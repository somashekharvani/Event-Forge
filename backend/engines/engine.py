"""Orchestrator / digital twin.

* A project is one JSON `state`. Every module output is a pure function of a slice of that state.
* Modules are recomputed incrementally: each module's inputs are hashed; unchanged hash -> cached output reused.
  The set of modules whose hash changed IS the change-impact set shown to the user.
* Changes are never applied silently: propose() builds the "after" plan, diffs it against "before", and the user approves.
* Every committed change is a version (undo / redo / restore).
"""
from __future__ import annotations

import copy
import datetime as dt
import hashlib
import json
import os
import sqlite3
import time
import uuid
from pathlib import Path

from . import budget as B, community as C, critic as K, ideas as I, timeline as T, vendors as V, vision as VI
from .money import fmt_inr, fmt_short, to_paise
from .spec import EventSpec, build_spec

DB_PATH = Path(os.environ.get("EVENTFORGE_DB", Path(__file__).resolve().parent.parent / "data" / "eventforge.db"))
SPEC_FIELDS = {"event_type", "title", "date", "date_assumed", "city", "guests", "budget_paise", "days", "outdoor", "diet", "culture",
               "priorities", "must_haves", "avoid", "celebrant_age", "theme", "risk_tolerance"}
MODULES = ["budget", "timeline", "vendors", "ideas", "vision", "community", "critic"]


def _h(x) -> str:
    return hashlib.sha1(json.dumps(x, sort_keys=True, default=str).encode()).hexdigest()[:12]


# ---------------------------------------------------------------------------------------------
# state helpers
def default_venue_id(spec: EventSpec) -> str:
    if spec.event_type == "community":
        return "community_ground" if spec.guests > 250 else "community_hall"
    if spec.event_type == "birthday":
        return "community_hall" if spec.guests <= 80 else "banquet_hall" if spec.guests <= 150 else "garden_lawn"
    return "mantapa_hall" if spec.guests <= 350 else "garden_lawn"


def new_state(spec: EventSpec, name: str | None = None, today: str | None = None) -> dict:
    d = spec.model_dump(mode="json")
    return {"name": name or spec.title or "My event", "spec": d, "today": today, "memory": {"prefs": [], "liked_themes": [], "disliked_themes": []},
            "selection": {}, "cancelled_vendors": [], "custom_weights": None, "vendor_weights": {}, "expenses": [], "task_overrides": {},
            "coordinators": 2, "venue_id": default_venue_id(spec), "custom_venue": None, "layout_params": {}, "layout_pins": {},
            "layout_theme": None, "program_overrides": {}, "checklist_done": [], "quotes": [], "photo": None, "volunteers": None,
            "shortlist": {}}


def today_of(state) -> dt.date:
    return dt.date.fromisoformat(state["today"]) if state.get("today") else dt.date.today()


def effective_spec(state: dict) -> EventSpec:
    d = copy.deepcopy(state["spec"])
    for p in state["memory"]["prefs"]:
        sc = p.get("spec_changes", {})
        if sc.get("diet"):
            d["diet"] = sc["diet"]
        if sc.get("avoid_add") and sc["avoid_add"] not in d["avoid"]:
            d["avoid"] = d["avoid"] + [sc["avoid_add"]]
    return EventSpec(**d)


def venue_of(state: dict) -> dict:
    if state["venue_id"] == "custom" and state.get("custom_venue"):
        return state["custom_venue"]
    return VI.VENUES[state["venue_id"] if state["venue_id"] in VI.VENUES else "banquet_hall"]


# ---------------------------------------------------------------------------------------------
def compute_plan(state: dict, cache: dict | None = None) -> tuple[dict, list[str], dict]:
    """Returns (plan, dirty_modules, new_cache)."""
    cache = cache or {}
    new_cache: dict = {}
    dirty: list[str] = []
    t_start = time.time()
    spec = effective_spec(state)
    today = today_of(state)
    sd = spec.model_dump(mode="json")

    def mod(name, inputs, fn):
        key = _h(inputs)
        if name in cache and cache[name][0] == key:
            new_cache[name] = cache[name]
            return cache[name][1]
        dirty.append(name)
        out = fn()
        new_cache[name] = (key, out)
        return out

    # selected vendors -> prices (independent of the budget allocation)
    sel_ids = state["selection"]
    sel_vendors = {}
    for cat, vid in sel_ids.items():
        v = next((x for x in V.all_vendors(spec.city) if x["id"] == vid), None)
        if v:
            sel_vendors[cat] = v
    bkeys = V.BUDGET_KEY[spec.event_type]
    vendor_prices = {bkeys[c]: V.price_for_event(v, spec)["mid"] for c, v in sel_vendors.items() if c in bkeys}

    bspec = {k: sd[k] for k in ("event_type", "city", "guests", "budget_paise", "days", "outdoor", "diet", "priorities", "avoid", "celebrant_age", "risk_tolerance")}
    bspec["month"] = sd["date"][5:7]
    b = mod("budget", {"spec": bspec, "vp": vendor_prices, "cw": state["custom_weights"]},
            lambda: B.build_budget(spec, vendor_prices, state["custom_weights"]))
    alloc = {r["key"]: r["allocated"] for r in b["categories"]}

    def _vendors():
        out, selection = {}, {}
        for cat in V.CATEGORIES_FOR[spec.event_type]:
            key = bkeys.get(cat)
            r = V.rank_vendors(spec, cat, alloc.get(key, 0), state["vendor_weights"], limit=99)
            r["ranked"] = [x for x in r["ranked"] if x["vendor"]["id"] not in state["cancelled_vendors"]]
            sid = sel_ids.get(cat)
            if sid:
                row = next((x for x in r["ranked"] if x["vendor"]["id"] == sid), None)
                if row is not None:
                    selection[cat] = row
            r["backup_count"] = sum(1 for x in r["ranked"] if x["eligible"] and x["available"] and x["vendor"]["id"] != sid) if sid else r["backup_count"]
            r["ranked_total"] = len(r["ranked"])
            r["ranked"] = r["ranked"][:8]
            out[cat] = r
        return {"by_category": out, "selection": selection}

    vend = mod("vendors", {"spec": {k: sd[k] for k in ("event_type", "city", "guests", "date", "days", "diet", "outdoor", "culture", "avoid", "celebrant_age")},
                           "alloc": alloc, "sel": sel_ids, "w": state["vendor_weights"], "cx": state["cancelled_vendors"]}, _vendors)

    sched = mod("timeline", {"spec": {**{k: sd[k] for k in ("event_type", "date", "days", "celebrant_age")}, "big": sd["guests"] > 400}, "ov": state["task_overrides"],
                             "co": state["coordinators"], "today": today.isoformat()},
                lambda: T.schedule(spec, today, state["task_overrides"], state["coordinators"]))

    def _ideas():
        decor_key = {"wedding": "decor", "birthday": "decor", "community": "decor"}[spec.event_type]
        out = I.build_ideas(spec, alloc.get(decor_key, 0), state["memory"])
        progs = out["programs"]
        for p in progs:
            o = state["program_overrides"].get(p["id"])
            if o:
                p.update({k: o[k] for k in ("start", "end", "day") if k in o})
        return out

    ideas = mod("ideas", {"spec": {k: sd[k] for k in ("event_type", "city", "guests", "date", "days", "culture", "diet", "outdoor", "avoid", "celebrant_age", "theme", "priorities")},
                          "decor": alloc.get("decor", 0) // 5000000, "mem": state["memory"], "po": state["program_overrides"]}, _ideas)
    programs = ideas["programs"]
    venue = venue_of(state)

    def _vision():
        theme = state["layout_theme"]
        layout = VI.auto_layout(venue, spec, programs, params=state["layout_params"], pins=state["layout_pins"], theme=theme)
        val = VI.validate_layout(layout, venue, spec, programs)
        return {"venue": venue, "layout": layout, "validation": val, "scenes": VI.scenes(layout, venue, spec, programs)}

    vis = mod("vision", {"spec": {k: sd[k] for k in ("event_type", "guests", "culture", "days", "celebrant_age", "avoid")}, "venue": venue,
                         "prog": programs, "lp": state["layout_params"], "pins": state["layout_pins"], "th": state["layout_theme"]}, _vision)

    def _fit():
        rows = []
        for v in VI.venue_library():
            L = VI.auto_layout(v, spec, programs)
            r = VI.validate_layout(L, v, spec, programs)
            rows.append({"id": v["id"], "name": v["name"], "indoor": v["indoor"], "width": v["width"], "depth": v["depth"], "area": v["area"],
                         "desc": v["desc"], "fill_pct": r["metrics"]["fill_pct"], "fails": r["summary"]["fail"], "warns": r["summary"]["warn"],
                         "fits": r["ok"], "fail_titles": [c["title"] for c in r["checks"] if c["status"] == "fail"][:3],
                         "seated_capacity": max(r["metrics"]["zone_capacity"].get("seating", 0), r["metrics"]["zone_capacity"].get("dining", 0))})
        rows.sort(key=lambda x: (not x["fits"], x["fails"], x["fill_pct"]))
        return rows

    fit = mod("vision_fit", {"spec": {k: sd[k] for k in ("event_type", "guests", "culture", "days", "celebrant_age", "avoid")}, "prog": programs}, _fit)

    def _community():
        if spec.event_type != "community":
            return None
        start = min(p["start"] for p in programs)
        end = max(p["end"] for p in programs)
        return {"roster": C.volunteer_roster(spec.guests, start, end, volunteers=state["volunteers"]),
                "permits": C.permits_checklist(spec), "estimator": C.estimator(spec), "sponsorship": C.sponsorship_pitch(spec)}

    comm = mod("community", {"spec": {k: sd[k] for k in ("event_type", "guests", "city", "date", "budget_paise")}, "prog": programs, "vol": state["volunteers"]}, _community)

    cr = mod("critic", {"b": b["checks"], "bt": b["estimate_total"], "bf": b["feasibility"], "s": [sched.get("status"), sched.get("min_slack"), len(sched.get("tasks", []))],
                        "sdate": sd["date"], "sel": sel_ids, "vv": vis["validation"]["summary"], "vc": [c["status"] for c in vis["validation"]["checks"]],
                        "r": comm and comm["roster"]["coverage_pct"], "spec": sd, "today": today.isoformat(), "p": b["risk"]["p_exceed_budget"], "co": state["cancelled_vendors"],
                        "vb": {c: x["backup_count"] for c, x in vend["by_category"].items()}},
             lambda: K.review(spec, b, sched, vend["by_category"], vend["selection"], vis, programs, comm["roster"] if comm else None, today))

    done = sum(1 for t in sched.get("tasks", []) if t["status"] == "done")
    upcoming = [t for t in sched.get("tasks", []) if t["status"] != "done"][:5]
    plan = {
        "spec": sd, "today": today.isoformat(), "name": state["name"],
        "overview": {"days_to_event": sched.get("days_to_event"), "budget": b["total"], "estimate": b["estimate_total"]["exp"], "feasibility": b["feasibility"],
                     "p_exceed": b["risk"]["p_exceed_budget"], "timeline_status": sched.get("status"), "tasks_done": done, "tasks_total": len(sched.get("tasks", [])),
                     "checks_passed": cr["hard_passed"], "checks_total": cr["hard_total"], "top_risks": cr["risks"][:3], "upcoming": upcoming,
                     "venue": venue["name"], "layout_ok": vis["validation"]["ok"]},
        "budget": b, "expenses": B.track_expenses(spec, b, state["expenses"]), "timeline": sched,
        "digest": {"weeks": T.weekly_digest(sched) if sched.get("tasks") else [], "text": T.digest_text(sched, state["name"]) if sched.get("tasks") else ""},
        "vendors": vend["by_category"], "selection": vend["selection"], "ideas": ideas, "programs": programs, "vision": vis, "venue_fit": fit,
        "community": comm, "critic": cr, "memory": state["memory"], "checklist_done": state["checklist_done"], "quotes": state["quotes"],
        "meta": {"computed_ms": round((time.time() - t_start) * 1000), "recomputed": dirty, "reused": [m for m in new_cache if m not in dirty],
                 "llm": "enabled" if os.environ.get("ANTHROPIC_API_KEY") else "off (deterministic engines only)"},
    }
    return plan, dirty, new_cache


# ---------------------------------------------------------------------------------------------
def apply_changes(state: dict, changes: dict, cache: dict | None = None) -> tuple[dict, list[dict]]:
    """Pure: returns (new_state, notes). Unknown keys are reported, never ignored silently."""
    s = copy.deepcopy(state)
    notes: list[dict] = []
    for k, v in changes.items():
        if k in SPEC_FIELDS and k != "theme":
            if k == "date" and isinstance(v, (dt.date,)):
                v = v.isoformat()
            s["spec"][k] = v
            if k == "date":
                s["spec"]["date_assumed"] = False
            if k == "guests":
                s["spec"]["guests"] = int(v)
        elif k == "budget_rupees":
            s["spec"]["budget_paise"] = to_paise(v)
        elif k == "guests_scale":
            s["spec"]["guests"] = max(1, int(round(s["spec"]["guests"] * float(v))))
        elif k == "venue_id":
            s["venue_id"] = v
            s["layout_params"], s["layout_pins"] = {}, {}
        elif k == "custom_venue":
            cv = VI.custom_venue(v.get("name", "My venue"), v.get("template", "banquet_hall"), float(v["width"]), float(v["depth"]), v.get("indoor"))
            s["custom_venue"], s["venue_id"] = cv, "custom"
            s["layout_params"], s["layout_pins"] = {}, {}
        elif k == "select_vendor":
            s["selection"][v["category"]] = v["vendor_id"]
        elif k == "unselect_vendor":
            s["selection"].pop(v, None)
        elif k == "vendor_cancel":
            vid = s["selection"].pop(v, None)
            if vid:
                s["cancelled_vendors"].append(vid)
            tid = {"venue": "venue", "caterer": "caterer", "photographer": "photo", "decorator": "decor", "entertainment": "music", "priest": "priest"}.get(v)
            if tid:
                s["task_overrides"].pop(tid, None)
            notes.append({"ok": True, "text": f"Vendor for {v} marked cancelled; its booking task is re-opened."})
        elif k == "task":
            o = s["task_overrides"].setdefault(v["id"], {})
            o.update({kk: vv for kk, vv in v.items() if kk != "id"})
            if v.get("status") in (None, "pending"):
                o.pop("done_date", None)
        elif k == "coordinators":
            s["coordinators"] = max(1, min(6, int(v)))
        elif k == "pref":
            p = I.parse_preference(v)
            s["memory"]["prefs"].append(p)
            notes.append({"ok": True, "text": f"Saved preference: “{p['text']}”" + (f" → {p['spec_changes']}" if p["spec_changes"] else "")})
        elif k == "remove_pref":
            s["memory"]["prefs"] = [p for p in s["memory"]["prefs"] if p["id"] != v]
        elif k == "clear_prefs":
            s["memory"] = {"prefs": [], "liked_themes": [], "disliked_themes": []}
        elif k == "like_theme":
            s["memory"]["liked_themes"] = list({*s["memory"]["liked_themes"], v})
            s["memory"]["disliked_themes"] = [x for x in s["memory"]["disliked_themes"] if x != v]
        elif k == "dislike_theme":
            s["memory"]["disliked_themes"] = list({*s["memory"]["disliked_themes"], v})
            s["memory"]["liked_themes"] = [x for x in s["memory"]["liked_themes"] if x != v]
        elif k == "theme":
            th = next((t for t in I.THEMES if t["id"] == v), None)
            if th:
                s["layout_theme"] = {"id": th["id"], "name": th["name"], "palette": th["palette"]}
                s["spec"]["theme"] = v
        elif k == "program":
            s["program_overrides"].setdefault(v["id"], {}).update({kk: vv for kk, vv in v.items() if kk != "id"})
        elif k == "weights":
            s["custom_weights"] = v or None
        elif k == "vendor_weights":
            s["vendor_weights"] = v
        elif k == "layout_pin":
            for it in (v if isinstance(v, list) else [v]):
                s["layout_pins"][it["id"]] = {"x": round(float(it["x"]), 2), "y": round(float(it["y"]), 2)}
        elif k == "layout_theme":
            s["layout_theme"] = {"id": "custom", "name": v.get("name", "Custom palette"), "palette": v["palette"][:4]}
        elif k == "layout_reset":
            s["layout_params"], s["layout_pins"] = {}, {}
        elif k == "vision_command":
            plan, _, _ = compute_plan(s, cache)
            vis = plan["vision"]
            spec = effective_spec(s)
            ops = VI.parse_command(v)
            L2, msgs = VI.apply_ops(vis["layout"], vis["venue"], spec, ops, plan["programs"])
            L2 = VI.relayout_if_needed(L2, vis["venue"], spec, plan["programs"])
            s["layout_params"] = {kk: vv for kk, vv in L2["params"].items()}
            s["layout_pins"] = L2["pins"]
            s["layout_theme"] = L2["theme"]
            notes += msgs
        else:
            notes.append({"ok": False, "text": f"Unknown change '{k}' ignored."})
    EventSpec(**{**s["spec"], "date": dt.date.fromisoformat(s["spec"]["date"]) if isinstance(s["spec"]["date"], str) else s["spec"]["date"]})  # validates
    return s, notes


def _risk_set(plan) -> set[str]:
    return {f["id"] for f in plan["critic"]["risks"]} | {h["id"] for h in plan["critic"]["hard"] if h["status"] != "pass"}


def impact(before: dict, after: dict, dirty: list[str], changes: dict) -> dict:
    sb, sa = before["timeline"], after["timeline"]
    td = T.diff_schedules(sb, sa) if sb.get("tasks") and sa.get("tasks") else {"moved": [], "moved_count": 0, "newly_at_risk": []}
    bb, ba = before["budget"], after["budget"]
    d_est = ba["estimate_total"]["exp"] - bb["estimate_total"]["exp"]
    d_budget = ba["total"] - bb["total"]
    cat_changes = []
    for x, y in zip(bb["categories"], ba["categories"]):
        dd = y["estimate"]["exp"] - x["estimate"]["exp"]
        if abs(dd) > 100:
            cat_changes.append({"label": y["label"], "delta": dd})
    cat_changes.sort(key=lambda c: -abs(c["delta"]))
    vb, va = before["vision"], after["vision"]
    ld = VI.diff_layouts(vb["layout"], va["layout"])
    new_checks = [c for c in va["validation"]["checks"] if c["status"] == "fail" and next((o["status"] for o in vb["validation"]["checks"] if o["id"] == c["id"]), "pass") != "fail"]
    fixed_checks = [c for c in vb["validation"]["checks"] if c["status"] == "fail" and next((o["status"] for o in va["validation"]["checks"] if o["id"] == c["id"]), "pass") != "fail"]
    rb, ra = _risk_set(before), _risk_set(after)
    new_findings = [f for f in after["critic"]["hard"] + after["critic"]["risks"] if f["id"] in ra - rb]
    resolved = [f for f in before["critic"]["hard"] + before["critic"]["risks"] if f["id"] in rb - ra]
    vend_changes = []
    for cat, r in after["vendors"].items():
        o = before["vendors"].get(cat)
        if not o:
            continue
        a_top = next((x["vendor"]["name"] for x in r["ranked"] if x["eligible"]), None)
        b_top = next((x["vendor"]["name"] for x in o["ranked"] if x["eligible"]), None)
        if a_top != b_top:
            vend_changes.append({"category": cat, "before": b_top, "after": a_top})
    for cat, row in after["selection"].items():
        if not row["eligible"] or not row["available"]:
            vend_changes.append({"category": cat, "before": row["vendor"]["name"], "after": None, "problem": "selected vendor no longer fits"})
    hf_b, hf_a = before["critic"]["hard_passed"], after["critic"]["hard_passed"]
    parts = []
    if td["moved_count"]:
        parts.append(f"moves {td['moved_count']} task(s)")
    if abs(d_est) > 1000 or d_budget:
        parts.append(f"{'adds' if d_est >= 0 else 'saves'} {fmt_short(abs(d_est))} to the expected cost" if abs(d_est) > 1000 else f"changes the budget by {fmt_short(d_budget)}")
    if new_checks:
        parts.append(f"breaks {len(new_checks)} layout check(s)")
    if fixed_checks:
        parts.append(f"fixes {len(fixed_checks)} layout check(s)")
    if ld["changed"]:
        parts.append(f"rearranges {len(ld['changed'])} layout item(s)")
    if ld["theme_changed"]:
        parts.append(f"restyles the decor to {va['layout']['theme']['name']}")
    if (hf_b, before["critic"]["hard_total"]) != (hf_a, after["critic"]["hard_total"]):
        parts.append(f"verification goes {hf_b}/{before['critic']['hard_total']} → {hf_a}/{after['critic']['hard_total']}")
    tb_, ta_ = (before["ideas"]["themes"] or [{}])[0].get("name"), (after["ideas"]["themes"] or [{}])[0].get("name")
    if tb_ != ta_:
        parts.append(f"re-ranks theme ideas (top pick {tb_} → {ta_})")
    if before["ideas"]["menu"]["diet"] != after["ideas"]["menu"]["diet"]:
        parts.append(f"changes the menu to {after['ideas']['menu']['diet'].replace('_', ' ')}")
    headline = ("This " + ", ".join(parts) + ".") if parts else "No material change to the plan."
    significant = bool(td["moved_count"] >= 3 or abs(d_est) > bb["total"] * .03 or new_checks or
                       ba["feasibility"] != bb["feasibility"] or ("venue_id" in changes) or ("custom_venue" in changes))
    return {
        "headline": headline, "significant": significant, "modules_recomputed": [m for m in dirty if m in MODULES or m == "vision_fit"],
        "budget": {"estimate_before": bb["estimate_total"]["exp"], "estimate_after": ba["estimate_total"]["exp"], "delta": d_est,
                   "budget_before": bb["total"], "budget_after": ba["total"], "feasibility_before": bb["feasibility"], "feasibility_after": ba["feasibility"],
                   "p_exceed_before": bb["risk"]["p_exceed_budget"], "p_exceed_after": ba["risk"]["p_exceed_budget"], "category_changes": cat_changes[:5]},
        "timeline": {"moved_count": td["moved_count"], "moved": td["moved"][:12], "newly_at_risk": td["newly_at_risk"][:8],
                     "status_before": sb.get("status"), "status_after": sa.get("status"), "critical_before": sb.get("critical_path"), "critical_after": sa.get("critical_path")},
        "vendors": vend_changes,
        "vision": {"before": vb["validation"]["summary"], "after": va["validation"]["summary"], "layout_changes": ld["changed"][:10],
                   "theme_changed": ld["theme_changed"], "new_failures": [{"title": c["title"], "detail": c["detail"]} for c in new_checks],
                   "fixed": [c["title"] for c in fixed_checks]},
        "critic": {"before": f"{hf_b}/{before['critic']['hard_total']}", "after": f"{hf_a}/{after['critic']['hard_total']}",
                   "new": [{"title": f["title"], "severity": f["severity"], "evidence": f["evidence"]} for f in new_findings][:8],
                   "resolved": [f["title"] for f in resolved][:8]},
    }


# ---------------------------------------------------------------------------------------------
# persistence
def db():
    try:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        c = sqlite3.connect(DB_PATH, check_same_thread=False)
    except (OSError, PermissionError):
        import tempfile
        fallback_path = Path(tempfile.gettempdir()) / "eventforge.db"
        c = sqlite3.connect(fallback_path, check_same_thread=False)
    c.row_factory = sqlite3.Row
    c.executescript("""
    CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, name TEXT, created TEXT, current_version INTEGER, redo TEXT DEFAULT '[]');
    CREATE TABLE IF NOT EXISTS versions(id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT, parent_id INTEGER, created TEXT, label TEXT, state TEXT, summary TEXT);
    """)
    return c


_PLAN_CACHE: dict[tuple, dict] = {}
_MOD_CACHE: dict[str, dict] = {}
_PROPOSALS: dict[str, dict] = {}


def create_project(spec: EventSpec, name: str | None = None, today: str | None = None) -> dict:
    pid = uuid.uuid4().hex[:10]
    state = new_state(spec, name, today)
    c = db()
    now = dt.datetime.utcnow().isoformat()
    c.execute("INSERT INTO projects(id,name,created,current_version) VALUES(?,?,?,NULL)", (pid, state["name"], now))
    vid = _save_version(c, pid, state, "Created", {"headline": "Project created"})
    c.commit()
    return {"id": pid, "version": vid}


def _save_version(c, pid, state, label, summary, parent=None) -> int:
    cur = c.execute("SELECT current_version FROM projects WHERE id=?", (pid,)).fetchone()
    parent = parent if parent is not None else (cur["current_version"] if cur else None)
    r = c.execute("INSERT INTO versions(project_id,parent_id,created,label,state,summary) VALUES(?,?,?,?,?,?)",
                  (pid, parent, dt.datetime.utcnow().isoformat(), label, json.dumps(state), json.dumps(summary)))
    c.execute("UPDATE projects SET current_version=?, name=? WHERE id=?", (r.lastrowid, state["name"], pid))
    return r.lastrowid


def load(pid: str) -> tuple[dict, int]:
    c = db()
    p = c.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
    if not p:
        raise KeyError(pid)
    v = c.execute("SELECT * FROM versions WHERE id=?", (p["current_version"],)).fetchone()
    return json.loads(v["state"]), v["id"]


def get_plan(pid: str) -> dict:
    state, vid = load(pid)
    key = (pid, vid)
    if key not in _PLAN_CACHE:
        plan, _, mc = compute_plan(state, _MOD_CACHE.get(pid))
        _MOD_CACHE[pid] = mc
        _PLAN_CACHE.clear() if len(_PLAN_CACHE) > 40 else None
        _PLAN_CACHE[key] = plan
    return {"project_id": pid, "version": vid, "state": state, "plan": _PLAN_CACHE[key]}


def propose(pid: str, changes: dict, label: str | None = None) -> dict:
    cur = get_plan(pid)
    state = cur["state"]
    new_s, notes = apply_changes(state, changes, _MOD_CACHE.get(pid))
    after, dirty, _ = compute_plan(new_s, copy.deepcopy(_MOD_CACHE.get(pid)))
    imp = impact(cur["plan"], after, dirty, changes)
    if imp["headline"].startswith("No material") and notes:
        imp["headline"] = notes[0]["text"]
    prop_id = uuid.uuid4().hex[:8]
    _PROPOSALS[prop_id] = {"pid": pid, "state": new_s, "label": label or _label(changes), "impact": imp, "base_version": cur["version"]}
    if len(_PROPOSALS) > 200:
        _PROPOSALS.pop(next(iter(_PROPOSALS)))
    prev = {"before": {"layout": cur["plan"]["vision"]["layout"], "venue": cur["plan"]["vision"]["venue"]},
            "after": {"layout": after["vision"]["layout"], "venue": after["vision"]["venue"]}}
    return {"proposal_id": prop_id, "label": _PROPOSALS[prop_id]["label"], "notes": notes, "impact": imp, "changes": changes, "previews": prev}


def _label(ch: dict) -> str:
    k = next(iter(ch)) if ch else "change"
    v = ch.get(k)
    return {"guests": f"Guests → {v}", "budget_paise": f"Budget → {fmt_inr(v) if isinstance(v, int) else v}", "date": f"Date → {v}", "vision_command": f"Layout: {v}",
            "venue_id": f"Venue → {v}", "city": f"City → {v}"}.get(k, f"Change: {k}")


def apply_proposal(prop_id: str) -> dict:
    p = _PROPOSALS.pop(prop_id, None)
    if not p:
        raise KeyError("proposal expired or already applied")
    cur = get_plan(p["pid"])
    if cur["version"] != p["base_version"]:
        raise ValueError("The plan changed since this proposal was made — please re-propose.")
    c = db()
    c.execute("UPDATE projects SET redo='[]' WHERE id=?", (p["pid"],))
    vid = _save_version(c, p["pid"], p["state"], p["label"], {"headline": p["impact"]["headline"]})
    c.commit()
    return get_plan(p["pid"])


def commit_direct(pid: str, changes: dict, label: str) -> dict:
    """For small, non-structural edits (expenses, checklist ticks, notes) — still versioned."""
    cur = get_plan(pid)
    new_s, notes = apply_changes(cur["state"], changes, _MOD_CACHE.get(pid))
    c = db()
    _save_version(c, pid, new_s, label, {"headline": label})
    c.execute("UPDATE projects SET redo='[]' WHERE id=?", (pid,))
    c.commit()
    out = get_plan(pid)
    out["notes"] = notes
    return out


def mutate_state(pid: str, fn, label: str) -> dict:
    cur = get_plan(pid)
    s = copy.deepcopy(cur["state"])
    fn(s)
    c = db()
    _save_version(c, pid, s, label, {"headline": label})
    c.execute("UPDATE projects SET redo='[]' WHERE id=?", (pid,))
    c.commit()
    return get_plan(pid)


def reject_proposal(prop_id: str):
    _PROPOSALS.pop(prop_id, None)


def undo(pid: str) -> dict:
    c = db()
    p = c.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
    v = c.execute("SELECT * FROM versions WHERE id=?", (p["current_version"],)).fetchone()
    if v["parent_id"] is None:
        raise ValueError("Nothing to undo")
    redo = json.loads(p["redo"])
    redo.append(p["current_version"])
    c.execute("UPDATE projects SET current_version=?, redo=? WHERE id=?", (v["parent_id"], json.dumps(redo), pid))
    c.commit()
    return get_plan(pid)


def redo(pid: str) -> dict:
    c = db()
    p = c.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
    stack = json.loads(p["redo"])
    if not stack:
        raise ValueError("Nothing to redo")
    vid = stack.pop()
    c.execute("UPDATE projects SET current_version=?, redo=? WHERE id=?", (vid, json.dumps(stack), pid))
    c.commit()
    return get_plan(pid)


def restore(pid: str, version_id: int) -> dict:
    c = db()
    v = c.execute("SELECT * FROM versions WHERE id=? AND project_id=?", (version_id, pid)).fetchone()
    if not v:
        raise KeyError("version")
    _save_version(c, pid, json.loads(v["state"]), f"Restored: {v['label']}", {"headline": f"Restored version {version_id}"})
    c.execute("UPDATE projects SET redo='[]' WHERE id=?", (pid,))
    c.commit()
    return get_plan(pid)


def versions(pid: str) -> list[dict]:
    c = db()
    cur = c.execute("SELECT current_version FROM projects WHERE id=?", (pid,)).fetchone()["current_version"]
    rows = c.execute("SELECT id,parent_id,created,label,summary FROM versions WHERE project_id=? ORDER BY id DESC", (pid,)).fetchall()
    return [{"id": r["id"], "parent": r["parent_id"], "created": r["created"], "label": r["label"], "headline": json.loads(r["summary"]).get("headline", ""),
             "current": r["id"] == cur} for r in rows]


def list_projects() -> list[dict]:
    c = db()
    rows = c.execute("SELECT id,name,created FROM projects ORDER BY created DESC LIMIT 30").fetchall()
    return [dict(r) for r in rows]


def compare_versions(pid: str, a: int, b: int) -> dict:
    c = db()
    sa = json.loads(c.execute("SELECT state FROM versions WHERE id=? AND project_id=?", (a, pid)).fetchone()["state"])
    sb = json.loads(c.execute("SELECT state FROM versions WHERE id=? AND project_id=?", (b, pid)).fetchone()["state"])
    pa, _, _ = compute_plan(sa)
    pb, dirty, _ = compute_plan(sb)
    return impact(pa, pb, dirty, {})
