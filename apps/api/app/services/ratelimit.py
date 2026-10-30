"""Rate limits per key (SPEC §16): in memory for tests and the offline build, or in
Postgres, so limits and the LLM budget survive restarts and span processes (S4)."""

import threading
import time
from collections import defaultdict, deque
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, sessionmaker

from app.core.errors import ApiError
from app.models.ops import LlmUsage, RateHit
from app.schemas.generated import ErrorCode

WINDOW_S = 60.0
BUCKET_S = 10


class PostgresHits:
    """Fixed 10 s buckets: one upsert plus a sum per check, no new service."""

    def __init__(self, factory: sessionmaker[Session]) -> None:
        self.factory = factory

    def hit(self, key: str, window_s: float) -> int:
        """Count one call; return the calls in the window, this one included."""
        now = datetime.now(UTC)
        bucket = now.replace(microsecond=0) - timedelta(seconds=now.second % BUCKET_S)
        since = now - timedelta(seconds=window_s)
        with self.factory() as db:
            stmt = insert(RateHit).values(key=key, bucket_start=bucket, count=1)
            db.execute(
                stmt.on_conflict_do_update(
                    index_elements=[RateHit.key, RateHit.bucket_start],
                    set_={"count": RateHit.count + 1},
                )
            )
            db.commit()
            total = db.scalar(
                select(func.coalesce(func.sum(RateHit.count), 0)).where(
                    RateHit.key == key, RateHit.bucket_start >= since
                )
            )
        return int(total or 0)


class LlmBudget:
    """Tokens per UTC day. 0 means no budget. Over budget, callers use the template."""

    def __init__(self, factory: sessionmaker[Session], daily_tokens: int) -> None:
        self.factory = factory
        self.daily_tokens = daily_tokens

    def exceeded(self) -> bool:
        if self.daily_tokens <= 0:
            return False
        with self.factory() as db:
            row = db.get(LlmUsage, datetime.now(UTC).date())
            return row is not None and row.tokens >= self.daily_tokens

    def add(self, tokens: int) -> None:
        stmt = insert(LlmUsage).values(day=datetime.now(UTC).date(), tokens=tokens, requests=1)
        with self.factory() as db:
            db.execute(
                stmt.on_conflict_do_update(
                    index_elements=[LlmUsage.day],
                    set_={"tokens": LlmUsage.tokens + tokens, "requests": LlmUsage.requests + 1},
                )
            )
            db.commit()


class RateLimiter:
    def __init__(
        self,
        per_minute: int,
        clock: Callable[[], float] = time.monotonic,
        *,
        window_s: float = WINDOW_S,
        store: PostgresHits | None = None,
    ) -> None:
        #: Calls allowed per window (the name predates other windows than a minute).
        self.per_minute = per_minute
        self.window_s = window_s
        self._clock = clock
        self.store = store
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        """Count one call for `key`; RATE_LIMITED (429) once over the limit."""
        if self.store is not None:
            if self.store.hit(key, self.window_s) > self.per_minute:
                retry = max(1, round(self.window_s / 2))
                per = "minute" if self.window_s == WINDOW_S else "hour"
                raise ApiError(
                    ErrorCode.RATE_LIMITED,
                    f"At most {self.per_minute} per {per}; try again later",
                    {"retryAfterS": retry},
                )
            return
        now = self._clock()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] >= self.window_s:
                hits.popleft()
            if len(hits) >= self.per_minute:
                retry = max(1, round(self.window_s - (now - hits[0])))
                per = "minute" if self.window_s == WINDOW_S else "hour"
                raise ApiError(
                    ErrorCode.RATE_LIMITED,
                    f"At most {self.per_minute} per {per}; try again in {retry} s",
                    {"retryAfterS": retry},
                )
            hits.append(now)
