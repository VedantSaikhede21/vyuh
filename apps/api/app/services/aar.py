"""After-action review reads (SPEC §11: GET /aar/sessions/{id}) and instructor remarks."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models import Scenario as ScenarioRow
from app.models import SessionRemark, TrainingSession, User
from app.schemas.generated import AarSessionResponse, CreateRemarkRequest, ErrorCode, SessionStatus
from app.schemas.generated import SessionRemark as SessionRemarkOut
from app.services.analytics.ai_trust import ai_trust
from app.services.analytics.kill_chain import kill_chain
from app.services.scenarios import load_scenario
from app.services.sessions import get_viewable_session, session_detail, stored_events


def _completed(db: Session, user: User, session_id: uuid.UUID) -> TrainingSession:
    row = get_viewable_session(db, user, session_id)
    if row.status is not SessionStatus.COMPLETED:
        raise ApiError(
            ErrorCode.SESSION_NOT_ACTIVE,
            "After-action review is available once the session is completed",
            {"status": row.status.value},
        )
    return row


def remarks(db: Session, session_id: uuid.UUID) -> list[SessionRemarkOut]:
    """Instructor remarks on a session, oldest first."""
    rows = db.execute(
        select(SessionRemark, User.name)
        .outerjoin(User, User.id == SessionRemark.author_id)
        .where(SessionRemark.session_id == session_id)
        .order_by(SessionRemark.created_at, SessionRemark.id)
    )
    return [
        SessionRemarkOut(
            id=r.id, author_name=name or "Former instructor", body=r.body, created_at=r.created_at
        )
        for r, name in rows
    ]


def add_remark(
    db: Session, user: User, session_id: uuid.UUID, body: CreateRemarkRequest
) -> SessionRemarkOut:
    """Staff only (router); the session must be completed. The trainee sees it as a notice."""
    text = body.body.strip()
    if not text:  # zod trims; JSON Schema cannot, so a blank body is checked here
        raise ApiError(ErrorCode.VALIDATION_ERROR, "Write a remark first", {"field": "body"})
    row = _completed(db, user, session_id)
    remark = SessionRemark(session_id=row.id, author_id=user.id, body=text)
    db.add(remark)
    db.commit()
    return SessionRemarkOut(
        id=remark.id, author_name=user.name, body=remark.body, created_at=remark.created_at
    )


def aar_session(db: Session, user: User, session_id: uuid.UUID) -> AarSessionResponse:
    """Scenario, full event log (ground truth included) and kill chain of a completed
    session, for its owner or staff. Truth is never sent before completion."""
    row = _completed(db, user, session_id)
    scenario = load_scenario(db.get_one(ScenarioRow, row.scenario_id))
    events = stored_events(db, row.id)
    return AarSessionResponse.model_validate(
        {
            "session": session_detail(db, row),
            "scenario": scenario,
            "events": events,
            "killChain": kill_chain(scenario, events),
            "aiTrust": ai_trust(scenario, events),
            "remarks": remarks(db, row.id),
        }
    )
