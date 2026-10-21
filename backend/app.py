"""EventForge API (Starlette — the ASGI toolkit FastAPI is built on; used directly because FastAPI could not be installed offline).

Run:  python -m uvicorn app:app --port 8000   (from the backend/ folder)
"""
from __future__ import annotations

import base64
import datetime as dt
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from starlette.applications import Starlette
from starlette.exceptions import HTTPException
from starlette.requests import Request
from starlette.responses import FileResponse, JSONResponse, Response
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

from engines import budget as B, community as C, critic as K, engine as E, evals, exports as X, ideas as I, llm, timeline as T, vendors as V, vision as VI
from engines.money import fmt_inr, fmt_short, to_paise
from engines.spec import build_spec, parse_intake

FRONT = ROOT / "frontend"
if not FRONT.exists():
    for candidate in [Path.cwd() / "frontend", Path(__file__).resolve().parent / "frontend", Path("/var/task/frontend")]:
        if candidate.exists():
            FRONT = candidate
            break


def J(data, status=200):
    return JSONResponse(json.loads(json.dumps(data, default=str)), status_code=status)


async def body(req: Request) -> dict:
    try:
        return await req.json()
    except Exception:
        return {}


def handler(fn):
    async def wrapper(req: Request):
        try:
            return await fn(req)
        except KeyError as e:
            return J({"error": f"Not found: {e}"}, 404)
        except (ValueError, TypeError) as e:
            msg = str(e)
            if "validation error" in msg:
                lines = [l.strip() for l in msg.split("\n") if l.strip() and "pydantic.dev" not in l and "validation error" not in l]
                return J({"error": "Invalid input — " + "; ".join(lines)[:300]}, 422)
            return J({"error": msg}, 400)
        except HTTPException:
            raise
        except Exception as e:  # pydantic validation etc.
            msg = str(e)
            if "validation error" in msg:
                return J({"error": "Invalid input: " + re.sub(r"\n.*For further information.*", "", msg)[:400]}, 422)
            raise
    wrapper.__name__ = fn.__name__
    return wrapper


def package(g: dict, extra: dict | None = None) -> dict:
    out = {"project_id": g["project_id"], "version": g["version"], "plan": g["plan"], "state_summary": {
        "coordinators": g["state"]["coordinators"], "venue_id": g["state"]["venue_id"], "today": g["state"]["today"]}}
    if extra:
        out.update(extra)
    return out


# ---------------------------------------------------------------- basic
@handler
async def health(req):
    return J({"ok": True, "llm": llm.provider(), "time": dt.datetime.utcnow().isoformat()})


@handler
async def intake(req):
    d = await body(req)
    text = d.get("text", "")
    base = d.get("base") or {}
    today = dt.date.fromisoformat(d["today"]) if d.get("today") else None
    r = parse_intake(text, today, base)
    return J(r)


@handler
async def create_project(req):
    d = await body(req)
    today = dt.date.fromisoformat(d["today"]) if d.get("today") else None
    fields = d.get("fields")
    if not fields:
        fields = parse_intake(d.get("text", ""), today)["fields"]
    if d.get("budget_rupees"):
        fields["budget_paise"] = to_paise(d["budget_rupees"])
    spec = build_spec(fields, today)
    r = E.create_project(spec, d.get("name"), d.get("today"))
    return J(package(E.get_plan(r["id"])))


@handler
async def list_projects(req):
    return J({"projects": E.list_projects()})


@handler
async def get_project(req):
    return J(package(E.get_plan(req.path_params["pid"])))


@handler
async def propose(req):
    d = await body(req)
    ch = d.get("changes") or {}
    if "date" in ch and isinstance(ch["date"], str):
        dt.date.fromisoformat(ch["date"])
    return J(E.propose(req.path_params["pid"], ch, d.get("label")))


@handler
async def apply_proposal(req):
    g = E.apply_proposal(req.path_params["prop"])
    return J(package(g))


@handler
async def reject_proposal(req):
    E.reject_proposal(req.path_params["prop"])
    return J({"ok": True})


@handler
async def commit(req):
    d = await body(req)
    g = E.commit_direct(req.path_params["pid"], d.get("changes") or {}, d.get("label") or "Update")
    return J(package(g, {"notes": g.get("notes", [])}))


@handler
async def undo(req):
    return J(package(E.undo(req.path_params["pid"])))


@handler
async def redo(req):
    return J(package(E.redo(req.path_params["pid"])))


@handler
async def restore(req):
    d = await body(req)
    return J(package(E.restore(req.path_params["pid"], int(d["version_id"]))))


@handler
async def versions(req):
    return J({"versions": E.versions(req.path_params["pid"])})


@handler
async def compare(req):
    q = req.query_params
    return J(E.compare_versions(req.path_params["pid"], int(q["a"]), int(q["b"])))


# ---------------------------------------------------------------- budget
@handler
async def whatif(req):
    d = await body(req)
    g = E.get_plan(req.path_params["pid"])
    spec = E.effective_spec(g["state"])
    ch = d.get("changes", {})
    if "budget_rupees" in ch:
        ch["budget_paise"] = to_paise(ch.pop("budget_rupees"))
    if "date" in ch:
        ch["date"] = dt.date.fromisoformat(ch["date"])
    vp = {V.BUDGET_KEY[spec.event_type][c]: r["price_estimate"]["mid"] for c, r in g["plan"]["selection"].items() if c in V.BUDGET_KEY[spec.event_type]}
    w = B.what_if(spec, ch, vp)
    w.pop("plan_after", None)
    return J(w)


@handler
async def optimize(req):
    g = E.get_plan(req.path_params["pid"])
    spec = E.effective_spec(g["state"])
    bk = V.BUDGET_KEY[spec.event_type]
    vp = {bk[c]: r["price_estimate"]["mid"] for c, r in g["plan"]["selection"].items() if c in bk}
    return J(B.optimize(spec, vp))


@handler
async def add_expense(req):
    d = await body(req)
    amt = to_paise(d["amount_rupees"])
    if amt <= 0:
        raise ValueError("amount must be positive")

    def fn(s):
        s["expenses"].append({"id": len(s["expenses"]) + 1 + sum(e["id"] for e in s["expenses"][-1:]), "category": d["category"], "amount_paise": amt,
                              "kind": d.get("kind", "paid"), "note": d.get("note", ""), "date": dt.date.today().isoformat()})
    return J(package(E.mutate_state(req.path_params["pid"], fn, f"Expense {fmt_inr(amt)} · {d['category']}")))


@handler
async def del_expense(req):
    eid = int(req.path_params["eid"])
    return J(package(E.mutate_state(req.path_params["pid"], lambda s: s.__setitem__("expenses", [e for e in s["expenses"] if e["id"] != eid]), "Expense removed")))


# ---------------------------------------------------------------- vendors
@handler
async def rank(req):
    d = await body(req)
    pid = req.path_params["pid"]
    g = E.get_plan(pid)
    spec = E.effective_spec(g["state"])
    cat = d["category"]
    alloc = next((r["allocated"] for r in g["plan"]["budget"]["categories"] if r["key"] == V.BUDGET_KEY[spec.event_type].get(cat)), 0)
    r = V.rank_vendors(spec, cat, alloc, d.get("weights"), limit=int(d.get("limit", 8)))
    r["ranked"] = [x for x in r["ranked"] if x["vendor"]["id"] not in g["state"]["cancelled_vendors"]]
    return J(r)


@handler
async def checklist(req):
    g = E.get_plan(req.path_params["pid"])
    return J(V.checklist_for(req.path_params["cat"], E.effective_spec(g["state"])))


@handler
async def tick(req):
    d = await body(req)

    def fn(s):
        cur = set(s["checklist_done"])
        (cur.add if d.get("done", True) else cur.discard)(d["item_id"])
        s["checklist_done"] = sorted(cur)
    return J(package(E.mutate_state(req.path_params["pid"], fn, "Checklist tick")))


@handler
async def outreach(req):
    d = await body(req)
    g = E.get_plan(req.path_params["pid"])
    spec = E.effective_spec(g["state"])
    v = next((x for x in V.all_vendors(spec.city) if x["id"] == d["vendor_id"]), None)
    if not v:
        raise KeyError("vendor")
    return J(V.outreach(v, spec, d.get("channel", "whatsapp"), d.get("lang", "en"), d.get("contact", "")))


@handler
async def add_quote(req):
    d = await body(req)
    q = V.extract_quote(d["text"], d.get("label", "Quote"), E.effective_spec(E.get_plan(req.path_params["pid"])["state"]).guests)
    q["id"] = d.get("id") or dt.datetime.utcnow().strftime("%H%M%S%f")
    q["category"] = d.get("category")
    q["raw"] = d["text"][:3000]
    if d.get("preview"):
        return J({"quote": q})
    return J(package(E.mutate_state(req.path_params["pid"], lambda s: s["quotes"].append(q), f"Quote added: {q['label']}"), {"quote": q}))


@handler
async def del_quote(req):
    qid = req.path_params["qid"]
    return J(package(E.mutate_state(req.path_params["pid"], lambda s: s.__setitem__("quotes", [q for q in s["quotes"] if q["id"] != qid]), "Quote removed")))


@handler
async def compare_quotes(req):
    g = E.get_plan(req.path_params["pid"])
    return J(V.compare_quotes(g["state"]["quotes"]))


# ---------------------------------------------------------------- vision
@handler
async def venues(req):
    return J({"venues": VI.venue_library()})


@handler
async def vision_validate(req):
    d = await body(req)
    g = E.get_plan(req.path_params["pid"])
    spec = E.effective_spec(g["state"])
    vis = g["plan"]["vision"]
    layout = {**vis["layout"], "elements": d["elements"]}
    for e in layout["elements"]:
        e.setdefault("label", VI.LABELS.get(e["type"], e["type"]))
    res = VI.validate_layout(layout, vis["venue"], spec, g["plan"]["programs"])
    sc = VI.scenes(layout, vis["venue"], spec, g["plan"]["programs"]) if d.get("scenes") else None
    return J({"validation": res, "scenes": sc})


@handler
async def photo(req):
    d = await body(req)
    raw = d["image_base64"].split(",")[-1]
    data = base64.b64decode(raw)
    a = VI.analyze_photo(data)
    if llm.available():
        j = llm.complete_json("Classify this event-venue photo. Keys: venue_type (banquet_hall|garden_lawn|mantapa_hall|community_hall|rooftop|community_ground), "
                              "indoor (bool), features (list of strings), style (string).", "Describe the venue.", image_bytes=data)
        if j:
            a["llm"] = j
            if j.get("venue_type") in VI.VENUES:
                a["suggested_template"] = j["venue_type"]
            a["confidence"] = "medium (vision model, unverified)"
    pid = req.path_params["pid"]
    E.mutate_state(pid, lambda s: s.__setitem__("photo", {k: v for k, v in a.items() if k != "llm"}), "Venue photo analysed")
    return J(a)


# ---------------------------------------------------------------- community
@handler
async def roster(req):
    d = await body(req)
    g = E.get_plan(req.path_params["pid"])
    spec = E.effective_spec(g["state"])
    progs = g["plan"]["programs"]
    return J(C.volunteer_roster(spec.guests, d.get("start") or min(p["start"] for p in progs), d.get("end") or max(p["end"] for p in progs),
                                int(d.get("shift_len", 3)), d.get("volunteers"), int(d.get("max_hours", 6))))


@handler
async def permits(req):
    d = await body(req)
    spec = E.effective_spec(E.get_plan(req.path_params["pid"])["state"])
    return J(C.permits_checklist(spec, d.get("loud", True), d.get("food_stalls", True)))


@handler
async def sponsor(req):
    d = await body(req)
    spec = E.effective_spec(E.get_plan(req.path_params["pid"])["state"])
    return J(C.sponsorship_pitch(spec, d.get("org", "Our community group"), d.get("impact", "")))


@handler
async def estimate(req):
    d = await body(req)
    g = E.get_plan(req.path_params["pid"])
    spec = E.effective_spec(g["state"])
    vis = g["plan"]["vision"]
    area = None
    for e in vis["layout"]["elements"]:
        if e["type"] in ("activity", "dining"):
            area = (area or 0) + e["w"] * e["h"]
    return J(C.estimator(spec, d.get("attendance_pct"), int(d.get("meals", 1)), d.get("area_m2") or area))


# ---------------------------------------------------------------- chat
async def _chat_impl(pid: str, msg: str) -> dict:
    g = E.get_plan(pid)
    plan, state = g["plan"], g["state"]
    spec = E.effective_spec(state)
    t = msg.lower().strip()
    today = E.today_of(state)
    sd = plan["spec"]

    # 1. layout commands
    ops = VI.parse_command(msg)
    if ops and all(o["op"] != "unknown" for o in ops) and re.search(r"stage|mandap|dining|buffet|seating|dance|photo|desk|first.?aid|kitchen|backstage|decor|theme|colou?r|activity", t) \
            and not re.search(r"\bwhat|why|how|show|tell\b", t[:12]):
        return {"reply": "I'll rearrange the layout and show you what that does to the plan before applying it.", "proposal": E.propose(pid, {"vision_command": msg})}

    # 2. preferences
    if re.search(r"^(i |we )?(prefer|like|love|want)|no loud|vegetarian only|pure veg|no crackers|eco[- ]friendly|dislike|avoid\b", t) and not re.search(r"guest|budget|date", t):
        return {"reply": "Noted — I'll remember that and use it for ideas, menu and vendor fit.", "proposal": E.propose(pid, {"pref": msg})}

    # 3. spec changes
    ch: dict = {}
    m = re.search(r"(\d[\d,]*)\s*(?:more|extra|additional)\s*(?:guests?|people)|add\s*(\d[\d,]*)\s*(?:guests?|people)", t)
    if m:
        ch["guests"] = spec.guests + int((m.group(1) or m.group(2)).replace(",", ""))
    m = re.search(r"(?:remove|reduce|cut|drop)\s*(\d[\d,]*)\s*(?:guests?|people)", t)
    if m:
        ch["guests"] = max(1, spec.guests - int(m.group(1).replace(",", "")))
    if re.search(r"change|make|set|update|move|increase|reduce|shift|switch|raise|lower|now|instead|let'?s|guests? (?:to|=)|budget (?:to|is)|to \d|into", t) and not ch:
        r = parse_intake(msg, today)
        f = r["fields"]
        if "guests" in f and f["guests"] != spec.guests and re.search(r"guest|people|pax|attend|headcount", t):
            ch["guests"] = f["guests"]
        if "budget_paise" in f and f["budget_paise"] != spec.budget_paise and re.search(r"budget|₹|rs|lakh|\bl\b|k\b", t):
            ch["budget_paise"] = f["budget_paise"]
        if "date" in f and not f.get("date_assumed") and f["date"] != sd["date"]:
            ch["date"] = f["date"]
        elif "date" in f and f.get("date_assumed") and re.search(r"month|date|postpone|prepone|move", t):
            ch["date"] = f["date"]
        if "city" in f and f["city"] != spec.city:
            ch["city"] = f["city"]
        if "days" in f and f["days"] != spec.days:
            ch["days"] = f["days"]
        if "diet" in f and f["diet"] != spec.diet:
            ch["diet"] = f["diet"]
        if "outdoor" in f and f["outdoor"] != spec.outdoor and re.search(r"outdoor|indoor|lawn|hall", t):
            ch["outdoor"] = f["outdoor"]
    if ch:
        return {"reply": "Here's what that would change — nothing is applied until you approve.", "proposal": E.propose(pid, ch)}

    # 4. questions answered from the plan
    ov, b, cr = plan["overview"], plan["budget"], plan["critic"]
    if re.search(r"why.*(alloc|categor|decor|cater|venue|photo|food)|explain", t):
        top = max(b["categories"], key=lambda r: r["weight"])
        rows = "\n".join(f"• {r['label']}: {fmt_inr(r['allocated'])} — {r['why']}" for r in b["categories"][:4])
        return {"reply": f"Allocation is rule-based, then summed exactly in integer paise. Largest share: {top['label']} ({top['weight'] * 100:.0f}%).\n{rows}"}
    if re.search(r"optimi[sz]e|save|saving|reduce (?:the )?cost|over budget|cheaper|cut cost", t):
        spec_ = spec
        o = B.optimize(spec_)
        if not o["needed"]:
            return {"reply": o["message"]}
        return {"reply": o["message"] + "\n" + "\n".join(f"{i + 1}. {s['label']} — saves {fmt_short(s['saving'])}" for i, s in enumerate(o["steps"]))}
    if re.search(r"budget|cost|spend|afford|expens|money|price", t):
        return {"reply": f"Budget {fmt_inr(b['total'])} (incl. {b['contingency_pct']}% contingency {fmt_inr(b['contingency'])}). Expected cost {fmt_inr(b['estimate_total']['exp'])} "
                         f"→ {b['feasibility'].replace('_', ' ')}. Simulated chance of exceeding the budget: {b['risk']['p_exceed_budget'] * 100:.0f}% "
                         f"(assumed cost ranges). Per head: {fmt_inr(b['per_head_total'])}. Say “optimise” to see savings levers."}
    if re.search(r"risk|problem|issue|wrong|danger|safe|critic|check", t):
        rs = cr["risks"][:4]
        hf = cr["hard_failed"][:3]
        lines = [f"✗ {h['title']} — {h['evidence']}" for h in hf] + [f"[{r['severity']}] {r['title']} — {r['evidence']}" for r in rs]
        return {"reply": f"Verification: {cr['hard_passed']}/{cr['hard_total']} hard checks pass.\n" + ("\n".join(lines) if lines else "No open problems found.")}
    if re.search(r"next|todo|to-do|task|deadline|schedule|timeline|when|critical", t):
        up = ov["upcoming"][:4]
        return {"reply": f"{ov['days_to_event']} days to go · timeline {plan['timeline']['status']}. Critical path: {' → '.join(plan['timeline']['critical_path'])}.\nNext: " +
                         "; ".join(f"{x['name']} ({x['start']}→{x['end']})" for x in up)}
    if re.search(r"vendor|caterer|photographer|decorator|venue", t) and not re.search(r"layout|move", t):
        cat = next((c for c in V.CATEGORIES_FOR[spec.event_type] if c in t), "caterer" if "caterer" in V.CATEGORIES_FOR[spec.event_type] else "venue")
        r = plan["vendors"][cat]["ranked"][:3]
        return {"reply": f"Top {cat}s (SAMPLE data, estimates): " + "; ".join(f"{x['vendor']['name']} {fmt_short(x['price_estimate']['mid'])} (score {x['score']})" for x in r)}
    if re.search(r"theme|idea|menu|decor|entertain|food", t):
        th = plan["ideas"]["themes"][:3]
        return {"reply": "Theme ideas for you: " + "; ".join(f"{x['name']} ({x['score']})" for x in th) + f". Menu note: {plan['ideas']['menu']['note']}"}
    if re.search(r"volunteer|permit|sponsor|crowd|food quantity", t) and plan["community"]:
        return {"reply": f"{plan['community']['roster']['volunteers']} volunteers cover all shifts ({plan['community']['roster']['coverage_pct']}%). Open the Community tab for permits, sponsorship and quantities."}
    if llm.available():
        ctx = json.dumps({"spec": sd, "overview": {k: ov[k] for k in ("days_to_event", "feasibility", "p_exceed", "checks_passed", "checks_total")}})
        out = llm.complete("You are EventForge, an event-planning assistant. Answer briefly using ONLY this plan data; never invent prices.", f"Plan: {ctx}\nQuestion: {msg}")
        if out:
            return {"reply": out}
    return {"reply": "I can change the plan (“make it 400 guests”, “budget 18 lakh”, “move dining away from the entrance”, “change decoration to white and gold”), "
                     "or answer questions (“what are the risks?”, “what's next?”, “why this allocation?”, “how can I save money?”)."}


@handler
async def chat(req):
    d = await body(req)
    return J(await _chat_impl(req.path_params["pid"], d.get("message", "")))


# ---------------------------------------------------------------- evals + exports
@handler
async def run_evals(req):
    return J(evals.run_all())


@handler
async def export(req):
    pid, kind = req.path_params["pid"], req.path_params["kind"]
    g = E.get_plan(pid)
    plan, state = g["plan"], g["state"]
    name = re.sub(r"[^a-zA-Z0-9_-]+", "_", state["name"])[:40] or "event"
    if kind == "ics":
        spec = E.effective_spec(state)
        return Response(T.to_ics(spec, plan["timeline"], plan["programs"], state["name"]), media_type="text/calendar",
                        headers={"Content-Disposition": f'attachment; filename="{name}.ics"'})
    if kind == "pdf":
        return Response(X.pdf_report(plan), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{name}-plan.pdf"'})
    if kind == "gif":
        return Response(X.walkthrough_gif(plan), media_type="image/gif", headers={"Content-Disposition": f'attachment; filename="{name}-walkthrough.gif"'})
    if kind == "json":
        return Response(json.dumps({"state": state, "plan": plan}, default=str, indent=1), media_type="application/json",
                        headers={"Content-Disposition": f'attachment; filename="{name}.json"'})
    if kind == "digest":
        return Response(plan["digest"]["text"], media_type="text/plain; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{name}-digest.txt"'})
    raise KeyError(kind)


async def index(req):
    return FileResponse(FRONT / "index.html")


@handler
async def judge_challenge_route(req):
    return J(K.judge_challenge_preset(req.path_params["preset"]))


routes = [
    Route("/", index),
    Route("/api/health", health),
    Route("/api/judge-challenge/{preset}", judge_challenge_route),
    Route("/api/intake", intake, methods=["POST"]),
    Route("/api/projects", create_project, methods=["POST"]),
    Route("/api/projects", list_projects, methods=["GET"]),
    Route("/api/venues", venues),
    Route("/api/evals", run_evals),
    Route("/api/projects/{pid}", get_project),
    Route("/api/projects/{pid}/propose", propose, methods=["POST"]),
    Route("/api/proposals/{prop}/apply", apply_proposal, methods=["POST"]),
    Route("/api/proposals/{prop}/reject", reject_proposal, methods=["POST"]),
    Route("/api/projects/{pid}/commit", commit, methods=["POST"]),
    Route("/api/projects/{pid}/undo", undo, methods=["POST"]),
    Route("/api/projects/{pid}/redo", redo, methods=["POST"]),
    Route("/api/projects/{pid}/restore", restore, methods=["POST"]),
    Route("/api/projects/{pid}/versions", versions),
    Route("/api/projects/{pid}/compare", compare),
    Route("/api/projects/{pid}/whatif", whatif, methods=["POST"]),
    Route("/api/projects/{pid}/optimize", optimize, methods=["POST"]),
    Route("/api/projects/{pid}/expenses", add_expense, methods=["POST"]),
    Route("/api/projects/{pid}/expenses/{eid}", del_expense, methods=["DELETE"]),
    Route("/api/projects/{pid}/vendors/rank", rank, methods=["POST"]),
    Route("/api/projects/{pid}/checklist/{cat}", checklist),
    Route("/api/projects/{pid}/checklist", tick, methods=["POST"]),
    Route("/api/projects/{pid}/outreach", outreach, methods=["POST"]),
    Route("/api/projects/{pid}/quotes", add_quote, methods=["POST"]),
    Route("/api/projects/{pid}/quotes/compare", compare_quotes),
    Route("/api/projects/{pid}/quotes/{qid}", del_quote, methods=["DELETE"]),
    Route("/api/projects/{pid}/vision/validate", vision_validate, methods=["POST"]),
    Route("/api/projects/{pid}/vision/photo", photo, methods=["POST"]),
    Route("/api/projects/{pid}/community/roster", roster, methods=["POST"]),
    Route("/api/projects/{pid}/community/permits", permits, methods=["POST"]),
    Route("/api/projects/{pid}/community/sponsor", sponsor, methods=["POST"]),
    Route("/api/projects/{pid}/community/estimate", estimate, methods=["POST"]),
    Route("/api/projects/{pid}/chat", chat, methods=["POST"]),
    Route("/api/projects/{pid}/export/{kind}", export),
    Mount("/static", app=StaticFiles(directory=str(FRONT)), name="static"),
]

# Provide aliases for both prefixed (/api/...) and direct (/...) routes
# so any cloud proxy (Vercel, Render, Railway, AWS Lambda) resolves seamlessly.
expanded_routes = []
for r in routes:
    expanded_routes.append(r)
    if isinstance(r, Route) and r.path.startswith("/api/"):
        unprefixed = r.path[4:]  # e.g. /health, /projects
        expanded_routes.append(Route(unprefixed, r.endpoint, methods=r.methods))

for alias in ["/api", "/api/", "/api/index.py", "/index.py", "/index.html"]:
    expanded_routes.append(Route(alias, index))

class VercelPathFixer:
    """Restores original request path from cloud proxy headers (x-matched-path, x-forwarded-uri)."""
    def __init__(self, asgi_app):
        self.asgi_app = asgi_app

    async def __call__(self, scope, receive, send):
        if scope.get("type") == "http":
            headers = dict(scope.get("headers", []))
            for h in [b"x-matched-path", b"x-forwarded-uri", b"x-original-url", b"x-rewrite-url"]:
                if h in headers:
                    val = headers[h].decode("utf-8")
                    if val and val != "/":
                        scope["path"] = val.split("?")[0]
                        break
        await self.asgi_app(scope, receive, send)

app = VercelPathFixer(Starlette(routes=expanded_routes))

