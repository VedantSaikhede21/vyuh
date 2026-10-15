"""Application settings. Env vars are the contract in CLAUDE.md §11 / apps/api/.env.example."""

from enum import StrEnum
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Self

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

MIN_LOCAL_SECRET_BYTES = 32
#: apps/api in the repo (/app in the Docker image, where TERRAIN_DIR is set explicitly).
API_ROOT = Path(__file__).resolve().parents[2]
#: Dev/test default for TERRAIN_DIR: the web app's committed presets (one source of truth).
DEFAULT_TERRAIN_DIR = API_ROOT.parent / "web" / "public" / "terrain"


class Env(StrEnum):
    DEV = "dev"
    PROD = "prod"
    OFFLINE = "offline"


class AuthMode(StrEnum):
    LOCAL = "local"
    SUPABASE = "supabase"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: Env = Env.DEV
    database_url: str = "postgresql+psycopg://vyuh:vyuh@localhost:5432/vyuh"

    auth_mode: AuthMode = AuthMode.LOCAL
    supabase_url: str = ""
    supabase_jwks_url: str = ""
    supabase_jwt_audience: str = "authenticated"
    local_jwt_secret: SecretStr = SecretStr("")

    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000"]
    )

    llm_enabled: bool = False
    llm_provider: str = "openrouter"
    llm_model: str = "google/gemini-flash-latest"
    openrouter_api_key: SecretStr = SecretStr("")
    llm_timeout_s: float = 20
    llm_rate_limit_per_min: int = 10

    open_meteo_enabled: bool = False
    guest_mode_enabled: bool = False
    guest_ttl_hours: int = 24
    log_level: str = "INFO"

    #: POST /scenarios/generate calls per user per minute (in memory).
    generate_rate_limit_per_min: int = 10

    #: Terrain presets (<dir>/<PRESET>/meta.json, heightmap.u16, buildings.geojson).
    terrain_dir: Path = DEFAULT_TERRAIN_DIR

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [o.strip().rstrip("/") for o in value.split(",") if o.strip()]
        return value

    @field_validator("terrain_dir", mode="before")
    @classmethod
    def _default_terrain_dir(cls, value: object) -> object:
        return DEFAULT_TERRAIN_DIR if value in (None, "") else value

    @field_validator("database_url")
    @classmethod
    def _psycopg_driver(cls, value: str) -> str:
        # Accept plain postgres:// URLs (as Supabase shows them) and use psycopg 3.
        for prefix in ("postgresql://", "postgres://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value[len(prefix) :]
        return value

    @model_validator(mode="after")
    def _check_auth(self) -> Self:
        if self.env is Env.PROD and self.auth_mode is not AuthMode.SUPABASE:
            raise ValueError("ENV=prod requires AUTH_MODE=supabase")
        if self.auth_mode is AuthMode.LOCAL:
            if len(self.local_jwt_secret.get_secret_value().encode()) < MIN_LOCAL_SECRET_BYTES:
                raise ValueError(
                    f"AUTH_MODE=local requires LOCAL_JWT_SECRET of at least "
                    f"{MIN_LOCAL_SECRET_BYTES} bytes"
                )
        else:
            if not self.supabase_jwks_url and self.supabase_url:
                base = self.supabase_url.rstrip("/")
                self.supabase_jwks_url = f"{base}/auth/v1/.well-known/jwks.json"
            if not self.supabase_jwks_url:
                raise ValueError("AUTH_MODE=supabase requires SUPABASE_URL or SUPABASE_JWKS_URL")
        return self

    @property
    def dev_login_enabled(self) -> bool:
        return self.auth_mode is AuthMode.LOCAL and self.env is not Env.PROD

    @property
    def supabase_issuer(self) -> str | None:
        return f"{self.supabase_url.rstrip('/')}/auth/v1" if self.supabase_url else None


@lru_cache
def get_settings() -> Settings:
    return Settings()
