from fastapi import APIRouter

from app.core.auth import CurrentUser, DbDep, SettingsDep
from app.schemas.generated import HomeResponse, StatusResponse
from app.services import portal

router = APIRouter(tags=["portal"])


@router.get("/home", response_model=HomeResponse)
def home(user: CurrentUser, db: DbDep) -> HomeResponse:
    """The signed-in user's operator home in one round trip."""
    return portal.home(db, user)


@router.get("/status", response_model=StatusResponse)
def status(db: DbDep, settings: SettingsDep) -> StatusResponse:
    """Public and minimal: up / down per component and versions (decision 156)."""
    return portal.status(db, settings)
