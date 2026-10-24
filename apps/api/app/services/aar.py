"""After-action review reads (SPEC §11: GET /aar/sessions/{id})."""

import uuid

from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models import Scenario as ScenarioRow
from app.models import User
from app.schemas.generated import AarSessionResponse, ErrorCode, SessionStatus
from app.services.analytics.ai_trust import ai_trust
from app.services.analytics.kill_chain import kill_chain
from app.services.scenarios import load_scenario
from app.services.sessions import get_viewable_session, session_detail, stored_events


def aar_session(db: Session, user: User, session_id: uuid.UUID) -> AarSessionResponse:
    """Scenario, full event log (ground truth included) and kill chain of a completed
    session, for its owner or staff. Truth is never sent before completion."""
    row = get_viewable_session(db, user, session_id)
    if row.status is not SessionStatus.COMPLETED:
        raise ApiError(
            ErrorCode.SESSION_NOT_ACTIVE,
            "After-action review is available once the session is completed",
            {"status": row.status.value},
        )
    scenario = load_scenario(db.get_one(ScenarioRow, row.scenario_id))
    events = stored_events(db, row.id)
    return AarSessionResponse.model_validate(
        {
            "session": session_detail(db, row),
            "scenario": scenario,
            "events": events,
            "killChain": kill_chain(scenario, events),
            "aiTrust": ai_trust(scenario, events),
        }
    )
