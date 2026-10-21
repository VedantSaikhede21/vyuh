"""FastAPI app factory. Run: `uv run uvicorn app.main:create_app --factory --reload`."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.core.config import Env, Settings, get_settings
from app.core.db import make_engine, make_session_factory
from app.core.errors import install_error_handlers
from app.core.logging import REQUEST_ID_HEADER, configure_logging, request_id_middleware
from app.routers import aar, auth, health, scenarios, sessions
from app.seed.demo import seed_if_changed
from app.services.ratelimit import RateLimiter
from app.services.sessions import expire_stale_sessions

API_PREFIX = "/api/v1"

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        # Startup sweep: sessions left ACTIVE by closed tabs become ABANDONED (SPEC §4.5).
        with app.state.session_factory() as db:
            expire_stale_sessions(db)
        # Dev only: re-seed when the seed files changed (decision 119). Elsewhere run
        # `pnpm seed` after a deploy that changes seed data.
        if settings.env is Env.DEV:
            try:
                summary = seed_if_changed(app.state.session_factory, settings)
            except Exception:
                logger.exception("Startup re-seed failed; run `pnpm seed` by hand")
            else:
                if summary:
                    logger.info("Seed files changed: %s", summary)
        yield

    app = FastAPI(
        title="VYUH API",
        version=__version__,
        openapi_url=f"{API_PREFIX}/openapi.json",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.engine = make_engine(settings.database_url)
    app.state.session_factory = make_session_factory(app.state.engine)
    app.state.generate_limiter = RateLimiter(settings.generate_rate_limit_per_min)

    install_error_handlers(app)
    app.middleware("http")(request_id_middleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", REQUEST_ID_HEADER],
        expose_headers=[REQUEST_ID_HEADER],
    )

    app.include_router(health.router, prefix=API_PREFIX)
    app.include_router(auth.router, prefix=API_PREFIX)
    app.include_router(scenarios.router, prefix=API_PREFIX)
    app.include_router(sessions.router, prefix=API_PREFIX)
    app.include_router(aar.router, prefix=API_PREFIX)
    return app
