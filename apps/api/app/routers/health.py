from fastapi import APIRouter

from app import __version__
from app.core.auth import SettingsDep
from app.schemas.generated import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health(settings: SettingsDep) -> HealthResponse:
    return HealthResponse(status="ok", env=settings.env.value, version=__version__)
