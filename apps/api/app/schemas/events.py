"""Thin wrappers over generated event models.

The generated module inlines the SimEvent union inside EventBatchRequest, so the
adapters reuse that exact annotation instead of redefining the union.
"""

from typing import Any

from pydantic import TypeAdapter

from app.schemas.generated import EventBatchRequest

SimEventListAdapter: TypeAdapter[list[Any]] = TypeAdapter(
    EventBatchRequest.model_fields["events"].annotation
)


def event_to_dict(event: Any) -> dict[str, Any]:
    """Generated event model → camelCase JSON dict as the client sent it."""
    return event.model_dump(mode="json", by_alias=True, exclude_none=True)
