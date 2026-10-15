"""In-memory per-user sliding-window rate limit (single API process; SPEC §16)."""

import threading
import time
from collections import defaultdict, deque
from collections.abc import Callable

from app.core.errors import ApiError
from app.schemas.generated import ErrorCode

WINDOW_S = 60.0


class RateLimiter:
    def __init__(self, per_minute: int, clock: Callable[[], float] = time.monotonic) -> None:
        self.per_minute = per_minute
        self._clock = clock
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        """Count one call for `key`; RATE_LIMITED (429) once over the limit."""
        now = self._clock()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] >= WINDOW_S:
                hits.popleft()
            if len(hits) >= self.per_minute:
                retry = max(1, round(WINDOW_S - (now - hits[0])))
                raise ApiError(
                    ErrorCode.RATE_LIMITED,
                    f"At most {self.per_minute} per minute; try again in {retry} s",
                    {"retryAfterS": retry},
                )
            hits.append(now)
