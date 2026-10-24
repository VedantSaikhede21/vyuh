# GENERATED FILE — DO NOT EDIT.
# Source: packages/shared (zod) → packages/shared/schema/vyuh.schema.json
# Regenerate with `pnpm gen:schemas` from the repo root.

from __future__ import annotations

from typing import Annotated, Any, Literal
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, RootModel
from enum import StrEnum
from uuid import UUID
from typing_extensions import TypeAliasType
from datetime import date as date_aliased


class VyuhSchemas(RootModel[Any]):
    root: Annotated[Any, Field(title="VyuhSchemas")]
    """
    GENERATED from packages/shared (zod). Do not edit — run `pnpm gen:schemas`.
    """


class Activity(StrEnum):
    APPROACHING = "APPROACHING"
    LOITERING = "LOITERING"
    DEPARTING = "DEPARTING"
    HOVERING = "HOVERING"
    UNKNOWN = "UNKNOWN"


class Affiliation(StrEnum):
    HOSTILE = "HOSTILE"
    FRIENDLY = "FRIENDLY"
    NEUTRAL = "NEUTRAL"
    UNKNOWN = "UNKNOWN"


class AffiliationSetPayload(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    affiliation: Affiliation


class AiStatusResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    llm_enabled: Annotated[bool, Field(alias="llmEnabled")]
    model: str | None


class OverTrust(RootModel[float]):
    root: Annotated[float, Field(ge=0.0, le=1.0)]


class UnderTrust(RootModel[float]):
    root: Annotated[float, Field(ge=0.0, le=1.0)]


class AiTrustMetrics(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    shown: Annotated[int, Field(ge=0, le=9007199254740991)]
    shown_correct: Annotated[int, Field(alias="shownCorrect", ge=0, le=9007199254740991)]
    shown_wrong: Annotated[int, Field(alias="shownWrong", ge=0, le=9007199254740991)]
    accepted_correct: Annotated[int, Field(alias="acceptedCorrect", ge=0, le=9007199254740991)]
    accepted_wrong: Annotated[int, Field(alias="acceptedWrong", ge=0, le=9007199254740991)]
    rejected_correct: Annotated[int, Field(alias="rejectedCorrect", ge=0, le=9007199254740991)]
    rejected_wrong: Annotated[int, Field(alias="rejectedWrong", ge=0, le=9007199254740991)]
    over_trust: Annotated[OverTrust | None, Field(alias="overTrust")]
    under_trust: Annotated[UnderTrust | None, Field(alias="underTrust")]


class AltitudeBand(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class AltitudeRef(StrEnum):
    AGL = "AGL"
    MSL = "MSL"


class AreaZoneKind(StrEnum):
    PROTECTED_ASSET = "PROTECTED_ASSET"
    NO_KINETIC = "NO_KINETIC"
    SENSOR_SITE = "SENSOR_SITE"


class Asset(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    id: Annotated[str, Field(min_length=1)]
    name: Annotated[str, Field(min_length=1)]
    x: float
    z: float
    radius_m: Annotated[float, Field(alias="radiusM", gt=0.0)]


class AssignmentCompletion(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    assignment_id: Annotated[UUID, Field(alias="assignmentId")]
    scenario_id: Annotated[UUID, Field(alias="scenarioId")]
    scenario_code: Annotated[str | None, Field(alias="scenarioCode")]
    scenario_name: Annotated[str, Field(alias="scenarioName")]
    due_at: Annotated[AwareDatetime | None, Field(alias="dueAt")]
    assigned: Annotated[int, Field(ge=0, le=9007199254740991)]
    completed: Annotated[int, Field(ge=0, le=9007199254740991)]
    pending: list[str]


class AssignmentItem(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    id: UUID
    scenario_id: Annotated[UUID, Field(alias="scenarioId")]
    scenario_code: Annotated[str | None, Field(alias="scenarioCode")]
    scenario_name: Annotated[str, Field(alias="scenarioName")]
    unit_id: Annotated[UUID | None, Field(alias="unitId")]
    unit_name: Annotated[str | None, Field(alias="unitName")]
    user_id: Annotated[UUID | None, Field(alias="userId")]
    user_name: Annotated[str | None, Field(alias="userName")]
    assigned_by_name: Annotated[str | None, Field(alias="assignedByName")]
    due_at: Annotated[AwareDatetime | None, Field(alias="dueAt")]
    created_at: Annotated[AwareDatetime, Field(alias="createdAt")]
    completed: bool
    completed_session_id: Annotated[UUID | None, Field(alias="completedSessionId")]


class AssignmentListResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    items: list[AssignmentItem]


ThreatMixAdditionalProperty = TypeAliasType(
    "ThreatMixAdditionalProperty", Annotated[int, Field(ge=0, le=9007199254740991)]
)


class Behaviour(StrEnum):
    RECON_LOITER = "RECON_LOITER"
    SMUGGLING_DROP = "SMUGGLING_DROP"
    ATTACK_RUN = "ATTACK_RUN"
    SWARM_SATURATION = "SWARM_SATURATION"
    DECOY = "DECOY"
    TRANSIT = "TRANSIT"
    FRIENDLY_PATROL = "FRIENDLY_PATROL"
    BIRD_FLOCK = "BIRD_FLOCK"


class BuildingProperties(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    height_m: Annotated[float, Field(alias="heightM", gt=0.0)]


class BuildingsStatus(StrEnum):
    OK = "OK"
    EMPTY = "EMPTY"
    UNAVAILABLE = "UNAVAILABLE"


class ClassificationResult(StrEnum):
    EXACT = "EXACT"
    CATEGORY = "CATEGORY"
    WRONG = "WRONG"


class ClientMeta(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    avg_fps: Annotated[float | None, Field(alias="avgFps", ge=0.0)] = None
    gpu: Annotated[str | None, Field(max_length=200)] = None
    browser: Annotated[str | None, Field(max_length=200)] = None


class ContactId(RootModel[str]):
    root: Annotated[str, Field(max_length=64, min_length=1)]


class Collateral(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    contact_ids: Annotated[list[ContactId], Field(alias="contactIds", min_length=1)]


class CompleteSessionRequest(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    end_t_ms: Annotated[int, Field(alias="endTMs", ge=0, le=9007199254740991)]
    client_meta: Annotated[ClientMeta, Field(alias="clientMeta")]


class Detection(RootModel[int]):
    root: Annotated[int, Field(ge=0, le=100)]


class Classification(RootModel[int]):
    root: Annotated[int, Field(ge=0, le=100)]


class Decision(RootModel[int]):
    root: Annotated[int, Field(ge=0, le=100)]


class Report(RootModel[int]):
    root: Annotated[int, Field(ge=0, le=100)]


class ComponentPct(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    detection: Detection | None
    classification: Classification | None
    decision: Decision | None
    report: Report | None


class ContactCategory(StrEnum):
    DRONE = "DRONE"
    BIRD = "BIRD"
    MANNED_AIRCRAFT = "MANNED_AIRCRAFT"


class ContactClass(StrEnum):
    QUAD_SMALL = "QUAD_SMALL"
    QUAD_HEAVY = "QUAD_HEAVY"
    FPV = "FPV"
    FIXED_WING_SMALL = "FIXED_WING_SMALL"
    LOITERING_GENERIC = "LOITERING_GENERIC"
    BIRD_SMALL = "BIRD_SMALL"
    BIRD_LARGE = "BIRD_LARGE"
    FRIENDLY_QUAD = "FRIENDLY_QUAD"
    CIVILIAN_HOBBY = "CIVILIAN_HOBBY"
    HELICOPTER_FRIENDLY = "HELICOPTER_FRIENDLY"


class ContactDroppedPayload(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    x: float
    z: float


class TrackId(RootModel[str]):
    root: Annotated[str, Field(min_length=1)]


class ContactOutcome(StrEnum):
    NEUTRALISED = "NEUTRALISED"
    LEAKED = "LEAKED"
    UNRESOLVED = "UNRESOLVED"
    IGNORED_OK = "IGNORED_OK"
    WRONGLY_ENGAGED = "WRONGLY_ENGAGED"
    FRATRICIDE = "FRATRICIDE"
    FRIENDLY_JAMMED = "FRIENDLY_JAMMED"
    CIVILIAN_JAMMED = "CIVILIAN_JAMMED"


class ContactReachedAssetPayload(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    asset_id: Annotated[str, Field(alias="assetId", max_length=64, min_length=1)]


class ControlLink(StrEnum):
    RF_MANUAL = "RF_MANUAL"
    AUTONOMOUS_GNSS = "AUTONOMOUS_GNSS"
    FIBRE_OPTIC = "FIBRE_OPTIC"
    NONE = "NONE"


class CreateAssignmentRequest(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    scenario_id: Annotated[UUID, Field(alias="scenarioId")]
    unit_id: Annotated[UUID | None, Field(alias="unitId")] = None
    user_ids: Annotated[list[UUID] | None, Field(alias="userIds", max_length=50)] = None
    due_at: Annotated[AwareDatetime | None, Field(alias="dueAt")] = None


class Strength(RootModel[str]):
    root: Annotated[str, Field(max_length=300, min_length=1)]


class DebriefFallbackReason(StrEnum):
    LLM_DISABLED = "LLM_DISABLED"
    TIMEOUT = "TIMEOUT"
    INVALID_OUTPUT = "INVALID_OUTPUT"
    ERROR = "ERROR"
    RATE_LIMITED = "RATE_LIMITED"


class DebriefMistake(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    t_ms: Annotated[int, Field(alias="tMs", ge=0, le=9007199254740991)]
    what: Annotated[str, Field(max_length=300, min_length=1)]
    why_it_matters: Annotated[str, Field(alias="whyItMatters", max_length=300, min_length=1)]
    do_instead: Annotated[str, Field(alias="doInstead", max_length=300, min_length=1)]


class DebriefSource(StrEnum):
    LLM = "LLM"
    TEMPLATE = "TEMPLATE"


class DevLoginRequest(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    email: Annotated[str, Field(max_length=254, min_length=3)]


class EffectorKind(StrEnum):
    EW_JAM = "EW_JAM"
    EW_SPOOF = "EW_SPOOF"
    INTERCEPT = "INTERCEPT"


class Emissions(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    rf_active: Annotated[bool, Field(alias="rfActive")]
    rf_band: Annotated[str | None, Field(alias="rfBand")] = None
    friendly_id_code: Annotated[str | None, Field(alias="friendlyIdCode")] = None


class EmptyPayload(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )


class ResolutionItem(RootModel[int]):
    root: Annotated[int, Field(gt=0, le=9007199254740991)]


class IrResolutionItem(RootModel[int]):
    root: Annotated[int, Field(gt=0, le=9007199254740991)]


class EoIrSensor(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    id: Annotated[str, Field(min_length=1)]
    x: float
    y: Annotated[float, Field(ge=0.0)]
    z: float
    kind: Literal["EO_IR"]
    fov_deg_min: Annotated[float, Field(alias="fovDegMin", gt=0.0)]
    fov_deg_max: Annotated[float, Field(alias="fovDegMax", gt=0.0)]
    resolution: tuple[ResolutionItem, ResolutionItem]
    ir_resolution: Annotated[
        tuple[IrResolutionItem, IrResolutionItem] | None, Field(alias="irResolution")
    ] = None


class EoLevel(StrEnum):
    DETECT = "DETECT"
    RECOGNISE = "RECOGNISE"
    IDENTIFY = "IDENTIFY"


class EoMode(StrEnum):
    DAY = "DAY"
    IR = "IR"


class ErrorCode(StrEnum):
    VALIDATION_ERROR = "VALIDATION_ERROR"
    IMPLAUSIBLE_EVENTS = "IMPLAUSIBLE_EVENTS"
    UNAUTHORIZED = "UNAUTHORIZED"
    FORBIDDEN = "FORBIDDEN"
    NOT_FOUND = "NOT_FOUND"
    SESSION_NOT_ACTIVE = "SESSION_NOT_ACTIVE"
    RATE_LIMITED = "RATE_LIMITED"
    LLM_UNAVAILABLE = "LLM_UNAVAILABLE"
    INTERNAL = "INTERNAL"


class EventBatchResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    accepted: Annotated[int, Field(ge=0, le=9007199254740991)]
    last_seq: Annotated[int, Field(alias="lastSeq", ge=-1, le=9007199254740991)]


class EventType(StrEnum):
    SESSION_STARTED = "SESSION_STARTED"
    CONTACT_SPAWNED = "CONTACT_SPAWNED"
    CONTACT_DESPAWNED = "CONTACT_DESPAWNED"
    CONTACT_REACHED_ASSET = "CONTACT_REACHED_ASSET"
    CONTACT_NEUTRALISED = "CONTACT_NEUTRALISED"
    CONTACT_DROPPED = "CONTACT_DROPPED"
    SENSOR_TRACK_CREATED = "SENSOR_TRACK_CREATED"
    SENSOR_TRACK_LOST = "SENSOR_TRACK_LOST"
    EO_IDENTIFIABLE = "EO_IDENTIFIABLE"
    RESPONSE_OUTCOME = "RESPONSE_OUTCOME"
    AI_SUGGESTION_SHOWN = "AI_SUGGESTION_SHOWN"
    SESSION_ENDED = "SESSION_ENDED"
    REPORT_TRUTH = "REPORT_TRUTH"
    TRACK_SELECTED = "TRACK_SELECTED"
    CAMERA_SLEWED = "CAMERA_SLEWED"
    MARKED_DETECTED = "MARKED_DETECTED"
    CLASSIFIED = "CLASSIFIED"
    AFFILIATION_SET = "AFFILIATION_SET"
    RESPONSE_ORDERED = "RESPONSE_ORDERED"
    REPORT_SUBMITTED = "REPORT_SUBMITTED"
    AI_SUGGESTION_ACCEPTED = "AI_SUGGESTION_ACCEPTED"
    AI_SUGGESTION_REJECTED = "AI_SUGGESTION_REJECTED"


class FalseContactDensity(StrEnum):
    LOW = "LOW"
    MED = "MED"
    HIGH = "HIGH"


class FromTextRequest(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    text: Annotated[str, Field(max_length=600, min_length=3)]


class HealthResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    status: Literal["ok"]
    env: str
    version: str


class KillChainStage(StrEnum):
    DETECT = "DETECT"
    TRACK = "TRACK"
    IDENTIFY = "IDENTIFY"
    DECIDE = "DECIDE"
    RESPOND = "RESPOND"
    ASSESS = "ASSESS"


class KillChainStatus(StrEnum):
    OK = "OK"
    LATE = "LATE"
    WRONG = "WRONG"
    MISSED = "MISSED"
    NOT_APPLICABLE = "NOT_APPLICABLE"


class KillChainStep(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    stage: KillChainStage
    available_t_ms: Annotated[
        int | None, Field(alias="availableTMs", ge=0, le=9007199254740991)
    ] = None
    action_t_ms: Annotated[int | None, Field(alias="actionTMs", ge=0, le=9007199254740991)] = None
    latency_s: Annotated[float | None, Field(alias="latencyS", ge=0.0)] = None
    action: str | None = None
    truth: str | None = None
    status: KillChainStatus
    feedback: str
    jump_t_ms: Annotated[int, Field(alias="jumpTMs", ge=0, le=9007199254740991)]


class LatLon(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    lat: Annotated[float, Field(ge=-90.0, le=90.0)]
    lon: Annotated[float, Field(ge=-180.0, le=180.0)]


class MarkedDetectedEvent(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    seq: Annotated[int, Field(ge=0, le=9007199254740991)]
    t_ms: Annotated[int, Field(alias="tMs", ge=0, le=9007199254740991)]
    type: Literal["MARKED_DETECTED"]
    track_id: Annotated[str, Field(alias="trackId", max_length=64, min_length=1)]
    payload: EmptyPayload


class MistakeItem(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    code: str
    text: str
    count: Annotated[int, Field(ge=0, le=9007199254740991)]
    sessions: Annotated[int, Field(ge=0, le=9007199254740991)]
    trainees: Annotated[int, Field(ge=0, le=9007199254740991)]


class NonThreatClass(StrEnum):
    BIRD_SMALL = "BIRD_SMALL"
    BIRD_LARGE = "BIRD_LARGE"
    FRIENDLY_QUAD = "FRIENDLY_QUAD"
    CIVILIAN_HOBBY = "CIVILIAN_HOBBY"
    HELICOPTER_FRIENDLY = "HELICOPTER_FRIENDLY"


class Penalty(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    code: Annotated[str, Field(min_length=1)]
    points: float
    t_ms: Annotated[int | None, Field(alias="tMs", ge=0, le=9007199254740991)] = None
    contact_id: Annotated[str | None, Field(alias="contactId")] = None
    feedback: str
    unavoidable: bool | None = None


class Leaf(RootModel[str]):
    root: Annotated[str, Field(min_length=1)]


class RadarSensor(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    id: Annotated[str, Field(min_length=1)]
    x: float
    y: Annotated[float, Field(ge=0.0)]
    z: float
    kind: Literal["RADAR"]
    ref_range_m: Annotated[float, Field(alias="refRangeM", gt=0.0)]
    scan_period_s: Annotated[float, Field(alias="scanPeriodS", gt=0.0)]


class RatingChange(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    before: Annotated[int, Field(ge=-9007199254740991, le=9007199254740991)]
    after: Annotated[int, Field(ge=-9007199254740991, le=9007199254740991)]
    scenario_rating: Annotated[
        int, Field(alias="scenarioRating", ge=-9007199254740991, le=9007199254740991)
    ]
    expected: Annotated[float, Field(ge=0.0, le=1.0)]


class RecommendationBasis(StrEnum):
    ELO_V1 = "ELO_V1"


class ReportLocation(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    bearing_deg: Annotated[float, Field(alias="bearingDeg", ge=0.0, lt=360.0)]
    range_m: Annotated[float, Field(alias="rangeM", ge=0.0)]
    from_sensor_id: Annotated[str, Field(alias="fromSensorId", min_length=1)]


class ReportTruthContact(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    contact_id: Annotated[str, Field(alias="contactId", max_length=64, min_length=1)]
    x: float
    z: float
    agl_m: Annotated[float, Field(alias="aglM")]
    heading_deg: Annotated[float, Field(alias="headingDeg", ge=0.0, lt=360.0)]
    speed_mps: Annotated[float, Field(alias="speedMps", ge=0.0)]
    activity: Activity


class ReportTruthPayload(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    report_seq: Annotated[int, Field(alias="reportSeq", ge=0, le=9007199254740991)]
    contacts: list[ReportTruthContact]


class ReportedClass(StrEnum):
    QUAD_SMALL = "QUAD_SMALL"
    QUAD_HEAVY = "QUAD_HEAVY"
    FPV = "FPV"
    FIXED_WING_SMALL = "FIXED_WING_SMALL"
    LOITERING_GENERIC = "LOITERING_GENERIC"
    BIRD_SMALL = "BIRD_SMALL"
    BIRD_LARGE = "BIRD_LARGE"
    FRIENDLY_QUAD = "FRIENDLY_QUAD"
    CIVILIAN_HOBBY = "CIVILIAN_HOBBY"
    HELICOPTER_FRIENDLY = "HELICOPTER_FRIENDLY"
    UNKNOWN = "UNKNOWN"


class RescoreRequest(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    tree_id: Annotated[str, Field(alias="treeId", min_length=1)]


class ResponseKind(StrEnum):
    MONITOR = "MONITOR"
    REPORT = "REPORT"
    EW_JAM = "EW_JAM"
    EW_SPOOF = "EW_SPOOF"
    INTERCEPT = "INTERCEPT"


class ResponseOrderedPayload(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    response: ResponseKind
    effector_id: Annotated[str | None, Field(alias="effectorId", max_length=64, min_length=1)] = (
        None
    )


class ResponseResult(StrEnum):
    NEUTRALISED = "NEUTRALISED"
    NO_EFFECT = "NO_EFFECT"
    MISSED = "MISSED"
    BLOCKED_BY_ROE = "BLOCKED_BY_ROE"
    BLOCKED_NO_KINETIC = "BLOCKED_NO_KINETIC"
    OUT_OF_RANGE = "OUT_OF_RANGE"
    COOLDOWN = "COOLDOWN"
    NO_AMMO = "NO_AMMO"


class RfSensor(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    id: Annotated[str, Field(min_length=1)]
    x: float
    y: Annotated[float, Field(ge=0.0)]
    z: float
    kind: Literal["RF"]
    range_m: Annotated[float, Field(alias="rangeM", gt=0.0)]
    bearing_err_deg: Annotated[float, Field(alias="bearingErrDeg", ge=0.0)]


class Roe(StrEnum):
    WEAPONS_FREE = "WEAPONS_FREE"
    WEAPONS_TIGHT = "WEAPONS_TIGHT"
    WEAPONS_HOLD = "WEAPONS_HOLD"


class ScenarioKind(StrEnum):
    SCRIPTED = "SCRIPTED"
    GENERATED = "GENERATED"
    AUTHORED = "AUTHORED"


class BestScore(RootModel[float]):
    root: Annotated[float, Field(ge=0.0, le=100.0)]


class ScoreComponents(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    detection: float
    classification: float
    decision: float
    report: float
    efficiency: float


class ScoreDisplay(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    total: Annotated[int, Field(ge=0, le=100)]
    components: ScoreComponents


class EditableEnum(StrEnum):
    DETECTION = "detection"
    CLASSIFICATION = "classification"
    DECISION = "decision"
    REPORT = "report"
    EFFICIENCY = "efficiency"


class ScoringTreeSummary(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    id: str
    base_id: Annotated[str, Field(alias="baseId")]
    derived_from: Annotated[str | None, Field(alias="derivedFrom")]
    description: str
    component_max: Annotated[ScoreComponents, Field(alias="componentMax")]
    editable: list[EditableEnum]
    built_in: Annotated[bool, Field(alias="builtIn")]
    created_at: Annotated[AwareDatetime | None, Field(alias="createdAt")]
    created_by_name: Annotated[str | None, Field(alias="createdByName")]
    scored_sessions: Annotated[int, Field(alias="scoredSessions", ge=0, le=9007199254740991)]


class SensorKind(StrEnum):
    RADAR = "RADAR"
    EO_IR = "EO_IR"
    RF = "RF"


class SensorTrackCreatedPayload(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    sensor_id: Annotated[str, Field(alias="sensorId", max_length=64, min_length=1)]
    sensor_kind: Annotated[SensorKind, Field(alias="sensorKind")]
    range_m: Annotated[float | None, Field(alias="rangeM", ge=0.0)] = None
    bearing_deg: Annotated[float, Field(alias="bearingDeg", ge=0.0, lt=360.0)]


class SimVersion(RootModel[int]):
    root: Annotated[int, Field(ge=1, le=9007199254740991)]


class TerrainRevision(RootModel[int]):
    root: Annotated[int, Field(ge=1, le=9007199254740991)]


class SessionEndReason(StrEnum):
    TIME_UP = "TIME_UP"
    ALL_RESOLVED = "ALL_RESOLVED"
    ABORTED = "ABORTED"


class SessionEnded(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    reason: SessionEndReason
    t_ms: Annotated[int, Field(alias="tMs", ge=0, le=9007199254740991)]


class SessionEndedPayload(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    reason: SessionEndReason


class SessionMode(StrEnum):
    PRACTICE = "PRACTICE"
    ASSESSMENT = "ASSESSMENT"


class SessionStartedPayload(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    mode: SessionMode
    scenario_id: Annotated[str, Field(alias="scenarioId", max_length=64, min_length=1)]
    seed: Annotated[int, Field(ge=0, le=4294967295)]


class SessionStatus(StrEnum):
    CREATED = "CREATED"
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    ABANDONED = "ABANDONED"


class Rate(RootModel[float]):
    root: Annotated[float, Field(ge=0.0, le=1.0)]


class StageRate(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    stage: KillChainStage
    ok: Annotated[int, Field(ge=0, le=9007199254740991)]
    total: Annotated[int, Field(ge=0, le=9007199254740991)]
    rate: Rate | None


class SunAzEl(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    az_deg: Annotated[float, Field(alias="azDeg")]
    el_deg: Annotated[float, Field(alias="elDeg")]


class SystemEventType(StrEnum):
    SESSION_STARTED = "SESSION_STARTED"
    CONTACT_SPAWNED = "CONTACT_SPAWNED"
    CONTACT_DESPAWNED = "CONTACT_DESPAWNED"
    CONTACT_REACHED_ASSET = "CONTACT_REACHED_ASSET"
    CONTACT_NEUTRALISED = "CONTACT_NEUTRALISED"
    CONTACT_DROPPED = "CONTACT_DROPPED"
    SENSOR_TRACK_CREATED = "SENSOR_TRACK_CREATED"
    SENSOR_TRACK_LOST = "SENSOR_TRACK_LOST"
    EO_IDENTIFIABLE = "EO_IDENTIFIABLE"
    RESPONSE_OUTCOME = "RESPONSE_OUTCOME"
    AI_SUGGESTION_SHOWN = "AI_SUGGESTION_SHOWN"
    SESSION_ENDED = "SESSION_ENDED"
    REPORT_TRUTH = "REPORT_TRUTH"


class TerrainPresetFiles(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    heightmap: Annotated[str, Field(min_length=1)]
    preview: Annotated[str | None, Field(min_length=1)] = None
    buildings: Annotated[str, Field(min_length=1)]


class AttributionItem(RootModel[str]):
    root: Annotated[str, Field(min_length=1)]


class TerrainPresetMeta(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    name: Annotated[str, Field(pattern="^[A-Z][A-Z0-9_]*$")]
    origin: LatLon
    utc_offset_min: Annotated[int, Field(alias="utcOffsetMin", ge=-720, le=840)]
    size_m: Annotated[float, Field(alias="sizeM", gt=0.0)]
    resolution: Annotated[int, Field(ge=2, le=4097)]
    metres_per_px: Annotated[float, Field(alias="metresPerPx", gt=0.0)]
    origin_elev_m: Annotated[float, Field(alias="originElevM")]
    rel_min_m: Annotated[float, Field(alias="relMinM")]
    rel_max_m: Annotated[float, Field(alias="relMaxM")]
    min_elev_m: Annotated[float, Field(alias="minElevM")]
    max_elev_m: Annotated[float, Field(alias="maxElevM")]
    buildings_status: Annotated[BuildingsStatus, Field(alias="buildingsStatus")]
    building_count: Annotated[int, Field(alias="buildingCount", ge=0, le=9007199254740991)]
    files: TerrainPresetFiles
    source: Annotated[str, Field(min_length=1)]
    attribution: Annotated[list[AttributionItem], Field(min_length=1)]
    revision: Annotated[int | None, Field(ge=1, le=9007199254740991)] = None


class TerrainRef(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    preset: Annotated[str, Field(min_length=1)]
    origin: LatLon


class ThreatClass(StrEnum):
    QUAD_SMALL = "QUAD_SMALL"
    QUAD_HEAVY = "QUAD_HEAVY"
    FPV = "FPV"
    FIXED_WING_SMALL = "FIXED_WING_SMALL"
    LOITERING_GENERIC = "LOITERING_GENERIC"


ThreatMixAdditionalProperty1 = TypeAliasType(
    "ThreatMixAdditionalProperty1", Annotated[int, Field(ge=0, le=50)]
)


class TimeBand(StrEnum):
    DAY = "DAY"
    DUSK = "DUSK"
    NIGHT = "NIGHT"


class TokenResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    access_token: Annotated[str, Field(alias="accessToken")]
    token_type: Annotated[Literal["bearer"], Field(alias="tokenType")]
    expires_in: Annotated[int, Field(alias="expiresIn", gt=0, le=9007199254740991)]


class TrackLostReason(StrEnum):
    MISSES = "MISSES"
    LOS = "LOS"
    OUT_OF_RANGE = "OUT_OF_RANGE"


class TrackSelectedEvent(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    seq: Annotated[int, Field(ge=0, le=9007199254740991)]
    t_ms: Annotated[int, Field(alias="tMs", ge=0, le=9007199254740991)]
    type: Literal["TRACK_SELECTED"]
    track_id: Annotated[str, Field(alias="trackId", max_length=64, min_length=1)]
    payload: EmptyPayload


class TraineeEventType(StrEnum):
    TRACK_SELECTED = "TRACK_SELECTED"
    CAMERA_SLEWED = "CAMERA_SLEWED"
    MARKED_DETECTED = "MARKED_DETECTED"
    CLASSIFIED = "CLASSIFIED"
    AFFILIATION_SET = "AFFILIATION_SET"
    RESPONSE_ORDERED = "RESPONSE_ORDERED"
    REPORT_SUBMITTED = "REPORT_SUBMITTED"
    AI_SUGGESTION_ACCEPTED = "AI_SUGGESTION_ACCEPTED"
    AI_SUGGESTION_REJECTED = "AI_SUGGESTION_REJECTED"


class DetectionLatencyS(RootModel[float]):
    root: Annotated[float, Field(ge=0.0)]


class ClassificationAccuracy(RootModel[float]):
    root: Annotated[float, Field(ge=0.0, le=1.0)]


class RatingBefore(RootModel[int]):
    root: Annotated[int, Field(ge=-9007199254740991, le=9007199254740991)]


class RatingAfter(RootModel[int]):
    root: Annotated[int, Field(ge=-9007199254740991, le=9007199254740991)]


class TrendPoint(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    session_id: Annotated[UUID, Field(alias="sessionId")]
    scenario_id: Annotated[UUID, Field(alias="scenarioId")]
    scenario_code: Annotated[str | None, Field(alias="scenarioCode")]
    scenario_name: Annotated[str, Field(alias="scenarioName")]
    difficulty: Annotated[int, Field(ge=1, le=5)]
    ended_at: Annotated[AwareDatetime, Field(alias="endedAt")]
    total: Annotated[int, Field(ge=0, le=100)]
    components: ComponentPct
    detection_latency_s: Annotated[DetectionLatencyS | None, Field(alias="detectionLatencyS")]
    classification_accuracy: Annotated[
        ClassificationAccuracy | None, Field(alias="classificationAccuracy")
    ]
    recommended_difficulty: Annotated[int, Field(alias="recommendedDifficulty", ge=1, le=5)]
    rating_before: Annotated[RatingBefore | None, Field(alias="ratingBefore")]
    rating_after: Annotated[RatingAfter | None, Field(alias="ratingAfter")]
    over_trust: Annotated[OverTrust | None, Field(alias="overTrust")]
    under_trust: Annotated[UnderTrust | None, Field(alias="underTrust")]
    tree_version: Annotated[str, Field(alias="treeVersion")]
    is_demo: Annotated[bool, Field(alias="isDemo")]


class TrendUser(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    id: UUID
    name: str
    unit_name: Annotated[str | None, Field(alias="unitName")]


class AvgTotal(RootModel[int]):
    root: Annotated[int, Field(ge=-9007199254740991, le=9007199254740991)]


class UnitRef(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    id: UUID
    name: str


class UnitSessionRow(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    session_id: Annotated[UUID, Field(alias="sessionId")]
    user_id: Annotated[UUID, Field(alias="userId")]
    user_name: Annotated[str, Field(alias="userName")]
    scenario_code: Annotated[str | None, Field(alias="scenarioCode")]
    scenario_name: Annotated[str, Field(alias="scenarioName")]
    difficulty: Annotated[int, Field(ge=1, le=5)]
    ended_at: Annotated[AwareDatetime, Field(alias="endedAt")]
    total: Annotated[int, Field(ge=-9007199254740991, le=9007199254740991)]
    tree_version: Annotated[str, Field(alias="treeVersion")]
    is_demo: Annotated[bool, Field(alias="isDemo")]


class LastTotal(RootModel[int]):
    root: Annotated[int, Field(ge=-9007199254740991, le=9007199254740991)]


class BestTotal(RootModel[int]):
    root: Annotated[int, Field(ge=-9007199254740991, le=9007199254740991)]


class Change(RootModel[int]):
    root: Annotated[int, Field(ge=-9007199254740991, le=9007199254740991)]


class UnitTraineeRow(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    user_id: Annotated[UUID, Field(alias="userId")]
    name: str
    sessions: Annotated[int, Field(ge=0, le=9007199254740991)]
    avg_total: Annotated[AvgTotal | None, Field(alias="avgTotal")]
    last_total: Annotated[LastTotal | None, Field(alias="lastTotal")]
    best_total: Annotated[BestTotal | None, Field(alias="bestTotal")]
    change: Change | None
    detection_latency_s: Annotated[float | None, Field(alias="detectionLatencyS")]
    classification_accuracy: Annotated[
        ClassificationAccuracy | None, Field(alias="classificationAccuracy")
    ]
    weakest_stage: Annotated[KillChainStage | None, Field(alias="weakestStage")]


class UpdateWeightsRequest(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    component_max: Annotated[ScoreComponents, Field(alias="componentMax")]
    note: Annotated[str | None, Field(max_length=200)] = None


class UserRole(StrEnum):
    TRAINEE = "TRAINEE"
    INSTRUCTOR = "INSTRUCTOR"
    ADMIN = "ADMIN"


class WaypointAction(StrEnum):
    DROP = "DROP"
    DIVE = "DIVE"
    RTH = "RTH"


class Weather(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    visibility_m: Annotated[float, Field(alias="visibilityM", ge=0.0)]
    rain_mmph: Annotated[float, Field(alias="rainMmph", ge=0.0)]
    wind_mps: Annotated[float, Field(alias="windMps", ge=0.0)]
    wind_dir_deg: Annotated[float, Field(alias="windDirDeg", ge=0.0, lt=360.0)]
    cloud_pct: Annotated[float, Field(alias="cloudPct", ge=0.0, le=100.0)]


class WeatherPreset(StrEnum):
    CLEAR = "CLEAR"
    HAZE = "HAZE"
    FOG = "FOG"
    RAIN = "RAIN"
    DUST = "DUST"


class ZoneKind(StrEnum):
    PROTECTED_ASSET = "PROTECTED_ASSET"
    NO_KINETIC = "NO_KINETIC"
    BORDER_LINE = "BORDER_LINE"
    SENSOR_SITE = "SENSOR_SITE"


class AffiliationSetEvent(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    seq: Annotated[int, Field(ge=0, le=9007199254740991)]
    t_ms: Annotated[int, Field(alias="tMs", ge=0, le=9007199254740991)]
    type: Literal["AFFILIATION_SET"]
    track_id: Annotated[str, Field(alias="trackId", max_length=64, min_length=1)]
    payload: AffiliationSetPayload


class AiSuggestion(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    suggested_class: Annotated[ContactClass, Field(alias="suggestedClass")]
    confidence: Annotated[float, Field(ge=0.0, le=1.0)]


class AiSuggestionPayload(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    suggested_class: Annotated[ContactClass, Field(alias="suggestedClass")]
    confidence: Annotated[float, Field(ge=0.0, le=1.0)]


class AiSuggestionRejectedEvent(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    seq: Annotated[int, Field(ge=0, le=9007199254740991)]
    t_ms: Annotated[int, Field(alias="tMs", ge=0, le=9007199254740991)]
    type: Literal["AI_SUGGESTION_REJECTED"]
    track_id: Annotated[str, Field(alias="trackId", max_length=64, min_length=1)]
    payload: AiSuggestionPayload


class AiSuggestionShownEvent(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    seq: Annotated[int, Field(ge=0, le=9007199254740991)]
    t_ms: Annotated[int, Field(alias="tMs", ge=0, le=9007199254740991)]
    type: Literal["AI_SUGGESTION_SHOWN"]
    track_id: Annotated[str, Field(alias="trackId", max_length=64, min_length=1)]
    payload: AiSuggestionPayload


class AreaZone(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    id: Annotated[str, Field(min_length=1)]
    kind: AreaZoneKind
    polygon: Annotated[list[tuple[float, float]], Field(min_length=3)]
    name: Annotated[str | None, Field(max_length=40, min_length=1)] = None


class AuthoredZone(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    name: Annotated[str, Field(max_length=40, min_length=1)]
    polygon: Annotated[list[tuple[float, float]], Field(max_length=16, min_length=3)]


class BorderLineZone(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    id: Annotated[str, Field(min_length=1)]
    kind: Literal["BORDER_LINE"]
    polyline: Annotated[list[tuple[float, float]], Field(min_length=2)]
    name: Annotated[str | None, Field(max_length=40, min_length=1)] = None


class CameraSlewedPayload(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    az_deg: Annotated[float, Field(alias="azDeg", ge=0.0, lt=360.0)]
    el_deg: Annotated[float, Field(alias="elDeg", ge=-90.0, le=90.0)]
    zoom: Annotated[float, Field(gt=0.0)]
    mode: EoMode | None = None


class ClassifiedPayload(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    class_: Annotated[ContactClass, Field(alias="class")]


class ContactDespawnedEvent(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    seq: Annotated[int, Field(ge=0, le=9007199254740991)]
    t_ms: Annotated[int, Field(alias="tMs", ge=0, le=9007199254740991)]
    type: Literal["CONTACT_DESPAWNED"]
    contact_id: Annotated[str, Field(alias="contactId", max_length=64, min_length=1)]
    payload: EmptyPayload


class ContactDroppedEvent(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    seq: Annotated[int, Field(ge=0, le=9007199254740991)]
    t_ms: Annotated[int, Field(alias="tMs", ge=0, le=9007199254740991)]
    type: Literal["CONTACT_DROPPED"]
    contact_id: Annotated[str, Field(alias="contactId", max_length=64, min_length=1)]
    track_id: Annotated[str | None, Field(alias="trackId", max_length=64, min_length=1)] = None
    payload: ContactDroppedPayload


class ContactKillChain(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    contact_id: Annotated[str, Field(alias="contactId", min_length=1)]
    is_threat: Annotated[bool, Field(alias="isThreat")]
    true_class: Annotated[ContactClass, Field(alias="trueClass")]
    true_affiliation: Annotated[Affiliation, Field(alias="trueAffiliation")]
    track_ids: Annotated[list[TrackId], Field(alias="trackIds")]
    outcome: ContactOutcome | None = None
    stages: Annotated[list[KillChainStep], Field(max_length=6, min_length=6)]


class ContactNeutralisedPayload(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    by: ResponseKind


class ContactReachedAssetEvent(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    seq: Annotated[int, Field(ge=0, le=9007199254740991)]
    t_ms: Annotated[int, Field(alias="tMs", ge=0, le=9007199254740991)]
    type: Literal["CONTACT_REACHED_ASSET"]
    contact_id: Annotated[str, Field(alias="contactId", max_length=64, min_length=1)]
    payload: ContactReachedAssetPayload


class ContactReport(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    t_ms: Annotated[int, Field(alias="tMs", ge=0, le=9007199254740991)]
    track_ids: Annotated[list[TrackId], Field(alias="trackIds", min_length=1)]
    count: Annotated[int, Field(ge=1, le=9007199254740991)]
    class_: Annotated[ReportedClass, Field(alias="class")]
    affiliation: Affiliation
    location: ReportLocation
    heading_deg: Annotated[float, Field(alias="headingDeg", ge=0.0, lt=360.0)]
    altitude_band: Annotated[AltitudeBand, Field(alias="altitudeBand")]
    activity: Activity


class ContactSpawnedEvent(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    seq: Annotated[int, Field(ge=0, le=9007199254740991)]
    t_ms: Annotated[int, Field(alias="tMs", ge=0, le=9007199254740991)]
    type: Literal["CONTACT_SPAWNED"]
    contact_id: Annotated[str, Field(alias="contactId", max_length=64, min_length=1)]
    payload: EmptyPayload


class CreateSessionRequest(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    scenario_id: Annotated[UUID, Field(alias="scenarioId")]
    mode: SessionMode
    sim_version: Annotated[int, Field(alias="simVersion", ge=1, le=9007199254740991)]


class DebriefContent(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    summary: Annotated[str, Field(max_length=800, min_length=1)]
    strengths: Annotated[list[Strength], Field(max_length=5)]
    mistakes: Annotated[list[DebriefMistake], Field(max_length=6)]
    drill: Annotated[str, Field(max_length=400, min_length=1)]


class DebriefResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    session_id: Annotated[UUID, Field(alias="sessionId")]
    source: DebriefSource
    model: str
    fallback_reason: Annotated[DebriefFallbackReason | None, Field(alias="fallbackReason")] = None
    content: DebriefContent
    created_at: Annotated[AwareDatetime, Field(alias="createdAt")]


class EffectorConfig(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    id: Annotated[str, Field(min_length=1)]
    kind: EffectorKind
    x: float
    y: Annotated[float | None, Field(ge=0.0)] = None
    z: float
    range_m: Annotated[float, Field(alias="rangeM", gt=0.0)]
    cooldown_s: Annotated[float, Field(alias="cooldownS", ge=0.0)]
    ammo: Annotated[int | None, Field(ge=0, le=9007199254740991)] = None


class Environment(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    date: date_aliased
    time: Annotated[str, Field(pattern="^([01]\\d|2[0-3]):[0-5]\\d$")]
    is_night: Annotated[bool, Field(alias="isNight")]
    weather: Weather
    sun_az_el: Annotated[SunAzEl | None, Field(alias="sunAzEl")] = None


class EoIdentifiablePayload(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    level: EoLevel
    range_m: Annotated[float, Field(alias="rangeM", ge=0.0)]


class ErrorBody(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    code: ErrorCode
    message: str
    details: dict[str, Any]


class ErrorEnvelope(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    error: ErrorBody


class GenerateRequest(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    terrain_preset: Annotated[str, Field(alias="terrainPreset", min_length=1)]
    difficulty: Annotated[int, Field(ge=1, le=5)]
    seed: Annotated[int, Field(ge=0, le=4294967295)]
    time_band: Annotated[TimeBand | None, Field(alias="timeBand")] = None
    weather_preset: Annotated[WeatherPreset | None, Field(alias="weatherPreset")] = None
    duration_s: Annotated[int | None, Field(alias="durationS", ge=30, le=3600)] = None
    roe: Roe | None = None
    threat_mix: Annotated[
        dict[ThreatClass, ThreatMixAdditionalProperty1] | None, Field(alias="threatMix")
    ] = None
    swarm_size: Annotated[int | None, Field(alias="swarmSize", ge=1, le=50)] = None
    false_contact_density: Annotated[
        FalseContactDensity | None, Field(alias="falseContactDensity")
    ] = None
    ai_assist_accuracy: Annotated[float | None, Field(alias="aiAssistAccuracy", ge=0.0, le=1.0)] = (
        None
    )
    approach_bearing_deg: Annotated[
        float | None, Field(alias="approachBearingDeg", ge=0.0, lt=360.0)
    ] = None
    decoys: Annotated[int | None, Field(ge=0, le=6)] = None


class MeResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    id: UUID
    name: str
    email: str | None
    role: UserRole
    unit: UnitRef | None
    rating: Annotated[int, Field(ge=-9007199254740991, le=9007199254740991)]
    is_guest: Annotated[bool, Field(alias="isGuest")]


class PerContactMetrics(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    contact_id: Annotated[str, Field(alias="contactId", min_length=1)]
    is_threat: Annotated[bool, Field(alias="isThreat")]
    track_ids: Annotated[list[TrackId], Field(alias="trackIds")]
    first_detectable_t_ms: Annotated[
        int | None, Field(alias="firstDetectableTMs", ge=0, le=9007199254740991)
    ] = None
    trainee_detected_t_ms: Annotated[
        int | None, Field(alias="traineeDetectedTMs", ge=0, le=9007199254740991)
    ] = None
    detection_latency_s: Annotated[float | None, Field(alias="detectionLatencyS", ge=0.0)] = None
    true_class: Annotated[ContactClass | None, Field(alias="trueClass")] = None
    classified_as: Annotated[ContactClass | None, Field(alias="classifiedAs")] = None
    classification_correct: Annotated[
        ClassificationResult | None, Field(alias="classificationCorrect")
    ] = None
    identifiable_when_classified: Annotated[
        bool | None, Field(alias="identifiableWhenClassified")
    ] = None
    responses: list[ResponseKind]
    response_appropriate: Annotated[bool | None, Field(alias="responseAppropriate")] = None
    outcome: ContactOutcome | None = None
    ai_suggestion_shown: Annotated[bool | None, Field(alias="aiSuggestionShown")] = None
    ai_suggestion_accepted: Annotated[bool | None, Field(alias="aiSuggestionAccepted")] = None
    ai_suggestion_correct: Annotated[bool | None, Field(alias="aiSuggestionCorrect")] = None
    dropped_t_ms: Annotated[int | None, Field(alias="droppedTMs", ge=0, le=9007199254740991)] = None
    points: float | None = None
    leaves: list[Leaf]
    feedback: list[str]


class ReportSubmittedEvent(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    seq: Annotated[int, Field(ge=0, le=9007199254740991)]
    t_ms: Annotated[int, Field(alias="tMs", ge=0, le=9007199254740991)]
    type: Literal["REPORT_SUBMITTED"]
    payload: ContactReport


class ReportTruthEvent(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    seq: Annotated[int, Field(ge=0, le=9007199254740991)]
    t_ms: Annotated[int, Field(alias="tMs", ge=0, le=9007199254740991)]
    type: Literal["REPORT_TRUTH"]
    payload: ReportTruthPayload


class ResponseOrderedEvent(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    seq: Annotated[int, Field(ge=0, le=9007199254740991)]
    t_ms: Annotated[int, Field(alias="tMs", ge=0, le=9007199254740991)]
    type: Literal["RESPONSE_ORDERED"]
    track_id: Annotated[str, Field(alias="trackId", max_length=64, min_length=1)]
    payload: ResponseOrderedPayload


class ResponseOutcomePayload(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    response: ResponseKind
    result: ResponseResult
    collateral: Collateral | None = None


class ScenarioListItem(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    id: UUID
    code: str | None
    name: str
    kind: ScenarioKind
    difficulty: Annotated[int, Field(ge=1, le=5)]
    duration_s: Annotated[int, Field(alias="durationS", gt=0, le=9007199254740991)]
    roe: Roe
    is_night: Annotated[bool, Field(alias="isNight")]
    terrain_preset: Annotated[str, Field(alias="terrainPreset", min_length=1)]
    date: date_aliased
    time: Annotated[str, Field(pattern="^([01]\\d|2[0-3]):[0-5]\\d$")]
    weather: Weather
    tags: list[str]
    best_score: Annotated[BestScore | None, Field(alias="bestScore")]


class ScenarioListResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    items: list[ScenarioListItem]


class ScenarioRequest(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    terrain_preset: Annotated[str, Field(alias="terrainPreset", min_length=1)]
    time_of_day: Annotated[str, Field(alias="timeOfDay", pattern="^([01]\\d|2[0-3]):[0-5]\\d$")]
    date: date_aliased | None = None
    weather: Weather | Literal["LIVE"]
    difficulty: Annotated[int, Field(ge=1, le=5)]
    seed: Annotated[int, Field(ge=0, le=4294967295)]
    threat_mix: Annotated[
        dict[ThreatClass, ThreatMixAdditionalProperty1] | None, Field(alias="threatMix")
    ] = None
    swarm_size: Annotated[int | None, Field(alias="swarmSize", ge=1, le=50)] = None
    false_contact_density: Annotated[
        FalseContactDensity | None, Field(alias="falseContactDensity")
    ] = None
    ai_assist_accuracy: Annotated[float | None, Field(alias="aiAssistAccuracy", ge=0.0, le=1.0)] = (
        None
    )
    duration_s: Annotated[int, Field(alias="durationS", ge=30, le=3600)]
    roe: Roe
    approach_bearing_deg: Annotated[
        float | None, Field(alias="approachBearingDeg", ge=0.0, lt=360.0)
    ] = None
    decoys: Annotated[int | None, Field(ge=0, le=6)] = None


class Score(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    total: Annotated[float, Field(ge=0.0, le=100.0)]
    components: ScoreComponents
    component_max: Annotated[ScoreComponents, Field(alias="componentMax")]
    penalties: list[Penalty]
    per_contact: Annotated[list[PerContactMetrics], Field(alias="perContact")]
    metrics: dict[str, Any]
    tree_version: Annotated[str, Field(alias="treeVersion", min_length=1)]
    recommended_difficulty: Annotated[
        int | None, Field(alias="recommendedDifficulty", ge=1, le=5)
    ] = None
    recommendation_basis: Annotated[
        RecommendationBasis | None, Field(alias="recommendationBasis")
    ] = None
    rating: RatingChange | None = None
    recommendation_rating: Annotated[
        int | None, Field(alias="recommendationRating", ge=-9007199254740991, le=9007199254740991)
    ] = None
    display: ScoreDisplay | None = None


class ScoringTreeListResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    items: list[ScoringTreeSummary]


class SensorTrackCreatedEvent(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    seq: Annotated[int, Field(ge=0, le=9007199254740991)]
    t_ms: Annotated[int, Field(alias="tMs", ge=0, le=9007199254740991)]
    type: Literal["SENSOR_TRACK_CREATED"]
    contact_id: Annotated[str, Field(alias="contactId", max_length=64, min_length=1)]
    track_id: Annotated[str, Field(alias="trackId", max_length=64, min_length=1)]
    payload: SensorTrackCreatedPayload


class SensorTrackLostPayload(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    reason: TrackLostReason


class SessionDetailResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    id: UUID
    scenario_id: Annotated[UUID, Field(alias="scenarioId")]
    scenario_name: Annotated[str, Field(alias="scenarioName")]
    mode: SessionMode
    status: SessionStatus
    started_at: Annotated[AwareDatetime, Field(alias="startedAt")]
    ended_at: Annotated[AwareDatetime | None, Field(alias="endedAt")]
    sim_version: Annotated[SimVersion | None, Field(alias="simVersion")]
    terrain_revision: Annotated[TerrainRevision | None, Field(alias="terrainRevision")]
    score: Score | None
    ended: SessionEnded | None
    is_demo: Annotated[bool, Field(alias="isDemo")]


class SessionEndedEvent(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    seq: Annotated[int, Field(ge=0, le=9007199254740991)]
    t_ms: Annotated[int, Field(alias="tMs", ge=0, le=9007199254740991)]
    type: Literal["SESSION_ENDED"]
    payload: SessionEndedPayload


class SessionStartedEvent(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    seq: Annotated[int, Field(ge=0, le=9007199254740991)]
    t_ms: Annotated[int, Field(alias="tMs", ge=0, le=9007199254740991)]
    type: Literal["SESSION_STARTED"]
    payload: SessionStartedPayload


class TraineeTrendsResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    user: TrendUser
    rating: Annotated[int, Field(ge=-9007199254740991, le=9007199254740991)]
    points: list[TrendPoint]
    mistakes: list[MistakeItem]
    stages: list[StageRate]
    ai_trust: Annotated[AiTrustMetrics, Field(alias="aiTrust")]


class UnitDashboardResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    unit: UnitRef
    sessions: Annotated[int, Field(ge=0, le=9007199254740991)]
    demo_sessions: Annotated[int, Field(alias="demoSessions", ge=0, le=9007199254740991)]
    avg_total: Annotated[AvgTotal | None, Field(alias="avgTotal")]
    components: ComponentPct
    detection_latency_s: Annotated[float | None, Field(alias="detectionLatencyS")]
    classification_accuracy: Annotated[
        ClassificationAccuracy | None, Field(alias="classificationAccuracy")
    ]
    leaderboard: list[UnitTraineeRow]
    stages: list[StageRate]
    weakest_stage: Annotated[KillChainStage | None, Field(alias="weakestStage")]
    mistakes: list[MistakeItem]
    assignments: list[AssignmentCompletion]
    recent: list[UnitSessionRow]


class UnitMember(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    id: UUID
    name: str
    role: UserRole


class UnitSummary(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    id: UUID
    name: str
    members: list[UnitMember]


class Waypoint(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    x: float
    y: Annotated[float, Field(ge=0.0)]
    z: float
    speed_mps: Annotated[float, Field(alias="speedMps", ge=0.0)]
    hold_s: Annotated[float | None, Field(alias="holdS", ge=0.0)] = None
    action: WaypointAction | None = None
    alt_ref: Annotated[AltitudeRef | None, Field(alias="altRef")] = None


class AiSuggestionAcceptedEvent(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    seq: Annotated[int, Field(ge=0, le=9007199254740991)]
    t_ms: Annotated[int, Field(alias="tMs", ge=0, le=9007199254740991)]
    type: Literal["AI_SUGGESTION_ACCEPTED"]
    track_id: Annotated[str, Field(alias="trackId", max_length=64, min_length=1)]
    payload: AiSuggestionPayload


class AuthorScenarioRequest(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    name: Annotated[str, Field(max_length=80, min_length=1)]
    note: Annotated[str | None, Field(max_length=600)] = None
    generate: GenerateRequest
    asset_xz: Annotated[tuple[float, float] | None, Field(alias="assetXz")] = None
    no_kinetic_zones: Annotated[list[AuthoredZone], Field(alias="noKineticZones", max_length=6)]
    scoring_tree_id: Annotated[str | None, Field(alias="scoringTreeId", min_length=1)] = None


class CameraSlewedEvent(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    seq: Annotated[int, Field(ge=0, le=9007199254740991)]
    t_ms: Annotated[int, Field(alias="tMs", ge=0, le=9007199254740991)]
    type: Literal["CAMERA_SLEWED"]
    track_id: Annotated[str | None, Field(alias="trackId", max_length=64, min_length=1)] = None
    payload: CameraSlewedPayload


class ClassifiedEvent(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    seq: Annotated[int, Field(ge=0, le=9007199254740991)]
    t_ms: Annotated[int, Field(alias="tMs", ge=0, le=9007199254740991)]
    type: Literal["CLASSIFIED"]
    track_id: Annotated[str, Field(alias="trackId", max_length=64, min_length=1)]
    payload: ClassifiedPayload


class ContactNeutralisedEvent(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    seq: Annotated[int, Field(ge=0, le=9007199254740991)]
    t_ms: Annotated[int, Field(alias="tMs", ge=0, le=9007199254740991)]
    type: Literal["CONTACT_NEUTRALISED"]
    contact_id: Annotated[str, Field(alias="contactId", max_length=64, min_length=1)]
    payload: ContactNeutralisedPayload


class ContactSpec(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    id: Annotated[str, Field(max_length=16, min_length=1)]
    class_: Annotated[ContactClass, Field(alias="class")]
    is_threat: Annotated[bool, Field(alias="isThreat")]
    affiliation: Affiliation
    control_link: Annotated[ControlLink, Field(alias="controlLink")]
    behaviour: Behaviour
    spawn_t_ms: Annotated[int, Field(alias="spawnTMs", ge=0, le=9007199254740991)]
    despawn_t_ms: Annotated[int | None, Field(alias="despawnTMs", ge=0, le=9007199254740991)] = None
    group_id: Annotated[str | None, Field(alias="groupId", min_length=1)] = None
    path: Annotated[list[Waypoint], Field(min_length=1)]
    emissions: Emissions
    ai_suggestion: Annotated[AiSuggestion | None, Field(alias="aiSuggestion")] = None


class EoIdentifiableEvent(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    seq: Annotated[int, Field(ge=0, le=9007199254740991)]
    t_ms: Annotated[int, Field(alias="tMs", ge=0, le=9007199254740991)]
    type: Literal["EO_IDENTIFIABLE"]
    contact_id: Annotated[str, Field(alias="contactId", max_length=64, min_length=1)]
    track_id: Annotated[str | None, Field(alias="trackId", max_length=64, min_length=1)] = None
    payload: EoIdentifiablePayload


class FromTextResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    request: GenerateRequest
    notes: list[str]
    model: str


class ResponseOutcomeEvent(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    seq: Annotated[int, Field(ge=0, le=9007199254740991)]
    t_ms: Annotated[int, Field(alias="tMs", ge=0, le=9007199254740991)]
    type: Literal["RESPONSE_OUTCOME"]
    track_id: Annotated[str, Field(alias="trackId", max_length=64, min_length=1)]
    contact_id: Annotated[str, Field(alias="contactId", max_length=64, min_length=1)]
    payload: ResponseOutcomePayload


class Scenario(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    id: Annotated[str, Field(min_length=1)]
    schema_version: Annotated[Literal[1], Field(alias="schemaVersion")]
    name: Annotated[str, Field(min_length=1)]
    briefing: str
    seed: Annotated[int, Field(ge=0, le=4294967295)]
    difficulty: Annotated[int, Field(ge=1, le=5)]
    request: ScenarioRequest | None = None
    generator_version: Annotated[
        int | None, Field(alias="generatorVersion", ge=1, le=9007199254740991)
    ] = None
    terrain: TerrainRef
    environment: Environment
    roe: Roe
    zones: list[BorderLineZone | AreaZone]
    assets: list[Asset]
    sensors: Annotated[
        list[Annotated[RadarSensor | EoIrSensor | RfSensor, Field(discriminator="kind")]],
        Field(min_length=1),
    ]
    effectors: list[EffectorConfig]
    contacts: Annotated[list[ContactSpec], Field(min_length=1)]
    duration_s: Annotated[int, Field(alias="durationS", ge=30, le=3600)]
    scoring_tree_id: Annotated[str, Field(alias="scoringTreeId", min_length=1)]


class ScenarioDetailResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    scenario_id: Annotated[UUID, Field(alias="scenarioId")]
    code: str | None
    kind: ScenarioKind
    scenario: Scenario


class SensorTrackLostEvent(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    seq: Annotated[int, Field(ge=0, le=9007199254740991)]
    t_ms: Annotated[int, Field(alias="tMs", ge=0, le=9007199254740991)]
    type: Literal["SENSOR_TRACK_LOST"]
    track_id: Annotated[str, Field(alias="trackId", max_length=64, min_length=1)]
    contact_id: Annotated[str | None, Field(alias="contactId", max_length=64, min_length=1)] = None
    payload: SensorTrackLostPayload


class UnitListResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    items: list[UnitSummary]


class AarSessionResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    session: SessionDetailResponse
    scenario: Scenario
    events: list[
        Annotated[
            SessionStartedEvent
            | ContactSpawnedEvent
            | ContactDespawnedEvent
            | ContactReachedAssetEvent
            | ContactNeutralisedEvent
            | ContactDroppedEvent
            | SensorTrackCreatedEvent
            | SensorTrackLostEvent
            | EoIdentifiableEvent
            | ResponseOutcomeEvent
            | AiSuggestionShownEvent
            | SessionEndedEvent
            | ReportTruthEvent
            | TrackSelectedEvent
            | CameraSlewedEvent
            | MarkedDetectedEvent
            | ClassifiedEvent
            | AffiliationSetEvent
            | ResponseOrderedEvent
            | ReportSubmittedEvent
            | AiSuggestionAcceptedEvent
            | AiSuggestionRejectedEvent,
            Field(discriminator="type"),
        ]
    ]
    kill_chain: Annotated[list[ContactKillChain], Field(alias="killChain")]
    ai_trust: Annotated[AiTrustMetrics, Field(alias="aiTrust")]


class AuthorPreviewResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    scenario: Scenario | None
    problems: list[str]
    threat_mix: Annotated[dict[ContactClass, ThreatMixAdditionalProperty], Field(alias="threatMix")]
    non_threats: Annotated[int, Field(alias="nonThreats", ge=0, le=9007199254740991)]


class AuthorScenarioResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    scenario_id: Annotated[UUID, Field(alias="scenarioId")]
    kind: ScenarioKind
    scenario: Scenario


class CreateSessionResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    session_id: Annotated[UUID, Field(alias="sessionId")]
    scenario: Scenario
    started_at: Annotated[AwareDatetime, Field(alias="startedAt")]
    sim_version: Annotated[int, Field(alias="simVersion", ge=1, le=9007199254740991)]


class EventBatchRequest(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    batch_seq: Annotated[int, Field(alias="batchSeq", ge=0, le=9007199254740991)]
    events: Annotated[
        list[
            Annotated[
                SessionStartedEvent
                | ContactSpawnedEvent
                | ContactDespawnedEvent
                | ContactReachedAssetEvent
                | ContactNeutralisedEvent
                | ContactDroppedEvent
                | SensorTrackCreatedEvent
                | SensorTrackLostEvent
                | EoIdentifiableEvent
                | ResponseOutcomeEvent
                | AiSuggestionShownEvent
                | SessionEndedEvent
                | ReportTruthEvent
                | TrackSelectedEvent
                | CameraSlewedEvent
                | MarkedDetectedEvent
                | ClassifiedEvent
                | AffiliationSetEvent
                | ResponseOrderedEvent
                | ReportSubmittedEvent
                | AiSuggestionAcceptedEvent
                | AiSuggestionRejectedEvent,
                Field(discriminator="type"),
            ]
        ],
        Field(max_length=500),
    ]


class GenerateScenarioResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    scenario_id: Annotated[UUID, Field(alias="scenarioId")]
    scenario: Scenario
