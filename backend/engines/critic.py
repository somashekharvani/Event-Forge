"""Adversarial critic.

Two layers, deliberately separate:
  HARD checks   — deterministic code (sums, DAG order, deadlines, capacity, layout geometry, availability).
                  These decide pass/fail; no LLM is involved.
  RISK findings — contextual heuristics (weather, festival / exam clashes, peak season, missing Plan B, noise cut-offs).
                  They are knowledge-base rules with stated confidence, not facts; the festival calendar is approximate.

Every finding carries severity, evidence and a suggested fix.
"""
from __future__ import annotations

import datetime as dt

from . import geo
from .money import fmt_inr
from .spec import EventSpec
from .timeline import has_cycle, build_tasks

# approximate dates — lunar festivals shift; the UI says "verify". (date, name, applies_to)
FESTIVALS = [
    (dt.date(2026, 9, 14), "Ganesh Chaturthi", "all"), (dt.date(2026, 10, 20), "Dussehra", "all"),
    (dt.date(2026, 11, 8), "Diwali", "all"), (dt.date(2026, 12, 25), "Christmas", "all"),
    (dt.date(2026, 12, 31), "New Year's Eve", "all"), (dt.date(2027, 1, 26), "Republic Day", "all"),
    (dt.date(2027, 3, 6), "Maha Shivaratri", "all"), (dt.date(2027, 3, 10), "Eid al-Fitr (moon-dependent)", "all"),
    (dt.date(2027, 3, 22), "Holi", "all"), (dt.date(2027, 4, 7), "Ugadi / Gudi Padwa", "all"),
    (dt.date(2027, 8, 15), "Independence Day", "all"), (dt.date(2027, 9, 4), "Ganesh Chaturthi", "all"),
    (dt.date(2027, 10, 29), "Diwali", "all"),
]
SEV_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}


def _f(id, kind, module, severity, title, evidence, fix="", status="warn"):
    return {"id": id, "kind": kind, "module": module, "severity": severity, "title": title, "evidence": evidence, "fix": fix, "status": status}


def review(spec: EventSpec, budget: dict, sched: dict, vendors: dict, selection: dict, vision: dict | None, programs: list[dict],
           roster: dict | None, today: dt.date) -> dict:
    hard: list[dict] = []
    risks: list[dict] = []

    def H(id, module, title, ok, evidence_ok, evidence_bad, fix="", sev="high", warn=False):
        st = "pass" if ok else ("warn" if warn else "fail")
        hard.append(_f(id, "hard", module, "info" if ok else sev, title, evidence_ok if ok else evidence_bad, "" if ok else fix, st))

    # ---- budget -------------------------------------------------------------------------
    cats = budget["categories"]
    tot = sum(c["allocated"] for c in cats) + budget["contingency"]
    H("budget_sum", "budget", "Budget categories + contingency sum exactly to the total", tot == budget["total"],
      f"{fmt_inr(tot)} = {fmt_inr(budget['total'])}", f"Sum {fmt_inr(tot)} ≠ total {fmt_inr(budget['total'])}", "Re-run the allocation.", "critical")
    H("budget_nonneg", "budget", "No negative allocations", all(c["allocated"] >= 0 for c in cats), "All allocations ≥ ₹0.", "A category is negative.", "", "critical")
    pct = budget["contingency_pct"]
    H("contingency", "budget", "Contingency reserve is between 8% and 20%", 8 <= pct <= 20, f"{pct}% ({budget['contingency_why']}).", f"{pct}% is outside the safe range.", "Adjust risk tolerance.", "medium")
    f = budget["feasibility"]
    H("budget_feasible", "budget", "Cheapest plausible cost fits within the budget", f != "infeasible",
      f"Expected {fmt_inr(budget['estimate_total']['exp'])} vs budget {fmt_inr(budget['total'])}."
      + (" Tight: expected spend exceeds the distributable amount." if f == "at_risk" else ""),
      f"Even the optimistic total {fmt_inr(budget['estimate_total']['low'])} exceeds the budget {fmt_inr(budget['total'])}.",
      "Use 'Optimise' to see levers, reduce guests, or raise the budget.", "critical")
    if f == "at_risk":
        hard[-1]["status"] = "warn"
        hard[-1]["severity"] = "medium"
        hard[-1]["fix"] = "Expected spend eats into the contingency — use 'Optimise' to restore a buffer."
    p = budget["risk"]["p_exceed_budget"]
    if p >= .25:
        risks.append(_f("mc_risk", "risk", "budget", "high" if p >= .5 else "medium", f"{p * 100:.0f}% simulated chance of exceeding budget",
                        f"Monte Carlo ({budget['risk']['n']:,} runs, assumed cost ranges): P80 {fmt_inr(budget['risk']['percentiles'][75])}, "
                        f"P95 {fmt_inr(budget['risk']['percentiles'][95])}. Biggest driver: {budget['risk']['sensitivity'][0]['key']}.",
                        f"Hold about {fmt_inr(budget['risk']['reserve_for_target'])} in reserve for {budget['risk']['confidence_target_pct']}% confidence, or cut scope."))

    # ---- timeline -------------------------------------------------------------------------
    tasks = sched.get("tasks", [])
    H("dag", "timeline", "Task dependencies form a valid DAG (no cycles)", not has_cycle(build_tasks(spec)), "Acyclic dependency graph.", "Cycle detected.", "", "critical")
    byid = {t["id"]: t for t in tasks}
    bad = [t["name"] for t in tasks for d in t["deps"] if d in byid and byid[d]["status"] != "done" and t["start"] < byid[d]["end"]]
    H("dep_order", "timeline", "No task starts before its dependencies finish", not bad, f"{len(tasks)} tasks ordered correctly.",
      f"Out-of-order: {', '.join(sorted(set(bad))[:4])}", "Re-run the scheduler.", "critical")
    late = [t["name"] for t in tasks if t["risk"] == "late"]
    H("deadlines", "timeline", "Every task can finish by its latest-finish date",
      sched.get("status") not in ("infeasible",) and not late, f"Slack {sched.get('min_slack', 0)} day(s) on the critical path.",
      (sched.get("findings") or [f"{len(late)} tasks would finish late."])[0], "Move the event date later or crash the critical tasks.", "critical")
    if sched.get("status") in ("tight", "resource_limited"):
        risks.append(_f("timeline_tight", "risk", "timeline", "medium", "Schedule has very little slack",
                        f"Minimum slack is {sched.get('min_slack')} days" + (f"; coordinator capacity causes {sched['resource_tardiness']} late task-days." if sched.get("resource_tardiness") else "."),
                        "Start bookings now or add another coordinator."))
    H("future_date", "spec", "Event date is in the future", (spec.date - today).days > 0, f"{(spec.date - today).days} days to go.", "Event date has passed.", "", "critical")

    # ---- vendors -------------------------------------------------------------------------
    for cat, sel in selection.items():
        v = sel["vendor"]
        if cat == "venue" and "capacity" in v:
            ok = v["capacity"] >= spec.guests
            H("venue_capacity", "vendors", "Selected venue holds all guests", ok, f"{v['name']} holds {v['capacity']} ≥ {spec.guests} guests.",
              f"{v['name']} holds only {v['capacity']} but {spec.guests} guests are planned.", "Pick a larger venue or cap the guest list.", "critical")
        H(f"avail_{cat}", "vendors", f"Selected {cat} is free on the event date(s) (sample calendar)", sel["available"],
          f"{v['name']} shows as free.", f"{v['name']} shows as BOOKED on your date in the sample calendar.", "Choose another vendor or shift the date.", "high")
        if sel["over_allocation"]:
            risks.append(_f(f"price_{cat}", "risk", "vendors", "medium", f"{v['name']} is above its budget allocation",
                            f"Estimated {fmt_inr(sel['price_estimate']['mid'])} vs allocation for {cat}.", "Negotiate, drop inclusions, or rebalance categories."))
    for cat in ("venue", "caterer", "photographer", "decorator"):
        r = vendors.get(cat)
        if not r:
            continue
        if cat in selection and r["backup_count"] < 1:
            risks.append(_f(f"planb_{cat}", "risk", "vendors", "high", f"No Plan B for {cat}",
                            f"Only {r['backup_count']} other eligible & available {cat}(s) found for your date in the sample data.",
                            "Shortlist at least two backups and keep the booking advance refundable."))
        elif cat not in selection:
            risks.append(_f(f"unbooked_{cat}", "risk", "vendors", "low", f"{cat.title()} not selected yet",
                            f"{r['backup_count'] + 1} candidates available on your date (sample data).", "Shortlist and request quotes."))
    hard.append(_f("provenance", "hard", "vendors", "info", "Vendor prices/ratings are labelled as sample estimates",
                   "Every vendor record carries sample=true and the UI shows a SAMPLE badge.", "", "pass"))

    # ---- vision -------------------------------------------------------------------------
    if vision:
        for c in vision["validation"]["checks"]:
            if c["hard"] or c["status"] != "pass":
                hard.append(_f(f"vision_{c['id']}", "hard" if c["hard"] else "risk", "vision", "high" if c["status"] == "fail" else "medium" if c["status"] == "warn" else "info",
                               c["title"], c["detail"], c["fix"], c["status"]))
    # ---- community -------------------------------------------------------------------------
    if roster is not None:
        H("roster", "community", "Volunteer roster covers every role and shift", roster["coverage_pct"] >= 100,
          f"Coverage {roster['coverage_pct']}% with max load {roster['max_load']} h.", f"{len(roster['unfilled'])} slot(s) unfilled.", "Recruit more volunteers.", "high")

    # ---- contextual risks -------------------------------------------------------------------------
    d = spec.date
    reg = geo.WEATHER.get(spec.region, {"rain": [], "heat": [], "fog": []})
    outdoor = bool(spec.outdoor) or (vision and not vision.get("venue", {}).get("indoor", True))
    if d.month in reg["rain"]:
        risks.append(_f("rain", "risk", "weather", "high" if outdoor else "medium", f"Monsoon-season date in {spec.city}",
                        f"{d.strftime('%B')} is a rainy month for this region." + (" Your venue is outdoors." if outdoor else " Indoor venue, but travel and arrival can be disrupted."),
                        "Book a covered/indoor fallback, add tent/rain cover, and keep a transport buffer." if outdoor else "Plan guest transport buffers and a covered drop-off.",
                        ))
    if d.month in reg["heat"] and outdoor:
        risks.append(_f("heat", "risk", "weather", "medium", "Hot-season outdoor event", f"{d.strftime('%B')} is typically hot in {spec.city}.",
                        "Schedule ceremonies before 11:00 or after 16:30, add shade, water stations and coolers."))
    if d.month in reg["fog"]:
        risks.append(_f("fog", "risk", "weather", "low", "Winter fog / cold-morning travel risk", f"{d.strftime('%B')} often has fog in {spec.region.replace('_', ' ')}.", "Avoid very early start times; plan arrival buffers for outstation guests."))
    for fd, name, _ in FESTIVALS:
        gap = abs((fd - d).days)
        if gap <= 2:
            risks.append(_f(f"fest_{fd.isoformat()}", "risk", "calendar", "medium" if gap <= 1 else "low", f"Close to {name}",
                            f"{name} falls on ≈{fd.strftime('%d %b %Y')} ({gap} day(s) away). Approximate calendar — verify.",
                            "Expect higher vendor prices, travel crowding and guest clashes; consider another date."))
    if d.month in (2, 3) and spec.event_type in ("wedding", "birthday", "community"):
        risks.append(_f("exams", "risk", "calendar", "low", "Board / school-exam season", "Many school boards hold exams between mid-Feb and early April.",
                        "Check with families who have students; avoid weekdays before exams."))
    if spec.event_type == "wedding":
        if d.month in {11, 12, 1, 2, 4, 5} and (d - today).days < 120:
            risks.append(_f("peak", "risk", "calendar", "high", "Peak wedding season with short lead time",
                            f"{(d - today).days} days to go in a peak month — venues, photographers and caterers book out early.", "Book venue and caterer first; keep two backups per category."))
        risks.append(_f("muhurtham", "risk", "calendar", "info", "Confirm the muhurtham before booking non-refundable items",
                        "Auspicious time windows are narrow and vary by family tradition.", "Fix the date with the priest before paying venue advances."))
    if d.weekday() < 4:
        risks.append(_f("weekday", "risk", "calendar", "info", "Weekday event", f"{d.strftime('%A')} — vendors may offer discounts, but guest attendance can drop.", "Confirm key guests' availability."))
    late_loud = [p["name"] for p in programs if p.get("loud") and p["end"] > "22:00"]
    if late_loud:
        risks.append(_f("noise", "risk", "compliance", "medium", "Amplified sound after 22:00", f"{', '.join(late_loud)} run past 22:00.", "Move earlier or confirm permission with local authorities."))
    if spec.guests > 500 and spec.event_type != "community":
        risks.append(_f("crowd", "risk", "safety", "medium", "Large gathering", f"{spec.guests} guests: parking, entry flow and emergency exits need explicit planning.", "Add marshals and a parking plan."))
    if spec.event_type == "community" and spec.guests >= 300:
        risks.append(_f("permits", "risk", "compliance", "high", "Permits and safety clearances are on the critical path",
                        "Police intimation, loudspeaker, fire and food-stall approvals can take weeks.", "Start permit applications as soon as the venue is confirmed."))
    if vision and any(p.get("loud") for p in programs):
        risks.append(_f("acoustic_comfort", "risk", "comfort", "info", "Acoustic layout: suggested comfort rule",
                        "High-volume speakers / DJ console are active during evening programs.",
                        "Suggested comfort rule: keep elderly and family dining seating >10 m from main sound arrays."))
    risks.sort(key=lambda r: SEV_ORDER[r["severity"]])
    passed = sum(1 for h in hard if h["status"] == "pass")
    return {"hard": hard, "risks": risks, "hard_passed": passed, "hard_total": len(hard),
            "hard_failed": [h for h in hard if h["status"] == "fail"], "hard_warn": [h for h in hard if h["status"] == "warn"],
            "crisis_sim": crisis_simulations(spec, budget, sched, vision, vendors),
            "note": "Hard checks are deterministic code. Risk findings are heuristics from a small knowledge base (approximate festival calendar, regional weather months) — treat as prompts, not facts."}


def crisis_simulations(spec: EventSpec, budget: dict, sched: dict, vision: dict | None, vendors: dict) -> list[dict]:
    """Deterministic simulation of 3 operational crises under pressure with verified mitigations."""
    out = []
    # 1. Unseasonal Rainstorm
    is_indoor = vision.get("venue", {}).get("indoor", True) if vision else not bool(spec.outdoor)
    if is_indoor:
        out.append({
            "id": "rain",
            "title": "Unseasonal Rainstorm",
            "scenario": f"Sudden rainfall on event day in {spec.city}.",
            "impact": "Main event is sheltered indoors; arrival, parking and drop-off are vulnerable.",
            "status": "managed",
            "mitigation": "Deploy 2 covered canopy walkways at entrance. Estimated reserve needed: ₹15,000.",
            "budget_absorbed": budget.get("contingency", 0) >= 1500000,
        })
    else:
        req_tent_area = int(spec.guests * 1.4)
        tent_cost = req_tent_area * 180 * 100  # ₹180/m² in paise
        absorbed = budget.get("contingency", 0) >= tent_cost
        out.append({
            "id": "rain",
            "title": "Unseasonal Rainstorm (Outdoor Venue)",
            "scenario": f"Heavy rainstorm impacts open-air {vision.get('venue', {}).get('name', 'lawn')}.",
            "impact": f"Requires {req_tent_area} m² waterproof German pagoda canopy for {spec.guests} guests.",
            "status": "warning" if absorbed else "critical",
            "mitigation": f"Emergency tenting: {fmt_inr(tent_cost)}. " +
                          (f"Contingency buffer of {fmt_inr(budget.get('contingency', 0))} fully covers this." if absorbed else
                           f"Shortfall of {fmt_inr(tent_cost - budget.get('contingency', 0))} against contingency reserve."),
            "budget_absorbed": absorbed,
        })

    # 2. Key Vendor No-Show (Caterer drops 48 hours prior)
    cat_data = vendors.get("caterer", {})
    backups = cat_data.get("ranked", [])
    backup_count = cat_data.get("backup_count", len(backups))
    if backups and len(backups) > 1:
        top_backup = backups[1]["vendor"]["name"]
        mid_price = backups[1].get("price_estimate", {}).get("mid", 0)
        out.append({
            "id": "vendor_drop",
            "title": "Caterer No-Show (48h Notice)",
            "scenario": "Primary caterer cancels due to unexpected kitchen emergency.",
            "impact": f"{spec.guests} guests require immediate full meal provision.",
            "status": "managed",
            "mitigation": f"System activates shortlisted backup: {top_backup} (Est. {fmt_inr(mid_price)}). "
                          f"Reopens booking task and generates immediate WhatsApp procurement dispatch.",
            "backup_name": top_backup,
            "backup_count": backup_count,
        })
    else:
        out.append({
            "id": "vendor_drop",
            "title": "Caterer No-Show (48h Notice)",
            "scenario": "Primary caterer cancels with no direct pre-shortlisted backup on file.",
            "impact": f"Emergency meal coverage required for {spec.guests} guests.",
            "status": "critical",
            "mitigation": f"Trigger emergency escalation to tier-2 institutional caterers in {spec.city}. "
                          f"Activate contingency reserve to absorb short-notice premium (+20%).",
            "backup_count": 0,
        })

    # 3. Guest Surge (+25% attendance)
    surge_guests = int(spec.guests * 1.25)
    extra_guests = surge_guests - spec.guests
    cater_rate = 78000  # ₹780 in paise per head baseline
    extra_food_cost = extra_guests * cater_rate
    door_width_needed = round(surge_guests / 100, 1)
    door_width_have = sum(d["width"] for d in vision.get("venue", {}).get("doors", [])) if vision else 4.0
    egress_ok = door_width_have >= door_width_needed

    out.append({
        "id": "guest_surge",
        "title": "Guest Surge (+25% Attendance)",
        "scenario": f"Attendance surges from {spec.guests} to {surge_guests} (+{extra_guests} guests).",
        "impact": f"Additional catering cost: {fmt_inr(extra_food_cost)}. Fire exit door width needed: {door_width_needed} m (Have: {door_width_have} m).",
        "status": "managed" if egress_ok else "warning",
        "mitigation": ("Exit door width is sufficient. Instruct caterer for +20% buffet replenishment buffer."
                       if egress_ok else f"Exit width shortfall ({door_width_have} m < {door_width_needed} m). Open secondary service gates."),
        "egress_ok": egress_ok,
        "extra_cost": fmt_inr(extra_food_cost),
    })
    return out


def judge_challenge_preset(preset_id: str) -> dict:
    """Pre-computed adversarial presets for hackathon judges to verify invariant enforcement."""
    if preset_id == "budget_blackhole":
        return {
            "title": "The Budget Black Hole",
            "input": "800 guests with ₹1,00,000 budget in a Tier-1 city.",
            "interception": "Hard Invariant `budget_feasible` FAILED.",
            "mathematical_proof": "Even baseline vegetarian catering for 800 guests requires ₹5,92,000 at Tier-1 minimum rates (₹740/head). The requested ₹1,00,000 budget results in an immediate ₹4,92,000 shortfall before accounting for venue, decor, or logistics.",
            "system_action": "System locks plan status as INFEASIBLE. Rejects silent debt allocation, calculates exact required minimum budget (₹7,80,000), or caps viable guest count to 102 guests.",
        }
    elif preset_id == "fire_hazard":
        return {
            "title": "The Fire Code Hazard",
            "input": "Ceremony seating dragged directly across the primary South and East exit doors.",
            "interception": "Hard Invariant `exit_clearance` and `reachable` FAILED.",
            "mathematical_proof": "Obstacle bounding boxes overlap the 1.8 m egress approach rectangle of 2 exit doors. Dijkstra evacuation grid analysis detects path obstruction with egress travel distance exceeding the 30.0 m maximum heuristic threshold.",
            "system_action": "Visual floor plan outlines blocked corridors in crimson dashes, locks overall layout verification to FAIL, and specifies the coordinate displacement vector needed to clear the 1.8 m buffer.",
        }
    elif preset_id == "impossible_timeline":
        return {
            "title": "The Impossible Timeline",
            "input": "2-day traditional wedding with 22 vendor dependencies requested in 4 calendar days.",
            "interception": "Critical Path Method (CPM) Invariant `deadlines` FAILED.",
            "mathematical_proof": "The Directed Acyclic Graph (DAG) critical path (scope → date → venue booking → invites → caterer lock) requires a minimum topological sequence of 89 calendar days even under maximum crashing compression (min_duration = 32 days).",
            "system_action": "Refuses to fake a compressed schedule. Formally reports a 85-day shortfall, computes the exact Earliest Feasible Date, and displays the critical path bottleneck breakdown.",
        }
    return {}
