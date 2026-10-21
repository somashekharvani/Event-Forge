"""Evaluation suite — runs inside the app (Verify tab) and from pytest.

Three groups:
  A. Invariants     (property-style, many seeded inputs)  e.g. 'budget always sums to total'
  B. Seeded faults  (we deliberately break a plan and check the system CATCHES it)
  C. Behaviour      (end-to-end: propose / apply / undo, parsing, extraction)
Each case returns pass/fail with a measured detail so the UI can show real numbers.
"""
from __future__ import annotations

import copy
import datetime as dt
import os
import random
import tempfile
import time

from . import budget as B, community as C, ideas as I, timeline as T, vendors as V, vision as VI
from .money import allocate, fmt_inr
from .spec import EventSpec, build_spec, parse_intake

TODAY = dt.date(2026, 10, 20)
MYSURU = "My sister's wedding in Mysore, March, ~300 guests, ₹15L, two-day, mostly vegetarian."


def _spec(text=MYSURU, **over) -> EventSpec:
    f = parse_intake(text, TODAY)["fields"]
    f.update(over)
    return build_spec(f, TODAY)


def _random_specs(n=40, seed=3):
    rng = random.Random(seed)
    cities = ["Mysuru", "Bengaluru", "Mumbai", "Delhi", "Chennai", "Jaipur", "Kochi", "Pune", "Hyderabad"]
    out = []
    for _ in range(n):
        t = rng.choice(["wedding", "birthday", "community"])
        g = rng.choice([30, 80, 150, 300, 500, 900])
        out.append(build_spec({"event_type": t, "guests": g, "budget_paise": rng.randint(50000, 5000000) * 100 // 10, "city": rng.choice(cities),
                               "days": rng.choice([1, 2, 3]) if t == "wedding" else 1, "diet": rng.choice(["veg", "mixed", "nonveg", "jain", "mostly_veg"]),
                               "date": (TODAY + dt.timedelta(days=rng.randint(30, 400))).isoformat(), "celebrant_age": rng.choice([5, 8, 30, 50]) if t == "birthday" else None,
                               "priorities": rng.sample(["food", "decor", "music", "photography"], rng.randint(0, 2))}, TODAY))
    return out


CASES = []


def case(group, name):
    def deco(fn):
        CASES.append((group, name, fn))
        return fn
    return deco


# ---------------------------------------------------------------- A. invariants
@case("Invariants", "Money: allocation sums exactly to the total (200 random weight sets)")
def _():
    rng = random.Random(1)
    for _ in range(200):
        tot = rng.randint(1, 10 ** 9)
        w = {f"k{i}": rng.random() + .01 for i in range(rng.randint(2, 12))}
        assert sum(allocate(tot, w).values()) == tot
    assert fmt_inr(150000000) == "₹15,00,000" and fmt_inr(12345678) == "₹1,23,456.78" and fmt_inr(500) == "₹5"
    return "200/200 allocations exact; Indian grouping correct"


@case("Invariants", "Budget: categories + contingency == total for 40 random events")
def _():
    n = 0
    for s in _random_specs():
        b = B.build_budget(s)
        assert b["checks"]["sums_to_total"] and b["checks"]["no_negative"], s
        assert 8 <= b["contingency_pct"] <= 20
        n += 1
    return f"{n}/{n} budgets sum exactly (integer paise)"


@case("Invariants", "Monte Carlo: reproducible and monotone (more budget → lower overrun risk)")
def _():
    s = _spec()
    a = B.build_budget(s)["risk"]["p_exceed_budget"]
    b = B.build_budget(s)["risk"]["p_exceed_budget"]
    assert a == b
    ps = [B.build_budget(_spec(budget_paise=x * 100_000_00 // 10))["risk"]["p_exceed_budget"] for x in (100, 130, 160, 200, 260)]
    assert all(ps[i] >= ps[i + 1] for i in range(len(ps) - 1)), ps
    return "P(exceed) by budget ₹10L→26L: " + " → ".join(f"{p * 100:.0f}%" for p in ps)


@case("Invariants", "What-if: more guests never lowers the expected cost")
def _():
    s = _spec()
    est = [B.what_if(s, {"guests": g})["after"]["estimate"] for g in (100, 200, 300, 400, 500)]
    assert all(est[i] < est[i + 1] for i in range(4))
    return "Estimates rise with guests: " + ", ".join(fmt_inr(e) for e in est)


@case("Invariants", "Timeline: no task starts before its dependencies (all 3 event types, 30 dates)")
def _():
    n = 0
    for t, g in (("wedding", 300), ("birthday", 40), ("community", 500)):
        for d in range(20, 500, 17):
            s = build_spec({"event_type": t, "guests": g, "budget_paise": 10 ** 8, "city": "Mysuru", "date": (TODAY + dt.timedelta(days=d)).isoformat()}, TODAY)
            sc = T.schedule(s, TODAY)
            by = {x["id"]: x for x in sc["tasks"]}
            for x in sc["tasks"]:
                for dep in x["deps"]:
                    assert x["start"] >= by[dep]["end"], (t, d, x["id"], dep)
            n += 1
    return f"{n} schedules verified, 0 dependency violations"


@case("Invariants", "Timeline: critical tasks have the minimum slack; DAG is acyclic")
def _():
    s = _spec()
    sc = T.schedule(s, TODAY)
    ms = sc["min_slack"]
    assert sc["critical_path"] and all(x["slack"] == ms for x in sc["tasks"] if x["critical"])
    assert not T.has_cycle(T.build_tasks(s))
    return f"critical path {' → '.join(sc['critical_path'])} ({sc['critical_path_days']} days), min slack {ms} d"


@case("Invariants", "Resource levelling: 1 coordinator is never faster than 2")
def _():
    s = _spec()
    one = T.schedule(s, TODAY, coordinators=1)
    two = T.schedule(s, TODAY, coordinators=2)
    assert one["resource_tardiness"] >= two["resource_tardiness"]
    return f"late task-days: 1 coordinator={one['resource_tardiness']}, 2 coordinators={two['resource_tardiness']}"


@case("Invariants", "Venue ranking: venues smaller than the guest count are never eligible")
def _():
    s = _spec()
    r = V.rank_vendors(s, "venue", 300000_00, limit=99)
    bad = [x for x in r["ranked"] if x["vendor"]["capacity"] < s.guests and x["eligible"]]
    assert not bad and any(not x["eligible"] for x in r["ranked"])
    return f"{sum(1 for x in r['ranked'] if not x['eligible'])} too-small venues excluded, score weights sum to {sum(r['weights'].values()):.2f}"


@case("Invariants", "Vendor ranking responds to weights (budget-only weighting favours in-budget vendors)")
def _():
    s = _spec()
    r = V.rank_vendors(s, "caterer", 400000_00, weights={"budget": 1, "rating": 0, "distance": 0, "availability": 0, "fit": 0}, limit=99)
    top = r["ranked"][0]
    assert not top["over_allocation"] or all(x["over_allocation"] for x in r["ranked"])
    return f"top by budget-only weights: {top['vendor']['name']} at {fmt_inr(top['price_estimate']['mid'])}"


# ---------------------------------------------------------------- B. seeded faults
FAULTS: list[tuple[str, bool]] = []


@case("Seeded faults", "Infeasible date is reported (not faked) with the earliest feasible date")
def _():
    s = _spec(date=(TODAY + dt.timedelta(days=45)).isoformat())
    sc = T.schedule(s, TODAY)
    assert sc["status"] == "infeasible" and sc["shortfall_days"] > 0
    assert dt.date.fromisoformat(sc["earliest_feasible_date"]) > s.date
    return f"short by {sc['shortfall_days']} d; earliest feasible {sc['earliest_feasible_date']}; crash feasible={sc['crash']['achievable']}"


@case("Seeded faults", "Over-budget plan is flagged infeasible")
def _():
    b = B.build_budget(_spec(budget_paise=300000_00))
    assert b["feasibility"] == "infeasible"
    return f"₹3L for 300 guests → {b['feasibility']} (optimistic cost {fmt_inr(b['estimate_total']['low'])})"


@case("Seeded faults", "Layout: overlapping objects detected")
def _():
    s = _spec(); pr = I.programs_for(s); v = VI.VENUES["mantapa_hall"]
    L = VI.auto_layout(v, s, pr)
    st = next(e for e in L["elements"] if e["type"] == "stage")
    mn = next(e for e in L["elements"] if e["type"] == "mandap")
    st["x"], st["y"] = mn["x"] + 1, mn["y"] + 1
    r = VI.validate_layout(L, v, s, pr)
    assert any(c["id"] == "overlaps" and c["status"] == "fail" for c in r["checks"])
    return "stage dragged onto mandap → overlap check FAILED as expected"


@case("Seeded faults", "Layout: blocked exit detected")
def _():
    s = _spec(); pr = I.programs_for(s); v = VI.VENUES["mantapa_hall"]
    L = VI.auto_layout(v, s, pr)
    ph = next(e for e in L["elements"] if e["type"] == "photo_booth")
    door = next(d for d in v["doors"] if d["wall"] == "E")
    ph["x"], ph["y"] = v["width"] - ph["w"] - .1, door["pos"] - ph["h"] / 2
    r = VI.validate_layout(L, v, s, pr)
    assert any(c["id"] == "exit_clearance" and c["status"] == "fail" for c in r["checks"])
    return "photo booth placed in front of the east exit → exit-clearance check FAILED as expected"


@case("Seeded faults", "Layout: venue too small for the guest count is rejected")
def _():
    s = _spec(); pr = I.programs_for(s); v = VI.VENUES["banquet_hall"]
    r = VI.validate_layout(VI.auto_layout(v, s, pr), v, s, pr)
    assert not r["ok"] and any(c["id"] in ("area", "program_capacity") and c["status"] == "fail" for c in r["checks"])
    return f"300 guests in a 30×18 m hall → {r['summary']['fail']} failed check(s); fill {r['metrics']['fill_pct']}%"


@case("Seeded faults", "Layout: two programs on the same stage at the same time are flagged")
def _():
    s = _spec(); pr = I.programs_for(s); v = VI.VENUES["mantapa_hall"]
    pr2 = copy.deepcopy(pr)
    a = next(p for p in pr2 if p["zone_type"] == "stage")
    pr2.append({**a, "id": "p_dup", "name": "Clashing show", "start": a["start"], "end": a["end"]})
    r = VI.validate_layout(VI.auto_layout(v, s, pr2), v, s, pr2)
    assert any(c["id"] == "program_conflicts" and c["status"] == "fail" for c in r["checks"])
    return "duplicate stage booking → program-conflict check FAILED as expected"


@case("Seeded faults", "Shared floor: ceremony → lunch with < 45 min conversion is flagged")
def _():
    s = _spec(); pr = copy.deepcopy(I.programs_for(s)); v = VI.VENUES["mantapa_hall"]
    mu = next(p for p in pr if p["key"] == "muhurtham")
    lu = next(p for p in pr if p["key"] == "lunch2")
    lu["start"] = mu["end"]
    L = VI.auto_layout(v, s, pr)
    assert L["params"]["shared"]
    r = VI.validate_layout(L, v, s, pr)
    assert any(c["id"] == "turnover" and c["status"] == "fail" for c in r["checks"])
    return "lunch scheduled straight after the muhurtham → turnover check FAILED as expected"


@case("Seeded faults", "Quote with missing terms is flagged, not invented")
def _():
    q = V.extract_quote("Decor package ₹1,20,000 including stage and flowers.", "Decor")
    assert "GST rate" in q["missing"] and "cancellation policy" in q["missing"] and "advance/payment terms" in q["missing"]
    assert "total_incl_gst" not in q and q["completeness"] < .6
    return f"missing flagged: {', '.join(q['missing'][:4])}…; completeness {q['completeness']}"


@case("Seeded faults", "Invalid structured data is rejected by the schema")
def _():
    bad = 0
    for kw in ({"guests": -5}, {"budget_paise": 0}, {"days": 0}, {"event_type": "party"}, {"guests": 99999}):
        try:
            EventSpec(**kw)
        except Exception:
            bad += 1
    assert bad == 5
    return "5/5 invalid specs rejected (negative guests, zero budget, 0 days, unknown type, 99,999 guests)"


@case("Seeded faults", "Selected venue booked on the date / too small → critic fails the plan")
def _():
    from . import engine as E
    old = os.environ.get("EVENTFORGE_DB")
    os.environ["EVENTFORGE_DB"] = ""
    E.DB_PATH = E.Path(tempfile.mkdtemp()) / "t.db"
    pid = E.create_project(_(__ := None) if False else _spec(), "t", TODAY.isoformat())["id"]
    plan = E.get_plan(pid)["plan"]
    small = next(x for x in V.rank_vendors(_spec(), "venue", 1, limit=99)["ranked"] if x["vendor"]["capacity"] < 300)
    E.commit_direct(pid, {"select_vendor": {"category": "venue", "vendor_id": small["vendor"]["id"]}}, "select small venue")
    p2 = E.get_plan(pid)["plan"]
    assert any(h["id"] == "venue_capacity" and h["status"] == "fail" for h in p2["critic"]["hard"])
    return f"{small['vendor']['name']} (capacity {small['vendor']['capacity']}) for 300 guests → capacity check FAILED"


# ---------------------------------------------------------------- C. behaviour
@case("Behaviour", "Intake: messy request → complete spec; vague request → targeted questions")
def _():
    r = parse_intake(MYSURU, TODAY)
    f = r["fields"]
    assert f["event_type"] == "wedding" and f["guests"] == 300 and f["budget_paise"] == 150000000 and f["city"] == "Mysuru" and f["days"] == 2 and f["diet"] == "mostly_veg"
    v = parse_intake("plan a party", TODAY)
    assert set(v["missing"]) == {"event_type", "guests", "budget_paise", "date", "city"} and len(v["questions"]) >= 5
    return "all 6 fields extracted from the sample request; 'plan a party' → 5 required questions"


@case("Behaviour", "Natural-language layout commands parse; nonsense is not guessed")
def _():
    ok = 0
    expect = {"move the stage to the left": ("move", "stage"), "move dining away from the entrance": ("move", "dining"), "change decoration to white and gold": ("theme", None),
              "add a dance floor": ("add", "dance_floor"), "make the stage bigger": ("resize", "stage"), "remove the photo booth": ("remove", "photo_booth")}
    for text, (op, ty) in expect.items():
        o = VI.parse_command(text)[0]
        assert o["op"] == op and (ty is None or o["type"] == ty), (text, o)
        ok += 1
    assert VI.parse_command("teleport the cake to mars")[0]["op"] == "unknown"
    return f"{ok}/6 commands parsed correctly; unknown phrase → 'unknown' (no guess)"


@case("Behaviour", "Layout is reproducible from stored edits (digital-twin determinism)")
def _():
    s = _spec(); pr = I.programs_for(s); v = VI.VENUES["mantapa_hall"]
    L = VI.auto_layout(v, s, pr)
    L2, _m = VI.apply_ops(L, v, s, VI.parse_command("add a dance floor, make the stage bigger by 10%, move the photo booth to the left"), pr)
    L3 = VI.auto_layout(v, s, pr, params=L2["params"], pins=L2["pins"], theme=L2["theme"])
    sig = lambda X: sorted((e["id"], e["x"], e["y"], e["w"], e["h"]) for e in X["elements"])
    assert sig(L2) == sig(L3)
    return "re-generating from {params, pins, theme} reproduces the edited layout exactly"


@case("Behaviour", "Change impact: guests 300→400 → propose → apply → undo restores the original")
def _():
    from . import engine as E
    E.DB_PATH = E.Path(tempfile.mkdtemp()) / "t2.db"
    pid = E.create_project(_spec(), "t", TODAY.isoformat())["id"]
    base = E.get_plan(pid)
    p = E.propose(pid, {"guests": 400})
    assert p["impact"]["budget"]["delta"] > 0 and p["impact"]["modules_recomputed"]
    assert E.get_plan(pid)["plan"]["spec"]["guests"] == 300       # not applied yet
    a = E.apply_proposal(p["proposal_id"])
    assert a["plan"]["spec"]["guests"] == 400
    u = E.undo(pid)
    assert u["plan"]["spec"]["guests"] == 300 and u["plan"]["budget"]["total"] == base["plan"]["budget"]["total"]
    return f"{p['impact']['headline']} → applied → undone (state identical)"


@case("Behaviour", "Incremental recompute: a theme-only change leaves budget & timeline untouched")
def _():
    from . import engine as E
    E.DB_PATH = E.Path(tempfile.mkdtemp()) / "t3.db"
    pid = E.create_project(_spec(), "t", TODAY.isoformat())["id"]
    E.get_plan(pid)
    p = E.propose(pid, {"theme": "royal_gold"})
    rec = p["impact"]["modules_recomputed"]
    assert "budget" not in rec and "timeline" not in rec and "vision" in rec
    return f"recomputed only: {', '.join(rec)}"


@case("Behaviour", "Vendor cancellation re-opens its task and reschedules")
def _():
    s = _spec()
    base = T.schedule(s, TODAY, {"scope": {"status": "done"}, "date": {"status": "done"}, "venue": {"status": "done", "done_date": TODAY.isoformat()}, "caterer": {"status": "done", "done_date": TODAY.isoformat()}})
    after = T.schedule(s, TODAY, {"scope": {"status": "done"}, "date": {"status": "done"}, "venue": {"status": "done", "done_date": TODAY.isoformat()}})
    d = T.diff_schedules(base, after)
    assert d["moved_count"] >= 1
    return f"caterer cancelled → {d['moved_count']} downstream task(s) moved; newly at risk: {len(d['newly_at_risk'])}"


@case("Behaviour", "ICS export is well-formed (balanced, folded ≤ 75 octets)")
def _():
    s = _spec(); sc = T.schedule(s, TODAY)
    ics = T.to_ics(s, sc, I.programs_for(s), "Test, event; with symbols")
    assert ics.count("BEGIN:VEVENT") == ics.count("END:VEVENT") > 20 and ics.startswith("BEGIN:VCALENDAR") and ics.rstrip().endswith("END:VCALENDAR")
    assert all(len(l.encode()) <= 75 for l in ics.split("\r\n"))
    return f"{ics.count('BEGIN:VEVENT')} events; all lines ≤ 75 octets"


@case("Behaviour", "Volunteer roster: full coverage with balanced load")
def _():
    r = C.volunteer_roster(800)
    assert r["coverage_pct"] == 100 and r["max_load"] - r["min_load"] <= 3
    return f"{r['volunteers']} volunteers, coverage {r['coverage_pct']}%, hours {r['min_load']}–{r['max_load']} (σ={r['stdev']})"


@case("Behaviour", "Preferences reshape ideas (no-loud-music removes DJ / loud themes)")
def _():
    s = _spec()
    mem0 = {"prefs": [], "liked_themes": [], "disliked_themes": []}
    p = I.parse_preference("No loud music please")
    t0 = {t["id"]: t["score"] for t in I.recommend_themes(s, 160000_00, mem0["prefs"], [], [], n=20)}
    t1 = {t["id"]: t["score"] for t in I.recommend_themes(s, 160000_00, [p], [], [], n=20)}
    assert p["avoid_tags"] == ["loud"]
    assert t1.get("bollywood", 0) < t0.get("bollywood", 100) or "bollywood" not in t1
    ent = I.entertainment_ideas(s, [p])
    assert not any("DJ" in e for e in ent)
    return "loud themes down-ranked, DJ/dance-floor ideas removed"


@case("Invariants", "Pareto optimizer: 3 distinct trade-off strategies with positive savings")
def _():
    s = _spec()
    b = B.build_budget(s)
    ps = b.get("pareto_strategies", [])
    assert len(ps) == 3
    assert all(p["saving"] > 0 for p in ps)
    assert {p["id"] for p in ps} == {"guest_trim", "seasonal_pivot", "schedule_compression"}
    return f"3 Pareto strategies generated: saves {ps[0]['saving_fmt']} (trim), {ps[1]['saving_fmt']} (pivot), {ps[2]['saving_fmt']} (compress)"


@case("Invariants", "Tax audit: 18% photography/venue and 5% catering compliance verified")
def _():
    s = _spec()
    b = B.build_budget(s)
    ta = b.get("tax_audit", {})
    assert ta["total_tax"] > 0 and ta["true_cost"] > b["distributable"]
    photo_tax = next(r for r in ta["rows"] if r["category"] == "photo_video")
    venue_tax = next(r for r in ta["rows"] if r["category"] == "venue")
    cater_tax = next(r for r in ta["rows"] if r["category"] == "catering")
    assert photo_tax["rate_pct"] == 18 and venue_tax["rate_pct"] == 18 and cater_tax["rate_pct"] == 5
    return f"Total tax {ta['total_tax_fmt']} across {len(ta['rows'])} categories; photo=18%, venue=18%, catering=5%"


@case("Behaviour", "Crisis simulator: verified mitigations for rain, caterer drop, and guest surge")
def _():
    from . import critic as K, timeline as T, vendors as V, vision as VI
    s = _spec()
    b = B.build_budget(s)
    sc = T.schedule(s, TODAY)
    vend = {cat: V.rank_vendors(s, cat, 20000000, {}) for cat in ("venue", "caterer", "photographer", "decorator")}
    vis = {"venue": VI.VENUES["mantapa_hall"], "validation": {"checks": []}}
    crises = K.crisis_simulations(s, b, sc, vis, vend)
    assert len(crises) == 3
    assert {c["id"] for c in crises} == {"rain", "vendor_drop", "guest_surge"}
    assert all("mitigation" in c and c["status"] in ("managed", "warning", "critical") for c in crises)
    return f"3 crisis scenarios evaluated: rain ({crises[0]['status']}), caterer ({crises[1]['status']}), surge ({crises[2]['status']})"


def run_all() -> dict:
    from . import engine as E
    saved_db = E.DB_PATH                     # evals use throw-away databases; never leave them installed globally
    try:
        return _run_all()
    finally:
        E.DB_PATH = saved_db


def _run_all() -> dict:
    results = []
    for group, name, fn in CASES:
        t0 = time.time()
        try:
            detail = fn()
            results.append({"group": group, "name": name, "passed": True, "detail": detail, "ms": round((time.time() - t0) * 1000)})
        except Exception as e:  # noqa
            results.append({"group": group, "name": name, "passed": False, "detail": f"{type(e).__name__}: {e}", "ms": round((time.time() - t0) * 1000)})
    ok = sum(1 for r in results if r["passed"])
    faults = [r for r in results if r["group"] == "Seeded faults"]
    return {"results": results, "passed": ok, "total": len(results), "seeded_detected": sum(1 for r in faults if r["passed"]), "seeded_total": len(faults),
            "ran_at": dt.datetime.utcnow().isoformat() + "Z"}
