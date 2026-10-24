"""One rounding rule for every score the API shows (audit P0-4, decision 149).

Scores are stored with more precision than they are shown (a total of 62.5). The
web used JavaScript `toFixed` (half up) while the debrief used Python `:.0f`
(half to even), so one session read 63 on the result screen and 62 in the
debrief. Now the API rounds every score it sends for display, half up, with
these two functions, and the web never rounds a score again.
"""

from decimal import ROUND_HALF_UP, Decimal


def display_round(value: float, digits: int = 0) -> float:
    """Half-up rounding on the decimal value as written (62.5 → 63, 12.25 → 12.3)."""
    q = Decimal(1).scaleb(-digits)
    return float(Decimal(repr(value)).quantize(q, rounding=ROUND_HALF_UP))


def display_int(value: float) -> int:
    """A total or percentage as a whole number."""
    return int(display_round(value))


def display_opt(value: float | None) -> int | None:
    return None if value is None else display_int(value)
