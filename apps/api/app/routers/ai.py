from fastapi import APIRouter, Request

from app.core.auth import CurrentUser
from app.schemas.generated import AiStatusResponse

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/status", response_model=AiStatusResponse)
def ai_status(request: Request, user: CurrentUser) -> AiStatusResponse:
    """Whether LLM features are on, so the UI can explain a disabled control."""
    llm = request.app.state.llm
    return AiStatusResponse(llm_enabled=llm.enabled, model=llm.model if llm.enabled else None)
