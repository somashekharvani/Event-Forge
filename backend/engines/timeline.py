"""Timeline engine: task DAG -> CPM (critical path) -> resource-constrained schedule -> reschedule/digest/ICS.

Dates are calendar days. The event day is the horizon; a task with `ddl` must FINISH at least `ddl` days before it.
If the plan cannot meet every deadline the engine says INFEASIBLE, reports the shortfall, the earliest feasible
date, and what crashing (compressing) the critical path would buy — it never fakes a schedule.

Resource handling: a serial schedule-generation scheme with randomised priority restarts (seeded, deterministic).
This is a heuristic, not a proven-optimal CP-SAT model; OR-Tools CP-SAT would be a drop-in for the `level()` step.
"""
from __future__ import annotations

import datetime as dt
import random
from collections import defaultdict, deque

from .spec import EventSpec

# id, name, phase, duration, min_duration, deps, ddl(days before event), category, effort%/day on coordinator
T = tuple


def _t(id, name, phase, dur, mn, deps, ddl, cat=None, effort=25, note=""):
    return {"id": id, "name": name, "phase": phase, "duration": dur, "min_duration": mn, "deps": deps, "ddl": ddl,
            "category": cat, "effort": effort, "note": note}


def build_tasks(spec: EventSpec) -> list[dict]:
    G, D = spec.guests, spec.days
    peak = spec.date is not None and spec.date.month in {11, 12, 1, 2, 4, 5} and spec.event_type == "wedding"
    big = G > 400
    if spec.event_type == "wedding":
        ts = [
            _t("scope", "Agree budget & rough guest list with family", "Foundation", 5, 2, [], 120 if peak else 100, None, 40),
            _t("date", "Fix date / muhurtham with priest & family", "Foundation", 7, 3, ["scope"], 115 if peak else 95, "priest", 30,
               "Check auspicious dates and key relatives' availability."),
            _t("venue", "Shortlist, visit & book venue", "Booking", 28 if big else 21, 10, ["date"], 100 if peak else 85, "venue", 45,
               "Peak-season venues book out early." if peak else ""),
            _t("caterer", "Shortlist, taste & book caterer", "Booking", 14, 7, ["venue"], 75, "caterer", 35),
            _t("photo", "Book photographer & videographer", "Booking", 10, 5, ["date"], 80, "photographer", 20),
            _t("decor", "Finalise theme & book decorator", "Booking", 14, 7, ["venue"], 60, "decorator", 30),
            _t("priest", "Book priest/pandit & list ritual items", "Booking", 7, 3, ["date"], 60, "priest", 15),
            _t("music", "Book DJ / band / performers", "Booking", 10, 5, ["venue"], 45, "entertainment", 20),
            _t("attire", "Attire, jewellery, makeup & mehendi bookings", "Personal", 35, 14, ["date"], 30, "makeup", 20),
            _t("guestlist", "Finalise guest list & addresses", "Guests", 10, 5, ["scope"], 55, None, 30),
            _t("invites_design", "Design & print invitations / e-invite", "Guests", 12, 6, ["guestlist", "venue"], 45, None, 25),
            _t("invites_send", "Send invitations", "Guests", 7, 3, ["invites_design"], 35, None, 25),
            _t("stay", "Arrange guest stay & transport", "Logistics", 14, 7, ["guestlist", "venue"], 20, "transport", 25),
            _t("menu", "Menu tasting & finalisation", "Booking", 5, 2, ["caterer"], 25, "caterer", 20),
            _t("permits", "Venue rules, loudspeaker & parking permissions", "Logistics", 5, 2, ["venue"], 10, None, 20),
            _t("layout", "Finalise venue layout & program schedule (EventForge Vision)", "Design", 7, 3, ["venue", "decor", "caterer"], 14, None, 30),
            _t("rsvp", "Collect RSVPs", "Guests", 21, 10, ["invites_send"], 10, None, 15),
            _t("headcount", "Lock headcount with caterer & venue", "Guests", 3, 1, ["rsvp"], 7, None, 30),
            _t("planb", "Backup plan: weather cover & vendor no-show", "Risk", 3, 1, ["layout"], 7, None, 20),
            _t("final_pay", "Final payments & vendor confirmation calls", "Logistics", 4, 2, ["headcount", "layout"], 3, None, 40),
            _t("runofshow", "Run-of-show & family roles", "Logistics", 4, 2, ["layout", "headcount"], 3, None, 30),
            _t("rehearsal", "Venue walkthrough & rehearsal", "Logistics", 1, 1, ["runofshow", "final_pay"], 1, None, 40),
        ]
        if D > 1:
            ts.insert(14, _t("functions", "Plan sangeet / mehendi / extra-day functions", "Design", 14, 7, ["venue", "music"], 25, "entertainment", 25))
            for t in ts:
                if t["id"] == "layout":
                    t["deps"] = t["deps"] + ["functions"]
    elif spec.event_type == "birthday":
        kid = (spec.celebrant_age or 30) <= 12
        ts = [
            _t("scope", "Decide guest list, budget & theme", "Foundation", 3, 1, [], 40, None, 40),
            _t("date", "Confirm date & time", "Foundation", 2, 1, ["scope"], 38, None, 20),
            _t("venue", "Book venue / party hall", "Booking", 7, 3, ["date"], 28, "venue", 40),
            _t("caterer", "Order food & cake", "Booking", 7, 3, ["venue"], 14, "caterer", 30),
            _t("decor", "Plan decor / balloons / theme props", "Booking", 7, 3, ["venue"], 10, "decorator", 25),
            _t("entertain", "Book entertainer / games" if kid else "Book DJ / music & activities", "Booking", 7, 3, ["date"], 14, "entertainment", 25),
            _t("photo", "Book photographer", "Booking", 5, 2, ["date"], 14, "photographer", 15),
            _t("invites", "Create & send invitations", "Guests", 5, 2, ["scope", "date"], 21, None, 25),
            _t("rsvp", "Collect RSVPs", "Guests", 7, 4, ["invites"], 5, None, 15),
            _t("gifts", "Order return gifts", "Logistics", 7, 3, ["scope"], 7, None, 15),
            _t("headcount", "Confirm final headcount with caterer", "Guests", 2, 1, ["rsvp"], 3, None, 30),
            _t("layout", "Plan seating & activity layout (Vision)", "Design", 3, 1, ["venue", "decor"], 5, None, 25),
            _t("final", "Confirm vendors & plan the day", "Logistics", 2, 1, ["headcount", "layout"], 1, None, 40),
        ]
    else:
        ts = [
            _t("committee", "Form organising committee & assign leads", "Foundation", 4, 2, [], 75, None, 40),
            _t("scope", "Set goals, programs & budget", "Foundation", 5, 2, ["committee"], 70, None, 40),
            _t("date", "Fix date (check festival/exam/holiday clashes)", "Foundation", 5, 2, ["scope"], 65, None, 25),
            _t("venue", "Get ground / hall permission", "Booking", 14, 7, ["date"], 50, "venue", 35),
            _t("permits", "Apply: police/loudspeaker, fire safety, food stalls, electricity", "Compliance", 21, 10, ["venue"], 14, None, 30,
               "Rules vary by city/state — confirm with local authorities."),
            _t("sponsors_pitch", "Prepare sponsorship pitch deck", "Funding", 5, 2, ["scope"], 55, None, 20),
            _t("sponsors", "Approach local sponsors", "Funding", 21, 10, ["sponsors_pitch"], 25, None, 30),
            _t("vendors", "Book sound, tent/stage, caterer", "Booking", 14, 7, ["venue"], 30, "sound", 30),
            _t("volunteers", "Recruit volunteers", "People", 14, 7, ["scope"], 14, None, 25),
            _t("publicity", "Publicity: posters, WhatsApp groups, social posts", "People", 14, 7, ["date"], 10, None, 25),
            _t("printing", "Print banners, passes & signage", "Logistics", 5, 2, ["publicity"], 6, None, 15),
            _t("safety", "Safety, crowd & medical plan", "Compliance", 7, 3, ["venue"], 7, None, 30),
            _t("estimates", "Crowd & food quantity estimate", "Logistics", 2, 1, ["scope", "vendors"], 5, None, 20),
            _t("layout", "Finalise ground layout & flow (Vision)", "Design", 5, 2, ["venue", "vendors"], 8, None, 30),
            _t("roster", "Volunteer roster & briefing", "People", 5, 2, ["volunteers", "layout"], 3, None, 30),
            _t("equipment", "Equipment & supplies checklist", "Logistics", 4, 2, ["vendors", "safety"], 3, None, 25),
            _t("final", "Final walkthrough & vendor confirmations", "Logistics", 1, 1, ["roster", "equipment", "permits"], 1, None, 40),
        ]
    return ts


# ---------------------------------------------------------------------------------------------
def topo_order(tasks: list[dict]) -> list[str]:
    ids = {t["id"] for t in tasks}
    indeg = {t["id"]: 0 for t in tasks}
    succ = defaultdict(list)
    for t in tasks:
        for d in t["deps"]:
            if d not in ids:
                raise ValueError(f"task {t['id']} depends on unknown task {d}")
            indeg[t["id"]] += 1
            succ[d].append(t["id"])
    q = deque(sorted(i for i, n in indeg.items() if n == 0))
    out = []
    while q:
        i = q.popleft()
        out.append(i)
        for s in sorted(succ[i]):
            indeg[s] -= 1
            if indeg[s] == 0:
                q.append(s)
    if len(out) != len(tasks):
        cyc = [i for i in indeg if i not in out]
        raise ValueError(f"dependency cycle among: {', '.join(cyc)}")
    return out


def has_cycle(tasks: list[dict]) -> bool:
    try:
        topo_order(tasks)
        return False
    except ValueError:
        return True


def _cpm(tasks: dict[str, dict], today: dt.date, event: dt.date, fixed: dict[str, int], durations: dict[str, int],
         shift: dict[str, int]) -> dict:
    """Return day-indices relative to `today`. fixed[id] = finish day for completed tasks."""
    E = (event - today).days
    order = topo_order(list(tasks.values()))
    es, ef = {}, {}
    for i in order:
        t = tasks[i]
        if i in fixed:
            ef[i] = fixed[i]
            es[i] = fixed[i] - durations[i]
            continue
        start = max([ef[d] for d in t["deps"]] + [0, shift.get(i, 0)])
        es[i] = start
        ef[i] = start + durations[i]
    succ = defaultdict(list)
    for t in tasks.values():
        for d in t["deps"]:
            succ[d].append(t["id"])
    ls, lf = {}, {}
    for i in reversed(order):
        t = tasks[i]
        cap = E - (t["ddl"] or 0)
        lf[i] = min([cap] + [ls[s] for s in succ[i]])
        ls[i] = lf[i] - durations[i]
    return {"E": E, "es": es, "ef": ef, "ls": ls, "lf": lf, "order": order}


def level(tasks: dict[str, dict], base: dict, durations: dict[str, int], fixed: dict[str, int], capacity_pct: int,
          shift: dict[str, int], iters: int = 300, seed: int = 11) -> dict:
    """Resource-constrained schedule (coordinator capacity in %/day). Serial SGS with seeded random restarts."""
    order = base["order"]
    E = base["E"]
    best = None
    rng = random.Random(seed)
    horizon = max(E, 1) + 400
    for it in range(iters):
        noise = 0 if it == 0 else rng.random() * (3 + it % 11)
        pri = {i: base["lf"][i] + (rng.random() * noise) for i in order}
        load = [0] * horizon
        st, fi = {}, {}
        # process in topological waves but by priority among ready tasks
        done = set()
        remaining = set(order)
        while remaining:
            ready = [i for i in remaining if all(d in done for d in tasks[i]["deps"])]
            i = min(ready, key=lambda x: pri[x])
            remaining.discard(i)
            done.add(i)
            if i in fixed:
                fi[i] = fixed[i]
                st[i] = fixed[i] - durations[i]
                continue
            t0 = max([fi[d] for d in tasks[i]["deps"]] + [0, shift.get(i, 0)])
            eff = tasks[i]["effort"]
            dur = durations[i]
            while any(load[d] + eff > capacity_pct for d in range(t0, t0 + dur)):
                t0 += 1
                if t0 + dur >= horizon:
                    break
            for d in range(t0, min(t0 + dur, horizon)):
                load[d] += eff
            st[i], fi[i] = t0, t0 + dur
        late = sum(max(0, fi[i] - base["lf"][i]) for i in order)
        span = max(fi.values())
        key = (late, span)
        if best is None or key < best[0]:
            best = (key, st, fi, load[:E + 30 if E > 0 else 30])
    return {"start": best[1], "finish": best[2], "tardiness": best[0][0], "makespan": best[0][1], "load": best[3]}


def schedule(spec: EventSpec, today: dt.date | None = None, overrides: dict | None = None,
             coordinators: int = 2, tasks: list[dict] | None = None) -> dict:
    """overrides: {task_id: {status: 'done'|'pending'|'cancelled', done_date: iso, delay_days: int}}"""
    today = today or dt.date.today()
    overrides = overrides or {}
    tl = tasks if tasks is not None else build_tasks(spec)
    tasks_d = {t["id"]: t for t in tl}
    event = spec.date
    E = (event - today).days
    result: dict = {"today": today.isoformat(), "event_date": event.isoformat(), "days_to_event": E, "coordinators": coordinators}
    if E <= 0:
        result.update({"feasible": False, "status": "infeasible", "reason": "The event date is today or in the past.",
                       "tasks": [], "critical_path": [], "findings": []})
        return result
    durations = {i: t["duration"] for i, t in tasks_d.items()}
    fixed, shift, status = {}, {}, {}
    for i, o in overrides.items():
        if i not in tasks_d:
            continue
        status[i] = o.get("status", "pending")
        if status[i] == "done":
            dd = dt.date.fromisoformat(o["done_date"]) if o.get("done_date") else today
            fixed[i] = min((dd - today).days, 0)
        if o.get("delay_days"):
            shift[i] = int(o["delay_days"])

    base = _cpm(tasks_d, today, event, fixed, durations, shift)
    lev = level(tasks_d, base, durations, fixed, 100 * coordinators, shift)

    min_slack = min(base["ls"][i] - base["es"][i] for i in tasks_d if i not in fixed) if len(fixed) < len(tasks_d) else 0
    # earliest feasible event date at normal durations: max over tasks of EF + ddl
    need = max(base["ef"][i] + (tasks_d[i]["ddl"] or 0) for i in tasks_d)
    earliest_days = max(need, 1)
    feasible_cpm = min_slack >= 0
    feasible_res = lev["tardiness"] == 0
    # crash analysis if infeasible
    crash = None
    if not feasible_cpm:
        crash = _crash(tasks_d, today, event, fixed, durations, shift)

    out_tasks = []
    crit_ids = []
    for i in base["order"]:
        t = tasks_d[i]
        slack = base["ls"][i] - base["es"][i] if i not in fixed else 0
        sd = today + dt.timedelta(days=lev["start"][i])
        fd = today + dt.timedelta(days=lev["finish"][i])
        lfd = today + dt.timedelta(days=base["lf"][i])
        res_late = lev["finish"][i] > base["lf"][i]
        critical = i not in fixed and slack == min_slack
        if critical:
            crit_ids.append(i)
        risk = "done" if status.get(i) == "done" else (
            "late" if (slack < 0 or res_late) else "at_risk" if slack <= 3 else "ok")
        out_tasks.append({
            "id": i, "name": t["name"], "phase": t["phase"], "category": t["category"], "deps": t["deps"],
            "duration": durations[i], "min_duration": t["min_duration"], "ddl": t["ddl"], "note": t["note"],
            "start": sd.isoformat(), "end": fd.isoformat(), "latest_finish": lfd.isoformat(), "slack": slack,
            "critical": critical, "risk": risk, "status": status.get(i, "pending"),
            "start_day": lev["start"][i], "end_day": lev["finish"][i], "lf_day": base["lf"][i],
        })
    # critical path as an ordered chain (follow tight dependencies)
    chain = _critical_chain(tasks_d, base, crit_ids)
    findings = []
    if not feasible_cpm:
        findings.append(f"INFEASIBLE: the deadlines cannot all be met — short by {-min_slack} day(s). "
                        f"Earliest feasible event date at normal durations: {(today + dt.timedelta(days=earliest_days)).strftime('%d %b %Y')}.")
    elif not feasible_res:
        findings.append(f"Task logic fits the date, but with {coordinators} coordinator(s) {lev['tardiness']} task-day(s) of lateness appear. "
                        "Add a helper or start earlier.")
    result.update({
        "feasible": feasible_cpm and feasible_res,
        "status": "infeasible" if not feasible_cpm else ("resource_limited" if not feasible_res else
                                                        ("tight" if min_slack <= 5 else "feasible")),
        "min_slack": min_slack, "earliest_feasible_date": (today + dt.timedelta(days=earliest_days)).isoformat(),
        "shortfall_days": max(0, -min_slack), "critical_path": chain,
        "critical_path_days": (base["ef"][chain[-1]] - base["es"][chain[0]]) if chain else 0,
        "tasks": out_tasks, "crash": crash, "findings": findings,
        "load": lev["load"], "resource_tardiness": lev["tardiness"],
        "algorithm": "CPM forward/backward pass + serial schedule-generation with 300 seeded random restarts",
    })
    return result


def _critical_chain(tasks, base, crit_ids) -> list[str]:
    """Longest chain of critical tasks linked by tight dependencies (finish of dep == start of task)."""
    if not crit_ids:
        return []
    crit = set(crit_ids)
    best, prev = {}, {}
    for i in base["order"]:
        if i not in crit:
            continue
        best[i] = 1
        for d in tasks[i]["deps"]:
            if d in crit and base["ef"][d] == base["es"][i] and best[d] + 1 > best[i]:
                best[i], prev[i] = best[d] + 1, d
    end = max(best, key=lambda x: (best[x], base["ef"][x]))
    chain = [end]
    while chain[-1] in prev:
        chain.append(prev[chain[-1]])
    return chain[::-1]


def _crash(tasks, today, event, fixed, durations, shift) -> dict:
    """Greedy compression of critical tasks toward min_duration until slack >= 0 (or stuck)."""
    dur = dict(durations)
    steps = []
    for _ in range(300):
        b = _cpm(tasks, today, event, fixed, dur, shift)
        ms = min(b["ls"][i] - b["es"][i] for i in tasks if i not in fixed)
        if ms >= 0:
            return {"achievable": True, "steps": _merge(steps), "days_saved": sum(s["days"] for s in _merge(steps))}
        cand = [i for i in tasks if i not in fixed and b["ls"][i] - b["es"][i] == ms and dur[i] > tasks[i]["min_duration"]]
        if not cand:
            return {"achievable": False, "steps": _merge(steps), "remaining_shortfall": -ms,
                    "message": "Even with every task rushed to its minimum duration the deadlines can't be met — move the date or cut scope."}
        pick = max(cand, key=lambda i: dur[i] - tasks[i]["min_duration"])
        dur[pick] -= 1
        steps.append({"task": pick, "name": tasks[pick]["name"]})
    return {"achievable": False, "steps": _merge(steps)}


def _merge(steps):
    d = {}
    for s in steps:
        d.setdefault(s["task"], {"task": s["task"], "name": s["name"], "days": 0})["days"] += 1
    return list(d.values())


# ---------------------------------------------------------------------------------------------
def diff_schedules(a: dict, b: dict) -> dict:
    """What moved between two schedules (by task id)."""
    ta = {t["id"]: t for t in a.get("tasks", [])}
    moved, newly_risky = [], []
    for t in b.get("tasks", []):
        o = ta.get(t["id"])
        if not o:
            continue
        ds = (dt.date.fromisoformat(t["start"]) - dt.date.fromisoformat(o["start"])).days
        de = (dt.date.fromisoformat(t["end"]) - dt.date.fromisoformat(o["end"])).days
        if ds or de:
            moved.append({"id": t["id"], "name": t["name"], "start_shift_days": ds, "end_shift_days": de})
        if t["risk"] in ("late", "at_risk") and o["risk"] not in ("late", "at_risk"):
            newly_risky.append({"id": t["id"], "name": t["name"], "risk": t["risk"]})
    return {"moved": moved, "moved_count": len(moved), "newly_at_risk": newly_risky,
            "feasible_before": a.get("feasible"), "feasible_after": b.get("feasible")}


def weekly_digest(sched: dict, today: dt.date | None = None, weeks: int = 4) -> list[dict]:
    today = today or dt.date.fromisoformat(sched["today"])
    wk0 = today - dt.timedelta(days=today.weekday())
    out = []
    for w in range(weeks):
        a = wk0 + dt.timedelta(weeks=w)
        b = a + dt.timedelta(days=6)
        start, due, risk = [], [], []
        for t in sched["tasks"]:
            if t["status"] == "done":
                continue
            s, e = dt.date.fromisoformat(t["start"]), dt.date.fromisoformat(t["end"])
            if a <= s <= b:
                start.append(t["name"])
            if a <= e <= b:
                due.append(t["name"])
                if t["risk"] in ("late", "at_risk"):
                    risk.append(t["name"])
        out.append({"week": w + 1, "from": a.isoformat(), "to": b.isoformat(), "start": start, "due": due, "at_risk": risk})
    return out


def digest_text(sched: dict, title: str) -> str:
    lines = [f"EventForge weekly digest — {title}", f"{sched['days_to_event']} days to go · status: {sched['status']}", ""]
    for w in weekly_digest(sched)[:2]:
        lines.append(f"Week of {w['from']}:")
        lines += [f"  ▶ start: {x}" for x in w["start"]] or ["  (nothing starts)"]
        lines += [f"  ✔ finish: {x}" for x in w["due"]]
        lines += [f"  ⚠ at risk: {x}" for x in w["at_risk"]]
        lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------------------------
def _esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _fold(line: str) -> str:
    b = line.encode()
    if len(b) <= 75:
        return line
    out, cur = [], b""
    for ch in line:
        c = ch.encode()
        if len(cur) + len(c) > 74:
            out.append(cur.decode())
            cur = b" "
        cur += c
    out.append(cur.decode())
    return "\r\n".join(out)


def to_ics(spec: EventSpec, sched: dict, programs: list[dict] | None, title: str) -> str:
    stamp = dt.datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//EventForge//Planner 1.0//EN", "CALSCALE:GREGORIAN",
         f"X-WR-CALNAME:{_esc(title)}"]

    def ev(uid, summary, d0, d1=None, desc="", alarm=False, start_time=None, end_time=None):
        L.append("BEGIN:VEVENT")
        L.append(f"UID:{uid}@eventforge")
        L.append(f"DTSTAMP:{stamp}")
        if start_time:
            L.append(f"DTSTART:{d0.strftime('%Y%m%d')}T{start_time.replace(':', '')}00")
            L.append(f"DTEND:{d0.strftime('%Y%m%d')}T{(end_time or start_time).replace(':', '')}00")
        else:
            L.append(f"DTSTART;VALUE=DATE:{d0.strftime('%Y%m%d')}")
            L.append(f"DTEND;VALUE=DATE:{((d1 or d0) + dt.timedelta(days=1)).strftime('%Y%m%d')}")
        L.append(_fold(f"SUMMARY:{_esc(summary)}"))
        if desc:
            L.append(_fold(f"DESCRIPTION:{_esc(desc)}"))
        if alarm:
            L.extend(["BEGIN:VALARM", "ACTION:DISPLAY", _fold(f"DESCRIPTION:{_esc(summary)}"), "TRIGGER:-P1D", "END:VALARM"])
        L.append("END:VEVENT")

    for t in sched.get("tasks", []):
        if t["status"] == "done":
            continue
        d0, d1 = dt.date.fromisoformat(t["start"]), dt.date.fromisoformat(t["end"])
        ev(f"task-{t['id']}", f"[Task] {t['name']}", d0, max(d0, d1 - dt.timedelta(days=1)),
           f"Phase: {t['phase']} · latest finish {t['latest_finish']} · slack {t['slack']}d" + (" · CRITICAL" if t["critical"] else ""),
           alarm=True)
    ev("event", f"{title} — EVENT DAY", spec.date, spec.date + dt.timedelta(days=spec.days - 1), "Planned with EventForge", alarm=True)
    for i, p in enumerate(programs or []):
        d = spec.date + dt.timedelta(days=p.get("day", 1) - 1)
        ev(f"prog-{i}", f"[Program] {p['name']}", d, None, p.get("zone_label", ""), start_time=p["start"], end_time=p["end"])
    L.append("END:VCALENDAR")
    return "\r\n".join(L) + "\r\n"
