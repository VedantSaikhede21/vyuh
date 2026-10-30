"""Operational tables: durable rate limits, LLM spend, client error reports."""

import uuid
from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, Identity, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_at


class RateHit(Base):
    """Calls per key in one fixed bucket; a limit sums the buckets in its window."""

    __tablename__ = "rate_hits"

    key: Mapped[str] = mapped_column(String(200), primary_key=True)
    bucket_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    count: Mapped[int] = mapped_column(Integer, server_default="0")


class LlmUsage(Base):
    """Tokens spent per UTC day, checked before each LLM call."""

    __tablename__ = "llm_usage"

    day: Mapped[date] = mapped_column(Date, primary_key=True)
    tokens: Mapped[int] = mapped_column(BigInteger, server_default="0")
    requests: Mapped[int] = mapped_column(Integer, server_default="0")


class ClientError(Base):
    """A browser error report. No PII: the user id only if signed in, no names."""

    __tablename__ = "client_errors"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    route: Mapped[str] = mapped_column(String(200))
    message: Mapped[str] = mapped_column(String(500))
    stack: Mapped[str] = mapped_column(Text, server_default="")
    user_agent: Mapped[str] = mapped_column(String(200), server_default="")
    web_build: Mapped[str] = mapped_column(String(64), server_default="")
    sim_version: Mapped[str] = mapped_column(String(16), server_default="")
    user_id: Mapped[uuid.UUID | None]
    created_at: Mapped[datetime] = created_at()
