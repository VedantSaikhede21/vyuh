"""LLM debrief with template fallback (SPEC §13.1, decision 131). The LLM is mocked."""

import json
from collections.abc import Callable
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Debrief, Scenario, User
from app.services.ai.llm import LlmClient
from tests.conftest import assert_error, fixture_log, make_settings
from tests.test_sessions import post_batch

Headers = Callable[[User], dict[str, str]]


def _completed(
    client: TestClient,
    start: Callable[..., str],
    user: User,
    headers: dict[str, str],
    scen: Scenario,
) -> str:
    sid = start(user, scen, "ASSESSMENT")
    log = fixture_log("s06_roe_attempts")
    assert post_batch(client, sid, headers, 0, log).status_code == 200
    r = client.post(
        f"/api/v1/sessions/{sid}/complete",
        json={"endTMs": log[-1]["tMs"], "clientMeta": {}},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    return sid


class FakeTransport:
    """Records prompts; answers with queued replies (str = content, Exception = raise)."""

    def __init__(self, *replies: str | Exception) -> None:
        self.replies = list(replies)
        self.calls: list[dict[str, Any]] = []

    def __call__(self, url: str, headers: dict[str, str], body: bytes, timeout_s: float) -> str:
        self.calls.append({"url": url, "body": json.loads(body), "timeout": timeout_s})
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return json.dumps({"choices": [{"message": {"content": reply}}]})


def _llm_on(app: FastAPI, transport: FakeTransport) -> None:
    app.state.llm = LlmClient(
        make_settings(llm_enabled=True, openrouter_api_key="k", llm_model="test/model"),
        transport,
    )


def _user_prompt(call: dict[str, Any]) -> dict[str, Any]:
    return json.loads(call["body"]["messages"][1]["content"])


@pytest.fixture
def session_id(
    client: TestClient,
    scenarios: dict[str, Scenario],
    make_user: Callable[..., User],
    auth_header: Headers,
    start_session: Callable[..., str],
) -> tuple[str, User]:
    user = make_user(email="rifleman@test")
    return _completed(client, start_session, user, auth_header(user), scenarios["S06"]), user


def test_template_when_llm_disabled(
    client: TestClient, db: Session, auth_header: Headers, session_id: tuple[str, User]
) -> None:
    sid, user = session_id
    r = client.post(f"/api/v1/aar/sessions/{sid}/debrief", headers=auth_header(user))
    assert r.status_code == 200, r.text
    body = r.json()
    assert (body["source"], body["model"], body["fallbackReason"]) == (
        "TEMPLATE",
        "template",
        "LLM_DISABLED",
    )
    content = body["content"]
    assert content["summary"].startswith("Score ")
    assert "S06" in content["summary"]
    # Mistakes come from the scoring feedback, each with a sim time that links to the replay.
    assert content["mistakes"], content
    assert all(isinstance(m["tMs"], int) for m in content["mistakes"])
    assert any("ROE" in m["what"] or "against" in m["what"] for m in content["mistakes"])
    assert content["drill"]
    # Cached: the second call returns the same row.
    again = client.post(f"/api/v1/aar/sessions/{sid}/debrief", headers=auth_header(user)).json()
    assert again["createdAt"] == body["createdAt"]
    assert db.get(Debrief, __import__("uuid").UUID(sid)) is not None


def test_llm_debrief_validated_and_cached(
    app: FastAPI,
    client: TestClient,
    auth_header: Headers,
    make_user: Callable[..., User],
    staff_for: Callable[..., User],
    session_id: tuple[str, User],
) -> None:
    sid, user = session_id
    # First find a real time from the input, as the LLM would.
    probe = FakeTransport("not json")
    _llm_on(app, probe)
    probe.replies.append("still not json")
    client.post(f"/api/v1/aar/sessions/{sid}/debrief", headers=auth_header(user))
    data = _user_prompt(probe.calls[0])
    t = data["penalties"][0]["tMs"]

    # Input holds no personal data and no raw log.
    text = json.dumps(data)
    assert "rifleman" not in text and "@test" not in text
    assert len(data["events"]) <= 10
    assert set(data) == {
        "scenario",
        "mode",
        "score",
        "penalties",
        "contacts",
        "nonThreatsHandledWell",
        "nonThreatsEngaged",
        "issues",
        "events",
    }
    # Compact (decision 139): repeated penalties merged, no indentation.
    roe = [p for p in data["penalties"] if p["code"] == "ROE_VIOLATION_ATTEMPT"]
    assert len(roe) == 1 and len(roe[0]["tracks"]) > 1
    assert len(probe.calls[0]["body"]["messages"][1]["content"]) < 2500

    reply = {
        "summary": "Two of three threats engaged in time.",
        "strengths": ["Fast detection."],
        "mistakes": [
            {
                "tMs": t,
                "what": "Intercept tried against the ROE.",
                "whyItMatters": "A breach.",
                "doInstead": "Check the ROE chip.",
            }
        ],
        "drill": "Run S06 in Practice.",
    }
    good = FakeTransport(json.dumps(reply))
    _llm_on(app, good)
    # The cached template (LLM was failing → INVALID_OUTPUT) is not transient: kept.
    kept = client.post(f"/api/v1/aar/sessions/{sid}/debrief", headers=auth_header(user)).json()
    assert kept["source"] == "TEMPLATE"
    assert kept["fallbackReason"] == "INVALID_OUTPUT"
    assert good.calls == []

    # Decision 151: staff can discard it and build it again; the trainee cannot.
    regen = f"/api/v1/aar/sessions/{sid}/debrief/regenerate"
    assert_error(client.post(regen, headers=auth_header(user)), 403, "FORBIDDEN")
    staff = staff_for(user)
    fresh = client.post(regen, headers=auth_header(staff))
    assert fresh.status_code == 200, fresh.text
    assert fresh.json()["source"] == "LLM"
    assert len(good.calls) == 1
    # The trainee now sees the regenerated debrief from the cache.
    seen = client.post(f"/api/v1/aar/sessions/{sid}/debrief", headers=auth_header(user)).json()
    assert seen["source"] == "LLM" and seen["createdAt"] == fresh.json()["createdAt"]


def test_llm_answer_used_and_timeout_retried(
    app: FastAPI, client: TestClient, auth_header: Headers, session_id: tuple[str, User]
) -> None:
    sid, user = session_id
    # Cache a template while the LLM is off, then turn it on: the template is replaced.
    client.post(f"/api/v1/aar/sessions/{sid}/debrief", headers=auth_header(user))
    holder: dict[str, Any] = {}

    class Echo(FakeTransport):
        def __call__(self, url: str, headers: dict[str, str], body: bytes, t: float) -> str:
            if not self.calls:
                self.calls.append({"body": json.loads(body)})
                raise TimeoutError("slow")
            self.calls.append({"body": json.loads(body)})
            data = _user_prompt(self.calls[-1])
            holder["data"] = data
            mistake = {
                "tMs": data["penalties"][-1]["tMs"],
                "what": "Late intercept.",
                "whyItMatters": "It reached the town.",
                "doInstead": "Engage at the first IDENTIFY.",
            }
            content = {
                "summary": "Mixed run.",
                "strengths": [],
                "mistakes": [mistake],
                "drill": "Run S15.",
            }
            return json.dumps({"choices": [{"message": {"content": json.dumps(content)}}]})

    echo = Echo()
    _llm_on(app, echo)
    body = client.post(f"/api/v1/aar/sessions/{sid}/debrief", headers=auth_header(user)).json()
    assert len(echo.calls) == 2  # one timeout, one retry
    assert echo.calls[0]["body"]["model"] == "test/model"
    assert body["source"] == "LLM"
    assert body["model"] == "test/model"
    assert "fallbackReason" not in body
    assert body["content"]["mistakes"][0]["tMs"] == holder["data"]["penalties"][-1]["tMs"]


def test_invented_time_falls_back(
    app: FastAPI, client: TestClient, auth_header: Headers, session_id: tuple[str, User]
) -> None:
    sid, user = session_id
    bad = {
        "summary": "x",
        "strengths": [],
        "mistakes": [{"tMs": 9_999_999, "what": "a", "whyItMatters": "b", "doInstead": "c"}],
        "drill": "d",
    }
    t = FakeTransport(json.dumps(bad), json.dumps(bad))
    _llm_on(app, t)
    body = client.post(f"/api/v1/aar/sessions/{sid}/debrief", headers=auth_header(user)).json()
    assert len(t.calls) == 2
    assert (body["source"], body["fallbackReason"]) == ("TEMPLATE", "INVALID_OUTPUT")


def test_debrief_rules(
    client: TestClient,
    scenarios: dict[str, Scenario],
    make_user: Callable[..., User],
    staff_for: Callable[..., User],
    auth_header: Headers,
    start_session: Callable[..., str],
    session_id: tuple[str, User],
) -> None:
    sid, owner = session_id
    other = make_user(email="other@test")
    assert_error(
        client.post(f"/api/v1/aar/sessions/{sid}/debrief", headers=auth_header(other)),
        403,
        "FORBIDDEN",
    )
    staff = staff_for(owner)
    r = client.post(f"/api/v1/aar/sessions/{sid}/debrief", headers=auth_header(staff))
    assert r.status_code == 200
    active = start_session(other, scenarios["S01"])
    assert_error(
        client.post(f"/api/v1/aar/sessions/{active}/debrief", headers=auth_header(other)),
        409,
        "SESSION_NOT_ACTIVE",
    )


def test_ai_status(
    client: TestClient, make_user: Callable[..., User], auth_header: Headers
) -> None:
    user = make_user()
    r = client.get("/api/v1/ai/status", headers=auth_header(user))
    assert r.json() == {"llmEnabled": False, "model": None}


def test_request_caps_tokens_and_client_errors_are_not_retried() -> None:
    import urllib.error

    calls: list[dict[str, Any]] = []

    def transport(url: str, headers: dict[str, str], body: bytes, t: float) -> str:
        calls.append(json.loads(body))
        raise urllib.error.HTTPError(url, 402, "credits", {}, None)  # type: ignore[arg-type]

    llm = LlmClient(make_settings(llm_enabled=True, openrouter_api_key="k"), transport)
    with pytest.raises(Exception) as err:
        llm.complete_json("u", "s", "x", lambda o: o, max_tokens=321)
    assert getattr(err.value, "reason", None) == "ERROR"
    assert len(calls) == 1  # a 402 cannot succeed on retry
    assert calls[0]["max_tokens"] == 321
    assert calls[0]["reasoning"] == {"effort": "low", "exclude": True}
    assert llm.url == "https://openrouter.ai/api/v1/chat/completions"


def test_google_provider_fields_key_and_busy_retry() -> None:
    import urllib.error

    calls: list[tuple[dict[str, str], dict[str, Any]]] = []
    replies: list[Any] = [
        urllib.error.HTTPError("u", 503, "busy", {}, None),  # type: ignore[arg-type]
        json.dumps({"choices": [{"message": {"content": '{"ok": true}'}}]}),
    ]

    def transport(url: str, headers: dict[str, str], body: bytes, t: float) -> str:
        calls.append((headers, json.loads(body)))
        r = replies.pop(0)
        if isinstance(r, Exception):
            raise r
        return r

    settings = make_settings(
        llm_enabled=True,
        llm_provider="google",
        llm_base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        llm_api_key="g-key",
        openrouter_api_key="old-key",
    )
    llm = LlmClient(settings, transport)
    paused: list[float] = []
    llm.pause = paused.append
    assert llm.complete_json("u", "s", "x", lambda o: o) == {"ok": True}
    assert paused == [1.0]  # a 503 is retried once, after a pause
    headers, body = calls[0]
    assert headers["Authorization"] == "Bearer g-key"  # LLM_API_KEY wins over the old name
    assert "X-Title" not in headers
    assert body["reasoning_effort"] == "low" and "reasoning" not in body
    assert llm.url == "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    # The old variable alone still works.
    assert make_settings(openrouter_api_key="old-key").llm_key == "old-key"


def test_test_header_forces_the_template_even_with_the_llm_on(
    app: FastAPI, client: TestClient, auth_header: Headers, session_id: tuple[str, User]
) -> None:
    """e2e hook (decision 148): the header skips the LLM entirely and the cached template
    is kept on later forced calls, so test runs never spend or depend on the LLM."""
    sid, user = session_id
    transport = FakeTransport()
    _llm_on(app, transport)
    forced = {**auth_header(user), "X-Vyuh-Test-Debrief": "template"}
    body = client.post(f"/api/v1/aar/sessions/{sid}/debrief", headers=forced).json()
    assert (body["source"], body["fallbackReason"]) == ("TEMPLATE", "LLM_DISABLED")
    again = client.post(f"/api/v1/aar/sessions/{sid}/debrief", headers=forced).json()
    assert again["createdAt"] == body["createdAt"]
    assert transport.calls == []


def test_test_header_is_ignored_where_dev_login_is_off(
    app: FastAPI,
    client: TestClient,
    auth_header: Headers,
    session_id: tuple[str, User],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.core.config import Settings

    monkeypatch.setattr(Settings, "dev_login_enabled", property(lambda _self: False))
    sid, user = session_id
    reply = {"summary": "Fine.", "strengths": [], "mistakes": [], "drill": "Run S06 again."}
    transport = FakeTransport(json.dumps(reply))
    _llm_on(app, transport)
    forced = {**auth_header(user), "X-Vyuh-Test-Debrief": "template"}
    body = client.post(f"/api/v1/aar/sessions/{sid}/debrief", headers=forced).json()
    assert body["source"] == "LLM"
    assert len(transport.calls) == 1


def _template_input(
    issues: list[dict[str, Any]], penalties: list[dict[str, Any]]
) -> dict[str, Any]:
    comps = {"detection": 10, "classification": 10, "decision": 20, "report": 0, "efficiency": 0}
    return {
        "scenario": {"code": "S06", "name": "Crowded Skies", "difficulty": 3},
        "mode": "ASSESSMENT",
        "score": {
            "total": 40.0,
            "components": comps,
            "componentMax": {**comps, "detection": 20, "classification": 20, "decision": 40},
            "penalties": penalties,
        },
        "contacts": [
            {"contactId": f"c0{n}", "trackIds": [f"T00{n}"], "isThreat": n < 5} for n in range(1, 8)
        ],
        "killChainIssues": issues,
        "keyEvents": [],
    }


def test_template_groups_a_stopped_chain_and_repeated_penalties() -> None:
    """Audit P1-12: one line for a chain stopped at one stage, one per repeated code."""
    from app.services.ai.debrief import template_debrief

    stopped = [
        {
            "contactId": "c06",
            "trackId": "T006",
            "isThreat": True,
            "stage": stage,
            "status": "MISSED",
            "tMs": 18_000,
            "feedback": f"{stage.lower()} missed",
        }
        for stage in ("IDENTIFY", "DECIDE", "RESPOND", "ASSESS")
    ]
    roe = [
        {
            "code": "ROE_VIOLATION_ATTEMPT",
            "points": -5,
            "tMs": 94_000 + n * 1000,
            "contactId": f"c0{n}",
            "feedback": "Engagement attempted against ROE",
        }
        for n in (1, 2, 3)
    ]
    content = template_debrief(_template_input(stopped, roe))
    whats = [m.what for m in content.mistakes]
    assert sum("T006" in w for w in whats) == 1, whats
    assert any(w.startswith("T006 STOPPED AT IDENTIFY") for w in whats), whats
    roe_lines = [w for w in whats if "against ROE" in w]
    assert roe_lines == ["Engagement attempted against ROE. Also T002, T003."], whats
    roe_line = next(m for m in content.mistakes if "against ROE" in m.what)
    assert roe_line.t_ms == 94_000 + 1000
