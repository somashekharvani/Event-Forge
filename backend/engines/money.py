"""Money helpers. All amounts are integer paise (1 rupee = 100 paise). Never floats."""
from __future__ import annotations


def to_paise(rupees) -> int:
    return int(round(float(rupees) * 100))


def fmt_inr(p: int, paise: bool = False) -> str:
    """Indian digit grouping: 1500000 rupees -> ₹15,00,000"""
    neg = p < 0
    p = abs(int(p))
    r, ps = divmod(p, 100)
    s = str(r)
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        s = ",".join(parts + [tail])
    out = "₹" + s
    if paise or ps:
        out += f".{ps:02d}"
    return ("-" if neg else "") + out


def fmt_short(p: int) -> str:
    r = abs(p) / 100
    sign = "-" if p < 0 else ""
    if r >= 1e7:
        return f"{sign}₹{r / 1e7:.2f}Cr"
    if r >= 1e5:
        return f"{sign}₹{r / 1e5:.2f}L"
    if r >= 1e3:
        return f"{sign}₹{r / 1e3:.1f}k"
    return f"{sign}₹{r:.0f}"


def allocate(total: int, weights: dict[str, float]) -> dict[str, int]:
    """Largest-remainder allocation. Result sums to exactly `total`."""
    s = sum(weights.values())
    if s <= 0:
        raise ValueError("weights must sum to > 0")
    raw = {k: total * w / s for k, w in weights.items()}
    base = {k: int(v) for k, v in raw.items()}
    left = total - sum(base.values())
    order = sorted(raw, key=lambda k: raw[k] - base[k], reverse=True)
    for k in order[:left]:
        base[k] += 1
    return base
