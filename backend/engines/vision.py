"""EventForge Vision — venue digital twin.

Layers
  1. Structured venue model  (dimensions, doors, fixed obstacles)   -> VENUES / custom_venue()
  2. Editable layout          (rectangles in metres, rule-based auto layout) -> auto_layout()
  3. Verification             (bounds, overlaps, exit clearance, egress path length, capacity, program conflicts)
  4. Natural-language edits   ("move dining away from the entrance") -> parse_command()/apply_ops()
  5. Walkthrough scenes       (camera routes computed from the layout)    -> scenes()

Coordinates: metres, x → east, y → south. y = 0 is the north wall; the main entrance is on the south wall.
All capacity / travel-distance thresholds are PLANNING HEURISTICS (not statutory limits). The output is a planning
preview, not proof that a real venue is safe or that its real dimensions match.
"""
from __future__ import annotations

import copy
import heapq
import io
import math
import re

from .spec import EventSpec

GRID = .5
BLOCK = {"stage", "mandap", "buffet", "photo_booth", "reg_desk", "first_aid", "kitchen", "backstage"}
WALK = {"seating", "dining", "dance_floor", "activity", "parking"}
M2_PER_PERSON = {"seating": .8, "dining": 1.5, "dance_floor": .5, "activity": 1.0}
CIRCULATION = 1.15
TURNOVER_MIN = 45         # minutes needed to convert a shared floor between chairs and dining tables
MAX_TRAVEL_M = 30.0           # heuristic: farthest occupant -> nearest exit
CLEARANCE_DEPTH = 1.8
LABELS = {"stage": "Stage", "mandap": "Mandap / altar", "seating": "Ceremony seating", "dining": "Dining tables",
          "buffet": "Buffet counters", "dance_floor": "Dance floor", "activity": "Activity area", "reg_desk": "Registration desk",
          "photo_booth": "Photo booth", "first_aid": "First-aid post", "kitchen": "Kitchen / service area", "backstage": "Backstage"}
HEIGHT = {"stage": 1.0, "mandap": 3.2, "buffet": 1.0, "photo_booth": 2.4, "reg_desk": 1.0, "first_aid": 2.4, "kitchen": 2.6,
          "backstage": 2.4, "seating": .5, "dining": .8, "dance_floor": .05, "activity": .05}


def door(id, wall, pos, width, kind="entrance"):
    return {"id": id, "wall": wall, "pos": pos, "width": width, "kind": kind}


VENUES = {
    "banquet_hall": {"id": "banquet_hall", "name": "AC Banquet Hall", "indoor": True, "width": 30, "depth": 18,
                     "desc": "Air-conditioned hall, good for receptions and small weddings.",
                     "doors": [door("main", "S", 15, 3.2), door("exit_e", "E", 8, 1.8, "exit"), door("exit_w", "W", 8, 1.8, "exit")],
                     "obstacles": [{"id": "col1", "type": "pillar", "x": 9.7, "y": 8.7, "w": .6, "h": .6},
                                   {"id": "col2", "type": "pillar", "x": 19.7, "y": 8.7, "w": .6, "h": .6}]},
    "garden_lawn": {"id": "garden_lawn", "name": "Garden Lawn", "indoor": False, "width": 50, "depth": 35,
                    "desc": "Open lawn with gate access — beautiful for day events; needs a rain plan.",
                    "doors": [door("main", "S", 25, 5), door("gate_e", "E", 17, 3, "exit"), door("gate_w", "W", 17, 3, "exit")],
                    "obstacles": [{"id": "tree1", "type": "tree", "x": 6, "y": 6, "w": 2.5, "h": 2.5},
                                  {"id": "tree2", "type": "tree", "x": 42, "y": 24, "w": 2.5, "h": 2.5}]},
    "mantapa_hall": {"id": "mantapa_hall", "name": "Kalyana Mantapa Hall", "indoor": True, "width": 36, "depth": 22,
                     "desc": "Traditional pillared wedding hall with a raised stage end.",
                     "doors": [door("main", "S", 18, 4), door("exit_e", "E", 11, 2, "exit"), door("exit_w", "W", 11, 2, "exit")],
                     "obstacles": [{"id": f"p{i}", "type": "pillar", "x": x, "y": y, "w": .8, "h": .8}
                                   for i, (x, y) in enumerate([(9, 7), (27, 7), (9, 15), (27, 15)])]},
    "community_hall": {"id": "community_hall", "name": "Community Hall", "indoor": True, "width": 24, "depth": 15,
                       "desc": "Compact society / community hall — ideal for birthdays and small functions.",
                       "doors": [door("main", "S", 12, 3), door("exit_e", "E", 7, 1.5, "exit"), door("exit_w", "W", 7, 1.5, "exit")],
                       "obstacles": []},
    "rooftop": {"id": "rooftop", "name": "Rooftop Terrace", "indoor": False, "width": 28, "depth": 16,
                "desc": "Open terrace with skyline views. Structural load and stair capacity must be verified.",
                "doors": [door("main", "S", 14, 2.2), door("stair_e", "E", 8, 1.5, "exit")],
                "obstacles": [{"id": "water_tank", "type": "tank", "x": 1, "y": 1, "w": 2.5, "h": 2.5}]},
    "community_ground": {"id": "community_ground", "name": "Community Ground", "indoor": False, "width": 70, "depth": 45,
                         "desc": "Open ground for festivals, fairs and large community events.",
                         "doors": [door("main", "S", 35, 8), door("gate_e", "E", 22, 5, "exit"), door("gate_w", "W", 22, 5, "exit"),
                                   door("gate_n", "N", 35, 5, "exit")],
                         "obstacles": [{"id": "tree1", "type": "tree", "x": 5, "y": 30, "w": 3, "h": 3},
                                       {"id": "tree2", "type": "tree", "x": 60, "y": 8, "w": 3, "h": 3}]},
}


def venue_library() -> list[dict]:
    out = []
    for v in VENUES.values():
        out.append({**v, "area": v["width"] * v["depth"], "usable_area": usable_area(v)})
    return out


def usable_area(v: dict) -> float:
    return round(v["width"] * v["depth"] - sum(o["w"] * o["h"] for o in v["obstacles"]), 1)


def custom_venue(name: str, template_id: str, width: float, depth: float, indoor: bool | None = None) -> dict:
    """Build a venue from user-confirmed dimensions, reusing a template's door pattern (scaled)."""
    t = copy.deepcopy(VENUES.get(template_id) or VENUES["banquet_hall"])
    if not (5 <= width <= 200 and 5 <= depth <= 200):
        raise ValueError("width and depth must be between 5 and 200 metres")
    sx, sy = width / t["width"], depth / t["depth"]
    for d in t["doors"]:
        d["pos"] = round(d["pos"] * (sx if d["wall"] in "NS" else sy), 2)
    kept = []
    for o in t["obstacles"]:
        o["x"], o["y"] = round(o["x"] * sx, 2), round(o["y"] * sy, 2)
        kept.append(o)
    t.update(id="custom", name=name or "My venue", width=width, depth=depth, obstacles=kept, custom=True,
             desc="Your venue — dimensions entered by you (please verify on site).")
    if indoor is not None:
        t["indoor"] = indoor
    return t


# ---------------------------------------------------------------------------------------------
def _door_rect(v: dict, d: dict) -> tuple[float, float, float, float]:
    W, D, w, p = v["width"], v["depth"], d["width"], d["pos"]
    c = CLEARANCE_DEPTH
    return {"S": (p - w / 2, D - c, w, c), "N": (p - w / 2, 0, w, c), "E": (W - c, p - w / 2, c, w), "W": (0, p - w / 2, c, w)}[d["wall"]]


def _door_point(v: dict, d: dict) -> tuple[float, float]:
    W, D, p = v["width"], v["depth"], d["pos"]
    return {"S": (p, D), "N": (p, 0), "E": (W, p), "W": (0, p)}[d["wall"]]


def _ov(a, b, eps=1e-6) -> float:
    ox = min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0])
    oy = min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1])
    return ox * oy if ox > eps and oy > eps else 0.0


def _r(e) -> tuple[float, float, float, float]:
    return (e["x"], e["y"], e["w"], e["h"])


def _center(e):
    return (e["x"] + e["w"] / 2, e["y"] + e["h"] / 2)


def _dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _main_entrance(v: dict) -> dict:
    return next((d for d in v["doors"] if d["kind"] == "entrance"), v["doors"][0])


# ---------------------------------------------------------------------------------------------
def zone_needs(spec: EventSpec, programs: list[dict], indoor: bool = False) -> dict:
    """Element sizes (w,h in m) required for this event, derived from guests and the programs."""
    G = spec.guests
    by_zone: dict[str, float] = {}
    for p in programs:
        by_zone[p["zone_type"]] = max(by_zone.get(p["zone_type"], 0), p["attendee_fraction"])
    needs: dict[str, dict] = {}
    aud = max([by_zone.get(z, 0) for z in ("seating", "mandap", "stage")] + [0])
    if aud:
        ppl = math.ceil(G * max(aud, .5))
        needs["seating"] = {"area": ppl * M2_PER_PERSON["seating"] * 1.06, "people": ppl}
    if "dining" in by_zone:
        ppl = math.ceil(G * by_zone["dining"])
        needs["dining"] = {"area": ppl * M2_PER_PERSON["dining"] * 1.06, "people": ppl}
        lines = max(2, math.ceil(ppl / 120))
        needs["buffet"] = {"lines": lines, "area": lines * 5 * 1.6}
    if "dance_floor" in by_zone:
        ppl = math.ceil(G * by_zone["dance_floor"] * .5)
        needs["dance_floor"] = {"area": ppl * M2_PER_PERSON["dance_floor"] * 1.06, "people": ppl}
    if "activity" in by_zone:
        ppl = math.ceil(G * by_zone["activity"] * (.5 if spec.event_type == "community" else .8))
        needs["activity"] = {"area": max(40, ppl * M2_PER_PERSON["activity"] * 1.06), "people": ppl}
    fixed = {}
    if "stage" in by_zone:
        fixed["stage"] = (10, 5) if spec.event_type == "community" else (8, 3.5) if spec.event_type == "wedding" else (5, 3)
        fixed["backstage"] = (4, 3)
    if "mandap" in by_zone:
        fixed["mandap"] = (6, 6) if spec.culture not in ("christian", "muslim") else (6, 3.5)
    fixed["reg_desk"] = (4, 1.2)
    if spec.event_type != "community":
        fixed["photo_booth"] = (3, 2.5)
    if spec.event_type == "community" or G >= 300:
        fixed["first_aid"] = (3, 3)
    if "dining" in by_zone and not indoor:
        fixed["kitchen"] = (6, 5)
    return {"sized": needs, "fixed": fixed, "by_zone": by_zone}


def required_area(needs: dict, shared: bool = False) -> float:
    sz = needs["sized"]
    a = sum(v["area"] for k, v in sz.items() if not (shared and k in ("seating", "dining")))
    if shared:
        a += max(sz.get("seating", {"area": 0})["area"], sz.get("dining", {"area": 0})["area"])
    a += sum(w * h for w, h in needs["fixed"].values())
    return round(a * CIRCULATION, 1)


def _mk(type_, x, y, w, h):
    return {"id": type_, "type": type_, "label": LABELS[type_], "x": round(x, 2), "y": round(y, 2), "w": round(w, 2), "h": round(h, 2)}


def default_order(spec: EventSpec) -> list[str]:
    if spec.event_type == "community":
        return ["stage_row", "seating", "activity", "dining_row"]
    if spec.event_type == "birthday":
        return ["stage_row", "activity", "seating", "dance", "dining_row"]
    return ["stage_row", "seating", "dance", "dining_row"]


def auto_layout(venue: dict, spec: EventSpec, programs: list[dict], params: dict | None = None, pins: dict | None = None,
                theme: dict | None = None) -> dict:
    W, D = venue["width"], venue["depth"]
    params = dict(params or {})
    pins = dict(pins or {})
    needs = zone_needs(spec, programs, venue.get("indoor", False))
    sized, fixed = needs["sized"], needs["fixed"]
    order = [r for r in params.get("order", default_order(spec))]
    side_doors = any(d["wall"] in "EW" for d in venue["doors"])
    M = 2.0 if side_doors else 1.0           # keep door approaches clear
    inner_w = W - 2 * M
    front = 3.2                                             # reserved band at the south for entrance + services
    top_m = 2.0 if any(d["wall"] == "N" for d in venue["doors"]) else 1.0
    avail_h = D - top_m - front

    rows: dict[str, dict] = {}
    # stage row
    members = [t for t in ("mandap", "stage") if t in fixed]
    if members:
        total = sum(fixed[t][0] for t in members) + 2 * (len(members) - 1)
        sc = min(1.0, (inner_w - 1) / total) if total > 0 else 1
        x0 = (W - total * sc) / 2
        els, h = [], 0
        for t in members:
            w, hh = fixed[t][0] * sc, fixed[t][1] * (sc if sc < 1 else 1)
            els.append(_mk(t, x0, 0, w, hh))
            x0 += w + 2 * sc
            h = max(h, hh)
        rows["stage_row"] = {"els": els, "h": h}
    # seating
    if "seating" in sized:
        w = max(4, inner_w - 3)
        rows["seating"] = {"els": [_mk("seating", (W - w) / 2, 0, w, sized["seating"]["area"] / w)], "h": sized["seating"]["area"] / w}
    if "dance_floor" in sized:
        w = min(inner_w - 3, 14)
        h = sized["dance_floor"]["area"] / w
        rows["dance"] = {"els": [_mk("dance_floor", (W - w) / 2, 0, w, h)], "h": h}
    if "activity" in sized:
        w = max(4, inner_w - 3)
        h = sized["activity"]["area"] / w
        rows["activity"] = {"els": [_mk("activity", (W - w) / 2, 0, w, h)], "h": h}
    if "dining" in sized:
        lines = sized["buffet"]["lines"]
        row_h_guess = max(4, sized["dining"]["area"] / max(inner_w - 5, 4))
        cols = 1 if lines * 5 <= row_h_guess + 1 else 2
        bw = 1.6 * cols + (.4 if cols == 2 else 0)
        bh = min(max(row_h_guess, 5), lines * 5 / cols)
        dw = max(4, inner_w - bw - 1.5)
        dh = sized["dining"]["area"] / dw
        bh = min(bh, dh) if dh > 3 else bh
        rh = max(dh, bh)
        rows["dining_row"] = {"els": [_mk("dining", M, 0, dw, dh), _mk("buffet", M + dw + 1.0, 0, bw, bh)], "h": rh,
                              "mirror": bool(params.get("buffet_left"))}
    # shared floor: ceremony chairs and dining tables use the same physical area at different times
    shared = params.get("shared")
    if shared is None:
        shared = required_area(needs, False) / max(usable_area(venue), 1) > .8 and "seating" in rows and "dining_row" in rows
    params["shared"] = bool(shared)
    if shared and "seating" in rows and "dining_row" in rows:
        dn = rows["dining_row"]["els"][0]
        area = max(sized["seating"]["area"], sized["dining"]["area"])
        dn["h"] = round(area / dn["w"], 2)
        rows["dining_row"]["els"][1]["h"] = min(rows["dining_row"]["els"][1]["h"], dn["h"])
        rows["dining_row"]["h"] = dn["h"]
        st = _mk("seating", dn["x"], 0, dn["w"], dn["h"])
        rows["dining_row"]["els"].insert(0, st)
        del rows["seating"]
    present = [r for r in order if r in rows] + [r for r in rows if r not in order]
    fixed_h = sum(rows[r]["h"] for r in present if r == "stage_row")
    el_h = sum(rows[r]["h"] for r in present if r != "stage_row")
    gap = .8
    gaps = gap * max(len(present) - 1, 0)
    need_h = fixed_h + el_h + gaps
    scale = 1.0
    if need_h > avail_h and el_h > 0:
        scale = max(.15, (avail_h - fixed_h - gaps) / el_h)
    extra = 0 if scale < 1 else max(0, min(2.5, (avail_h - need_h) / (len(present) + 1)))
    y = top_m + extra
    elements = []
    for r in present:
        row = rows[r]
        elastic = r != "stage_row"
        for e in row["els"]:
            e["y"] = round(y, 2)
            if elastic and scale < 1:
                e["h"] = round(e["h"] * scale, 2)
            elements.append(e)
        y += row["h"] * (scale if elastic else 1) + gap + extra
    if params.get("buffet_left"):
        d_, b_ = next((e for e in elements if e["type"] == "dining"), None), next((e for e in elements if e["type"] == "buffet"), None)
        s_ = next((e for e in elements if e["type"] == "seating"), None) if params["shared"] else None
        if d_ and b_:
            d_["x"], b_["x"] = round(M + b_["w"] + 1.0, 2), M
            if s_:
                s_["x"] = d_["x"]
    # flip horizontally if requested (mirror about vertical axis)
    if params.get("flip_x"):
        for e in elements:
            e["x"] = round(W - e["x"] - e["w"], 2)
    layout = {"venue_id": venue["id"], "width": W, "depth": D, "elements": elements, "params": {**params, "order": order},
              "pins": pins, "theme": theme or {"id": "marigold_heritage", "name": "Marigold & Mango-Leaf Heritage",
                                              "palette": ["#f28c28", "#f6c026", "#2e7d32", "#fff3d6"]}}
    # small blocks near anchors
    entr = _main_entrance(venue)
    ep = _door_point(venue, entr)

    def put(type_, anchor=None, far_from_entrance=False, prefer_wall=None):
        if type_ not in fixed:
            return
        w, h = fixed[type_]
        el = _mk(type_, 0, 0, w, h)
        pos = find_free(layout, venue, el, anchor=anchor, far_from=ep if far_from_entrance else None, prefer_wall=prefer_wall)
        if pos:
            el["x"], el["y"] = pos
        else:  # no room: place at the south band anyway; validators will flag overlaps
            el["x"], el["y"] = M, D - h - .5
        layout["elements"].append(el)

    by = {e["type"]: e for e in layout["elements"]}
    put("reg_desk", anchor=(ep[0] - 5, ep[1] - 2.5))
    put("photo_booth", anchor=(ep[0] + 7, ep[1] - 3.5))
    put("first_aid", anchor=(ep[0] - 9, ep[1] - 3))
    put("backstage", anchor=(_center(by["stage"])[0] + 7, _center(by["stage"])[1]) if "stage" in by else None, prefer_wall="N")
    put("kitchen", anchor=(W - 4, _center(by["dining"])[1]) if "dining" in by else (W - 4, D / 2), far_from_entrance=True, prefer_wall="E")
    # zones the user added manually (params.extra) and zones they removed (params.removed)
    for t_, (ew, eh) in params.get("extra", {}).items():
        if not any(e["type"] == t_ for e in layout["elements"]):
            el_ = _mk(t_, 0, 0, ew, eh)
            pos_ = pins.get(t_)
            if pos_:
                el_["x"], el_["y"] = pos_["x"], pos_["y"]
            else:
                p2 = find_free(layout, venue, el_, anchor=(W / 2, D / 2))
                el_["x"], el_["y"] = p2 or (1, 1)
            layout["elements"].append(el_)
    removed = set(params.get("removed", []))
    layout["elements"] = [e for e in layout["elements"] if e["type"] not in removed]
    # nudge solid blocks off fixed obstacles (trees, pillars, tanks)
    for el in layout["elements"]:
        if el["type"] in BLOCK and any(_ov(_r(el), (o["x"], o["y"], o["w"], o["h"])) > 0 for o in venue["obstacles"]):
            pos = find_free(layout, venue, el, anchor=_center(el))
            if pos:
                el["x"], el["y"] = pos
    # size multipliers (keep the centre), THEN pins (manual x/y wins)
    for el in layout["elements"]:
        m = params.get("size", {}).get(el["id"])
        if m:
            cx, cy = _center(el)
            el["w"], el["h"] = round(el["w"] * m, 2), round(el["h"] * m, 2)
            el["x"], el["y"] = round(cx - el["w"] / 2, 2), round(cy - el["h"] / 2, 2)
    for el in layout["elements"]:
        p_ = pins.get(el["id"])
        if p_:
            el["x"], el["y"] = p_["x"], p_["y"]
    layout["needs"] = {"required_area": required_area(needs, params["shared"]), "usable_area": usable_area(venue)}
    return layout


def find_free(layout: dict, venue: dict, el: dict, anchor=None, far_from=None, prefer_wall=None, region=None, ignore: set | None = None):
    """Grid search for a collision-free position. Objective: near `anchor`, or far from `far_from`."""
    W, D = venue["width"], venue["depth"]
    w, h = el["w"], el["h"]
    ignore = (ignore or set()) | {el["id"]}
    others = [_r(e) for e in layout["elements"] if e["id"] not in ignore]
    others += [(o["x"], o["y"], o["w"], o["h"]) for o in venue["obstacles"]]
    others += [_door_rect(venue, d) for d in venue["doors"]]
    best, best_v = None, None
    x = .5
    while x + w <= W - .5 + 1e-6:
        y = .5
        while y + h <= D - .5 + 1e-6:
            r = (x, y, w, h)
            if region and not (region[0] <= x and x + w <= region[0] + region[2] and region[1] <= y and y + h <= region[1] + region[3]):
                y += GRID
                continue
            if all(_ov(r, o) == 0 for o in others):
                c = (x + w / 2, y + h / 2)
                v = 0.0
                if anchor:
                    v += _dist(c, anchor)
                if far_from:
                    v -= _dist(c, far_from) * (1.0 if not anchor else .12)
                if prefer_wall == "N":
                    v += y * .2
                if prefer_wall == "E":
                    v += (W - x - w) * .6
                if best_v is None or v < best_v:
                    best, best_v = (round(x, 2), round(y, 2)), v
            y += GRID
        x += GRID
    return best


# ---------------------------------------------------------------------------------------------
def _grid(layout: dict, venue: dict):
    W, D = venue["width"], venue["depth"]
    nx, ny = int(math.ceil(W / GRID)), int(math.ceil(D / GRID))
    blocked = [[False] * nx for _ in range(ny)]

    def mark(r):
        x0, y0 = max(0, int(r[0] / GRID)), max(0, int(r[1] / GRID))
        x1, y1 = min(nx - 1, int((r[0] + r[2] - 1e-6) / GRID)), min(ny - 1, int((r[1] + r[3] - 1e-6) / GRID))
        for j in range(y0, y1 + 1):
            for i in range(x0, x1 + 1):
                blocked[j][i] = True

    for e in layout["elements"]:
        if e["type"] in BLOCK:
            mark(_r(e))
    for o in venue["obstacles"]:
        mark((o["x"], o["y"], o["w"], o["h"]))
    return blocked, nx, ny


def _dijkstra(blocked, nx, ny, sources):
    INF = 1e9
    dist = [[INF] * nx for _ in range(ny)]
    pq = []
    for (i, j) in sources:
        i, j = min(max(i, 0), nx - 1), min(max(j, 0), ny - 1)
        if not blocked[j][i]:
            dist[j][i] = 0.0
            heapq.heappush(pq, (0.0, i, j))
    prev = {}
    nb = [(1, 0, 1.0), (-1, 0, 1.0), (0, 1, 1.0), (0, -1, 1.0), (1, 1, 1.414), (-1, 1, 1.414), (1, -1, 1.414), (-1, -1, 1.414)]
    while pq:
        d, i, j = heapq.heappop(pq)
        if d > dist[j][i]:
            continue
        for di, dj, c in nb:
            a, b = i + di, j + dj
            if 0 <= a < nx and 0 <= b < ny and not blocked[b][a]:
                if di and dj and (blocked[j][a] or blocked[b][i]):
                    continue
                nd = d + c
                if nd < dist[b][a]:
                    dist[b][a] = nd
                    prev[(a, b)] = (i, j)
                    heapq.heappush(pq, (nd, a, b))
    return dist, prev


def _door_cells(venue, d):
    x, y = _door_point(venue, d)
    cells = []
    k = int(d["width"] / GRID)
    for t in range(-k // 2, k // 2 + 1):
        if d["wall"] in "NS":
            cells.append((int((x + t * GRID) / GRID), int((y - .01 if d["wall"] == "S" else y + .01) / GRID)))
        else:
            cells.append((int((x - .01 if d["wall"] == "E" else x + .01) / GRID), int((y + t * GRID) / GRID)))
    return cells


def validate_layout(layout: dict, venue: dict, spec: EventSpec, programs: list[dict]) -> dict:
    W, D = venue["width"], venue["depth"]
    els = layout["elements"]
    checks: list[dict] = []

    def add(id, title, status, detail, fix="", hard=True, **extra):
        checks.append({"id": id, "title": title, "status": status, "detail": detail, "fix": fix, "hard": hard, **extra})

    # 1 bounds
    oob = [e["label"] for e in els if e["x"] < -1e-6 or e["y"] < -1e-6 or e["x"] + e["w"] > W + 1e-6 or e["y"] + e["h"] > D + 1e-6]
    add("bounds", "Everything is inside the venue walls", "fail" if oob else "pass",
        f"Outside the walls: {', '.join(oob)}" if oob else "All elements fit within the walls.", "Move or shrink the highlighted items." if oob else "")
    # 2 overlaps
    ov_pairs = []
    shared = bool(layout.get("params", {}).get("shared"))
    for i in range(len(els)):
        for j in range(i + 1, len(els)):
            a = _ov(_r(els[i]), _r(els[j]))
            if shared and {els[i]["type"], els[j]["type"]} == {"seating", "dining"}:
                continue
            if a > .05:
                ov_pairs.append((els[i]["label"], els[j]["label"], round(a, 1)))
        for o in venue["obstacles"]:
            a = _ov(_r(els[i]), (o["x"], o["y"], o["w"], o["h"]))
            if a > .05 and els[i]["type"] in BLOCK:
                ov_pairs.append((els[i]["label"], o["type"], round(a, 1)))
    add("overlaps", "No objects overlap", "fail" if ov_pairs else "pass",
        "; ".join(f"{a} ↔ {b} ({m} m²)" for a, b, m in ov_pairs[:6]) if ov_pairs else "No overlapping objects.",
        "Drag one of the overlapping items to free space, or reduce its size." if ov_pairs else "", pairs=[[a, b] for a, b, _ in ov_pairs])
    # 3 exit clearance
    blocked_doors = []
    for d in venue["doors"]:
        r = _door_rect(venue, d)
        hit = [e["label"] for e in els if _ov(_r(e), r) > 0]
        if hit:
            blocked_doors.append(f"{d['id']} blocked by {', '.join(hit)}")
    add("exit_clearance", "Doors and exits are clear (1.8 m deep)", "fail" if blocked_doors else "pass",
        "; ".join(blocked_doors) if blocked_doors else f"{len(venue['doors'])} doors have clear approach space.",
        "Keep 1.8 m free in front of every door." if blocked_doors else "")
    # 4 egress
    blocked, nx, ny = _grid(layout, venue)
    exit_cells = [c for d in venue["doors"] for c in _door_cells(venue, d)]
    dist_exit, _ = _dijkstra(blocked, nx, ny, exit_cells)
    ent = _main_entrance(venue)
    dist_ent, prev_ent = _dijkstra(blocked, nx, ny, _door_cells(venue, ent))
    far_rows, unreachable = [], []
    for e in els:
        i0, j0 = max(0, int(e["x"] / GRID)), max(0, int(e["y"] / GRID))
        i1, j1 = min(nx - 1, int((e["x"] + e["w"] - 1e-6) / GRID)), min(ny - 1, int((e["y"] + e["h"] - 1e-6) / GRID))
        if e["type"] in WALK:
            cells = [(i, j) for j in range(j0, j1 + 1) for i in range(i0, i1 + 1)]
        else:
            cells = [(i, j) for j in range(max(0, j0 - 2), min(ny - 1, j1 + 2) + 1) for i in range(max(0, i0 - 2), min(nx - 1, i1 + 2) + 1)
                     if not blocked[j][i]]
        reach = [dist_exit[j][i] for (i, j) in cells if dist_exit[j][i] < 1e8 and not blocked[j][i]]
        if not reach:
            unreachable.append(e["label"])
        elif e["type"] in WALK:
            far_rows.append((e["label"], round(max(reach) * GRID, 1)))
    add("reachable", "Every area can be reached and evacuated", "fail" if unreachable else "pass",
        f"No walkable route to an exit from: {', '.join(unreachable)}" if unreachable else "All areas connect to an exit.",
        "Open a path (aisle) around or through the listed areas." if unreachable else "")
    worst = max(far_rows, key=lambda r: r[1]) if far_rows else None
    if worst:
        st = "pass" if worst[1] <= MAX_TRAVEL_M else "warn"
        add("egress", f"Farthest person is ≤ {int(MAX_TRAVEL_M)} m from an exit (heuristic)", st,
            f"Worst case: {worst[0]} — {worst[1]} m to the nearest exit (straight-line path around obstacles).",
            "Add an exit or open a wider aisle on that side." if st == "warn" else "", hard=False, metrics=far_rows)
    # exits count/width heuristic
    exits = [d for d in venue["doors"]]
    need_exits = 1 if spec.guests <= 50 else 2
    width_need = round(spec.guests / 100, 1)
    width_have = round(sum(d["width"] for d in exits), 1)
    st = "pass" if len(exits) >= need_exits and width_have >= width_need else "fail"
    add("exit_count", "Enough exits and total door width (heuristic: ≥2 exits, ≥1 m per 100 guests)", st,
        f"{len(exits)} doors totalling {width_have} m for {spec.guests} guests (need ≥ {width_need} m).",
        "Choose a venue with more exit width or cap attendance." if st == "fail" else "")
    # 5 capacity
    needs = zone_needs(spec, programs, venue.get("indoor", False))
    req = required_area(needs, shared)
    use = usable_area(venue)
    ratio = req / use if use else 9
    st = "pass" if ratio <= .92 else "warn" if ratio <= 1.0 else "fail"
    add("area", "Venue is large enough for all zones + 25% circulation", st,
        f"Needs ≈ {req} m² (all zones + circulation) vs {use} m² usable → {ratio * 100:.0f}% full.",
        "Pick a bigger venue, reduce guests, or drop an optional zone." if st != "pass" else "", metrics={"required": req, "usable": use})
    cap_rows = []
    zone_caps: dict[str, int] = {}
    for e in els:
        if e["type"] in M2_PER_PERSON:
            zone_caps[e["type"]] = int(e["w"] * e["h"] / M2_PER_PERSON[e["type"]])
    for p in programs:
        att = math.ceil(spec.guests * p["attendee_fraction"])
        z = p["zone_type"]
        if z in ("stage", "mandap", "dance_floor"):
            floor = max(zone_caps.get("seating", 0), zone_caps.get("dining", 0)) if shared else zone_caps.get("seating", 0) + zone_caps.get("dining", 0) // 2
            cap = floor + zone_caps.get("dance_floor", 0)
            what = "audience space"
        elif z in zone_caps:
            cap, what = zone_caps[z], z.replace("_", " ")
        else:
            cap, what = None, None
        present = any(e["type"] == z for e in els)
        if not present:
            cap_rows.append((p["name"], "fail", f"no {z.replace('_', ' ')} zone exists in the layout", att, 0))
        elif cap is not None:
            stt = "pass" if cap >= att * 1.05 else "warn" if cap >= att else "fail"
            cap_rows.append((p["name"], stt, f"{what} holds {cap} vs {att} attending", att, cap))
    bad = [r for r in cap_rows if r[1] == "fail"]
    tight = [r for r in cap_rows if r[1] == "warn"]
    add("program_capacity", "Each program's zone fits its attendees", "fail" if bad else "warn" if tight else "pass",
        "; ".join(f"{r[0]}: {r[2]}" for r in (bad + tight)[:5]) if (bad or tight) else f"{len(cap_rows)} programs checked — all zones have room.",
        "Enlarge the zone, move the program to a bigger zone, or lower attendance." if bad or tight else "", rows=[list(r) for r in cap_rows])
    # 6 program conflicts
    conflicts = []
    for i in range(len(programs)):
        for j in range(i + 1, len(programs)):
            a, b = programs[i], programs[j]
            if a["day"] == b["day"] and a["zone_type"] == b["zone_type"] and a["zone_type"] in ("stage", "mandap", "dance_floor", "dining"):
                if a["start"] < b["end"] and b["start"] < a["end"]:
                    conflicts.append(f"{a['name']} ↔ {b['name']} both use {a['zone_type']} {a['start']}–{b['end']}")
    add("program_conflicts", "No two programs need the same zone at the same time", "fail" if conflicts else "pass",
        "; ".join(conflicts) if conflicts else "Programs are time-separated per zone.", "Shift one program's time." if conflicts else "")
    if shared:
        def mins(t): return int(t[:2]) * 60 + int(t[3:])
        tight = []
        for a_ in programs:
            for b_ in programs:
                if a_["day"] == b_["day"] and a_["zone_type"] in ("seating", "mandap") and b_["zone_type"] == "dining":
                    gap = mins(b_["start"]) - mins(a_["end"]) if b_["start"] >= a_["start"] else mins(a_["start"]) - mins(b_["end"])
                    if gap < TURNOVER_MIN:
                        tight.append(f"{a_['name']} → {b_['name']}: only {gap} min to convert chairs ⇄ tables")
        add("turnover", f"Shared floor has ≥ {TURNOVER_MIN} min to convert between ceremony chairs and dining tables",
            "fail" if tight else "pass", "; ".join(tight) if tight else "Ceremony and dining are separated by enough time to convert the floor.",
            "Delay the meal, or pick a venue large enough for separate zones." if tight else "")
    late = [p["name"] for p in programs if p.get("loud") and p["end"] > "22:00"]
    add("noise", "Loud programs end by 22:00 (typical noise-rule cut-off — verify locally)", "warn" if late else "pass",
        f"Loud programs past 22:00: {', '.join(late)}" if late else "No loud program runs past 22:00.", "Move it earlier or confirm permission." if late else "", hard=False)
    # 7 reachability from entrance (accessibility)
    far = []
    for e in els:
        if e["type"] in ("reg_desk",):
            continue
        i0, j0 = max(0, int(e["x"] / GRID)), max(0, int(e["y"] / GRID))
        i1, j1 = min(nx - 1, int((e["x"] + e["w"]) / GRID)), min(ny - 1, int((e["y"] + e["h"]) / GRID))
        cells = [(i, j) for j in range(max(0, j0 - 2), min(ny - 1, j1 + 2) + 1) for i in range(max(0, i0 - 2), min(nx - 1, i1 + 2) + 1) if not blocked[j][i]]
        if not any(dist_ent[j][i] < 1e8 for (i, j) in cells):
            far.append(e["label"])
    add("entrance_access", "Guests can walk from the main entrance to every zone", "fail" if far else "pass",
        f"Not reachable from the entrance: {', '.join(far)}" if far else "All zones reachable from the main entrance.", "")
    # buffet queue space
    bf = next((e for e in els if e["type"] == "buffet"), None)
    if bf:
        q = (bf["x"] - 2.0, bf["y"], 2.0, bf["h"])
        qq = (bf["x"] + bf["w"], bf["y"], 2.0, bf["h"])
        clash = [e["label"] for e in els if e["type"] in BLOCK and e["id"] != "buffet" and (_ov(_r(e), q) > 0 and _ov(_r(e), qq) > 0)]
        add("queue", "Queue space beside the buffet", "pass" if not clash else "warn", "2 m queue lane available beside the counters." if not clash else
            f"Queue lane hemmed in by {', '.join(clash)}", "", hard=False)
    summary = {s: sum(1 for c in checks if c["status"] == s) for s in ("pass", "warn", "fail")}
    summary["total"] = len(checks)
    metrics = {"zone_capacity": zone_caps, "required_area": req, "usable_area": use, "fill_pct": round(ratio * 100)}
    return {"checks": checks, "summary": summary, "metrics": metrics, "ok": summary["fail"] == 0}


# ---------------------------------------------------------------------------------------------
SYN = [
    ("buffet", r"buffet|counters?|food counters?"), ("dining", r"dining|dinner area|eating|food area|tables"),
    ("seating", r"seating|chairs|audience|guest seating|ceremony seating"), ("mandap", r"mandap|mantap|altar|ceremony area|vedi"),
    ("stage", r"stage|dais"), ("dance_floor", r"dance ?floor|dancefloor|dance"), ("photo_booth", r"photo ?booth|selfie|photo"),
    ("reg_desk", r"registration|reg desk|welcome desk|help ?desk|reception desk"), ("first_aid", r"first[- ]?aid|medical"),
    ("kitchen", r"kitchen|cooking|service area"), ("backstage", r"backstage|green room"), ("activity", r"activity|games? area|stalls?"),
]
COLOR_WORDS = {"white": "#f8f5ee", "ivory": "#f7f1e3", "cream": "#fff3d6", "gold": "#c9a227", "golden": "#c9a227", "silver": "#c0c0c0",
               "red": "#9b1c1f", "maroon": "#7a1f2b", "green": "#2e7d32", "sage": "#9db79a", "pink": "#e86a92", "peach": "#f4d6cc",
               "blue": "#1e5aa8", "navy": "#0d1b4c", "orange": "#f28c28", "yellow": "#f6c026", "teal": "#0f4c5c", "purple": "#6a4cff",
               "black": "#1a1a1a", "pastel": "#f4d6cc", "lavender": "#d9c2ff", "mint": "#cfe3d0"}


def _find_types(s: str) -> list[str]:
    hits = []
    for t, pat in SYN:
        for m in re.finditer(pat, s):
            hits.append((m.start(), t))
    hits.sort()
    seen, out = set(), []
    for _, t in hits:
        if t not in seen:
            seen.add(t); out.append(t)
    return out


def parse_command(text: str) -> list[dict]:
    """Rule-based natural-language -> list of ops. Unknown phrases yield an {'op':'unknown'} entry (never guessed)."""
    t = text.lower()
    ops = []
    parts = [p.strip() for p in re.split(r",|;|\band then\b|\bthen\b|\band\b(?=\s+(?:move|change|make|add|remove|put|shift|swap|place|set|increase|decrease))", t) if p.strip()]
    for part in parts:
        if re.search(r"decor|theme|colou?r", part) and re.search(r"\bto\b|\bin\b|\bwith\b", part):
            tail = re.split(r"\bto\b|\bin\b|\bwith\b", part, 1)[1]
            ops.append({"op": "theme", "text": tail.strip()})
            continue
        m = re.search(r"swap (?:the )?(.+?) (?:and|with) (?:the )?(.+)", part)
        if m:
            a, b = _find_types(m.group(1)), _find_types(m.group(2))
            if a and b:
                ops.append({"op": "swap", "a": a[0], "b": b[0]})
                continue
        m = re.search(r"(?:add|put in|include|create) (?:a |an |some )?(.+)", part)
        if m and not re.search(r"move|shift", part):
            ty = _find_types(m.group(1))
            if ty:
                ops.append({"op": "add", "type": ty[0]})
                continue
        m = re.search(r"(?:remove|delete|drop|get rid of) (?:the )?(.+)", part)
        if m:
            ty = _find_types(m.group(1))
            if ty:
                ops.append({"op": "remove", "type": ty[0]})
                continue
        m = re.search(r"(?:make|increase|enlarge|expand|reduce|shrink|decrease)\b(.*)", part)
        if m and re.search(r"bigger|larger|smaller|wider|bigger|increase|enlarge|expand|reduce|shrink|decrease|%", part):
            ty = _find_types(part)
            pct = re.search(r"(\d{1,3})\s*%", part)
            f = 1 + (int(pct.group(1)) / 100 if pct else .2)
            if re.search(r"smaller|reduce|shrink|decrease|narrower", part):
                f = 1 / f if pct is None else 1 - int(pct.group(1)) / 100
            if ty:
                ops.append({"op": "resize", "type": ty[0], "factor": round(f, 3)})
                continue
        if re.search(r"move|shift|put|place|relocate|bring|push|take", part):
            ty = _find_types(part.split(" away from")[0].split(" to ")[0].split(" towards")[0].split(" near")[0].split(" next")[0].split(" behind")[0])
            if not ty:
                ty = _find_types(part)
            if ty:
                subj = ty[0]
                tgt = {"op": "move", "type": subj}
                if re.search(r"away from (?:the )?(?:main )?(entrance|door|gate)|far from (?:the )?(?:main )?(entrance|door|gate)|farther from (?:the )?entrance", part):
                    tgt["target"] = "far_from_entrance"
                elif re.search(r"(?:near|close to|towards?|next to|by|closer to) (?:the )?(?:main )?(entrance|door|gate)", part):
                    tgt["target"] = "near_entrance"
                elif re.search(r"other side|opposite side|flip|mirror", part):
                    tgt["target"] = "other_side"
                elif re.search(r"centre|center|middle", part):
                    tgt["target"] = "center"
                else:
                    m2 = re.search(r"(?:near|next to|beside|close to|behind|in front of|towards?)\s+(?:the )?(.+)", part)
                    others = [x for x in _find_types(m2.group(1))] if m2 else []
                    if others and others[0] != subj:
                        tgt["target"] = "near"
                        tgt["ref"] = others[0]
                    else:
                        dirs = []
                        for k, pat in [("W", r"\bleft\b|\bwest\b"), ("E", r"\bright\b|\beast\b"),
                                       ("N", r"\bback\b|\btop\b|\bnorth\b|far end"), ("S", r"\bfront\b|\bbottom\b|\bsouth\b")]:
                            if re.search(pat, part):
                                dirs.append(k)
                        if dirs:
                            tgt["target"] = "dir"
                            tgt["dirs"] = dirs
                if "target" in tgt:
                    ops.append(tgt)
                    continue
        ops.append({"op": "unknown", "text": part})
    return ops


def _theme_from_text(txt: str) -> dict:
    from .ideas import THEMES
    t = txt.lower()
    for th in THEMES:
        key = [w for w in re.findall(r"[a-z]+", th["name"].lower()) if len(w) > 4]
        if th["id"].replace("_", " ") in t or any(k in t for k in key[:2]):
            return {"id": th["id"], "name": th["name"], "palette": th["palette"]}
    cols = [COLOR_WORDS[w] for w in re.findall(r"[a-z]+", t) if w in COLOR_WORDS]
    names = [w for w in re.findall(r"[a-z]+", t) if w in COLOR_WORDS]
    if cols:
        pal = (cols + ["#f8f5ee", "#c9a227", "#5e7a5c", "#ffffff"])[:4]
        return {"id": "custom", "name": " & ".join(n.title() for n in names), "palette": pal}
    return {}


def apply_ops(layout: dict, venue: dict, spec: EventSpec, ops: list[dict], programs: list[dict]) -> tuple[dict, list[dict]]:
    L = copy.deepcopy(layout)
    msgs: list[dict] = []
    W, D = venue["width"], venue["depth"]
    ep = _door_point(venue, _main_entrance(venue))
    needs = zone_needs(spec, programs, venue.get("indoor", False))

    def el(t):
        return next((e for e in L["elements"] if e["type"] == t), None)

    def pin(e):
        L["pins"][e["id"]] = {"x": e["x"], "y": e["y"]}

    for op in ops:
        k = op["op"]
        if k == "unknown":
            msgs.append({"ok": False, "text": f"I couldn't understand “{op['text']}”. Try: move the stage to the left · move dining away from the entrance · "
                                              "change decoration to white and gold · add a dance floor · make the stage bigger."})
        elif k == "theme":
            th = _theme_from_text(op["text"])
            if th:
                L["theme"] = th
                msgs.append({"ok": True, "text": f"Decor theme set to {th['name']}."})
            else:
                msgs.append({"ok": False, "text": f"No theme or colours recognised in “{op['text']}”."})
        elif k == "remove":
            e = el(op["type"])
            if e:
                L["elements"].remove(e); L["pins"].pop(e["id"], None)
                L["params"].setdefault("removed", []).append(e["type"])
                L["params"].get("extra", {}).pop(e["type"], None)
                msgs.append({"ok": True, "text": f"Removed {e['label']}."})
            else:
                msgs.append({"ok": False, "text": f"There is no {LABELS[op['type']].lower()} to remove."})
        elif k == "add":
            if el(op["type"]):
                msgs.append({"ok": False, "text": f"{LABELS[op['type']]} already exists — move or resize it instead."})
                continue
            size = {"dance_floor": (8, 8), "photo_booth": (3, 2.5), "stage": (8, 3.5), "mandap": (6, 6), "buffet": (3.4, 8),
                    "first_aid": (3, 3), "kitchen": (6, 5), "backstage": (4, 3), "reg_desk": (4, 1.2), "activity": (10, 8),
                    "seating": (14, 6), "dining": (14, 8)}[op["type"]]
            e = _mk(op["type"], 0, 0, *size)
            pos = find_free(L, venue, e, anchor=(W / 2, D / 2))
            if pos:
                e["x"], e["y"] = pos
                L["elements"].append(e); pin(e)
                L["params"].setdefault("extra", {})[op["type"]] = list(size)
                if op["type"] in L["params"].get("removed", []):
                    L["params"]["removed"].remove(op["type"])
                msgs.append({"ok": True, "text": f"Added {e['label']} at ({pos[0]:.0f}, {pos[1]:.0f})."})
            else:
                msgs.append({"ok": False, "text": f"No free space for a {e['label'].lower()} — the venue is full. Shrink another zone first."})
        elif k == "resize":
            e = el(op["type"])
            if not e:
                msgs.append({"ok": False, "text": f"No {LABELS[op['type']].lower()} to resize."}); continue
            cx, cy = _center(e)
            nw, nh = e["w"] * op["factor"], e["h"] * op["factor"]
            old = (e["x"], e["y"], e["w"], e["h"])
            e["w"], e["h"] = round(nw, 2), round(nh, 2)
            e["x"], e["y"] = round(max(.5, min(W - nw - .5, cx - nw / 2)), 2), round(max(.5, min(D - nh - .5, cy - nh / 2)), 2)
            pin(e)
            sz = L["params"].setdefault("size", {})
            sz[e["id"]] = round(sz.get(e["id"], 1.0) * op["factor"], 4)
            msgs.append({"ok": True, "text": f"{e['label']} resized ×{op['factor']:.2f} (now {e['w']:.1f}×{e['h']:.1f} m)."})
        elif k == "swap":
            a, b = el(op["a"]), el(op["b"])
            if not (a and b):
                msgs.append({"ok": False, "text": "Both zones must exist to swap them."}); continue
            ca, cb = _center(a), _center(b)
            a["x"], a["y"] = round(cb[0] - a["w"] / 2, 2), round(cb[1] - a["h"] / 2, 2)
            b["x"], b["y"] = round(ca[0] - b["w"] / 2, 2), round(ca[1] - b["h"] / 2, 2)
            pin(a); pin(b)
            msgs.append({"ok": True, "text": f"Swapped {a['label']} and {b['label']} (check the validator for overlaps)."})
        elif k == "move":
            _move(L, venue, spec, op, msgs, ep, pin, el)
    return L, msgs


def _move(L, venue, spec, op, msgs, ep, pin, el):
    W, D = venue["width"], venue["depth"]
    e = el(op["type"])
    if not e:
        msgs.append({"ok": False, "text": f"There is no {LABELS[op['type']].lower()} in the layout."}); return
    tgt = op["target"]
    bands = {"seating", "dining", "dance_floor", "activity"}
    # big zones are re-ordered (band order) because there is no free space around them
    if op["type"] in bands | {"buffet"} and tgt in ("far_from_entrance", "near_entrance", "other_side", "dir") and (tgt != "dir" or {"N", "S"} & set(op.get("dirs", []))):
        order = list(L["params"].get("order", []))
        row = {"seating": "seating", "dining": "dining_row", "buffet": "dining_row", "dance_floor": "dance", "activity": "activity"}[op["type"]]
        if row not in order:
            msgs.append({"ok": False, "text": f"{LABELS[op['type']]} is not part of the main band order."}); return
        far = tgt == "far_from_entrance" or (tgt == "dir" and "N" in op["dirs"]) or (tgt == "other_side" and order.index(row) >= len(order) / 2)
        order.remove(row)
        if far:
            order.insert(0, row)
        else:
            order.append(row)
        L["params"]["order"] = order
        stage_row = "stage_row"
        # keep the stage row at the far end unless the user asked to move it
        if stage_row in order and order[0] != stage_row and op["type"] not in ("stage", "mandap"):
            order.remove(stage_row); order.insert(0, stage_row) if not far else order.insert(1, stage_row)
        L["_relayout"] = True
        msgs.append({"ok": True, "text": f"{LABELS[op['type']]} moved {'away from' if far else 'closer to'} the entrance (band order: {', '.join(order)})."})
        return
    if tgt == "other_side" and op["type"] in ("stage", "mandap", "backstage"):
        for t_ in ("stage", "mandap", "backstage"):
            e_ = el(t_)
            if e_:
                e_["x"] = round(W - e_["x"] - e_["w"], 2)
                pin(e_)
        msgs.append({"ok": True, "text": "Stage row mirrored left ↔ right (stage, mandap and backstage swapped sides)."})
        return
    if tgt == "other_side":
        cx, cy = _center(e)
        if abs(cy - D / 2) / D >= abs(cx - W / 2) / W:
            ny, nx = D - e["y"] - e["h"], e["x"]
        else:
            ny, nx = e["y"], W - e["x"] - e["w"]
        region = None
        anchor = (nx + e["w"] / 2, ny + e["h"] / 2)
    elif tgt == "far_from_entrance":
        region, anchor = None, None
    elif tgt == "near_entrance":
        region, anchor = None, (ep[0], ep[1] - 4)
    elif tgt == "center":
        region, anchor = None, (W / 2, D / 2)
    elif tgt == "near":
        r = el(op["ref"])
        if not r:
            msgs.append({"ok": False, "text": f"There is no {LABELS[op['ref']].lower()} to place it next to."}); return
        region, anchor = None, _center(r)
    else:  # dir
        d = op["dirs"]
        x0, x1 = (0, W) if not ({"E", "W"} & set(d)) else ((0, W / 3) if "W" in d else (2 * W / 3, W / 3))
        y0, y1 = (0, D) if not ({"N", "S"} & set(d)) else ((0, D / 3) if "N" in d else (2 * D / 3, D / 3))
        region = (x0, y0, x1 if x1 > x0 else x1, y1)
        region = (x0, y0, (W / 3 if ({"E", "W"} & set(d)) else W), (D / 3 if ({"N", "S"} & set(d)) else D))
        cx = (W / 6 if "W" in d else 5 * W / 6 if "E" in d else W / 2)
        cy = (D / 6 if "N" in d else 5 * D / 6 if "S" in d else D / 2)
        anchor = (cx, cy)
    pos = find_free(L, venue, e, anchor=anchor, far_from=ep if tgt == "far_from_entrance" else None, region=region)
    if not pos:
        # try displacing small blockers: swap with the single element at the target if sizes allow
        msgs.append({"ok": False, "text": f"No free space to move the {LABELS[op['type']].lower()} there. Shrink or move another item first."})
        return
    old = (e["x"], e["y"])
    e["x"], e["y"] = pos
    pin(e)
    moved = _dist(old, pos)
    msgs.append({"ok": True, "text": f"{LABELS[op['type']]} moved {moved:.0f} m to ({pos[0]:.0f}, {pos[1]:.0f})."})


def relayout_if_needed(layout: dict, venue: dict, spec: EventSpec, programs: list[dict]) -> dict:
    if not layout.get("_relayout"):
        return layout
    L = auto_layout(venue, spec, programs, params=layout["params"], pins={k: v for k, v in layout["pins"].items()
                                                                           if k not in ("seating", "dining", "buffet", "dance_floor", "activity", "stage", "mandap")},
                    theme=layout.get("theme"))
    return L


# ---------------------------------------------------------------------------------------------
def _lighting(start: str) -> str:
    h = int(start.split(":")[0])
    return "day" if 7 <= h < 16 else "golden" if 16 <= h < 18 else "evening" if 18 <= h < 24 else "night"


def route_to(layout: dict, venue: dict, target_el: dict) -> list[list[float]]:
    blocked, nx, ny = _grid(layout, venue)
    ent = _main_entrance(venue)
    dist, prev = _dijkstra(blocked, nx, ny, _door_cells(venue, ent))
    i0, j0 = max(0, int(target_el["x"] / GRID)), max(0, int(target_el["y"] / GRID))
    i1, j1 = min(nx - 1, int((target_el["x"] + target_el["w"]) / GRID)), min(ny - 1, int((target_el["y"] + target_el["h"]) / GRID))
    best, bd = None, 1e9
    # nearest reachable cell to the element's south-edge midpoint (where a visitor would stand)
    tx, ty = target_el["x"] + target_el["w"] / 2, target_el["y"] + target_el["h"] + 1.0
    for j in range(max(0, j0 - 4), min(ny - 1, j1 + 4) + 1):
        for i in range(max(0, i0 - 4), min(nx - 1, i1 + 4) + 1):
            if dist[j][i] < 1e8 and not blocked[j][i]:
                d = math.hypot((i + .5) * GRID - tx, (j + .5) * GRID - ty)
                if d < bd:
                    best, bd = (i, j), d
    if not best:
        px, py = _door_point(venue, ent)
        return [[px, py - 1], [tx, ty]]
    path = [best]
    while path[-1] in prev:
        path.append(prev[path[-1]])
    path.reverse()
    pts = [[round((i + .5) * GRID, 2), round((j + .5) * GRID, 2)] for (i, j) in path]
    # simplify: keep every ~3 m
    out, last = [pts[0]], pts[0]
    for p in pts[1:-1]:
        if _dist(p, last) >= 3:
            out.append(p); last = p
    out.append(pts[-1])
    return out


def scenes(layout: dict, venue: dict, spec: EventSpec, programs: list[dict]) -> list[dict]:
    out = []
    byt = {}
    for e in layout["elements"]:
        byt.setdefault(e["type"], e)
    for p in sorted(programs, key=lambda x: (x["day"], x["start"])):
        z = byt.get(p["zone_type"])
        if not z:
            out.append({"program_id": p["id"], "title": p["name"], "day": p["day"], "start": p["start"], "end": p["end"], "zone": None,
                        "error": f"No {p['zone_type'].replace('_', ' ')} zone in the layout", "route": [], "lighting": _lighting(p["start"])})
            continue
        route = route_to(layout, venue, z)
        att = math.ceil(spec.guests * p["attendee_fraction"])
        out.append({"program_id": p["id"], "title": p["name"], "day": p["day"], "start": p["start"], "end": p["end"],
                    "zone": {"id": z["id"], "type": z["type"], "label": z["label"], "cx": _center(z)[0], "cy": _center(z)[1]},
                    "route": route, "route_length_m": round(sum(_dist(route[i], route[i + 1]) for i in range(len(route) - 1)), 1),
                    "lighting": _lighting(p["start"]), "attendees": att, "loud": p.get("loud", False),
                    "caption": f"Day {p['day']} · {p['start']}–{p['end']} · {p['name']} · ~{att} guests · {z['label']}"})
    return out


def diff_layouts(a: dict, b: dict) -> dict:
    ea = {e["id"]: e for e in a["elements"]}
    eb = {e["id"]: e for e in b["elements"]}
    moved = []
    for i, e in eb.items():
        o = ea.get(i)
        if not o:
            moved.append({"id": i, "label": e["label"], "change": "added"})
        elif abs(o["x"] - e["x"]) > .05 or abs(o["y"] - e["y"]) > .05 or abs(o["w"] - e["w"]) > .05 or abs(o["h"] - e["h"]) > .05:
            moved.append({"id": i, "label": e["label"], "change": "moved/resized",
                          "dist_m": round(_dist(_center(o), _center(e)), 1)})
    for i, e in ea.items():
        if i not in eb:
            moved.append({"id": i, "label": e["label"], "change": "removed"})
    return {"changed": moved, "theme_changed": a.get("theme", {}).get("id") != b.get("theme", {}).get("id")
            or a.get("theme", {}).get("palette") != b.get("theme", {}).get("palette")}


# ---------------------------------------------------------------------------------------------
def analyze_photo(data: bytes) -> dict:
    """Colour/brightness heuristics on an uploaded venue photo. This does NOT measure dimensions and its
    indoor/outdoor guess is a rough heuristic (an LLM vision model would do better when configured)."""
    from PIL import Image
    if len(data) > 12 * 1024 * 1024:
        raise ValueError("Image is larger than 12 MB")
    im = Image.open(io.BytesIO(data))
    im.load()
    w0, h0 = im.size
    im = im.convert("RGB")
    im.thumbnail((200, 200))
    px = list(im.getdata())
    n = len(px)
    import colorsys
    hsv = [colorsys.rgb_to_hsv(r / 255, g / 255, b / 255) for r, g, b in px]
    bright = sum(v for _, _, v in hsv) / n
    sat = sum(s for _, s, _ in hsv) / n
    green = sum(1 for h, s, v in hsv if .22 < h < .45 and s > .25 and v > .2) / n
    W, H = im.size
    top = [colorsys.rgb_to_hsv(*(c / 255 for c in im.getpixel((x, y)))) for y in range(int(H * .3)) for x in range(W)]
    sky = sum(1 for h, s, v in top if (.5 < h < .68 and v > .55) or (s < .12 and v > .85)) / max(len(top), 1)
    warm = sum(1 for h, s, v in hsv if (h < .12 or h > .95) and s > .45 and v > .5) / n
    q = im.quantize(colors=5, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()[:15]
    counts = sorted(q.getcolors(), reverse=True)
    palette = ["#%02x%02x%02x" % tuple(pal[i * 3:i * 3 + 3]) for _, i in counts[:5]]
    outdoor = green + sky * .6 > .28
    kind = "garden_lawn" if green > .3 else "rooftop" if (sky > .3 and green < .1) else "mantapa_hall" if warm > .12 else "banquet_hall"
    return {"image_size": [w0, h0], "brightness": round(bright, 2), "saturation": round(sat, 2), "green_ratio": round(green, 2),
            "sky_ratio": round(sky, 2), "warm_light_ratio": round(warm, 2), "palette": palette, "guess_outdoor": bool(outdoor),
            "suggested_template": kind, "suggested_theme_palette": palette[:4],
            "confidence": "low (colour heuristics only)",
            "notes": ["Dimensions cannot be measured from a photo — enter the real length × width.",
                      "The photo is used as a visual reference/backdrop and for palette extraction only."]}
