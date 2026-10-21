"""Community-event toolkit: volunteer roster (balanced shifts), permit & safety checklist, sponsorship pitch,
crowd / food / facilities estimator. All quantities are planning rules of thumb, not regulations — verify locally."""
from __future__ import annotations

import math
import random
import statistics

from .money import allocate, fmt_inr, to_paise
from .spec import EventSpec

ROLES = [  # role, volunteers per 100 expected attendees (min 1), skill
    ("Registration & help desk", 1.0), ("Crowd & queue management", 1.5), ("Food service & hygiene", 2.0),
    ("Stage & program coordination", .8), ("First-aid & lost-and-found", .5), ("Parking & entry/exit", 1.0),
    ("Cleanliness & waste", 1.0),
]


def _hours(start: str, end: str) -> list[int]:
    s, e = int(start.split(":")[0]), int(end.split(":")[0])
    return list(range(s, max(e, s + 1)))


def volunteer_roster(guests: int, start: str = "09:00", end: str = "18:00", shift_len: int = 3, volunteers: list[dict] | None = None,
                     max_hours: int = 6, seed: int = 5) -> dict:
    """Assign volunteers to (role, shift) slots, balancing load.

    Greedy fill with a fairness objective (always pick the least-loaded eligible volunteer) followed by
    swap-based local improvement that reduces the maximum load. Reports unfilled slots honestly."""
    hours = _hours(start, end)
    n_shifts = max(1, math.ceil(len(hours) / shift_len))
    shifts = []
    for i in range(n_shifts):
        s = hours[0] + i * shift_len
        e = min(s + shift_len, hours[-1] + 1)
        shifts.append((s, e))
    need = {}
    for role, per100 in ROLES:
        need[role] = max(1, math.ceil(guests / 100 * per100 / 2))  # per shift
    total_slots = sum(need.values()) * n_shifts
    if not volunteers:
        per_vol = max(1, max_hours // shift_len)          # shifts one volunteer can cover
        n_vol = max(8, math.ceil(total_slots / per_vol * 1.08))
        volunteers = [{"name": f"Volunteer {i + 1}", "availability": None, "skills": []} for i in range(n_vol)]
    rng = random.Random(seed)
    load = {v["name"]: 0 for v in volunteers}
    assign: dict[tuple, list[str]] = {}
    busy: dict[str, set[int]] = {v["name"]: set() for v in volunteers}
    unfilled = []
    order = [(si, role) for si in range(n_shifts) for role, _ in ROLES]

    def avail(v, si):
        a = v.get("availability")
        s, e = shifts[si]
        return (a is None or (a[0] <= s and a[1] >= e)) and si not in busy[v["name"]] and load[v["name"]] + (e - s) <= max_hours

    for si, role in order:
        got = []
        for _ in range(need[role]):
            cand = [v for v in volunteers if avail(v, si) and v["name"] not in got and
                    (not v.get("skills") or role in v["skills"] or not any(role in w.get("skills", []) for w in volunteers))]
            if not cand:
                unfilled.append({"role": role, "shift": f"{shifts[si][0]:02d}:00–{shifts[si][1]:02d}:00"})
                continue
            cand.sort(key=lambda v: (load[v["name"]], rng.random()))
            v = cand[0]
            got.append(v["name"])
            load[v["name"]] += shifts[si][1] - shifts[si][0]
            busy[v["name"]].add(si)
        assign[(si, role)] = got
    # local improvement: swap a slot from the max-loaded to the min-loaded volunteer if legal
    improved = 0
    for _ in range(200):
        hi = max(load, key=load.get)
        lo = min(load, key=load.get)
        if load[hi] - load[lo] <= shifts[0][1] - shifts[0][0]:
            break
        moved = False
        for (si, role), names in assign.items():
            if hi in names and lo not in names and si not in busy[lo]:
                vlo = next(v for v in volunteers if v["name"] == lo)
                if avail(vlo, si):
                    d = shifts[si][1] - shifts[si][0]
                    names[names.index(hi)] = lo
                    busy[hi].discard(si); busy[lo].add(si)
                    load[hi] -= d; load[lo] += d
                    moved = True; improved += 1
                    break
        if not moved:
            break
    table = []
    for si, (s, e) in enumerate(shifts):
        table.append({"shift": f"{s:02d}:00–{e:02d}:00", "roles": [{"role": r, "needed": need[r], "assigned": assign[(si, r)]} for r, _ in ROLES]})
    loads = list(load.values())
    return {"shifts": table, "volunteers": len(volunteers), "load_hours": load, "max_load": max(loads) if loads else 0,
            "min_load": min(loads) if loads else 0, "stdev": round(statistics.pstdev(loads), 2) if loads else 0,
            "unfilled": unfilled, "coverage_pct": round(100 * (1 - len(unfilled) / max(total_slots, 1)), 1),
            "swaps_improved": improved,
            "note": "Balanced greedy assignment + swap improvement (not a proven-optimal integer program)."}


def permits_checklist(spec: EventSpec, loud: bool = True, food_stalls: bool = True, outdoor: bool | None = None) -> dict:
    g = spec.guests
    size = "small (<100)" if g < 100 else "medium (100–500)" if g < 500 else "large (500–2,000)" if g < 2000 else "very large (2,000+)"
    items = [
        {"item": "Written permission from the venue / ground owner (society, school, temple trust or municipality)", "when": "≥ 6 weeks", "applies": True},
        {"item": "Local police intimation / permission for a public gathering", "when": "≥ 3 weeks", "applies": g >= 100 or spec.event_type == "community"},
        {"item": "Loudspeaker / amplified-sound permission and observe night-time noise limits (commonly no amplified sound after 10 pm)",
         "when": "≥ 3 weeks", "applies": loud},
        {"item": "Food-safety registration/licence for stalls and caterers (FSSAI — temporary registration for stalls)", "when": "≥ 3 weeks", "applies": food_stalls},
        {"item": "Fire-safety clearance for temporary structures, tents, stages and decorative lighting", "when": "≥ 3 weeks", "applies": g >= 300},
        {"item": "Temporary electricity connection or generator with a licensed electrician; earthing & MCBs checked", "when": "≥ 2 weeks", "applies": True},
        {"item": "Municipal permission for road use / banners / hoardings and waste disposal plan", "when": "≥ 3 weeks", "applies": spec.event_type == "community"},
        {"item": "Event insurance / public-liability cover (consider for large or sponsored events)", "when": "≥ 2 weeks", "applies": g >= 500},
        {"item": "Traffic & parking plan (marshals, signage, no-parking on access roads)", "when": "≥ 2 weeks", "applies": g >= 200},
    ]
    safety = [
        "Two or more clearly marked exits, kept unobstructed; announce them at the start",
        f"First-aid post staffed by trained volunteers; nearest hospital & ambulance numbers displayed ({max(1, g // 500 + 1)} post(s) suggested)",
        "Fire extinguishers near the stage, kitchen and generator; no open flames near fabric decor",
        "Lost-child / lost-and-found desk and a volunteer briefing on the emergency plan",
        "Crowd density: plan ≤ 2 people per m² standing in open areas (lower in queues and near the stage)",
        "Water & shade/cooling in hot months; covered area and slip-safe flooring in rain",
        "Single-use plastic avoided; waste segregation points and a clean-up crew",
    ]
    return {"size_class": size, "permits": [i for i in items if i["applies"]], "safety": safety,
            "disclaimer": "Rules differ by state, city and venue. Treat this as a prompt list and confirm every item with the local authority."}


def sponsorship_pitch(spec: EventSpec, org: str = "Our community group", impact: str = "") -> dict:
    footfall = spec.guests
    target = int(spec.budget_paise * .5)             # aim to raise half through sponsors
    tiers = [("Title sponsor", .35, 1), ("Gold", .2, 2), ("Silver", .1, 3), ("Community partner", .05, 5)]
    pool = allocate(target, {t[0]: t[1] * t[2] for t in tiers})
    rows = []
    for name, share, count in tiers:
        amt = pool[name] // count
        rows.append({"tier": name, "slots": count, "amount": amt, "benefits": {
            "Title sponsor": ["Event named 'presented by'", "Logo on stage, banners & social posts", "2-min address & stall space", "Mentions in all publicity"],
            "Gold": ["Logo on banners & posters", "Stall space", "Social media thank-you"],
            "Silver": ["Logo on banner", "Social media thank-you"],
            "Community partner": ["Name on thank-you board", "In-kind support recognised (food, water, printing)"]}[name]})
    d = spec.date.strftime("%d %B %Y") if spec.date else "our event date"
    text = (f"Dear Sir/Madam,\n\n{org} is organising a community event in {spec.city} on {d}, expected to welcome about {footfall} "
            f"residents and visitors. {impact or 'The day includes cultural programs, food, games and activities for all ages.'}\n\n"
            f"We are inviting local businesses to partner with us. Sponsorship tiers: " +
            "; ".join(f"{r['tier']} {fmt_inr(r['amount'])}" for r in rows) +
            ".\n\nIn-kind support (food, water, printing, tents, sound) is equally welcome and will be acknowledged.\n\n"
            "We would be happy to meet for 15 minutes and share the budget and plan.\n\nWarm regards,\n[Name, role, phone]")
    return {"target": target, "tiers": rows, "pitch": text, "goal_pct": 50,
            "note": "Tier amounts are suggestions scaled to your budget, not market benchmarks."}


def estimator(spec: EventSpec, attendance_pct: int | None = None, meals: int = 1, area_m2: float | None = None) -> dict:
    """Crowd, food, water, toilet and counter estimates (rules of thumb)."""
    open_event = spec.event_type == "community"
    show = attendance_pct if attendance_pct is not None else (70 if open_event else 90)
    expected = round(spec.guests * show / 100)
    peak = round(expected * (.45 if open_event else .8))     # concurrent presence at the busiest hour
    buffer = 1.10
    plates = math.ceil(expected * (.85 if open_event else 1.0) * meals * buffer)
    per_person_g = {"rice_cooked_kg": .25, "dal_sambar_l": .15, "veg_curry_kg": .12, "sweet_pieces": 2, "snack_pieces": 3}
    food = {"plates": plates}
    for k, v in per_person_g.items():
        food[k] = round(plates * v, 1)
    food["water_litres"] = round(expected * (1.2 if open_event else 1.0), 0)
    food["tea_coffee_cups"] = expected * (2 if open_event else 1)
    counters = max(2, math.ceil(peak / 120))                  # one buffet line serves ~120 guests per 30 minutes
    toilets = max(2, math.ceil(peak / 50))
    out = {"expected_attendance": expected, "peak_concurrent": peak, "attendance_pct": show, "food": food,
           "buffet_lines": counters, "toilets": toilets, "handwash_points": max(2, toilets // 2),
           "dustbins": max(4, math.ceil(peak / 40)), "volunteers_suggested": max(8, math.ceil(peak / 25)),
           "serving_time_minutes": math.ceil(peak / (counters * 4)), "assumptions": [
               "10% buffer on plates; per-person quantities are caterer rules of thumb (rice 250 g cooked, dal/sambar 150 ml, curry 120 g)",
               "One buffet line ≈ 4 guests/minute; toilets ≈ 1 per 50 concurrent guests; verify with your caterer & venue"]}
    if area_m2:
        dens = peak / area_m2
        out["density_per_m2"] = round(dens, 2)
        out["density_status"] = "comfortable" if dens <= 1 else "busy" if dens <= 2 else "unsafe — reduce attendance or add area"
    return out
