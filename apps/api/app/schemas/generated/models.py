# GENERATED FILE — DO NOT EDIT.
# Source: packages/shared (zod) → packages/shared/schema/vyuh.schema.json
# Regenerate with `pnpm gen:schemas` from the repo root.

from __future__ import annotations

from typing import Annotated, Any, Literal
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, RootModel
from enum import StrEnum
from typing_extensions import TypeAliasType
from uuid import UUID
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


class AltitudeBand(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


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


class Behaviour(StrEnum):
    RECON_LOITER = "RECON_LOITER"
    SMUGGLING_DROP = "SMUGGLING_DROP"
    ATTACK_RUN = "ATTACK_RUN"
    SWARM_SATURATION = "SWARM_SATURATION"
    DECOY = "DECOY"
    TRANSIT = "TRANSIT"
    FRIENDLY_PATROL = "FRIENDLY_PATROL"
    BIRD_FLOCK = "BIRD_FLOCK"


class CameraSlewedPayload(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    az_deg: Annotated[float, Field(alias="azDeg", ge=0.0, lt=360.0)]
    el_deg: Annotated[float, Field(alias="elDeg", ge=-90.0, le=90.0)]
    zoom: Annotated[float, Field(gt=0.0)]


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


class Collateral(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    contact_id: Annotated[str, Field(alias="contactId", max_length=64, min_length=1)]


class CompleteSessionRequest(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    end_t_ms: Annotated[int, Field(alias="endTMs", ge=0, le=9007199254740991)]
    client_meta: Annotated[ClientMeta, Field(alias="clientMeta")]


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


class ContactOutcome(StrEnum):
    NEUTRALISED = "NEUTRALISED"
    LEAKED = "LEAKED"
    IGNORED_OK = "IGNORED_OK"
    WRONGLY_ENGAGED = "WRONGLY_ENGAGED"
    FRATRICIDE = "FRATRICIDE"


class ContactReachedAssetPayload(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    asset_id: Annotated[str, Field(alias="assetId", max_length=64, min_length=1)]


class TrackId(RootModel[str]):
    root: Annotated[str, Field(min_length=1)]


class ControlLink(StrEnum):
    RF_MANUAL = "RF_MANUAL"
    AUTONOMOUS_GNSS = "AUTONOMOUS_GNSS"
    FIBRE_OPTIC = "FIBRE_OPTIC"
    NONE = "NONE"


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


class EoLevel(StrEnum):
    DETECT = "DETECT"
    RECOGNISE = "RECOGNISE"
    IDENTIFY = "IDENTIFY"


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
    SENSOR_TRACK_CREATED = "SENSOR_TRACK_CREATED"
    SENSOR_TRACK_LOST = "SENSOR_TRACK_LOST"
    EO_IDENTIFIABLE = "EO_IDENTIFIABLE"
    RESPONSE_OUTCOME = "RESPONSE_OUTCOME"
    AI_SUGGESTION_SHOWN = "AI_SUGGESTION_SHOWN"
    SESSION_ENDED = "SESSION_ENDED"
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


class ReportLocation(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    bearing_deg: Annotated[float, Field(alias="bearingDeg", ge=0.0, lt=360.0)]
    range_m: Annotated[float, Field(alias="rangeM", ge=0.0)]
    from_sensor_id: Annotated[str, Field(alias="fromSensorId", min_length=1)]


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
    OUT_OF_RANGE = "OUT_OF_RANGE"
    COOLDOWN = "COOLDOWN"


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


class ScoreComponents(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    detection: float
    classification: float
    decision: float
    report: float
    efficiency: float


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


class SessionEndReason(StrEnum):
    TIME_UP = "TIME_UP"
    ALL_RESOLVED = "ALL_RESOLVED"
    ABORTED = "ABORTED"


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
    SENSOR_TRACK_CREATED = "SENSOR_TRACK_CREATED"
    SENSOR_TRACK_LOST = "SENSOR_TRACK_LOST"
    EO_IDENTIFIABLE = "EO_IDENTIFIABLE"
    RESPONSE_OUTCOME = "RESPONSE_OUTCOME"
    AI_SUGGESTION_SHOWN = "AI_SUGGESTION_SHOWN"
    SESSION_ENDED = "SESSION_ENDED"


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


ThreatMixAdditionalProperty = TypeAliasType(
    "ThreatMixAdditionalProperty", Annotated[int, Field(ge=0, le=50)]
)


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


class UnitRef(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    id: UUID
    name: str


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


class BorderLineZone(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    id: Annotated[str, Field(min_length=1)]
    kind: Literal["BORDER_LINE"]
    polyline: Annotated[list[tuple[float, float]], Field(min_length=2)]


class CameraSlewedEvent(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    seq: Annotated[int, Field(ge=0, le=9007199254740991)]
    t_ms: Annotated[int, Field(alias="tMs", ge=0, le=9007199254740991)]
    type: Literal["CAMERA_SLEWED"]
    payload: CameraSlewedPayload


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
    first_detectable_t_ms: Annotated[
        int | None, Field(alias="firstDetectableTMs", ge=0, le=9007199254740991)
    ] = None
    trainee_detected_t_ms: Annotated[
        int | None, Field(alias="traineeDetectedTMs", ge=0, le=9007199254740991)
    ] = None
    detection_latency_s: Annotated[float | None, Field(alias="detectionLatencyS", ge=0.0)] = None
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
    points: float | None = None
    feedback: list[str]


class ReportSubmittedEvent(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    seq: Annotated[int, Field(ge=0, le=9007199254740991)]
    t_ms: Annotated[int, Field(alias="tMs", ge=0, le=9007199254740991)]
    type: Literal["REPORT_SUBMITTED"]
    payload: ContactReport


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
        dict[ThreatClass, ThreatMixAdditionalProperty] | None, Field(alias="threatMix")
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


class Score(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    total: Annotated[float, Field(ge=0.0, le=100.0)]
    components: ScoreComponents
    penalties: list[Penalty]
    per_contact: Annotated[list[PerContactMetrics], Field(alias="perContact")]
    metrics: dict[str, Any]
    tree_version: Annotated[str, Field(alias="treeVersion", min_length=1)]


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


class AiSuggestionAcceptedEvent(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    seq: Annotated[int, Field(ge=0, le=9007199254740991)]
    t_ms: Annotated[int, Field(alias="tMs", ge=0, le=9007199254740991)]
    type: Literal["AI_SUGGESTION_ACCEPTED"]
    track_id: Annotated[str, Field(alias="trackId", max_length=64, min_length=1)]
    payload: AiSuggestionPayload


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


class CreateSessionResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    session_id: Annotated[UUID, Field(alias="sessionId")]
    scenario: Scenario
    started_at: Annotated[AwareDatetime, Field(alias="startedAt")]


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
                | SensorTrackCreatedEvent
                | SensorTrackLostEvent
                | EoIdentifiableEvent
                | ResponseOutcomeEvent
                | AiSuggestionShownEvent
                | SessionEndedEvent
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
