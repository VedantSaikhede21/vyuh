from fastapi import APIRouter

from app.core.auth import DbDep, StaffUser
from app.schemas.generated import ScoringTreeListResponse, ScoringTreeSummary, UpdateWeightsRequest
from app.services.scoring import versions

router = APIRouter(prefix="/scoring", tags=["scoring"])


@router.get("/trees", response_model=ScoringTreeListResponse)
def list_trees(user: StaffUser, db: DbDep) -> ScoringTreeListResponse:
    """Built-in trees and every saved weight version."""
    return ScoringTreeListResponse(items=versions.list_trees(db))


@router.patch("/trees/{tree_id}/weights", response_model=ScoringTreeSummary)
def update_weights(
    tree_id: str, body: UpdateWeightsRequest, user: StaffUser, db: DbDep
) -> ScoringTreeSummary:
    """Save new component weights as a new immutable version; nothing is re-scored."""
    return versions.create_weight_version(db, user, tree_id, body)
