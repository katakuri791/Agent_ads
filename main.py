"""Point d'entrée FastAPI (bootstrap uniquement).

Les routes vivent désormais dans `api/<feature>/route.py` (feature-based) et sont
assemblées ici via `include_router`. Ce fichier ne garde que ce qui relève du
cycle de vie de l'application : création de l'app, CORS, observabilité (Sentry),
et les jobs de fond APScheduler (sync Meta + publication Instagram).
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend import facebook_sync, meta_instagram
from backend.config import CORS_ORIGINS, ENV, SENTRY_DSN
from backend.db import (
    finalize_scheduled_post,
    get_meta_account,
    list_due_ig_scheduled_posts,
)

# ─── Routers feature-based ────────────────────────────────────────────────────
from api.accounts.route import router as accounts_router
from api.audiences.route import router as audiences_router
from api.auth.route import router as auth_router
from api.billing.route import router as billing_router
from api.campaigns.route import router as campaigns_router
from api.chat.route import router as chat_router
from api.conversations.route import router as conversations_router
from api.dashboard.route import router as dashboard_router
from api.health.route import router as health_router
from api.instagram.route import router as instagram_router
from api.notifications.route import router as notifications_router
from api.pages.route import router as pages_router
from api.scheduled_posts.route import router as scheduled_posts_router
from api.search.route import router as search_router
from api.settings.route import router as settings_router
from api.sync.route import router as sync_router

logger = logging.getLogger("metainsight")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


# ─── Observabilité (Sentry) ───────────────────────────────────────────────────
# Initialisé AVANT la création de l'app pour capturer les erreurs de tout le
# cycle de vie. Sans SENTRY_DSN (dev local), c'est un no-op total — aucune
# dépendance réseau et capture_exception() ailleurs reste silencieux.
if SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[FastApiIntegration()],
        traces_sample_rate=0.1,
        environment=ENV,
    )
    logger.info("Sentry initialisé (env=%s)", ENV)


# ─── Worker de sync Meta → cache (APScheduler) ────────────────────────────────
# Le dashboard lit le cache ; ce scheduler le tient à jour en arrière-plan. Le
# SDK Meta est BLOQUANT → on exécute le sync dans un thread (asyncio.to_thread)
# pour ne pas geler l'event loop FastAPI.

SYNC_INTERVAL_MINUTES = int(os.environ.get("FB_SYNC_INTERVAL_MINUTES", "20"))
SYNC_ON_STARTUP = os.environ.get("FB_SYNC_ON_STARTUP", "true").lower() != "false"

scheduler = AsyncIOScheduler()


async def _run_sync_job() -> None:
    try:
        await asyncio.to_thread(facebook_sync.sync_all_accounts)
    except Exception:
        logger.exception("fb_sync job crashed")


# Intervalle du job de publication Instagram (Meta ne planifie pas IG → c'est nous).
IG_PUBLISH_INTERVAL_MINUTES = int(os.environ.get("IG_PUBLISH_INTERVAL_MINUTES", "1"))


def _publish_due_ig_posts() -> None:
    """Publie les posts Instagram dus (bloquant → exécuté dans un thread).

    Pour chaque post arrivé à échéance : résout le token du compte, publie via
    l'API IG (container + media_publish), puis marque `published`/`failed`.
    Chaque post est isolé — un échec n'empêche pas les autres."""
    now_iso = datetime.now(timezone.utc).isoformat()
    due = list_due_ig_scheduled_posts(now_iso)
    if not due:
        return
    logger.info("ig_publish: %d post(s) Instagram à publier", len(due))
    for post in due:
        row_id = post.get("id")
        account = get_meta_account(post.get("user_id"), post.get("account_id"))
        token = (account or {}).get("meta_access_token")
        page_id = post.get("page_id") or (account or {}).get("meta_page_id")
        if not token or not page_id:
            finalize_scheduled_post(row_id, "failed")
            logger.warning("ig_publish: post %s sans token/page → failed", row_id)
            continue
        media_url = post.get("ig_media_url")
        is_video = (post.get("ig_media_type") or "image") == "video"
        try:
            result = meta_instagram.publish_ig_now(
                page_id,
                token,
                caption=post.get("message") or "",
                image_url=None if is_video else media_url,
                video_url=media_url if is_video else None,
            )
            finalize_scheduled_post(row_id, "published", meta_post_id=result.get("post_id"))
        except Exception:  # noqa: BLE001 — on isole CHAQUE post
            finalize_scheduled_post(row_id, "failed")
            logger.exception("ig_publish: échec publication du post %s", row_id)


async def _run_ig_publish_job() -> None:
    try:
        await asyncio.to_thread(_publish_due_ig_posts)
    except Exception:
        logger.exception("ig_publish job crashed")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    scheduler.add_job(
        _run_sync_job, "interval", minutes=SYNC_INTERVAL_MINUTES,
        id="fb_sync", max_instances=1, coalesce=True,
    )
    scheduler.add_job(
        _run_ig_publish_job, "interval", minutes=IG_PUBLISH_INTERVAL_MINUTES,
        id="ig_publish", max_instances=1, coalesce=True,
    )
    scheduler.start()
    logger.info(
        "fb_sync scheduled every %d min; ig_publish every %d min",
        SYNC_INTERVAL_MINUTES, IG_PUBLISH_INTERVAL_MINUTES,
    )
    if SYNC_ON_STARTUP:
        # Sync initial non bloquant pour le démarrage du serveur.
        asyncio.create_task(_run_sync_job())
    try:
        yield
    finally:
        scheduler.shutdown(wait=False)


# ─── Application ──────────────────────────────────────────────────────────────

app = FastAPI(title="MetaInsight Agent API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Assemblage des routers feature-based. Les chemins complets (ex. "/auth/login")
# sont portés par chaque route → aucun prefix ici, URLs identiques à avant.
for _router in (
    health_router,
    auth_router,
    notifications_router,
    settings_router,
    accounts_router,
    pages_router,
    scheduled_posts_router,
    campaigns_router,
    audiences_router,
    dashboard_router,
    billing_router,
    instagram_router,
    search_router,
    sync_router,
    conversations_router,
    chat_router,
):
    app.include_router(_router)
