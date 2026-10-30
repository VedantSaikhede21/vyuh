from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select

from app.core.auth import DbDep, require_role
from app.models import ClientError, User
from app.schemas.generated import (
    ClientErrorItem,
    ClientErrorListResponse,
    ClientErrorReport,
    UserRole,
)

router = APIRouter(tags=["ops"])

LIST_LIMIT = 50


@router.post("/client-errors", status_code=204)
def report_client_error(body: ClientErrorReport, request: Request, db: DbDep) -> Response:
    """A browser's error report. Open to anyone, limited per address, size-limited."""
    address = request.client.host if request.client else "unknown"
    request.app.state.client_error_limiter.check(f"client-error:{address}")
    db.add(
        ClientError(
            route=body.route,
            message=body.message,
            stack=body.stack,
            user_agent=body.user_agent,
            web_build=body.web_build,
            sim_version=body.sim_version,
        )
    )
    db.commit()
    return Response(status_code=204)


@router.get("/client-errors", response_model=ClientErrorListResponse)
def list_client_errors(
    db: DbDep, _: Annotated[User, Depends(require_role(UserRole.ADMIN))]
) -> ClientErrorListResponse:
    rows = db.scalars(select(ClientError).order_by(ClientError.id.desc()).limit(LIST_LIMIT)).all()
    return ClientErrorListResponse(
        items=[
            ClientErrorItem(
                route=r.route,
                message=r.message,
                user_agent=r.user_agent,
                web_build=r.web_build,
                created_at=r.created_at,
            )
            for r in rows
        ]
    )
