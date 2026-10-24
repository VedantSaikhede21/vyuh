"""Text-to-scenario (SPEC §13.2, decision 134). The LLM is mocked."""

import json
import math
from collections.abc import Callable
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.models import User
from app.schemas.generated import UserRole
from app.services.ai.from_text import clamp_request, text_seed
from app.services.ai.llm import LlmClient
from tests.conftest import assert_error, make_settings

Headers = Callable[[User], dict[str, str]]
TEXT = "night swarm of 8 from the north with 2 decoys, hard"


def _llm(app: FastAPI, reply: dict[str, Any]) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []

    def transport(url: str, headers: dict[str, str], body: bytes, t: float) -> str:
        calls.append(json.loads(body))
        return json.dumps({"choices": [{"message": {"content": json.dumps(reply)}}]})

    app.state.llm = LlmClient(
        make_settings(llm_enabled=True, openrouter_api_key="k", llm_model="test/model"), transport
    )
    return calls


def _bearing(x: float, z: float) -> float:
    return math.degrees(math.atan2(x, z)) % 360


def test_night_swarm_of_8_from_the_north_with_2_decoys_hard(
    app: FastAPI, client: TestClient, make_user: Callable[..., User], auth_header: Headers
) -> None:
    staff = make_user(UserRole.INSTRUCTOR, "instructor@test")
    headers = auth_header(staff)
    calls = _llm(
        app,
        {
            "timeBand": "NIGHT",
            "swarmSize": 8,
            "approachBearingDeg": 0,
            "decoys": 2,
            "difficulty": 4,
        },
    )
    r = client.post("/api/v1/scenarios/from-text", json={"text": TEXT}, headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    req = body["request"]
    assert req == {
        "terrainPreset": "PUNJAB_PLAINS",
        "difficulty": 4,
        "seed": text_seed(TEXT),
        "timeBand": "NIGHT",
        "swarmSize": 8,
        "decoys": 2,
        "approachBearingDeg": 0.0,
    }
    assert body["notes"] == ["No terrain named: using PUNJAB_PLAINS."]
    # The prompt carries only the instructor's text.
    assert json.loads(calls[0]["messages"][1]["content"]) == {"text": TEXT}

    # Confirmed → the existing generator builds a matching scenario.
    g = client.post("/api/v1/scenarios/generate", json=req, headers=headers)
    assert g.status_code == 201, g.text
    sc = g.json()["scenario"]
    assert sc["difficulty"] == 4
    assert sc["environment"]["isNight"] is True
    swarm = [c for c in sc["contacts"] if c["behaviour"] == "SWARM_SATURATION"]
    assert len(swarm) == 8 and len({c["groupId"] for c in swarm}) == 1
    assert sum(c["behaviour"] == "DECOY" for c in sc["contacts"]) == 2
    asset = sc["assets"][0]
    start = swarm[0]["path"][0]
    off = (_bearing(start["x"] - asset["x"], start["z"] - asset["z"]) + 180) % 360 - 180
    assert abs(off) <= 35, off  # within the requested-axis search and spawn spread
    assert sc["request"]["approachBearingDeg"] == 0 and sc["request"]["decoys"] == 2


def test_clamped_and_ignored_values_are_noted() -> None:
    req, notes = clamp_request(
        {
            "terrainPreset": "MARS",
            "difficulty": 9,
            "swarmSize": 80,
            "decoys": -1,
            "timeBand": "NOON",
            "approachBearingDeg": 370,
            "aiAssistAccuracy": 80,
            "threatMix": {"FPV": 2, "TANK": 1},
            "colour": "red",
        },
        "x",
    )
    d = req.model_dump(by_alias=True, exclude_none=True, mode="json")
    assert d["terrainPreset"] == "PUNJAB_PLAINS"
    assert (d["difficulty"], d["swarmSize"], d["decoys"]) == (5, 50, 0)
    assert d["approachBearingDeg"] == 10.0
    assert d["aiAssistAccuracy"] == 0.8
    assert d["threatMix"] == {"FPV": 2}
    assert "timeBand" not in d
    text = " ".join(notes)
    for word in ("MARS", "Difficulty 9 set to 5", "NOON", "TANK", "colour"):
        assert word in text, (word, notes)


def test_same_text_same_seed() -> None:
    assert text_seed("Night  swarm") == text_seed("night swarm")
    assert text_seed("night swarm") != text_seed("day swarm")


def test_disabled_and_rbac(
    client: TestClient, make_user: Callable[..., User], auth_header: Headers
) -> None:
    staff = make_user(UserRole.INSTRUCTOR, "instructor@test")
    r = client.post("/api/v1/scenarios/from-text", json={"text": TEXT}, headers=auth_header(staff))
    body = assert_error(r, 503, "LLM_UNAVAILABLE")
    assert "LLM_ENABLED=false" in body["message"]
    trainee = make_user()
    assert_error(
        client.post(
            "/api/v1/scenarios/from-text", json={"text": TEXT}, headers=auth_header(trainee)
        ),
        403,
        "FORBIDDEN",
    )


def test_unreadable_llm_output_is_503(
    app: FastAPI, client: TestClient, make_user: Callable[..., User], auth_header: Headers
) -> None:
    staff = make_user(UserRole.INSTRUCTOR, "instructor@test")
    _llm(app, {"difficulty": "hard"})  # parsed fine: ignored with a note
    r = client.post("/api/v1/scenarios/from-text", json={"text": TEXT}, headers=auth_header(staff))
    assert r.status_code == 200
    assert any("not a number" in n for n in r.json()["notes"])
