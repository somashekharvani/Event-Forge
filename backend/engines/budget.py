"""Budget engine: the LLM-style "judgement" (weights) is rule-driven and explained; ALL arithmetic is integer paise.

Parts
  1. allocate_budget  - category weights (event type, priorities, avoid-list) -> exact integer allocation
  2. estimate_costs   - transparent cost model (low / expected / high per category) from city tier, guests, days, diet
  3. monte_carlo      - correlated simulation of total cost -> P(over budget), percentiles, histogram, sensitivity
  4. what_if          - recompute with changed inputs and diff
  5. optimize         - greedy lever search to bring an over-budget plan back within budget
  6. track_expenses   - planned vs actual with overrun warnings and forecast

All cost-model numbers are ASSUMPTIONS (planning heuristics), not calibrated market data. The UI says so.
"""
from __future__ import annotations

import copy
import datetime as dt

import numpy as np

from . import geo
from .money import allocate, fmt_inr, to_paise
from .spec import EventSpec

CATEGORIES: dict[str, list[tuple[str, str, float]]] = {
    "wedding": [("venue", "Venue & rentals", .20), ("catering", "Catering", .30), ("decor", "Decor & flowers", .12),
                ("photo_video", "Photography & video", .08), ("entertainment", "Music & entertainment", .05),
                ("attire_beauty", "Attire, makeup & mehendi", .08), ("rituals", "Priest & ritual items", .03),
                ("invitations", "Invitations & gifts", .04), ("logistics", "Transport & guest stay", .07),
                ("misc", "Miscellaneous", .03)],
    "birthday": [("venue", "Venue", .18), ("catering", "Food & cake", .32), ("decor", "Decor & balloons", .14),
                 ("cake", "Cake & desserts", .06), ("entertainment", "Entertainment & games", .14),
                 ("photo_video", "Photography", .06), ("return_gifts", "Return gifts", .06),
                 ("invitations", "Invitations", .02), ("misc", "Miscellaneous", .02)],
    "community": [("venue_permits", "Venue, permits & fees", .12), ("food", "Food & water", .30),
                  ("sound_lights", "Sound, lights & stage", .15), ("decor", "Decor & signage", .08),
                  ("printing", "Printing & publicity", .05), ("safety_medical", "Safety & first aid", .08),
                  ("volunteer_kits", "Volunteer kits & refreshments", .07), ("activities", "Activities & prizes", .10),
                  ("misc", "Miscellaneous", .05)],
}
# priority keyword -> category key (per event type)
PRIORITY_MAP = {
    "wedding": {"food": "catering", "decor": "decor", "photography": "photo_video", "music": "entertainment", "venue": "venue"},
    "birthday": {"food": "catering", "decor": "decor", "photography": "photo_video", "music": "entertainment", "venue": "venue"},
    "community": {"food": "food", "decor": "decor", "photography": "printing", "music": "sound_lights", "venue": "venue_permits"},
}
AVOID_EFFECT = {"loud music": ("entertainment", "sound_lights"), "alcohol": (), "firecrackers": ()}

# --- cost-model assumptions -------------------------------------------------------------------
CATER_PER_HEAD = {"veg": 740, "mostly_veg": 780, "mixed": 860, "nonveg": 1050, "jain": 790}   # ₹ per guest per full meal, tier-1
CATER_PER_HEAD_BDAY = {"veg": 480, "mostly_veg": 520, "mixed": 600, "nonveg": 700, "jain": 520}
CATER_PER_HEAD_COMM = {"veg": 140, "mostly_veg": 150, "mixed": 170, "nonveg": 190, "jain": 140}
PEAK_MONTHS = {11, 12, 1, 2, 4, 5}
# elasticity of each category to guest count (cost ∝ guests^elasticity)
ELASTICITY = {"venue": .35, "catering": 1.0, "food": 1.0, "decor": .25, "photo_video": .1, "entertainment": .1,
              "attire_beauty": .0, "rituals": .0, "invitations": .9, "logistics": .8, "misc": .5, "cake": .6,
              "return_gifts": 1.0, "venue_permits": .3, "sound_lights": .3, "printing": .3, "safety_medical": .4,
              "volunteer_kits": .6, "activities": .4}
# low/high factors around the expected cost (uncertainty width)
SPREAD = {"venue": (.9, 1.2), "catering": (.9, 1.3), "food": (.9, 1.3), "decor": (.8, 1.6), "photo_video": (.9, 1.3),
          "entertainment": (.8, 1.5), "attire_beauty": (.8, 1.5), "rituals": (.85, 1.3), "invitations": (.85, 1.3),
          "logistics": (.8, 1.6), "misc": (.5, 2.0), "cake": (.9, 1.3), "return_gifts": (.85, 1.25),
          "venue_permits": (.9, 1.4), "sound_lights": (.85, 1.4), "printing": (.85, 1.3), "safety_medical": (.9, 1.3),
          "volunteer_kits": (.85, 1.3), "activities": (.7, 1.6)}


def category_list(spec: EventSpec) -> list[tuple[str, str, float]]:
    return CATEGORIES[spec.event_type]


def _scale(spec: EventSpec) -> tuple[float, float]:
    tier_m = geo.TIER_MULT[spec.tier]
    peak = 1.10 if (spec.date and spec.date.month in PEAK_MONTHS and spec.event_type == "wedding") else 1.0
    return tier_m, peak


def base_expected_rupees(spec: EventSpec, key: str) -> float:
    """Expected cost in ₹ for one category at the spec's guest count (before vendor overrides)."""
    G, D = spec.guests, spec.days
    m, peak = _scale(spec)
    t = spec.event_type
    if t == "wedding":
        meals = 1 + .75 * (D - 1) + .25
        v = {
            "venue": (45000 + 380 * G) * D ** .85 * m * peak * (1.15 if spec.outdoor else 1.0),
            "catering": CATER_PER_HEAD[spec.diet] * m * meals * G,
            "decor": (35000 + 330 * G) * D ** .8 * m * peak,
            "photo_video": (50000 + 55 * G) * D ** .7 * m * peak,
            "entertainment": (30000 + 60 * G) * D ** .7 * m,
            "attire_beauty": 105000 * m * (1 + .25 * (D - 1)),
            "rituals": 35000 * m * D ** .5,
            "invitations": (12000 + 160 * G) * m,
            "logistics": (18000 + 210 * G) * m * D ** .6,
            "misc": 30000 * m + 50 * G,
        }
    elif t == "birthday":
        kid = (spec.celebrant_age or 30) <= 12
        v = {
            "venue": (10000 + 140 * G) * m,
            "catering": CATER_PER_HEAD_BDAY[spec.diet] * m * G * (.9 if kid else 1.0),
            "decor": (7000 + 200 * G * (1.3 if kid else 1.0)) * m,
            "cake": (3500 + 90 * G) * m,
            "entertainment": (7000 + 200 * G * (1.0 if kid else .6)) * m,
            "photo_video": (7000 + 80 * G) * m,
            "return_gifts": (110 if kid else 60) * G * m,
            "invitations": (2500 + 25 * G) * m,
            "misc": 3000 * m + 40 * G,
        }
    else:
        v = {
            "venue_permits": (12000 + 60 * G) * m,
            "food": CATER_PER_HEAD_COMM[spec.diet] * m * G * .85,   # not every visitor eats
            "sound_lights": (25000 + 40 * G) * m,
            "decor": (12000 + 30 * G) * m,
            "printing": (6000 + 15 * G) * m,
            "safety_medical": (8000 + 35 * G) * m,
            "volunteer_kits": (4000 + 45 * G) * m,
            "activities": (10000 + 55 * G) * m,
            "misc": 6000 * m + 20 * G,
        }
    return v[key]


def estimate_costs(spec: EventSpec, vendor_prices: dict[str, int] | None = None) -> dict[str, dict]:
    """Per-category {low, exp, high} in paise. Selected-vendor quotes (paise) override the model for that category
    with a narrow spread, because a quote is more certain than a heuristic."""
    out = {}
    for key, label, _w in category_list(spec):
        exp = to_paise(base_expected_rupees(spec, key))
        lo_f, hi_f = SPREAD[key]
        if vendor_prices and key in vendor_prices:
            exp = int(vendor_prices[key])
            lo_f, hi_f = .97, 1.06
            src = "vendor quote (sample dataset)"
        else:
            src = "cost model assumption"
        out[key] = {"low": int(exp * lo_f), "exp": exp, "high": int(exp * hi_f), "source": src,
                    "elasticity": ELASTICITY[key]}
    return out


def contingency_pct(spec: EventSpec) -> tuple[int, str]:
    pct, why = 10, ["base 10%"]
    if spec.outdoor:
        pct += 2; why.append("+2% outdoor (weather)")
    if spec.guests > 300:
        pct += 2; why.append("+2% large guest count")
    if spec.days > 1:
        pct += 1; why.append("+1% multi-day logistics")
    if spec.risk_tolerance == "low":
        pct += 2; why.append("+2% low risk tolerance")
    pct = min(pct, 15)
    return pct, ", ".join(why)


def allocate_budget(spec: EventSpec, custom_weights: dict[str, float] | None = None) -> dict:
    cats = category_list(spec)
    weights = {k: w for k, _l, w in cats}
    why = {k: f"Typical {spec.event_type} share {w * 100:.0f}% of spend." for k, _l, w in cats}
    pmap = PRIORITY_MAP[spec.event_type]
    for rank, p in enumerate(spec.priorities):
        k = pmap.get(p)
        if k in weights:
            boost = 1.35 if rank == 0 else 1.2
            weights[k] *= boost
            why[k] += f" Boosted ×{boost} because '{p}' is priority #{rank + 1}."
    for a in spec.avoid:
        for k in AVOID_EFFECT.get(a, ()):
            if k in weights:
                weights[k] *= .6
                why[k] += f" Reduced ×0.6 because you want to avoid {a}."
    if custom_weights:
        for k, w in custom_weights.items():
            if k in weights:
                weights[k] = w
                why[k] += " Manually overridden."
    pct, pct_why = contingency_pct(spec)
    cont = spec.budget_paise * pct // 100
    distributable = spec.budget_paise - cont
    alloc = allocate(distributable, weights)
    s = sum(weights.values())
    rows = []
    for k, label, _w in cats:
        rows.append({"key": k, "label": label, "weight": round(weights[k] / s, 4), "allocated": alloc[k],
                     "per_head": alloc[k] // max(spec.guests, 1), "why": why[k]})
    return {"total": spec.budget_paise, "contingency_pct": pct, "contingency_why": pct_why, "contingency": cont,
            "distributable": distributable, "categories": rows,
            "per_head_total": spec.budget_paise // spec.guests,
            "per_head_distributable": distributable // spec.guests}


def build_budget(spec: EventSpec, vendor_prices: dict[str, int] | None = None,
                 custom_weights: dict[str, float] | None = None) -> dict:
    plan = allocate_budget(spec, custom_weights)
    est = estimate_costs(spec, vendor_prices)
    for row in plan["categories"]:
        e = est[row["key"]]
        row["estimate"] = e
        row["gap"] = row["allocated"] - e["exp"]       # + = headroom, - = shortfall vs allocation
        row["status"] = "over" if e["exp"] > row["allocated"] * 1.10 else ("tight" if e["exp"] > row["allocated"] else "ok")
    tot_low = sum(e["low"] for e in est.values())
    tot_exp = sum(e["exp"] for e in est.values())
    tot_high = sum(e["high"] for e in est.values())
    plan["estimate_total"] = {"low": tot_low, "exp": tot_exp, "high": tot_high}
    plan["headroom"] = spec.budget_paise - tot_exp          # vs FULL budget (contingency available to absorb)
    plan["feasibility"] = ("infeasible" if tot_low > spec.budget_paise else
                           "at_risk" if tot_exp > plan["distributable"] else "feasible")
    plan["checks"] = {
        "sums_to_total": sum(r["allocated"] for r in plan["categories"]) + plan["contingency"] == spec.budget_paise,
        "no_negative": all(r["allocated"] >= 0 for r in plan["categories"]),
    }
    plan["risk"] = monte_carlo(spec, est, plan)
    plan["pareto_strategies"] = pareto_strategies(spec, plan)
    plan["tax_audit"] = audit_taxes(spec, plan)
    plan["disclaimer"] = ("Cost ranges are planning assumptions (city tier, guest count, diet, season) — not calibrated "
                          "market data. Replace with real vendor quotes as you receive them.")
    return plan


def pareto_strategies(spec: EventSpec, plan: dict) -> list[dict]:
    """Generates 3 mathematical Pareto trade-off strategies showing savings vs. compromises."""
    alloc_map = {r["key"]: r["allocated"] for r in plan["categories"]}

    # 1. The Guest Trim (15% reduction)
    trim_pct = 0.15
    new_guests = max(10, int(round(spec.guests * (1 - trim_pct))))
    guests_cut = spec.guests - new_guests
    cater_saving = int(alloc_map.get("catering", alloc_map.get("food", 0)) * trim_pct)
    venue_var_saving = int(alloc_map.get("venue", 0) * 0.08)
    misc_saving = int(alloc_map.get("logistics", 0) * 0.12)
    s1_saving = cater_saving + venue_var_saving + misc_saving

    # 2. The Seasonal & Buffet Pivot
    decor_saving = int(alloc_map.get("decor", 0) * 0.25)
    cater_buffet_saving = int(alloc_map.get("catering", alloc_map.get("food", 0)) * 0.12)
    s2_saving = decor_saving + cater_buffet_saving

    # 3. The Schedule Compression
    if spec.days > 1:
        s3_saving = int(alloc_map.get("venue", 0) * 0.30) + int(alloc_map.get("logistics", 0) * 0.25)
        s3_gives_up = "Separate day venue rental and multiple setup/makeup cycles."
        s3_changes = {"days": spec.days - 1}
    else:
        s3_saving = int(alloc_map.get("photo_video", 0) * 0.20) + int(alloc_map.get("entertainment", 0) * 0.25)
        s3_gives_up = "Overtime coverage and multi-cam extended drone recordings."
        s3_changes = {"risk_tolerance": "high"}

    return [
        {
            "id": "guest_trim",
            "name": "The Guest Trim",
            "saving": s1_saving,
            "saving_fmt": fmt_inr(s1_saving),
            "keeps": "Luxury catering tier, premium floral decor, and full photo/video coverage.",
            "gives_up": f"Invitations for ~{guests_cut} extended guests (Attendance: {spec.guests} → {new_guests}).",
            "changes": {"guests": new_guests},
            "icon": "👥",
        },
        {
            "id": "seasonal_pivot",
            "name": "Seasonal Floral & Buffet Pivot",
            "saving": s2_saving,
            "saving_fmt": fmt_inr(s2_saving),
            "keeps": f"All {spec.guests} guests invited; full program and entertainment intact.",
            "gives_up": "Imported exotic florals and plated table service (switches to Marigold/Mango leaf & buffet).",
            "changes": {"theme": "marigold_heritage"},
            "icon": "🌸",
        },
        {
            "id": "schedule_compression",
            "name": "Schedule & Shift Compression",
            "saving": s3_saving,
            "saving_fmt": fmt_inr(s3_saving),
            "keeps": "All core rituals, traditions, and primary guest list.",
            "gives_up": s3_gives_up,
            "changes": s3_changes,
            "icon": "⚡",
        },
    ]


def audit_taxes(spec: EventSpec, plan: dict) -> dict:
    """Calculates category-level GST exposure and ancillary surcharges."""
    alloc_map = {r["key"]: r["allocated"] for r in plan["categories"]}

    rates = {
        "venue": (0.18, "18% GST (Commercial rental SAC 997212)"),
        "venue_permits": (0.18, "18% GST (Rental SAC 997212)"),
        "decor": (0.18, "18% GST (Event decor SAC 998599)"),
        "photo_video": (0.18, "18% GST (Photography SAC 998381)"),
        "entertainment": (0.18, "18% GST (Entertainment SAC 9996)"),
        "sound_lights": (0.18, "18% GST (Sound/PA equipment rental)"),
        "catering": (0.05, "5% GST (Standalone outdoor catering SAC 996331)"),
        "food": (0.05, "5% GST (Standalone outdoor catering SAC 996331)"),
        "logistics": (0.05, "5% GST (Transport / cab fleet SAC 9964)"),
        "attire_beauty": (0.18, "18% GST (Salon / makeup SAC 9997)"),
    }

    rows = []
    total_tax = 0
    for k, alloc in alloc_map.items():
        if alloc <= 0:
            continue
        rate, rule = rates.get(k, (0.18, "18% GST standard rate"))
        tax_amt = int(alloc * rate)
        total_tax += tax_amt
        label = next((r["label"] for r in plan["categories"] if r["key"] == k), k.title())
        rows.append({
            "category": k,
            "label": label,
            "allocated": alloc,
            "allocated_fmt": fmt_inr(alloc),
            "rate_pct": int(rate * 100),
            "tax_paise": tax_amt,
            "tax_fmt": fmt_inr(tax_amt),
            "rule": rule,
        })

    gen_diesel = (20000 if spec.guests > 300 else 12000) * 100
    sound_permit = 6000 * 100
    surcharges = gen_diesel + sound_permit
    true_cost = plan["distributable"] + total_tax + surcharges

    return {
        "rows": rows,
        "total_tax": total_tax,
        "total_tax_fmt": fmt_inr(total_tax),
        "surcharges": surcharges,
        "surcharges_fmt": fmt_inr(surcharges),
        "surcharges_detail": f"Generator diesel backup ({fmt_inr(gen_diesel)}) + Municipal sound clearance ({fmt_inr(sound_permit)})",
        "true_cost": true_cost,
        "true_cost_fmt": fmt_inr(true_cost),
        "tax_inflation_pct": round(((true_cost - plan["distributable"]) / max(plan["distributable"], 1)) * 100, 1),
        "disclaimer": "Typical rates — verify with your CA / tax advisor. Hotel venues with room tariff > ₹7,500/night may attract 18% on catering instead of 5%."
    }


# ---------------------------------------------------------------------------------------------
def monte_carlo(spec: EventSpec, est: dict, plan: dict, n: int = 10000, seed: int = 7) -> dict:
    """Simulate total cost.  Each category ~ Triangular(low, exp, high); a shared lognormal 'market shock' and a
    guest-count uncertainty factor create realistic correlation (a bad market raises everything together)."""
    rng = np.random.default_rng(seed)
    keys = list(est)
    shock = rng.lognormal(0, .04, n)
    g_fac = rng.triangular(.93, 1.0, 1.12, n)          # guests actually attending vs planned
    cols = []
    for k in keys:
        e = est[k]
        tri = rng.triangular(e["low"], e["exp"], max(e["high"], e["exp"] + 1), n)
        cols.append(tri * (g_fac ** ELASTICITY[k]) * shock)
    mat = np.vstack(cols).T
    total = mat.sum(axis=1)
    budget = spec.budget_paise
    p_over = float((total > budget).mean())
    p_over_nocont = float((total > plan["distributable"]).mean())
    pct = {q: int(np.percentile(total, q)) for q in (5, 25, 50, 75, 90, 95)}
    hist, edges = np.histogram(total, bins=28)
    sens = []
    for i, k in enumerate(keys):
        c = float(np.corrcoef(mat[:, i], total)[0, 1]) if mat[:, i].std() > 0 else 0.0
        share = float(mat[:, i].var() / max(total.var(), 1))
        sens.append({"key": k, "correlation": round(c, 3), "variance_share": round(share, 3)})
    sens.sort(key=lambda r: -r["variance_share"])
    tol_q = {"low": 95, "medium": 85, "high": 70}[spec.risk_tolerance]
    target = int(np.percentile(total, tol_q))
    reserve_needed = max(0, target - plan["distributable"])
    return {
        "n": n, "seed": seed, "p_exceed_budget": round(p_over, 4), "p_exceed_without_contingency": round(p_over_nocont, 4),
        "percentiles": pct, "mean": int(total.mean()),
        "histogram": {"counts": hist.tolist(), "edges": [int(x) for x in edges]},
        "sensitivity": sens, "risk_tolerance": spec.risk_tolerance, "confidence_target_pct": tol_q,
        "reserve_for_target": int(reserve_needed),
        "reserve_vs_contingency": int(reserve_needed - plan["contingency"]),
        "label": "SIMULATED from assumed cost ranges — not a forecast from real data",
    }


# ---------------------------------------------------------------------------------------------
def what_if(spec: EventSpec, changes: dict, vendor_prices: dict | None = None) -> dict:
    """Apply field changes to a copy of the spec and diff the two budgets."""
    base = build_budget(spec, vendor_prices)
    d = spec.model_dump()
    for k, v in changes.items():
        if k == "catering_per_head_pct":
            continue
        d[k] = v
    new_spec = EventSpec(**d)
    adj = None
    new = build_budget(new_spec, vendor_prices)
    if "catering_per_head_pct" in changes:
        pct = float(changes["catering_per_head_pct"]) / 100
        for key in ("catering", "food"):
            for row in new["categories"]:
                if row["key"] == key:
                    e = row["estimate"]
                    for q in ("low", "exp", "high"):
                        e[q] = int(e[q] * (1 + pct))
                    row["gap"] = row["allocated"] - e["exp"]
        tl = sum(r["estimate"]["low"] for r in new["categories"])
        te = sum(r["estimate"]["exp"] for r in new["categories"])
        th = sum(r["estimate"]["high"] for r in new["categories"])
        new["estimate_total"] = {"low": tl, "exp": te, "high": th}
        new["headroom"] = new_spec.budget_paise - te
        adj = "catering per-head adjusted"
    diffs = []
    for a, b in zip(base["categories"], new["categories"]):
        diffs.append({"key": a["key"], "label": a["label"], "alloc_before": a["allocated"], "alloc_after": b["allocated"],
                      "est_before": a["estimate"]["exp"], "est_after": b["estimate"]["exp"],
                      "est_delta": b["estimate"]["exp"] - a["estimate"]["exp"], "status_after": b["status"]})
    return {
        "before": {"estimate": base["estimate_total"]["exp"], "feasibility": base["feasibility"], "total": base["total"],
                   "p_exceed": base["risk"]["p_exceed_budget"]},
        "after": {"estimate": new["estimate_total"]["exp"], "feasibility": new["feasibility"], "total": new["total"],
                  "p_exceed": new["risk"]["p_exceed_budget"]},
        "estimate_delta": new["estimate_total"]["exp"] - base["estimate_total"]["exp"],
        "shortfall_vs_budget": max(0, new["estimate_total"]["exp"] - new["total"]),
        "categories": diffs, "changes": changes, "note": adj, "plan_after": new,
    }


# ---------------------------------------------------------------------------------------------
LEVERS = [
    # id, label, pain (0-10, lower = easier to accept), effect fn(spec_dict, est) -> saving paise estimate
    ("guests_-10", "Trim the guest list by 10%", 6),
    ("simplify_menu", "Simplify the menu (fewer live counters / starters): −8% catering", 3),
    ("decor_scale", "Scale decor to essentials: −20% decor", 3),
    ("weekday", "Choose an off-peak date / weekday slot: −10% venue & decor", 2),
    ("photo_package", "Take a smaller photo/video package: −15%", 4),
    ("entertainment_cut", "Replace live act with playlist / DJ-lite: −35% entertainment", 5),
    ("logistics_trim", "Reduce transport & stay support: −25% logistics", 5),
    ("misc_trim", "Trim miscellaneous: −30%", 1),
]
LEVER_CATS = {
    "simplify_menu": ({"catering": .08, "food": .08}), "decor_scale": ({"decor": .20}),
    "weekday": ({"venue": .10, "decor": .10, "venue_permits": .10}), "photo_package": ({"photo_video": .15}),
    "entertainment_cut": ({"entertainment": .35, "sound_lights": .20}), "logistics_trim": ({"logistics": .25}),
    "misc_trim": ({"misc": .30}),
}


def optimize(spec: EventSpec, vendor_prices: dict | None = None) -> dict:
    """Greedy: repeatedly take the lever with best saving-per-pain (priority categories are protected) until the
    expected cost fits inside the budget minus a 5% buffer. Every lever's saving is computed by the engine, not guessed."""
    est = estimate_costs(spec, vendor_prices)
    protected = {PRIORITY_MAP[spec.event_type].get(p) for p in spec.priorities[:2]}
    target = int(spec.budget_paise * .95)
    cur_total = sum(e["exp"] for e in est.values())
    if cur_total <= target:
        return {"needed": False, "message": "Expected cost already fits within budget with a 5% buffer.", "steps": [],
                "before": cur_total, "after": cur_total, "target": target}
    steps, used = [], set()
    guest_scale = 1.0
    for _ in range(len(LEVERS)):
        if cur_total <= target:
            break
        best = None
        for lid, label, pain in LEVERS:
            if lid in used:
                continue
            if lid == "guests_-10":
                saving = int(sum(e["exp"] * (1 - .9 ** e["elasticity"]) for e in est.values()))
                p = pain
            else:
                eff = LEVER_CATS[lid]
                saving = 0
                p = pain
                for k, f in eff.items():
                    if k in est:
                        if k in protected:
                            p += 4
                        saving += int(est[k]["exp"] * f)
            if saving <= 0:
                continue
            score = saving / (p + 1)
            if best is None or score > best[0]:
                best = (score, lid, label, saving, p)
        if not best:
            break
        _, lid, label, saving, p = best
        used.add(lid)
        if lid == "guests_-10":
            for k in est:
                f = .9 ** est[k]["elasticity"]
                for q in ("low", "exp", "high"):
                    est[k][q] = int(est[k][q] * f)
        else:
            for k, f in LEVER_CATS[lid].items():
                if k in est:
                    for q in ("low", "exp", "high"):
                        est[k][q] = int(est[k][q] * (1 - f))
        cur_total = sum(e["exp"] for e in est.values())
        steps.append({"lever": lid, "label": label, "saving": saving, "pain": p, "total_after": cur_total})
    before = sum(e["exp"] for e in estimate_costs(spec, vendor_prices).values())
    return {"needed": True, "steps": steps, "before": before, "after": cur_total, "target": target,
            "fits": cur_total <= target, "total_saving": before - cur_total,
            "message": ("Applying these levers brings the expected cost within budget." if cur_total <= target else
                        "Even with every lever, expected cost exceeds budget — increase the budget or cut scope (e.g. fewer guests/days)."),
            "levers_to_change": _levers_to_changes(steps)}


def _levers_to_changes(steps) -> dict:
    ch = {}
    for s in steps:
        if s["lever"] == "guests_-10":
            ch["guests_scale"] = .9
    return ch


# ---------------------------------------------------------------------------------------------
def track_expenses(spec: EventSpec, plan: dict, expenses: list[dict]) -> dict:
    """expenses: [{id, category, amount_paise, kind: 'paid'|'committed', note, date}]"""
    by = {r["key"]: {"label": r["label"], "planned": r["allocated"], "expected": r["estimate"]["exp"], "paid": 0,
                     "committed": 0} for r in plan["categories"]}
    unknown = 0
    for e in expenses:
        k = e.get("category")
        if k not in by:
            unknown += e["amount_paise"]
            continue
        by[k]["paid" if e.get("kind", "paid") == "paid" else "committed"] += e["amount_paise"]
    rows, warnings = [], []
    forecast = 0
    for k, r in by.items():
        actual = r["paid"] + r["committed"]
        used = actual / r["planned"] if r["planned"] else 0
        fc = max(actual, r["expected"])
        forecast += fc
        status = "over" if actual > r["planned"] else ("warn" if used >= .9 else "ok")
        if status == "over":
            warnings.append(f"{r['label']}: spent/committed {fmt_inr(actual)} exceeds planned {fmt_inr(r['planned'])} by {fmt_inr(actual - r['planned'])}.")
        elif status == "warn":
            warnings.append(f"{r['label']}: {used * 100:.0f}% of allocation used.")
        rows.append({"key": k, **r, "actual": actual, "used_pct": round(used * 100, 1), "variance": r["planned"] - actual,
                     "forecast": fc, "status": status})
    paid = sum(r["paid"] for r in rows)
    committed = sum(r["committed"] for r in rows)
    if forecast > spec.budget_paise:
        warnings.insert(0, f"Forecast {fmt_inr(forecast)} exceeds total budget {fmt_inr(spec.budget_paise)} by {fmt_inr(forecast - spec.budget_paise)}.")
    return {"rows": rows, "paid": paid, "committed": committed, "unallocated_expenses": unknown,
            "forecast": forecast, "remaining": spec.budget_paise - paid - committed, "warnings": warnings,
            "budget": spec.budget_paise}
