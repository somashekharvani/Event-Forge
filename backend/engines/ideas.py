"""Creative layer: themes, menus, entertainment, cultural program templates, preference memory.

Ideas are curated templates conditioned on the Event Spec (not free generation) so they are consistent and can be
tested; if an LLM key is configured it can add bespoke suggestions on top (see llm.py). Cultural templates are
starting points — families and priests vary, always confirm with them.
"""
from __future__ import annotations

import re
import uuid

from . import llm
from .spec import EventSpec

THEMES = [
    {"id": "royal_gold", "name": "Royal White & Gold", "palette": ["#f7f1e3", "#c9a227", "#8c6d1f", "#ffffff"], "events": ["wedding", "birthday"],
     "cultures": ["generic", "north_indian", "christian", "muslim"], "level": 3, "tags": ["elegant", "indoor", "formal"],
     "decor": ["Draped white fabric ceiling with warm fairy lights", "Gold-trimmed stage backdrop with fresh white blooms",
               "Candle-lit pathway to the entrance", "Brass lamps & gold charger plates on dining tables"]},
    {"id": "temple_red", "name": "Temple Traditional — Kanchipuram red & gold", "palette": ["#9b1c1f", "#d4a017", "#f6e7c1", "#2f5d3a"],
     "events": ["wedding"], "cultures": ["kannada", "telugu", "tamil", "malayali"], "level": 2, "tags": ["traditional", "floral", "south"],
     "decor": ["Banana-stem & mango-leaf entrance arch", "Jasmine & marigold mandap with brass kalash", "Rangoli at the entrance, brass lamps",
               "Silk-border drapes in maroon and gold"]},
    {"id": "marigold_heritage", "name": "Marigold & Mango-Leaf Heritage", "palette": ["#f28c28", "#f6c026", "#2e7d32", "#fff3d6"],
     "events": ["wedding", "community", "birthday"], "cultures": ["generic", "kannada", "telugu", "tamil", "north_indian", "malayali"],
     "level": 1, "tags": ["eco", "floral", "traditional", "outdoor_ok"],
     "decor": ["Marigold strings across the ceiling (biodegradable)", "Clay diyas and brass urli with floating flowers",
               "Banana-leaf & coconut-frond accents", "Hand-painted warli or rangoli backdrops"]},
    {"id": "boho_garden", "name": "Boho Garden Pastels", "palette": ["#f4d6cc", "#cfe3d0", "#f7ecd0", "#b98d7a"], "events": ["wedding", "birthday"],
     "cultures": ["generic", "christian", "north_indian"], "level": 2, "tags": ["outdoor_ok", "pastel", "floral", "photogenic"],
     "decor": ["Pampas & dried-flower arches", "Low seating with jute rugs & cushions", "Hanging terrariums and lantern clusters",
               "Pastel floral photo wall"]},
    {"id": "rustic_lantern", "name": "Rustic Lantern Evening", "palette": ["#3b2f2f", "#e0a458", "#f5e6c8", "#6b8f71"], "events": ["birthday", "wedding", "community"],
     "cultures": ["generic"], "level": 1, "tags": ["outdoor_ok", "warm", "quiet"],
     "decor": ["Mason-jar lanterns and string lights", "Wooden crates as sideboards", "Hay-bale seating corners", "Chalkboard menu & welcome signs"]},
    {"id": "minimal_sage", "name": "Minimal Sage & Ivory", "palette": ["#e8efe4", "#9db79a", "#f8f5ee", "#5e7a5c"], "events": ["wedding", "birthday"],
     "cultures": ["generic", "christian"], "level": 2, "tags": ["elegant", "minimal", "pastel", "quiet", "eco"],
     "decor": ["Eucalyptus garlands & single-stem table arrangements", "Linen runners, wooden accents", "Soft uplighting, no heavy drapes",
               "Hand-lettered signage"]},
    {"id": "safari", "name": "Jungle Safari", "palette": ["#2e7d32", "#f4c542", "#8d6e63", "#fff8e1"], "events": ["birthday"], "cultures": ["generic"],
     "level": 1, "tags": ["kids", "colorful", "outdoor_ok"],
     "decor": ["Leaf-and-vine balloon garland", "Animal-print table covers", "Treasure-hunt trail with binocular props", "Safari jeep photo corner"]},
    {"id": "space", "name": "Space Explorer", "palette": ["#0d1b4c", "#6a4cff", "#ffd54f", "#e3e8ff"], "events": ["birthday"], "cultures": ["generic"],
     "level": 2, "tags": ["kids", "indoor", "colorful"],
     "decor": ["Star-field ceiling with LED stars", "Planet balloons in graded sizes", "Rocket-launch cake table", "Glow-in-the-dark activity corner"]},
    {"id": "unicorn", "name": "Pastel Unicorn & Rainbow", "palette": ["#ffd1e8", "#d9c2ff", "#c9f1ff", "#fff3b0"], "events": ["birthday"], "cultures": ["generic"],
     "level": 1, "tags": ["kids", "pastel", "colorful"],
     "decor": ["Rainbow balloon arch", "Cloud-shaped backdrops", "Unicorn-horn headbands as return gifts", "Cupcake tower with pastel icing"]},
    {"id": "bollywood", "name": "Retro Bollywood Night", "palette": ["#c2185b", "#ffb300", "#1a1a2e", "#ffffff"], "events": ["birthday", "wedding"],
     "cultures": ["generic", "north_indian"], "level": 2, "tags": ["loud", "dance", "colorful", "milestone"],
     "decor": ["Vintage film-poster cut-outs", "Marquee-letter lights", "Cinema-ticket style invitations", "Dance floor with retro disco lights"]},
    {"id": "eco_utsav", "name": "Eco Utsav (reuse & natural)", "palette": ["#6d4c41", "#8bc34a", "#fbc02d", "#fff8e1"], "events": ["community"], "cultures": ["generic"],
     "level": 1, "tags": ["eco", "outdoor_ok", "traditional", "quiet"],
     "decor": ["Clay & fabric decor instead of plastic", "Recycled-cloth bunting made by residents", "Steel plates & cloth bags — zero single-use",
               "Natural-colour rangoli competition"]},
    {"id": "cultural_fair", "name": "Cultural Heritage Fair", "palette": ["#b71c1c", "#ff8f00", "#1b5e20", "#ffffff"], "events": ["community"], "cultures": ["generic"],
     "level": 2, "tags": ["outdoor_ok", "colorful", "traditional"],
     "decor": ["State-wise food & craft stalls with banners", "Folk-art backdrop painted by local students", "Flag-colour bunting along the ground",
               "Open-air main stage with local art"]},
    {"id": "sufi_evening", "name": "Sufi Evening — Teal & Gold", "palette": ["#0f4c5c", "#e0a96d", "#fdf0d5", "#5f0f40"], "events": ["wedding", "community"],
     "cultures": ["muslim", "generic", "north_indian"], "level": 2, "tags": ["quiet", "elegant", "evening", "acoustic"],
     "decor": ["Moroccan lanterns and low floor seating", "Rose-petal pathways", "Jali-pattern backdrops with warm uplight", "Attar & gajra welcome corner"]},
]

MENUS = {
    "kannada": {"welcome": ["Panaka / jaljeera", "Tender coconut water", "Filter coffee"],
                "starters": ["Maddur vada", "Mini masala dosa", "Kosambari (moong salad)"],
                "mains": ["Bisi bele bath", "Vangi bath", "Gojju-pulao", "Palya (2 veg)", "Saaru & rice", "Mosaru bajji"],
                "desserts": ["Holige / obbattu", "Mysore pak", "Payasa", "Chiroti with badam milk"],
                "counters": ["Live dosa counter", "Filter coffee & tea"], "nonveg": ["Chicken ghee roast", "Mutton pulao"]},
    "telugu": {"welcome": ["Buttermilk", "Rose milk"], "starters": ["Mirchi bajji", "Gongura paneer tikka"],
               "mains": ["Pulihora", "Pappu", "Gutti vankaya curry", "Daddojanam", "Pesarattu counter"],
               "desserts": ["Bobbatlu", "Ariselu", "Kesari"], "counters": ["Live pesarattu", "Chaat"],
               "nonveg": ["Hyderabadi dum biryani", "Chicken fry"]},
    "tamil": {"welcome": ["Jigarthanda", "Neer mor"], "starters": ["Medu vada", "Banana-flower cutlet"],
              "mains": ["Banana-leaf sadya: sambar, rasam, kootu, poriyal", "Lemon & tamarind rice", "Curd rice"],
              "desserts": ["Payasam (2 types)", "Kesari", "Jangiri"], "counters": ["Filter coffee", "Kuzhi paniyaram"],
              "nonveg": ["Chettinad chicken", "Fish fry"]},
    "malayali": {"welcome": ["Tender coconut", "Sambaram"], "starters": ["Banana chips & sharkara varatti", "Parippu vada"],
                 "mains": ["Sadya: avial, olan, parippu, pachadi, thoran", "Rice with sambar & pulissery", "Pappadam"],
                 "desserts": ["Palada payasam", "Ada pradhaman"], "counters": ["Appam & stew (veg)"], "nonveg": ["Kerala fish curry", "Chicken roast"]},
    "north_indian": {"welcome": ["Thandai / mocktails", "Aam panna"], "starters": ["Paneer tikka", "Hara bhara kebab", "Dahi ke kebab"],
                     "mains": ["Dal makhani", "Shahi paneer", "Jeera rice / pulao", "Assorted breads", "Chole bhature counter"],
                     "desserts": ["Gulab jamun", "Jalebi with rabri", "Gajar halwa"], "counters": ["Live chaat", "Pasta/noodles counter"],
                     "nonveg": ["Butter chicken", "Seekh kebab", "Mutton rogan josh"]},
    "muslim": {"welcome": ["Rooh afza sherbet", "Kahwa"], "starters": ["Shami kebab (veg: dahi kebab)", "Haleem (small cups)"],
               "mains": ["Dum biryani (veg / mutton / chicken)", "Mirchi ka salan", "Dal gosht", "Naan & kulcha"],
               "desserts": ["Shahi tukda", "Sheer khurma", "Double ka meetha"], "counters": ["Live kebab grill"],
               "nonveg": ["Mutton biryani", "Chicken korma"]},
    "christian": {"welcome": ["Fruit punch", "Wine / grape juice (optional)"], "starters": ["Cutlets", "Stuffed mushrooms"],
                  "mains": ["Pulao & curry", "Roast (chicken / veg)", "Pasta", "Salads"], "desserts": ["Wedding cake", "Pudding", "Ice cream"],
                  "counters": ["Pasta live counter"], "nonveg": ["Roast chicken", "Fish moilee"]},
    "marwari_jain": {"welcome": ["Badam thandai", "Kesar pista milk", "Fresh mint chaas"],
                     "starters": ["Moong dal kachori", "Paneer charkha tikka (no onion/garlic)", "Dhokla & khandvi"],
                     "mains": ["Dal baati churma (pure ghee)", "Gatte ki sabzi (Jain prep)", "Panchmel dal", "Ker sangri", "Phulka & missi roti", "Pulao with green peas & nuts"],
                     "desserts": ["Ghevar (malai/plain)", "Moong dal halwa", "Rasmalai", "Mawa kachori"],
                     "counters": ["Live phulka counter", "Jain chaat (raw banana base)", "Dry fruit kesar thandai"],
                     "nonveg": []},
    "generic": {"welcome": ["Fresh lime soda", "Fruit punch"], "starters": ["Paneer tikka", "Veg spring rolls", "Cutlets"],
                "mains": ["Dal tadka", "Seasonal veg curry", "Pulao", "Roti / naan", "Raita & salad"],
                "desserts": ["Gulab jamun", "Ice cream", "Seasonal fruit"], "counters": ["Chaat counter"],
                "nonveg": ["Chicken curry", "Fish fry"]},
}
KIDS_MENU = {"welcome": ["Fruit punch", "Mocktails"], "starters": ["Mini pizzas", "Veg nuggets", "French fries"],
             "mains": ["Pasta", "Veg fried rice & manchurian", "Mini burgers"], "desserts": ["Cupcakes", "Ice-cream cart", "Birthday cake"],
             "counters": ["Popcorn & candy floss"], "nonveg": ["Chicken nuggets"]}
COMMUNITY_MENU = {"welcome": ["Chai / filter coffee", "Buttermilk"], "starters": ["Sundal / snack stalls (volunteer-run)"],
                  "mains": ["Khichdi / pulao + sabzi (prasad-style, batch-cooked)", "Curd rice"], "desserts": ["Payasam / halwa"],
                  "counters": ["Water stations with steel glasses"], "nonveg": []}

ENTERTAINMENT = {
    "wedding": ["Live nadaswaram / shehnai at the entrance", "Classical dance performance by family", "Sangeet with family skits & choreographed dances",
                "Acoustic live band for dinner", "Instant-print photo booth", "Antakshari / games for the ladies' sangeet", "Mehendi artists corner"],
    "birthday_kid": ["Magician / puppet show", "Face painting & tattoo corner", "Treasure hunt", "Musical chairs & pass-the-parcel", "Bubble & foam machine",
                     "Craft table (paint a mask)"],
    "birthday_teen": ["DJ & dance floor", "Karaoke", "Escape-room challenge", "Photo wall + Polaroid station"],
    "birthday_adult": ["Acoustic playlist & curated bar-less mocktail menu", "Memory lane slideshow", "Surprise video messages", "Live ghazal / light music"],
    "birthday_milestone": ["Family timeline slideshow", "Toasts by 5 people (2 min each)", "Live ghazal / classical evening", "Photo-book guestbook"],
    "community": ["Open-mic & kids' talent show", "Folk-dance performance by residents", "Rangoli / drawing competition", "Tug-of-war & street games",
                  "Quiz for families", "Food-stall competition"],
}
RETURN_GIFTS = {"wedding": ["Potted tulsi / sapling", "Brass or silver coin", "Handmade sweets box", "Local-craft keepsake"],
                "birthday_kid": ["Colouring book + crayons", "Seed-paper pencils", "Mini puzzle", "Plantable gift"],
                "birthday": ["Handmade candle", "Seed gift", "Chocolate box"], "community": ["Reusable cloth bag", "Seed packets", "Participation certificates"]}

# --- cultural program templates -------------------------------------------------------------------
# (key, name, day, start, end, zone_type, attendee_fraction, loud)
P = tuple
WEDDING_PROGRAMS = {
    "marwari_jain": [
        ("arrive1", "Guest arrival & welcome", 1, "16:00", "17:00", "reg_desk", .5, False),
        ("mehendi", "Mehendi & Mahila Sangeet", 1, "17:00", "20:00", "stage", .7, True),
        ("dinner1", "Traditional Jain dinner (pre-sunset / early evening)", 1, "19:30", "21:30", "dining", .6, False),
        ("bhaat", "Mayra / Bhaat ceremony", 2, "10:00", "12:00", "seating", .7, False),
        ("lunch2", "Jain traditional feast / lunch", 2, "12:30", "14:30", "dining", .6, False),
        ("baraat", "Baraat & Toran reception", 2, "17:30", "18:30", "reg_desk", .8, True),
        ("jaimala", "Jaimala & stage greetings", 2, "18:30", "19:30", "stage", .8, False),
        ("pheras", "Lagna Mandap Pheras & Kanyadan", 2, "20:00", "22:30", "mandap", .6, False),
        ("dinner2", "Wedding dinner", 2, "19:30", "22:00", "dining", .7, False)],
    "kannada": [
        ("arrive1", "Guest arrival & welcome", 1, "16:00", "17:00", "reg_desk", .5, False),
        ("mehendi", "Mehendi & Arishina Shastra (haldi)", 1, "17:00", "19:30", "seating", .5, False),
        ("sangeet", "Sangeet / family performances", 1, "19:30", "22:00", "stage", .8, True),
        ("dinner1", "Dinner (day 1)", 1, "20:30", "22:15", "dining", .6, False),
        ("muhurtham", "Dhare muhurtham & Saptapadi", 2, "09:30", "11:30", "mandap", .8, False),
        ("lunch2", "Wedding lunch", 2, "12:30", "14:45", "dining", .6, False),
        ("reception", "Reception — stage greetings", 2, "18:30", "21:30", "stage", .8, False),
        ("dinner2", "Reception dinner", 2, "19:30", "21:45", "dining", .6, False)],
    "telugu": [
        ("arrive1", "Guest arrival & welcome", 1, "16:00", "17:00", "reg_desk", .5, False),
        ("pelli_kuthuru", "Pellikuthuru & mehendi", 1, "17:00", "19:30", "seating", .5, False),
        ("sangeet", "Sangeet", 1, "19:30", "22:00", "stage", .8, True),
        ("dinner1", "Dinner (day 1)", 1, "20:30", "22:15", "dining", .6, False),
        ("muhurtham", "Kashi yatra, Jeelakarra-bellam & muhurtham", 2, "08:30", "11:30", "mandap", .8, False),
        ("lunch2", "Wedding lunch", 2, "12:30", "14:45", "dining", .6, False),
        ("reception", "Reception", 2, "18:30", "21:30", "stage", .8, False),
        ("dinner2", "Reception dinner", 2, "19:30", "21:45", "dining", .6, False)],
    "tamil": [
        ("arrive1", "Guest arrival & nichayathartham", 1, "16:00", "18:00", "reg_desk", .5, False),
        ("oonjal", "Mehendi & oonjal", 1, "18:00", "19:30", "seating", .5, False),
        ("dinner1", "Dinner (day 1)", 1, "20:00", "22:00", "dining", .6, False),
        ("muhurtham", "Kasi yatra & muhurtham (thali tying)", 2, "07:30", "10:30", "mandap", .8, False),
        ("lunch2", "Banana-leaf wedding lunch", 2, "11:45", "14:00", "dining", .6, False),
        ("reception", "Reception", 2, "18:30", "21:30", "stage", .8, False),
        ("dinner2", "Reception dinner", 2, "19:30", "21:45", "dining", .6, False)],
    "malayali": [
        ("arrive1", "Guest arrival & welcome", 1, "16:00", "17:00", "reg_desk", .5, False),
        ("mehendi", "Mehendi & family evening", 1, "17:00", "20:00", "seating", .5, False),
        ("dinner1", "Dinner (day 1)", 1, "20:00", "22:00", "dining", .6, False),
        ("muhurtham", "Muhurtham & thalikettu", 2, "09:30", "11:00", "mandap", .8, False),
        ("sadya", "Wedding sadya", 2, "12:00", "14:30", "dining", .6, False),
        ("reception", "Reception", 2, "18:30", "21:30", "stage", .8, False)],
    "north_indian": [
        ("arrive1", "Guest arrival & welcome", 1, "16:00", "17:00", "reg_desk", .5, False),
        ("mehendi", "Mehendi", 1, "17:00", "19:00", "seating", .4, False),
        ("sangeet", "Sangeet night", 1, "19:30", "23:00", "dance_floor", .8, True),
        ("dinner1", "Dinner (day 1)", 1, "20:30", "22:30", "dining", .6, False),
        ("haldi", "Haldi", 2, "09:00", "11:00", "seating", .5, False),
        ("baraat", "Baraat arrival & milni", 2, "17:30", "18:30", "reg_desk", .8, True),
        ("jaimala", "Jaimala & stage", 2, "18:30", "19:30", "stage", .8, False),
        ("pheras", "Pheras", 2, "21:00", "23:30", "mandap", .5, False),
        ("dinner2", "Wedding dinner", 2, "19:30", "22:30", "dining", .7, False)],
    "muslim": [
        ("arrive1", "Guest arrival & welcome", 1, "17:00", "18:00", "reg_desk", .5, False),
        ("mehendi", "Mehendi / dholki night", 1, "18:00", "21:00", "stage", .6, True),
        ("dinner1", "Dinner (day 1)", 1, "20:00", "22:00", "dining", .6, False),
        ("nikah", "Nikah", 2, "11:00", "12:30", "mandap", .7, False),
        ("lunch2", "Lunch / dawat", 2, "13:00", "15:00", "dining", .6, False),
        ("walima", "Walima & stage greetings", 2, "19:00", "22:00", "stage", .8, False),
        ("dinner2", "Walima dinner", 2, "20:00", "22:00", "dining", .6, False)],
    "christian": [
        ("arrive1", "Guest arrival", 1, "09:30", "10:30", "reg_desk", .8, False),
        ("service", "Wedding service (church / venue altar)", 1, "10:30", "12:00", "mandap", .8, False),
        ("photos", "Photos & welcome drinks", 1, "12:00", "13:00", "photo_booth", .6, False),
        ("lunch", "Reception lunch", 1, "13:00", "15:00", "dining", .7, False),
        ("cake", "Cake cutting & toasts", 1, "15:00", "16:00", "stage", .8, False),
        ("dance", "Dance floor", 1, "16:00", "18:00", "dance_floor", .5, True)],
    "generic": [
        ("arrive1", "Guest arrival & welcome", 1, "16:00", "17:00", "reg_desk", .5, False),
        ("sangeet", "Mehendi & sangeet", 1, "17:00", "21:30", "stage", .8, True),
        ("dinner1", "Dinner (day 1)", 1, "20:00", "22:00", "dining", .6, False),
        ("ceremony", "Wedding ceremony", 2, "10:00", "12:00", "mandap", .8, False),
        ("lunch2", "Wedding lunch", 2, "12:30", "14:30", "dining", .6, False),
        ("reception", "Reception", 2, "19:00", "22:00", "stage", .8, False),
        ("dinner2", "Reception dinner", 2, "20:00", "22:00", "dining", .6, False)],
}
BIRTHDAY_KID = [("arrive", "Arrival & welcome", 1, "16:00", "16:30", "reg_desk", .8, False),
                ("games", "Games & entertainer", 1, "16:30", "18:00", "activity", .8, True),
                ("cake", "Cake cutting", 1, "18:00", "18:30", "stage", .9, False),
                ("food", "Snacks & dinner", 1, "18:30", "20:00", "dining", .7, False),
                ("gifts", "Return gifts & goodbyes", 1, "20:00", "20:30", "reg_desk", .8, False)]
BIRTHDAY_ADULT = [("arrive", "Welcome drinks & arrivals", 1, "18:30", "19:30", "reg_desk", .8, False),
                  ("toasts", "Speeches, slideshow & cake cutting", 1, "19:30", "20:30", "stage", .9, False),
                  ("dinner", "Dinner", 1, "20:30", "22:00", "dining", .7, False),
                  ("dance", "Music & dance", 1, "22:00", "22:00", "dance_floor", .4, True)]
COMMUNITY_PROGRAMS = [("open", "Registration & opening ceremony", 1, "09:00", "10:00", "reg_desk", .6, False),
                      ("inaug", "Inauguration & welcome address", 1, "10:00", "10:45", "stage", .6, False),
                      ("culture", "Cultural performances", 1, "11:00", "13:00", "stage", .6, True),
                      ("activities", "Games, stalls & competitions", 1, "10:30", "16:00", "activity", .7, False),
                      ("lunch", "Community lunch / prasad", 1, "13:00", "15:00", "dining", .6, False),
                      ("prizes", "Prize distribution & vote of thanks", 1, "16:30", "17:30", "stage", .6, False),
                      ("cleanup", "Clean-up drive", 1, "17:30", "18:30", "activity", .1, False)]

PROGRAM_NAMES_ZONE = {"reg_desk": "Registration / entrance", "seating": "Ceremony seating", "stage": "Stage", "dining": "Dining",
                      "mandap": "Mandap / altar", "dance_floor": "Dance floor", "activity": "Activity area", "photo_booth": "Photo booth"}


def programs_for(spec: EventSpec) -> list[dict]:
    if spec.event_type == "wedding":
        tpl = WEDDING_PROGRAMS.get(spec.culture, WEDDING_PROGRAMS["generic"])
        out = [p for p in tpl if p[2] <= max(spec.days, 1) or spec.days == 1 and p[2] == 1]
        if spec.days == 1:
            # compress to a single day: ceremony + lunch (+ reception evening) from the day-2 block
            day2 = [p for p in tpl if p[2] == 2]
            out = [("arrive1", "Guest arrival & welcome", 1, "08:30", "09:30", "reg_desk", .6, False)] + [
                (k, n, 1, s, e, z, f, l) for (k, n, d, s, e, z, f, l) in day2 if not k.startswith("dinner")]
        elif spec.days >= 3:
            out = list(tpl) + [("day3", "Day-3 family lunch / send-off", 3, "12:00", "14:00", "dining", .5, False)]
    elif spec.event_type == "birthday":
        kid = (spec.celebrant_age or 30) <= 12
        out = BIRTHDAY_KID if kid else BIRTHDAY_ADULT
    else:
        out = COMMUNITY_PROGRAMS
    if "loud music" in spec.avoid:
        out = [(k, n, d, s, e, z, f, False) for (k, n, d, s, e, z, f, l) in out]
    return [{"id": f"p_{k}", "key": k, "name": n, "day": d, "start": s, "end": e, "zone_type": z, "attendee_fraction": f,
             "loud": l, "zone_label": PROGRAM_NAMES_ZONE.get(z, z)} for (k, n, d, s, e, z, f, l) in out]


# ---------------------------------------------------------------------------------------------
def parse_preference(text: str) -> dict:
    """Turn a free-text preference into a structured, reviewable record with explicit effects."""
    t = text.lower()
    pref = {"id": uuid.uuid4().hex[:8], "text": text.strip(), "kind": "prefer", "avoid_tags": [], "prefer_tags": [],
            "spec_changes": {}}
    if re.search(r"\bno\b|\bavoid\b|don'?t|dislike|without|not\b|hate", t):
        pref["kind"] = "avoid"
    if re.search(r"loud|dj|noisy|volume", t) and pref["kind"] == "avoid" or "quiet" in t or "no loud" in t:
        pref["avoid_tags"].append("loud")
        pref["spec_changes"]["avoid_add"] = "loud music"
    if re.search(r"pure\s*veg|vegetarian only|only veg|veg only|no non[\s-]?veg", t):
        pref["spec_changes"]["diet"] = "veg"
    if "jain" in t:
        pref["spec_changes"]["diet"] = "jain"
    if re.search(r"eco|sustainab|plastic[\s-]?free|zero[\s-]?waste|biodegrad", t):
        pref["prefer_tags"].append("eco")
    if re.search(r"pastel|soft colou?rs?", t):
        pref["prefer_tags"].append("pastel")
    if re.search(r"traditional|classic|heritage", t):
        pref["prefer_tags"].append("traditional")
    if re.search(r"modern|minimal", t):
        pref["prefer_tags"] += ["minimal"]
    if re.search(r"outdoor|garden|lawn", t):
        pref["prefer_tags"].append("outdoor_ok")
    if re.search(r"elegant|formal", t):
        pref["prefer_tags"].append("elegant")
    if re.search(r"floral|flowers", t):
        pref["prefer_tags"].append("floral")
    if re.search(r"no alcohol|dry", t):
        pref["spec_changes"]["avoid_add"] = "alcohol"
    if re.search(r"no (?:fire)?crackers", t):
        pref["spec_changes"]["avoid_add"] = "firecrackers"
    if not (pref["avoid_tags"] or pref["prefer_tags"] or pref["spec_changes"]):
        pref["note"] = "Saved as a note — no structured effect detected."
    return pref


def _afford_level(spec: EventSpec, decor_alloc: int) -> int:
    per_head = decor_alloc / max(spec.guests, 1) / 100  # rupees per guest
    return 1 if per_head < 350 else 2 if per_head < 700 else 3


def recommend_themes(spec: EventSpec, decor_alloc: int, prefs: list[dict], liked: list[str], disliked: list[str], n: int = 5) -> list[dict]:
    afford = _afford_level(spec, decor_alloc)
    avoid_tags = {t for p in prefs for t in p.get("avoid_tags", [])}
    prefer_tags = {t for p in prefs for t in p.get("prefer_tags", [])}
    liked_tags = set()
    for th in THEMES:
        if th["id"] in liked:
            liked_tags |= set(th["tags"])
    out = []
    for th in THEMES:
        if spec.event_type not in th["events"]:
            continue
        if th["id"] in disliked:
            continue
        score, why = 40, [f"fits {spec.event_type}"]
        if spec.event_type == "birthday":
            kid = (spec.celebrant_age or 30) <= 12
            if "kids" in th["tags"] and not kid:
                continue
            if kid and "kids" not in th["tags"]:
                score -= 25; why.append("not child-oriented")
            if kid and "kids" in th["tags"]:
                score += 20; why.append("made for kids' parties")
        if spec.culture in th["cultures"] and spec.culture != "generic":
            score += 20; why.append(f"matches {spec.culture.replace('_', ' ')} tradition")
        elif "generic" in th["cultures"]:
            score += 5
        elif spec.event_type == "wedding":
            score -= 20; why.append("tradition mismatch")
        if th["level"] <= afford:
            score += 10; why.append(f"affordable at your decor budget (level {th['level']} ≤ {afford})")
        else:
            score -= 18 * (th["level"] - afford); why.append("likely above your decor allocation")
        if spec.outdoor and "outdoor_ok" in th["tags"]:
            score += 10; why.append("works outdoors")
        if spec.outdoor and "indoor" in th["tags"]:
            score -= 8
        if "loud" in avoid_tags and "loud" in th["tags"]:
            score -= 45; why.append("conflicts with 'no loud music'")
        if "loud music" in spec.avoid and "loud" in th["tags"]:
            score -= 45
        for tg in th["tags"]:
            if tg in prefer_tags:
                score += 12; why.append(f"matches your preference '{tg}'")
            if tg in liked_tags and tg not in prefer_tags:
                score += 4
        if spec.theme and spec.theme == th["id"]:
            score += 8
        out.append({**th, "score": max(0, min(100, score)), "why": why})
    out.sort(key=lambda x: -x["score"])
    return out[:n]


def build_menu(spec: EventSpec, prefs: list[dict]) -> dict:
    kid = spec.event_type == "birthday" and (spec.celebrant_age or 30) <= 12
    base = KIDS_MENU if kid else COMMUNITY_MENU if spec.event_type == "community" else MENUS.get(spec.culture, MENUS["generic"])
    diet = spec.diet
    for p in prefs:
        if p.get("spec_changes", {}).get("diet"):
            diet = p["spec_changes"]["diet"]
    include_nonveg = diet in ("nonveg", "mixed") and base.get("nonveg")
    menu = {k: list(v) for k, v in base.items() if k != "nonveg"}
    if include_nonveg:
        menu["non_veg_options"] = list(base["nonveg"])
    note = {"veg": "Pure vegetarian menu.", "jain": "Jain tradition: strictly excludes root vegetables (potatoes, onions, garlic) and emphasizes separate food preparation.",
            "mostly_veg": "Mostly vegetarian: keep non-veg to one clearly separate counter (optional).",
            "mixed": "Mixed menu: keep veg & non-veg serving lines separate.", "nonveg": "Non-veg friendly; keep a full veg line too."}[diet]
    if diet == "mostly_veg" and base.get("nonveg"):
        menu["optional_nonveg_counter"] = base["nonveg"][:1]
    return {"diet": diet, "menu": menu, "note": note, "culture": spec.culture}


def entertainment_ideas(spec: EventSpec, prefs: list[dict]) -> list[str]:
    if spec.event_type == "wedding":
        ideas = ENTERTAINMENT["wedding"]
    elif spec.event_type == "community":
        ideas = ENTERTAINMENT["community"]
    else:
        a = spec.celebrant_age or 30
        key = "birthday_kid" if a <= 12 else "birthday_teen" if a <= 19 else "birthday_milestone" if a % 10 == 0 and a >= 40 else "birthday_adult"
        ideas = ENTERTAINMENT[key]
    quiet = any("loud" in p.get("avoid_tags", []) for p in prefs) or "loud music" in spec.avoid
    if quiet:
        ideas = [i for i in ideas if not re.search(r"\bDJ\b|dance floor|loud|karaoke", i, re.I)] + ["Acoustic / instrumental live set (low volume)"]
    return ideas


def gift_ideas(spec: EventSpec) -> list[str]:
    if spec.event_type == "birthday":
        return RETURN_GIFTS["birthday_kid" if (spec.celebrant_age or 30) <= 12 else "birthday"]
    return RETURN_GIFTS[spec.event_type]


def invitation_text(spec: EventSpec) -> str:
    d = spec.date.strftime("%A, %d %B %Y") if spec.date else "the date"
    if spec.event_type == "wedding":
        return (f"With joy and the blessings of our families, we invite you to celebrate the wedding on {d} in {spec.city}"
                f"{' (festivities over ' + str(spec.days) + ' days)' if spec.days > 1 else ''}. Your presence will make it complete. "
                "Venue, timings and RSVP details are in the card.")
    if spec.event_type == "birthday":
        who = f"{spec.celebrant_age}th birthday" if spec.celebrant_age else "birthday"
        return f"You're invited to a {who} celebration on {d} in {spec.city}. Come with smiles — food, fun and cake await! Please RSVP so we can plan."
    return (f"Dear neighbours and friends — join our community event on {d} in {spec.city}. Food, games, culture and good company for the whole "
            "family. Volunteers welcome! Please RSVP/volunteer using the link on the poster.")


def build_ideas(spec: EventSpec, decor_alloc: int, memory: dict) -> dict:
    prefs = memory.get("prefs", [])
    liked, disliked = memory.get("liked_themes", []), memory.get("disliked_themes", [])
    themes = recommend_themes(spec, decor_alloc, prefs, liked, disliked)
    out = {"themes": themes, "menu": build_menu(spec, prefs), "entertainment": entertainment_ideas(spec, prefs),
           "return_gifts": gift_ideas(spec), "invitation": invitation_text(spec), "programs": programs_for(spec),
           "memory_applied": [p["text"] for p in prefs], "llm_extra": None}
    if llm.available():
        j = llm.complete_json("You are an Indian event planner. Give 5 short, specific, original ideas as {\"ideas\": [..]}.",
                              f"Event: {spec.model_dump_json()}. Preferences: {[p['text'] for p in prefs]}")
        if j and isinstance(j.get("ideas"), list):
            out["llm_extra"] = [str(x)[:200] for x in j["ideas"][:5]]
    return out
