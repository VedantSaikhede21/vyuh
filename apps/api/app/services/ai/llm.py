"""LLM client (SPEC §13.4, decision 130): OpenRouter chat completions, JSON output.

Standard library HTTP (`urllib`), so the API needs no new runtime dependency. Every
call: per-user rate limit, `LLM_TIMEOUT_S` per attempt, one retry (on a timeout, a
transport error or output that fails the caller's validation). `LLM_ENABLED=false`
makes no network call at all. Prompts are files in `prompts/`.
"""

import json
import logging
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from pathlib import Path
from typing import Any, TypeVar

from app.core.config import Settings
from app.core.errors import ApiError
from app.services.ratelimit import RateLimiter

logger = logging.getLogger(__name__)

PROMPTS = Path(__file__).resolve().parent / "prompts"
ATTEMPTS = 2  # one retry
RETRY_PAUSE_S = 1.0
DEFAULT_MAX_TOKENS = 1200
#: Reasoning models spend part of max_tokens thinking: ask for little, in each provider's
#: own field (Google rejects OpenRouter's `reasoning` object with HTTP 400; decision 138).
REASONING: dict[str, dict[str, Any]] = {
    "openrouter": {"reasoning": {"effort": "low", "exclude": True}},
    "google": {"reasoning_effort": "low"},
}
#: Client errors a retry cannot fix (bad model id, no credit, …); 408 and 429 are retried.
NO_RETRY_HTTP = frozenset(range(400, 500)) - {408, 429}

T = TypeVar("T")

#: (url, headers, body, timeout_s) -> response body text. Replaced in tests.
Transport = Callable[[str, dict[str, str], bytes, float], str]


class LlmError(Exception):
    """The LLM could not give a usable answer; `reason` is a DebriefFallbackReason value."""

    def __init__(self, reason: str, message: str) -> None:
        super().__init__(message)
        self.reason = reason


def prompt(name: str) -> str:
    return (PROMPTS / name).read_text(encoding="utf-8")


def urllib_transport(url: str, headers: dict[str, str], body: bytes, timeout_s: float) -> str:
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")  # noqa: S310
    with urllib.request.urlopen(req, timeout=timeout_s) as resp:  # noqa: S310 - URL from settings
        return resp.read().decode("utf-8")


class LlmClient:
    def __init__(self, settings: Settings, transport: Transport | None = None) -> None:
        self.settings = settings
        self.transport: Transport = transport or urllib_transport
        self.limiter = RateLimiter(settings.llm_rate_limit_per_min)
        self.pause: Callable[[float], None] = time.sleep

    @property
    def enabled(self) -> bool:
        return self.settings.llm_enabled

    @property
    def model(self) -> str:
        return self.settings.llm_model

    @property
    def url(self) -> str:
        return self.settings.llm_base_url.rstrip("/") + "/chat/completions"

    def complete_json(
        self,
        user_key: str,
        system: str,
        user: str,
        parse: Callable[[dict[str, Any]], T],
        max_tokens: int = DEFAULT_MAX_TOKENS,
    ) -> T:
        """Ask for one JSON object and return `parse(obj)`; raise LlmError when no
        attempt gives a valid one. `parse` raises ValueError on invalid output."""
        if not self.enabled:
            raise LlmError("LLM_DISABLED", "LLM features are off (LLM_ENABLED=false)")
        try:
            self.limiter.check(user_key)
        except ApiError as err:
            raise LlmError("RATE_LIMITED", err.message) from err
        body = json.dumps(
            {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.2,
                # Without it the provider reserves the model's maximum output (credit check).
                "max_tokens": max_tokens,
                **REASONING.get(self.settings.llm_provider.lower(), {}),
            }
        ).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.settings.llm_key}",
        }
        if self.settings.llm_provider.lower() == "openrouter":
            headers["X-Title"] = "VYUH trainer"
        reason, message = "ERROR", "no attempt made"
        for attempt in range(1, ATTEMPTS + 1):
            try:
                raw = self.transport(self.url, headers, body, self.settings.llm_timeout_s)
            except TimeoutError as err:
                reason, message = "TIMEOUT", f"LLM timed out after {self.settings.llm_timeout_s} s"
                logger.warning("LLM attempt %d: %s (%s)", attempt, message, err)
                continue
            except urllib.error.HTTPError as err:
                detail = err.read().decode("utf-8", "replace")[:300]
                reason, message = "ERROR", f"LLM request failed: HTTP {err.code} {detail}"
                logger.warning("LLM attempt %d: %s", attempt, message)
                if err.code in NO_RETRY_HTTP:
                    break
                if attempt < ATTEMPTS:
                    self.pause(RETRY_PAUSE_S)  # busy or rate-limited: give it a moment
                continue
            except (urllib.error.URLError, OSError) as err:
                if isinstance(getattr(err, "reason", None), TimeoutError):
                    reason, message = "TIMEOUT", "LLM timed out"
                else:
                    reason, message = "ERROR", f"LLM request failed: {err}"
                logger.warning("LLM attempt %d: %s", attempt, message)
                continue
            try:
                return parse(_content_json(raw))
            except (ValueError, KeyError, TypeError) as err:
                reason, message = "INVALID_OUTPUT", f"LLM output rejected: {err}"
                logger.warning("LLM attempt %d: %s", attempt, message)
        raise LlmError(reason, message)


def _content_json(raw: str) -> dict[str, Any]:
    """The JSON object in an OpenAI-style chat completion (code fences tolerated)."""
    content = json.loads(raw)["choices"][0]["message"]["content"]
    if not isinstance(content, str):
        raise ValueError("no text content")
    text = content.strip()
    if text.startswith("```"):
        text = text.strip("`").removeprefix("json").strip()
    obj = json.loads(text)
    if not isinstance(obj, dict):
        raise ValueError("not a JSON object")
    return obj
