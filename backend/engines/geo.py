"""City knowledge base: price tier, weather region. Heuristic planning data, not live data."""
from __future__ import annotations

# name -> (tier, region)
CITIES = {
    "Bengaluru": (1, "karnataka"), "Mysuru": (2, "karnataka"), "Mangaluru": (2, "coastal_karnataka"),
    "Hubballi": (3, "karnataka"), "Mumbai": (1, "mumbai"), "Pune": (1, "pune"), "Nagpur": (2, "central"),
    "Delhi": (1, "north"), "Gurugram": (1, "north"), "Noida": (1, "north"), "Lucknow": (2, "north"),
    "Jaipur": (2, "rajasthan"), "Udaipur": (2, "rajasthan"), "Chandigarh": (2, "north"),
    "Hyderabad": (1, "hyderabad"), "Visakhapatnam": (2, "andhra_coast"), "Vijayawada": (2, "andhra_coast"),
    "Chennai": (1, "chennai"), "Coimbatore": (2, "tamil_interior"), "Madurai": (2, "tamil_interior"),
    "Kochi": (2, "kerala"), "Thiruvananthapuram": (2, "kerala"), "Kozhikode": (2, "kerala"),
    "Kolkata": (1, "kolkata"), "Bhubaneswar": (2, "kolkata"), "Ahmedabad": (1, "gujarat"),
    "Surat": (2, "gujarat"), "Indore": (2, "central"), "Bhopal": (2, "central"), "Goa": (2, "mumbai"),
}
ALIASES = {
    "bangalore": "Bengaluru", "bengaluru": "Bengaluru", "mysore": "Mysuru", "mysuru": "Mysuru",
    "bombay": "Mumbai", "madras": "Chennai", "calcutta": "Kolkata", "cochin": "Kochi",
    "trivandrum": "Thiruvananthapuram", "gurgaon": "Gurugram", "vizag": "Visakhapatnam",
    "new delhi": "Delhi", "mangalore": "Mangaluru", "hubli": "Hubballi", "banaras": "Varanasi",
}
for _c in CITIES:
    ALIASES.setdefault(_c.lower(), _c)

# months (1-12) with elevated weather risk, per region
WEATHER = {
    "karnataka": {"rain": [6, 7, 8, 9, 10], "heat": [3, 4, 5], "fog": []},
    "coastal_karnataka": {"rain": [6, 7, 8, 9], "heat": [3, 4, 5], "fog": []},
    "mumbai": {"rain": [6, 7, 8, 9], "heat": [4, 5], "fog": []},
    "pune": {"rain": [6, 7, 8, 9], "heat": [4, 5], "fog": []},
    "central": {"rain": [6, 7, 8, 9], "heat": [4, 5, 6], "fog": [12, 1]},
    "north": {"rain": [7, 8, 9], "heat": [4, 5, 6], "fog": [12, 1]},
    "rajasthan": {"rain": [7, 8, 9], "heat": [4, 5, 6], "fog": []},
    "hyderabad": {"rain": [6, 7, 8, 9, 10], "heat": [3, 4, 5], "fog": []},
    "andhra_coast": {"rain": [6, 7, 8, 9, 10, 11], "heat": [4, 5], "fog": []},
    "chennai": {"rain": [10, 11, 12], "heat": [4, 5, 6], "fog": []},
    "tamil_interior": {"rain": [10, 11], "heat": [4, 5], "fog": []},
    "kerala": {"rain": [6, 7, 8, 10, 11], "heat": [3, 4], "fog": []},
    "kolkata": {"rain": [6, 7, 8, 9], "heat": [4, 5], "fog": [12, 1]},
    "gujarat": {"rain": [7, 8, 9], "heat": [4, 5, 6], "fog": []},
}
REGION_CULTURE = {
    "karnataka": "kannada", "coastal_karnataka": "kannada", "hyderabad": "telugu", "andhra_coast": "telugu",
    "chennai": "tamil", "tamil_interior": "tamil", "kerala": "malayali", "north": "north_indian",
    "rajasthan": "north_indian",
}
TIER_MULT = {1: 1.0, 2: 0.8, 3: 0.65}


def canon_city(name: str | None) -> str | None:
    if not name:
        return None
    return ALIASES.get(name.strip().lower())


def city_info(name: str) -> tuple[int, str]:
    c = canon_city(name) or name
    return CITIES.get(c, (3, "north"))
