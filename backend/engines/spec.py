"""Event Spec (validated schema) + adaptive intake parser.

Intake = deterministic extractor (regex/keyword) -> optional LLM refinement -> Pydantic validation
-> list of missing fields -> targeted clarifying questions. Every inferred value is recorded as an
assumption so the UI can show what was guessed.
"""
from __future__ import annotations

import datetime as dt
import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from . import geo, llm
from .money import to_paise

EventType = Literal["wedding", "birthday", "community"]
Diet = Literal["veg", "mostly_veg", "mixed", "nonveg", "jain"]
Culture = Literal["kannada", "telugu", "tamil", "malayali", "north_indian", "marwari_jain", "muslim", "christian", "generic"]


class EventSpec(BaseModel):
    event_type: EventType = "wedding"
    title: str = ""
    date: dt.date | None = None
    date_assumed: bool = False
    city: str = "Bengaluru"
    guests: int = Field(100, ge=1, le=5000)
    budget_paise: int = Field(100000_00, gt=0)
    days: int = Field(1, ge=1, le=7)
    outdoor: bool | None = None
    diet: Diet = "mixed"
    culture: Culture = "generic"
    priorities: list[str] = []
    must_haves: list[str] = []
    avoid: list[str] = []
    celebrant_age: int | None = None
    theme: str | None = None
    risk_tolerance: Literal["low", "medium", "high"] = "medium"

    @field_validator("city")
    @classmethod
    def _city(cls, v: str) -> str:
        return geo.canon_city(v) or v.strip().title()

    @property
    def tier(self) -> int:
        return geo.city_info(self.city)[0]

    @property
    def region(self) -> str:
        return geo.city_info(self.city)[1]


REQUIRED = ["event_type", "guests", "budget_paise", "date", "city"]

MONTHS = {m: i + 1 for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october",
     "november", "december"])}
MONTHS.update({k[:3]: v for k, v in list(MONTHS.items())})
MONTHS["sept"] = 9
NUMWORD = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7}

PRIORITY_WORDS = {
    "food": "food", "catering": "food", "menu": "food", "decor": "decor", "decoration": "decor",
    "flowers": "decor", "photo": "photography", "photography": "photography", "video": "photography",
    "music": "music", "dj": "music", "entertainment": "music", "venue": "venue", "dance": "music",
}
CULTURE_WORDS = [
    (r"kannad|karnataka|mandap|dhare", "kannada"), (r"telugu|andhra|telangana", "telugu"),
    (r"tamil|iyer|iyengar", "tamil"), (r"malayal|kerala|nair|syrian christian", "malayali"),
    (r"marwari|jain\s+wedding|rajasthani", "marwari_jain"),
    (r"nikah|muslim|walima|islamic", "muslim"), (r"church|christian|catholic", "christian"),
    (r"punjabi|north indian|sikh|gujarati|baraat|sangeet", "north_indian"),
]


def _parse_money(text: str) -> tuple[int | None, str]:
    t = text.lower().replace(",", "")
    unit_mult = {"crore": 1e7, "cr": 1e7, "lakh": 1e5, "lakhs": 1e5, "lac": 1e5, "lacs": 1e5, "l": 1e5,
                 "k": 1e3, "thousand": 1e3}
    pats = [
        r"(?:₹|rs\.?|inr)\s*(\d+(?:\.\d+)?)\s*(crore|cr|lakhs?|lacs?|l|k|thousand)?\b",
        r"\b(\d+(?:\.\d+)?)\s*(crore|cr|lakhs?|lacs?|l|k|thousand)\b",
        r"budget[^\d]{0,15}(\d+(?:\.\d+)?)\s*()",
    ]
    for p in pats:
        m = re.search(p, t)
        if m:
            val = float(m.group(1)) * unit_mult.get(m.group(2) or "", 1)
            if val >= 1000:
                return to_paise(val), m.group(0).strip()
    return None, ""


def _next_occurrence(month: int, day: int | None, year: int | None, today: dt.date) -> tuple[dt.date, bool]:
    assumed = day is None
    y = year or today.year
    if day is None:
        # assume the 2nd Saturday of the month (weekend wedding/party default)
        first = dt.date(y, month, 1)
        sat = first + dt.timedelta(days=(5 - first.weekday()) % 7)
        d = sat + dt.timedelta(days=7)
    else:
        d = dt.date(y, month, min(day, 28 if month == 2 else 30 if month in (4, 6, 9, 11) else 31))
    if year is None and d <= today:
        return _next_occurrence(month, day, y + 1, today)
    return d, assumed


def _parse_date(text: str, today: dt.date) -> tuple[dt.date | None, bool, str]:
    t = text.lower()
    m = re.search(r"\b(20\d\d)-(\d\d)-(\d\d)\b", t)
    if m:
        return dt.date(int(m[1]), int(m[2]), int(m[3])), False, m[0]
    m = re.search(r"\b(\d{1,2})[/-](\d{1,2})[/-](20\d\d)\b", t)  # dd/mm/yyyy (India)
    if m:
        try:
            return dt.date(int(m[3]), int(m[2]), int(m[1])), False, m[0]
        except ValueError:
            pass
    mon = "|".join(sorted(MONTHS, key=len, reverse=True))
    m = re.search(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s*(?:of\s+)?({mon})\b[\s,]*(20\d\d)?", t)
    if m and not (m[2] == "may" and False):
        try:
            d, _ = _next_occurrence(MONTHS[m[2]], int(m[1]), int(m[3]) if m[3] else None, today)
            return d, False, m[0].strip()
        except ValueError:
            pass
    m = re.search(rf"\b({mon})\s+(\d{{1,2}})(?:st|nd|rd|th)?\b[\s,]*(20\d\d)?", t)
    if m:
        try:
            d, _ = _next_occurrence(MONTHS[m[1]], int(m[2]), int(m[3]) if m[3] else None, today)
            return d, False, m[0].strip()
        except ValueError:
            pass
    m = re.search(rf"\b(?:in|on|during|of|this|next)\s+({mon})\b[\s,]*(20\d\d)?", t) or \
        re.search(rf"\b({mon})\b[\s,]*(20\d\d)\b", t) or re.search(
            r"\b(january|february|march|april|june|july|august|september|october|november|december)\b", t)
    if m:
        mname = m[1]
        yr = None
        if m.lastindex and m.lastindex >= 2 and m[2]:
            yr = int(m[2])
        d, assumed = _next_occurrence(MONTHS[mname], None, yr, today)
        return d, True, m[0].strip()
    return None, False, ""


def parse_intake(text: str, today: dt.date | None = None, base: dict | None = None) -> dict:
    today = today or dt.date.today()
    text = str(text or "")[:5000]
    t = text.lower()
    f: dict = dict(base or {})
    ev: dict[str, str] = {}
    assumptions: list[str] = []

    # event type
    if re.search(r"wedding|marriage|shaadi|vivah|reception|engagement|nikah|sangeet", t):
        f["event_type"], ev["event_type"] = "wedding", "wedding keywords"
    elif re.search(r"birthday|b'?day|anniversary|turning \d+", t):
        f["event_type"], ev["event_type"] = "birthday", "birthday keywords"
    elif re.search(r"community|festival|society|apartment|neighbou?r|temple|cultural|charity|fundrais|rwa|"
                   r"mela|puja|pooja|ganesh|navratri|garba|residents|colony|school day|annual day", t):
        f["event_type"], ev["event_type"] = "community", "community keywords"

    # guests
    m = re.search(r"(\d[\d,]*)\s*(?:\+\s*)?(?:guests?|people|persons?|pax|attendees|members|invitees|heads|"
                  r"residents|families|visitors)", t) or re.search(r"(?:guest count|for|around|about|~)\s*(\d{2,5})\b(?!\s*(?:k|l|lakh))", t)
    if m:
        f["guests"] = int(m.group(1).replace(",", ""))
        ev["guests"] = m.group(0).strip()

    # budget
    b, evb = _parse_money(text)
    if b:
        f["budget_paise"], ev["budget_paise"] = b, evb

    # date
    d, assumed, evd = _parse_date(text, today)
    if d:
        f["date"], f["date_assumed"], ev["date"] = d.isoformat(), assumed, evd
        if assumed:
            assumptions.append(f"No exact day given — assumed {d.strftime('%a %d %b %Y')} (2nd Saturday). Please confirm.")

    # city
    for alias in sorted(geo.ALIASES, key=len, reverse=True):
        if re.search(rf"\b{re.escape(alias)}\b", t):
            f["city"], ev["city"] = geo.ALIASES[alias], alias
            break

    # days
    m = re.search(r"\b(\d|one|two|three|four|five)[\s-]*(?:day|days)\b", t)
    if m:
        v = m.group(1)
        f["days"] = int(v) if v.isdigit() else NUMWORD[v]
        ev["days"] = m.group(0)

    # diet
    if re.search(r"jain", t):
        f["diet"], ev["diet"] = "jain", "jain"
    elif re.search(r"mostly\s+veg|mainly\s+veg|largely\s+veg", t):
        f["diet"], ev["diet"] = "mostly_veg", "mostly vegetarian"
    elif re.search(r"non[\s-]?veg", t) and not re.search(r"no\s+non[\s-]?veg", t):
        f["diet"], ev["diet"] = "nonveg", "non-veg"
    elif re.search(r"pure\s+veg|only\s+veg|vegetarian|\bveg\b|no\s+non[\s-]?veg", t):
        f["diet"], ev["diet"] = "veg", "vegetarian"

    # age (birthday)
    m = re.search(r"(\d{1,3})(?:st|nd|rd|th)\s+(?:birthday|bday|anniversary)", t) or re.search(r"turning\s+(\d{1,3})", t)
    if m:
        f["celebrant_age"] = int(m.group(1))
        ev["celebrant_age"] = m.group(0)

    # outdoor / indoor
    if re.search(r"outdoor|lawn|garden|open[\s-]air|terrace|rooftop", t):
        f["outdoor"], ev["outdoor"] = True, "outdoor keywords"
    elif re.search(r"indoor|banquet|hall|air[\s-]?condition", t):
        f["outdoor"], ev["outdoor"] = False, "indoor keywords"

    # culture
    for pat, c in CULTURE_WORDS:
        if re.search(pat, t):
            f["culture"], ev["culture"] = c, pat
            break

    # priorities
    pr: list[str] = []
    for m in re.finditer(r"(?:priorit\w*|focus(?:ed)? on|splurge on|most important|important|mainly|emphasis on)[:\s]+([^.;\n]+)", t):
        for w in re.findall(r"[a-z]+", m.group(1)):
            if w in PRIORITY_WORDS and PRIORITY_WORDS[w] not in pr:
                pr.append(PRIORITY_WORDS[w])
    for m in re.finditer(r"(food|decor|photography|music|venue)\s+(?:first|matters most|is the priority)", t):
        if PRIORITY_WORDS[m.group(1)] not in pr:
            pr.append(PRIORITY_WORDS[m.group(1)])
    if pr:
        f["priorities"], ev["priorities"] = pr, "stated priorities"

    # avoid
    avoid = []
    if re.search(r"no (?:loud )?music|no dj|quiet|no loud", t):
        avoid.append("loud music")
    if re.search(r"no alcohol|dry (?:wedding|event)|alcohol[\s-]free", t):
        avoid.append("alcohol")
    if re.search(r"no crackers|no firecrackers|eco[\s-]?friendly|zero[\s-]?waste", t):
        avoid.append("firecrackers")
    if avoid:
        f["avoid"] = avoid
        ev["avoid"] = "stated dislikes"

    # LLM refinement (optional, validated)
    if llm.available():
        j = llm.complete_json(
            "Extract event planning fields from the request. Keys allowed: event_type(wedding|birthday|community), "
            "guests(int), budget_rupees(int), date(YYYY-MM-DD), city, days(int), diet(veg|mostly_veg|mixed|nonveg|jain), "
            "culture, priorities(list), avoid(list). Omit unknown keys.", text)
        if j:
            for k_src, k_dst, fn in [("guests", "guests", int), ("days", "days", int), ("city", "city", str),
                                     ("event_type", "event_type", str), ("diet", "diet", str)]:
                if k_src in j and k_dst not in f:
                    try:
                        f[k_dst] = fn(j[k_src])
                        ev[k_dst] = "llm"
                    except Exception:
                        pass
            if "budget_rupees" in j and "budget_paise" not in f:
                try:
                    f["budget_paise"] = to_paise(int(j["budget_rupees"]))
                    ev["budget_paise"] = "llm"
                except Exception:
                    pass

    # defaults inferred from context (recorded as assumptions)
    if "culture" not in f and "city" in f:
        region = geo.city_info(f["city"])[1]
        c = geo.REGION_CULTURE.get(region)
        if c and f.get("event_type", "wedding") == "wedding":
            f["culture"] = c
            assumptions.append(f"Culture not stated — using the regional default template ({c.replace('_', ' ')}). Change it in Ideas.")
    if f.get("event_type") == "wedding" and "days" not in f:
        assumptions.append("Number of days not stated — assuming a single-day wedding.")
    if "diet" not in f:
        assumptions.append("Diet not stated — assuming a mixed (veg + non-veg) menu.")

    missing = [k for k in REQUIRED if k not in f]
    questions = []
    qmap = {
        "event_type": "What kind of event is this — wedding, birthday, or a community event?",
        "guests": "Roughly how many guests do you expect?",
        "budget_paise": "What is your total budget (for example ₹5 lakh)?",
        "date": "Which date or month are you planning for?",
        "city": "Which city will the event be in?",
    }
    for k in missing:
        questions.append({"field": k, "question": qmap[k], "required": True})
    if f.get("date_assumed"):
        questions.append({"field": "date", "question": "Is the assumed date OK, or do you have an exact date?", "required": False})
    if "outdoor" not in f:
        questions.append({"field": "outdoor", "question": "Do you prefer an indoor hall or an outdoor/lawn venue?", "required": False})
    if not f.get("priorities"):
        questions.append({"field": "priorities", "question": "What matters most — food, decor, photography, music or the venue?", "required": False})
    if f.get("event_type") == "wedding" and "days" not in f:
        questions.append({"field": "days", "question": "How many days of functions (e.g. mehendi, sangeet, ceremony, reception)?", "required": False})

    return {"fields": f, "evidence": ev, "missing": missing, "questions": questions, "assumptions": assumptions,
            "llm_used": llm.available()}


def build_spec(fields: dict, today: dt.date | None = None) -> EventSpec:
    """Validate partial fields into a complete EventSpec, filling safe defaults."""
    today = today or dt.date.today()
    f = dict(fields)
    f.setdefault("event_type", "wedding")
    if not f.get("date"):
        f["date"] = (today + dt.timedelta(days=120)).isoformat()
        f["date_assumed"] = True
    if isinstance(f.get("date"), str):
        f["date"] = dt.date.fromisoformat(f["date"])
    if "guests" not in f:
        f["guests"] = {"wedding": 300, "birthday": 60, "community": 400}[f["event_type"]]
    if "budget_paise" not in f:
        per_head = {"wedding": 3500, "birthday": 1800, "community": 450}[f["event_type"]]
        f["budget_paise"] = to_paise(per_head * f["guests"])
    f.setdefault("title", {"wedding": "Wedding", "birthday": "Birthday celebration", "community": "Community event"}[f["event_type"]])
    return EventSpec(**f)
