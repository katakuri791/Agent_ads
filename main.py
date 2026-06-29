import asyncio
import logging
import os
import socket
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

import requests
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from facebook_business.exceptions import FacebookRequestError
from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from backend.agent import (
    build_agent,
    build_campaign_questionnaire,
    extract_final_reply,
    extract_tool_calls,
    history_to_lc_messages,
    wants_campaign_creation,
)
from backend.auth import (
    get_current_user,
    login as auth_login,
    revoke_refresh_token,
    rotate_refresh_token,
    signup as auth_signup,
    update_user_profile,
)
from backend.config import CORS_ORIGINS, ENV, SENTRY_DSN
from backend.db import (
    create_conversation,
    create_meta_account,
    create_scheduled_post_record,
    list_scheduled_post_records,
    set_scheduled_post_status,
    delete_meta_account,
    get_conversation,
    get_meta_account,
    get_user_settings,
    list_conversations,
    list_meta_accounts,
    load_messages,
    log_tool_call,
    save_campaign_failure,
    save_campaign_tree,
    save_message,
    set_default_meta_account,
    touch_conversation,
    update_fb_campaign_status,
    update_meta_account,
    upsert_user_settings,
)
from backend import dashboard, facebook_sync, meta_pages, notifications
from backend.db import (
    get_fb_sync_state as db_get_fb_sync_state,
)
from backend.meta_tools import (
    get_campaign_detail,
    list_campaigns_with_insights,
    list_custom_audiences,
    set_campaign_status,
    test_connection,
    upload_image_bytes,
    upload_video_bytes,
)
from backend.ratelimit import check_rate_limit
from backend.schemas import (
    AudienceReachResponse,
    AudienceSummary,
    AuthResponse,
    CampaignCreated,
    CampaignDetailResponse,
    CampaignQuestionnaire,
    CampaignStatusUpdate,
    CampaignSummary,
    ChatImageUploadResponse,
    ChatRequest,
    ChatResponse,
    ChatVideoUploadResponse,
    ConversationSummary,
    DashboardKpi,
    DashboardResponse,
    DashboardSeriesPoint,
    LoginRequest,
    LogoutRequest,
    MessageOut,
    MetaAccountRequest,
    MetaAccountResponse,
    MetaSettingsRequest,
    MetaSettingsResponse,
    MetaTestResponse,
    NotificationsResponse,
    PagePost,
    PageSummaryResponse,
    RefreshRequest,
    ScheduledPost,
    ScheduledPostsResponse,
    SearchResponse,
    SearchResultItem,
    SignupRequest,
    StructuredOutput,
    SyncStatusResponse,
    ToolCallInfo,
    UserPublic,
    UserUpdateRequest,
)

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


# ─── Worker de sync Meta → Supabase (APScheduler) ─────────────────────────────
# Le dashboard lit désormais le cache Supabase ; ce scheduler le tient à jour en
# arrière-plan. Le SDK Meta est BLOQUANT → on exécute le sync dans un thread
# (asyncio.to_thread) pour ne pas geler l'event loop FastAPI.

SYNC_INTERVAL_MINUTES = int(os.environ.get("FB_SYNC_INTERVAL_MINUTES", "20"))
SYNC_ON_STARTUP = os.environ.get("FB_SYNC_ON_STARTUP", "true").lower() != "false"

scheduler = AsyncIOScheduler()


async def _run_sync_job() -> None:
    try:
        await asyncio.to_thread(facebook_sync.sync_all_accounts)
    except Exception:
        logger.exception("fb_sync job crashed")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    scheduler.add_job(
        _run_sync_job, "interval", minutes=SYNC_INTERVAL_MINUTES,
        id="fb_sync", max_instances=1, coalesce=True,
    )
    scheduler.start()
    logger.info("fb_sync scheduled every %d min", SYNC_INTERVAL_MINUTES)
    if SYNC_ON_STARTUP:
        # Sync initial non bloquant pour le démarrage du serveur.
        asyncio.create_task(_run_sync_job())
    try:
        yield
    finally:
        scheduler.shutdown(wait=False)


app = FastAPI(title="MetaInsight Agent API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def _meta_http_error(exc: Exception) -> HTTPException:
    """Convertit toute erreur d'appel Meta en HTTP 502 *lisible* — jamais un 500
    opaque ni un blocage. La cause complète est loggée côté serveur."""
    logger.exception("Meta API call failed")
    if isinstance(exc, FacebookRequestError):
        detail = exc.api_error_message() or str(exc)
    elif isinstance(exc, meta_pages.GraphError):
        detail = str(exc)
    elif isinstance(exc, (requests.Timeout, socket.timeout)):
        detail = "Délai dépassé en contactant Meta (Graph API trop lent). Réessaie."
    elif isinstance(exc, requests.RequestException):
        detail = f"Erreur réseau en contactant Meta : {exc}"
    else:
        detail = f"Erreur inattendue en récupérant les données Meta : {exc}"
    return HTTPException(status_code=502, detail=detail)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


# ─── Auth ────────────────────────────────────────────────────────────────────


@app.post("/auth/signup", response_model=AuthResponse)
def route_signup(body: SignupRequest) -> AuthResponse:
    access, refresh, user = auth_signup(body.email, body.password, body.full_name)
    return AuthResponse(access_token=access, refresh_token=refresh, user=user)


@app.post("/auth/login", response_model=AuthResponse)
def route_login(body: LoginRequest) -> AuthResponse:
    access, refresh, user = auth_login(body.email, body.password)
    return AuthResponse(access_token=access, refresh_token=refresh, user=user)


@app.post("/auth/refresh", response_model=AuthResponse)
def route_refresh(body: RefreshRequest) -> AuthResponse:
    """Renouvelle l'access token via un refresh token valide (rotation one-time use)."""
    access, refresh, user = rotate_refresh_token(body.refresh_token)
    return AuthResponse(access_token=access, refresh_token=refresh, user=user)


@app.post("/auth/logout")
def route_logout(body: LogoutRequest) -> dict:
    """Invalide le refresh token courant côté serveur (déconnexion propre)."""
    revoke_refresh_token(body.refresh_token)
    return {"ok": True}


# ─── Notifications in-app ─────────────────────────────────────────────────────


@app.get("/notifications", response_model=NotificationsResponse)
def route_notifications(user: UserPublic = Depends(get_current_user)) -> NotificationsResponse:
    return NotificationsResponse(**notifications.list_notifications(user.id))


@app.patch("/notifications/read-all")
def route_notifications_read_all(user: UserPublic = Depends(get_current_user)) -> dict:
    notifications.mark_all_read(user.id)
    return {"ok": True}


@app.patch("/notifications/{notification_id}")
def route_notification_read(
    notification_id: str, user: UserPublic = Depends(get_current_user)
) -> dict:
    notifications.mark_read(user.id, notification_id)
    return {"ok": True}


@app.get("/auth/me", response_model=UserPublic)
def route_me(user: UserPublic = Depends(get_current_user)) -> UserPublic:
    return user


@app.patch("/auth/me", response_model=UserPublic)
def route_update_me(
    body: UserUpdateRequest, user: UserPublic = Depends(get_current_user)
) -> UserPublic:
    patch = body.model_dump(exclude_unset=True)
    return update_user_profile(user.id, patch)


# ─── Settings ────────────────────────────────────────────────────────────────


def _mask_settings(row: Optional[dict]) -> MetaSettingsResponse:
    if not row:
        return MetaSettingsResponse(meta_access_token_set=False)
    return MetaSettingsResponse(
        meta_access_token_set=bool(row.get("meta_access_token")),
        meta_ad_account_id=row.get("meta_ad_account_id"),
        meta_page_id=row.get("meta_page_id"),
        meta_pixel_id=row.get("meta_pixel_id"),
        preferred_currency=row.get("preferred_currency"),
        timezone=row.get("timezone"),
    )


@app.get("/settings", response_model=MetaSettingsResponse)
def route_get_settings(user: UserPublic = Depends(get_current_user)) -> MetaSettingsResponse:
    return _mask_settings(get_user_settings(user.id))


@app.put("/settings", response_model=MetaSettingsResponse)
def route_put_settings(
    body: MetaSettingsRequest, user: UserPublic = Depends(get_current_user)
) -> MetaSettingsResponse:
    # Only the fields the client explicitly sent are present (exclude_unset).
    # A field sent as "" (or whitespace) means "clear this value" (→ NULL);
    # a field that is absent is left unchanged. See upsert_user_settings.
    patch = body.model_dump(exclude_unset=True)
    saved = upsert_user_settings(user.id, patch)
    return _mask_settings(saved)


def _resolve_account(
    user_id: str,
    account_id: Optional[str] = None,
    need_account: bool = False,
    need_page: bool = False,
) -> dict:
    """Résout le compte Meta sélectionné (multi-clés) et valide les credentials
    requis par la route. Remplace l'ancien `_require_meta_settings` mono-compte."""
    acct = get_meta_account(user_id, account_id)
    if not acct or not acct.get("meta_access_token"):
        raise HTTPException(status_code=400, detail="Meta access token is required.")
    if need_account and not acct.get("meta_ad_account_id"):
        raise HTTPException(status_code=400, detail="Meta ad account id is required.")
    if need_page and not acct.get("meta_page_id"):
        raise HTTPException(status_code=400, detail="Meta page id is required.")
    return acct


def _preset_to_days(date_preset: Optional[str]) -> tuple[int, bool]:
    """Traduit un date_preset Meta (last_7d, last_30d, maximum…) en (days, all_time)
    pour les lectures cache. `maximum` → all_time."""
    preset = (date_preset or "last_30d").strip().lower()
    if preset == "maximum":
        return 30, True
    if preset == "today" or preset == "yesterday":
        return 1, False
    if preset.startswith("last_") and preset.endswith("d"):
        try:
            return max(1, int(preset[5:-1])), False
        except ValueError:
            pass
    return 30, False


def _mask_account(row: dict) -> MetaAccountResponse:
    return MetaAccountResponse(
        id=row["id"],
        label=row.get("label") or "Compte Meta",
        meta_access_token_set=bool(row.get("meta_access_token")),
        meta_ad_account_id=row.get("meta_ad_account_id"),
        meta_page_id=row.get("meta_page_id"),
        meta_pixel_id=row.get("meta_pixel_id"),
        preferred_currency=row.get("preferred_currency"),
        timezone=row.get("timezone"),
        is_default=bool(row.get("is_default")),
        token_status=row.get("token_status") or "valid",
    )


# ─── Meta accounts (multi-clés) ──────────────────────────────────────────────


@app.get("/meta/accounts", response_model=list[MetaAccountResponse])
def route_list_accounts(
    user: UserPublic = Depends(get_current_user),
) -> list[MetaAccountResponse]:
    return [_mask_account(a) for a in list_meta_accounts(user.id)]


@app.post("/meta/accounts", response_model=MetaAccountResponse)
def route_create_account(
    body: MetaAccountRequest, user: UserPublic = Depends(get_current_user)
) -> MetaAccountResponse:
    patch = body.model_dump(exclude_unset=True)
    make_default = patch.pop("is_default", None)
    acct = create_meta_account(user.id, patch)
    if make_default:
        acct = set_default_meta_account(user.id, acct["id"]) or acct
    return _mask_account(acct)


@app.put("/meta/accounts/{account_id}", response_model=MetaAccountResponse)
def route_update_account(
    account_id: str, body: MetaAccountRequest, user: UserPublic = Depends(get_current_user)
) -> MetaAccountResponse:
    patch = body.model_dump(exclude_unset=True)
    make_default = patch.pop("is_default", None)
    acct = update_meta_account(user.id, account_id, patch)
    if acct is None:
        raise HTTPException(status_code=404, detail="Compte introuvable.")
    if make_default:
        acct = set_default_meta_account(user.id, account_id) or acct
    return _mask_account(acct)


@app.delete("/meta/accounts/{account_id}")
def route_delete_account(
    account_id: str, user: UserPublic = Depends(get_current_user)
) -> dict:
    delete_meta_account(user.id, account_id)
    return {"ok": True}


@app.post("/meta/accounts/{account_id}/test", response_model=MetaTestResponse)
def route_test_account(
    account_id: str, user: UserPublic = Depends(get_current_user)
) -> MetaTestResponse:
    acct = get_meta_account(user.id, account_id)
    if not acct or not acct.get("meta_access_token") or not acct.get("meta_ad_account_id"):
        return MetaTestResponse(ok=False, error="Token ou Ad Account ID manquant.")
    ok, info = test_connection(acct["meta_access_token"], acct["meta_ad_account_id"])
    if ok:
        return MetaTestResponse(ok=True, account_name=info)
    return MetaTestResponse(ok=False, error=info)


@app.get("/meta/page-info")
def route_meta_page_info(
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> dict:
    settings = _resolve_account(user.id, account_id, need_page=True)
    try:
        info = meta_pages.get_page_info(settings["meta_page_id"], settings["meta_access_token"])
    except Exception as exc:
        raise _meta_http_error(exc)
    return {
        "name": info.get("name"),
        "category": info.get("category"),
        "fan_count": info.get("fan_count"),
        "followers_count": info.get("followers_count"),
        "link": info.get("link"),
        "picture_url": info.get("picture_url"),
        "about": info.get("about"),
        "website": info.get("website"),
    }


@app.get("/meta/page-insights")
def route_meta_page_insights(
    days: int = Query(28, ge=1, le=90),
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> dict:
    settings = _resolve_account(user.id, account_id, need_page=True)
    try:
        stats = meta_pages.get_page_insights(
            settings["meta_page_id"], settings["meta_access_token"], days=days
        )
    except Exception as exc:
        raise _meta_http_error(exc)
    return {"days": days, **stats}


@app.get("/meta/page-posts", response_model=list[PagePost])
def route_meta_page_posts(
    limit: int = Query(10, ge=1, le=25),
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> list[PagePost]:
    settings = _resolve_account(user.id, account_id, need_page=True)
    try:
        posts = meta_pages.list_page_posts(
            settings["meta_page_id"], settings["meta_access_token"], limit=limit
        )
    except Exception as exc:
        raise _meta_http_error(exc)
    return [PagePost(**p) for p in posts]


@app.get("/meta/page-summary", response_model=PageSummaryResponse)
def route_meta_page_summary(
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> PageSummaryResponse:
    settings = _resolve_account(user.id, account_id, need_page=True)
    try:
        summary = meta_pages.get_page_post_summary(
            settings["meta_page_id"], settings["meta_access_token"], limit=50
        )
    except Exception as exc:
        raise _meta_http_error(exc)
    # Page-level reach (total / organic / paid) — best-effort, never blocks the
    # rest of the page (returns zeros if Meta deprecated the metric).
    try:
        stats = meta_pages.get_page_insights(
            settings["meta_page_id"], settings["meta_access_token"], days=28
        )
        summary["reach_total"] = stats.get("reach_total", 0)
        summary["reach_organic"] = stats.get("reach_organic", 0)
        summary["reach_paid"] = stats.get("reach_paid", 0)
    except Exception:
        logger.warning("page-summary reach metrics unavailable", exc_info=True)
    return PageSummaryResponse(**summary)


@app.get("/meta/page-engagement-debug")
def route_meta_page_engagement_debug(
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> dict:
    """Endpoint de diagnostic : remonte la VRAIE cause de l'absence d'engagement
    (token de page non résolu, scope manquant, token expiré…) au lieu du faux
    message « App Review ». Affiche /me/accounts (la page cible a-t-elle un token ?)
    et la sonde brute /{page}/posts avec le message Meta exact (code/subcode)."""
    settings = _resolve_account(user.id, account_id, need_page=True)
    try:
        return meta_pages.diagnose_page_engagement(
            settings["meta_page_id"], settings["meta_access_token"]
        )
    except Exception as exc:
        raise _meta_http_error(exc)


@app.post("/meta/page-posts")
async def route_create_page_post(
    message: str = Form(""),
    link: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    video: Optional[UploadFile] = File(None),
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> dict:
    """Publie un post sur la page Facebook de l'utilisateur (texte, lien, photo ou
    vidéo + légende). La publication est immédiate et irréversible.
    Précédence du média : vidéo > image > texte."""
    settings = _resolve_account(user.id, account_id, need_page=True)
    message = (message or "").strip()
    link = (link or "").strip() or None

    video_data = await video.read() if video is not None else b""
    if video_data and len(video_data) > 200 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Vidéo trop lourde (>200 Mo).")
    image_data = await image.read() if image is not None else b""
    if image_data and len(image_data) > 30 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image trop lourde (>30 Mo).")
    if not message and not image_data and not video_data:
        raise HTTPException(status_code=400, detail="Un message, une image ou une vidéo est requis.")

    try:
        if video_data:
            result = meta_pages.create_page_video_post(
                settings["meta_page_id"],
                settings["meta_access_token"],
                video_data,
                message=message or None,
                filename=video.filename or "video.mp4",
            )
        elif image_data:
            result = meta_pages.create_page_photo_post(
                settings["meta_page_id"],
                settings["meta_access_token"],
                image_data,
                message=message or None,
                filename=image.filename or "upload.jpg",
            )
        else:
            result = meta_pages.create_page_post(
                settings["meta_page_id"],
                settings["meta_access_token"],
                message,
                link=link,
            )
    except Exception as exc:
        raise _meta_http_error(exc)

    post_id = result.get("post_id") or result.get("id")
    return {"ok": True, "post_id": post_id}


# ─── Posts planifiés (Schedule) ──────────────────────────────────────────────
def _merge_scheduled_posts(live: list[dict], records: list[dict]) -> list[dict]:
    """Fusionne les posts live Meta avec l'historique persisté (table scheduled_posts).

    Meta retire un post de l'arête `scheduled_posts` dès publication → on s'appuie
    sur la base pour ne pas perdre l'historique. Pour un post enregistré absent du
    live ET dont la date est passée : il a été publié → status='published' (grisé).
    """
    now = datetime.now(timezone.utc)
    by_id: dict[str, dict] = {}
    for p in live:
        if p.get("id"):
            by_id[str(p["id"])] = p

    for r in records:
        mid = r.get("meta_post_id")
        if mid and str(mid) in by_id:
            continue  # Meta est autoritaire sur les posts encore présents
        # Post connu de la base mais absent du live Meta.
        sched = r.get("scheduled_time")
        try:
            is_past = bool(sched) and datetime.fromisoformat(
                str(sched).replace("Z", "+00:00")
            ) <= now
        except (ValueError, TypeError):
            is_past = False
        # Une planification passée et disparue du live = publiée par Meta.
        status = "published" if (is_past or r.get("status") == "published") else "scheduled"
        if status == "published" and r.get("status") != "published" and mid:
            set_scheduled_post_status(str(mid), "published")  # persiste la transition
        synth = {
            "id": str(mid) if mid else f"local-{r.get('id')}",
            "message": r.get("message") or "",
            "type": r.get("type") or "text",
            "scheduled_time": sched,
            "created_time": r.get("created_at"),
            "permalink_url": None,
            "full_picture": r.get("full_picture"),
            "status": status,
        }
        by_id[synth["id"]] = synth

    merged = list(by_id.values())
    merged.sort(key=lambda p: p.get("scheduled_time") or "")
    return merged


@app.get("/meta/scheduled-posts", response_model=ScheduledPostsResponse)
def route_list_scheduled_posts(
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> ScheduledPostsResponse:
    settings = _resolve_account(user.id, account_id, need_page=True)
    try:
        posts, reason = meta_pages.list_scheduled_posts(
            settings["meta_page_id"], settings["meta_access_token"]
        )
    except Exception as exc:
        raise _meta_http_error(exc)
    # `scheduled_posts` renvoie une liste vide SANS erreur quand pages_manage_posts
    # manque → on lève l'avertissement explicitement pour ne pas laisser un calendrier
    # vide silencieux (cause du post orphelin non supprimable).
    if not reason:
        scopes = meta_pages.list_token_scopes(settings["meta_access_token"])
        if scopes and "pages_manage_posts" not in scopes:
            reason = meta_pages.MANAGE_POSTS_MISSING
    # Fusion avec l'historique persisté : les posts déjà publiés restent visibles.
    records = list_scheduled_post_records(user.id, settings["meta_page_id"])
    posts = _merge_scheduled_posts(posts, records)
    return ScheduledPostsResponse(posts=[ScheduledPost(**p) for p in posts], blocked_reason=reason)


@app.post("/meta/scheduled-posts")
async def route_create_scheduled_post(
    scheduled_time: str = Form(...),  # ISO 8601 ou epoch (secondes)
    message: str = Form(""),
    link: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    video: Optional[UploadFile] = File(None),
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> dict:
    """Planifie un post (texte/lien/photo/vidéo) publié automatiquement par Meta.
    Précédence du média : vidéo > image > texte."""
    settings = _resolve_account(user.id, account_id, need_page=True)
    message = (message or "").strip()
    link = (link or "").strip() or None

    # Accepte un timestamp epoch (secondes) ou une date ISO 8601.
    raw = (scheduled_time or "").strip()
    try:
        ts = int(float(raw)) if raw.replace(".", "", 1).isdigit() else int(
            datetime.fromisoformat(raw.replace("Z", "+00:00")).timestamp()
        )
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Date de planification invalide.")

    if ts < int(time.time()) + 10 * 60:
        raise HTTPException(
            status_code=400,
            detail="La planification doit être au moins 10 minutes dans le futur (contrainte Meta).",
        )

    video_data = await video.read() if video is not None else b""
    if video_data and len(video_data) > 200 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Vidéo trop lourde (>200 Mo).")
    image_data = await image.read() if image is not None else b""
    if image_data and len(image_data) > 30 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image trop lourde (>30 Mo).")
    if not message and not image_data and not video_data:
        raise HTTPException(status_code=400, detail="Un message, une image ou une vidéo est requis.")

    # Garde-fou : sans `pages_manage_posts`, un upload « réussit » mais produit un
    # média non publié orphelin (invisible dans scheduled_posts, non supprimable).
    # On refuse proprement AVANT de créer cet orphelin.
    try:
        meta_pages.ensure_can_manage_posts(settings["meta_access_token"])
    except meta_pages.GraphError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        result = meta_pages.create_scheduled_post(
            settings["meta_page_id"],
            settings["meta_access_token"],
            message,
            ts,
            link=link,
            image_bytes=image_data or None,
            video_bytes=video_data or None,
            filename=(video.filename if video else None) or (image.filename if image else None) or "upload",
        )
    except Exception as exc:
        raise _meta_http_error(exc)
    post_id = result.get("post_id") or result.get("id")
    # Persiste la planification pour que l'historique survive à la publication.
    post_type = "video" if video_data else "image" if image_data else "link" if link else "text"
    create_scheduled_post_record(
        user.id,
        settings["meta_page_id"],
        meta_post_id=str(post_id) if post_id else None,
        scheduled_time=datetime.fromtimestamp(ts, tz=timezone.utc).isoformat(),
        post_type=post_type,
        message=message,
        link=link,
        account_id=settings.get("id"),
    )
    return {"ok": True, "post_id": post_id}


@app.post("/meta/scheduled-posts/{post_id}/publish")
def route_publish_scheduled_post(
    post_id: str,
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> dict:
    settings = _resolve_account(user.id, account_id, need_page=True)
    try:
        meta_pages.publish_scheduled_post(post_id, settings["meta_access_token"], settings["meta_page_id"])
    except Exception as exc:
        raise _meta_http_error(exc)
    set_scheduled_post_status(post_id, "published")  # garde l'historique grisé
    return {"ok": True}


@app.delete("/meta/scheduled-posts/{post_id}")
def route_delete_scheduled_post(
    post_id: str,
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> dict:
    settings = _resolve_account(user.id, account_id, need_page=True)
    # Message clair si le scope manque (sinon Meta renvoie un subcode 33 cryptique).
    try:
        meta_pages.ensure_can_manage_posts(settings["meta_access_token"])
    except meta_pages.GraphError as exc:
        # On retire quand même de NOTRE calendrier (le post côté Meta reste un
        # orphelin non supprimable tant que le scope n'est pas accordé).
        set_scheduled_post_status(post_id, "deleted")
        raise HTTPException(status_code=400, detail=str(exc))
    try:
        meta_pages.delete_scheduled_post(post_id, settings["meta_access_token"], settings["meta_page_id"])
    except Exception as exc:
        raise _meta_http_error(exc)
    set_scheduled_post_status(post_id, "deleted")  # retiré de l'historique
    return {"ok": True}


@app.get("/meta/campaigns/{campaign_id}/detail", response_model=CampaignDetailResponse)
def route_meta_campaign_detail(
    campaign_id: str,
    date_preset: str = Query("last_30d"),
    since: Optional[str] = Query(None),
    until: Optional[str] = Query(None),
    # `section` = onglet demandé (adsets|ads|demographics|placements). Le frontend
    # charge un onglet à la fois → ~2 appels Meta au lieu de 6 par ouverture, ce
    # qui évite le "User request limit reached". Absent = tout (compat).
    section: Optional[str] = Query(None),
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> CampaignDetailResponse:
    settings = _resolve_account(user.id, account_id, need_account=True)
    out: dict = {"adsets": [], "ads": [], "demographics": [], "placements": []}
    # Onglets adsets/ads → cache Supabase (instantané). Démographie/placements →
    # live Meta (chargés à la demande au clic, breakdowns non synchronisés par
    # campagne — cf. plan « Hors scope »).
    try:
        days, all_time = _preset_to_days(date_preset)
        start, end, _, _ = dashboard.resolve_window(days, all_time, since, until)
        if section in (None, "adsets"):
            out["adsets"] = dashboard.campaign_adsets(settings["meta_ad_account_id"], campaign_id, start, end)
        if section in (None, "ads"):
            out["ads"] = dashboard.campaign_ads(settings["meta_ad_account_id"], campaign_id, start, end)
        if section in (None, "demographics", "placements"):
            live = get_campaign_detail(
                settings["meta_access_token"], campaign_id,
                date_preset=date_preset, since=since, until=until,
                section=section if section in ("demographics", "placements") else None,
            )
            out["demographics"] = live.get("demographics", [])
            out["placements"] = live.get("placements", [])
    except Exception as exc:
        raise _meta_http_error(exc)
    return CampaignDetailResponse(**out)


@app.get("/meta/audiences", response_model=list[AudienceSummary])
def route_meta_audiences(
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> list[AudienceSummary]:
    settings = _resolve_account(user.id, account_id, need_account=True)
    try:
        auds = list_custom_audiences(
            settings["meta_access_token"], settings["meta_ad_account_id"]
        )
    except Exception as exc:
        raise _meta_http_error(exc)
    return [AudienceSummary(**a) for a in auds]


@app.get("/meta/audience-reach", response_model=AudienceReachResponse)
def route_meta_audience_reach(
    days: int = Query(30, ge=1, le=90),
    period: Optional[str] = Query(None),
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> AudienceReachResponse:
    settings = _resolve_account(user.id, account_id, need_account=True)
    all_time = (period or "").lower() == "all"
    try:
        reach = dashboard.get_audience_reach(settings["meta_ad_account_id"], days=days, all_time=all_time)
    except Exception as exc:
        raise _meta_http_error(exc)
    return AudienceReachResponse(**reach)


@app.get("/meta/campaigns", response_model=list[CampaignSummary])
def route_meta_campaigns(
    date_preset: str = Query("last_30d"),
    since: Optional[str] = Query(None),
    until: Optional[str] = Query(None),
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> list[CampaignSummary]:
    settings = _resolve_account(user.id, account_id, need_account=True)
    days, all_time = _preset_to_days(date_preset)
    try:
        rows = dashboard.list_campaigns(
            settings["meta_ad_account_id"], days=days, all_time=all_time, since=since, until=until,
        )
    except Exception as exc:
        raise _meta_http_error(exc)
    return [CampaignSummary(**r) for r in rows]


@app.patch("/meta/campaigns/{campaign_id}/status")
def route_update_campaign_status(
    campaign_id: str,
    body: CampaignStatusUpdate,
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> dict:
    """Active (ACTIVE) ou met en pause (PAUSED) une campagne Meta. Met aussi à jour
    le cache (fb_campaigns) pour un affichage immédiat dans la liste."""
    settings = _resolve_account(user.id, account_id, need_account=True)
    ok, msg = set_campaign_status(settings["meta_access_token"], campaign_id, body.status)
    if not ok:
        raise HTTPException(status_code=502, detail=msg)
    update_fb_campaign_status(campaign_id, body.status)
    return {"ok": True, "status": body.status}


@app.get("/meta/dashboard", response_model=DashboardResponse)
def route_meta_dashboard(
    days: int = Query(30, ge=1, le=90),
    period: Optional[str] = Query(None),
    since: Optional[str] = Query(None),
    until: Optional[str] = Query(None),
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> DashboardResponse:
    settings = _resolve_account(user.id, account_id, need_account=True)
    all_time = (period or "").lower() == "all"
    try:
        data = dashboard.get_account_dashboard(
            settings["meta_ad_account_id"], days=days, all_time=all_time, since=since, until=until,
        )
    except Exception as exc:
        raise _meta_http_error(exc)

    kpi_row = data.get("kpi_row") or {}

    def _f(v, default=0.0):
        try:
            return float(v) if v not in (None, "") else default
        except (TypeError, ValueError):
            return default

    def _i(v, default=0):
        try:
            return int(float(v)) if v not in (None, "") else default
        except (TypeError, ValueError):
            return default

    impressions = _i(kpi_row.get("impressions"))
    clicks = _i(kpi_row.get("clicks"))
    spend = _f(kpi_row.get("spend"))
    reach = _i(kpi_row.get("reach"))
    ctr = _f(kpi_row.get("ctr"))
    cpc = _f(kpi_row.get("cpc"))
    cpm = _f(kpi_row.get("cpm"))

    def fmt_int(n: int) -> str:
        if n >= 1_000_000:
            return f"{n/1_000_000:.1f}M"
        if n >= 1_000:
            return f"{n/1_000:.1f}K"
        return f"{n}"

    revenue = _f(data.get("revenue"))
    roas = _f(data.get("roas"))
    profit = _f(data.get("profit"))
    leads = _i(data.get("leads"))
    cost_per_lead = _f(data.get("cost_per_lead"))
    conv_rate = _f(data.get("conv_rate"))
    profile = data.get("conversion_profile") or "none"

    ch = data.get("changes") or {}

    # Cartes « résultat » ADAPTATIVES selon le profil réel du compte (aucun chiffre
    # inventé — on n'affiche que ce que Meta remonte) :
    #   • sales → Revenue / ROAS / Profit
    #   • leads → Leads / Coût par lead / Taux de conversion
    #   • none  → Revenue / ROAS / Profit en "—" (aucune conversion trackée)
    if profile == "leads":
        outcome_kpis = [
            DashboardKpi(label="Leads", value=fmt_int(leads), raw=float(leads), change=ch.get("leads")),
            DashboardKpi(label="Coût / lead", value=f"${cost_per_lead:,.2f}", raw=cost_per_lead),
            DashboardKpi(label="Taux conv.", value=f"{conv_rate:.2f}%", raw=conv_rate),
        ]
    else:
        has_revenue = profile == "sales"
        outcome_kpis = [
            DashboardKpi(label="Revenue", value=f"${revenue:,.2f}" if has_revenue else "—", raw=revenue, change=ch.get("revenue")),
            DashboardKpi(label="ROAS", value=f"{roas:.2f}x" if has_revenue else "—", raw=roas),
            DashboardKpi(label="Profit", value=f"${profit:,.2f}" if has_revenue else "—", raw=profit),
        ]

    kpis = [
        DashboardKpi(label="Impressions", value=fmt_int(impressions), raw=impressions, change=ch.get("impressions")),
        DashboardKpi(label="Clicks", value=fmt_int(clicks), raw=clicks, change=ch.get("clicks")),
        DashboardKpi(label="Reach", value=fmt_int(reach), raw=reach, change=ch.get("reach")),
        DashboardKpi(label="Spend", value=f"${spend:,.2f}", raw=spend, change=ch.get("spend")),
        *outcome_kpis,
        DashboardKpi(label="CTR", value=f"{ctr:.2f}%", raw=ctr, change=ch.get("ctr")),
        DashboardKpi(label="CPC", value=f"${cpc:.2f}", raw=cpc, change=ch.get("cpc")),
        DashboardKpi(label="CPM", value=f"${cpm:.2f}", raw=cpm, change=ch.get("cpm")),
    ]

    series = [DashboardSeriesPoint(**p) for p in data.get("series", [])]
    age = data.get("age_breakdown") or []
    gender = data.get("gender_breakdown") or []
    geo = data.get("geo_breakdown") or []

    # Top 5 campaigns by real performance over the SAME window as the KPIs above:
    # conversions, then ROAS, then CTR, then spend (a campaign that improves its
    # results climbs automatically). Optional — ignore errors silently.
    top: list[CampaignSummary] = []
    try:
        camps = dashboard.list_campaigns(
            settings["meta_ad_account_id"], days=days, all_time=all_time, since=since, until=until,
        )
        camps.sort(
            key=lambda c: (
                c.get("conversions", 0),
                c.get("roas", 0.0),
                c.get("ctr", 0.0),
                c.get("spend", 0.0),
            ),
            reverse=True,
        )
        top = [CampaignSummary(**c) for c in camps[:5]]
    except Exception:
        pass

    return DashboardResponse(
        days=days,
        kpis=kpis,
        series=series,
        age_breakdown=age,
        gender_breakdown=gender,
        geo_breakdown=geo,
        top_campaigns=top,
    )


@app.get("/meta/search", response_model=SearchResponse)
def route_meta_search(
    q: str = Query(..., min_length=1),
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> SearchResponse:
    settings = get_meta_account(user.id, account_id) or {}
    needle = q.strip().lower()
    results: list[SearchResultItem] = []

    # Campaigns
    if settings.get("meta_access_token") and settings.get("meta_ad_account_id"):
        try:
            camps = list_campaigns_with_insights(
                settings["meta_access_token"],
                settings["meta_ad_account_id"],
                date_preset="last_30d",
            )
            for c in camps:
                name = (c.get("name") or "").strip()
                if needle in name.lower():
                    results.append(
                        SearchResultItem(
                            kind="campaign",
                            id=str(c.get("id")),
                            title=name,
                            subtitle=f"{c.get('objective','?')} · {c.get('status','?')}",
                        )
                    )
        except Exception:
            pass

    # Posts + Page
    if settings.get("meta_access_token") and settings.get("meta_page_id"):
        try:
            posts = meta_pages.list_page_posts(
                settings["meta_page_id"], settings["meta_access_token"], limit=25
            )
            for p in posts:
                msg = (p.get("message") or "").strip()
                if needle in msg.lower():
                    results.append(
                        SearchResultItem(
                            kind="post",
                            id=str(p.get("id")),
                            title=msg[:80] + ("…" if len(msg) > 80 else ""),
                            subtitle=p.get("created_time"),
                            url=p.get("permalink_url"),
                        )
                    )
        except Exception:
            pass

        try:
            info = meta_pages.get_page_info(
                settings["meta_page_id"], settings["meta_access_token"]
            )
            name = (info.get("name") or "").strip()
            if needle in name.lower():
                results.insert(
                    0,
                    SearchResultItem(
                        kind="page",
                        id=str(settings["meta_page_id"]),
                        title=name,
                        subtitle=info.get("category"),
                        url=info.get("link"),
                    ),
                )
        except Exception:
            pass

    return SearchResponse(query=q, results=results[:30])


@app.post("/settings/test", response_model=MetaTestResponse)
def route_test_settings(user: UserPublic = Depends(get_current_user)) -> MetaTestResponse:
    settings = get_user_settings(user.id)
    if not settings or not settings.get("meta_access_token") or not settings.get("meta_ad_account_id"):
        return MetaTestResponse(ok=False, error="Token ou Ad Account ID manquant.")
    ok, info = test_connection(settings["meta_access_token"], settings["meta_ad_account_id"])
    if ok:
        return MetaTestResponse(ok=True, account_name=info)
    return MetaTestResponse(ok=False, error=info)


# ─── Sync (cache analytics Meta → Supabase) ──────────────────────────────────


def _sync_status(acct: dict) -> SyncStatusResponse:
    # Le cache (et fb_sync_state) est keyé par ad account ; l'API reste exprimée
    # en row id meta_accounts (ce que sélectionne l'UI) → on mappe ici.
    state = db_get_fb_sync_state(acct.get("meta_ad_account_id") or "") or {}
    return SyncStatusResponse(
        account_id=acct["id"],
        last_sync_at=state.get("last_sync_at"),
        last_sync_status=state.get("last_sync_status"),
        last_error=state.get("last_error"),
        insights_synced_until=(
            str(state["insights_synced_until"]) if state.get("insights_synced_until") else None
        ),
        running=state.get("last_sync_status") == "running",
    )


@app.post("/api/sync/{account_id}", response_model=SyncStatusResponse)
async def route_sync_account(
    account_id: str, user: UserPublic = Depends(get_current_user)
) -> SyncStatusResponse:
    """Force un sync immédiat du compte (bouton « Refresh » de l'UI / debug).
    Le SDK Meta étant bloquant, on l'exécute dans un thread."""
    acct = get_meta_account(user.id, account_id)
    if not acct or not acct.get("meta_access_token") or not acct.get("meta_ad_account_id"):
        raise HTTPException(status_code=400, detail="Compte Meta non configuré (token + ad account requis).")
    try:
        await asyncio.to_thread(facebook_sync.sync_account, acct)
    except Exception as exc:
        logger.exception("manual sync failed for account %s", acct["id"])
        # Enregistre l'état d'erreur + détecte un token expiré (alerte UI), puis 502.
        await asyncio.to_thread(facebook_sync.record_sync_error, acct, exc)
        raise HTTPException(status_code=502, detail=f"Sync échoué : {exc}")
    return _sync_status(acct)


@app.get("/api/sync/status", response_model=SyncStatusResponse)
def route_sync_status(
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> SyncStatusResponse:
    acct = get_meta_account(user.id, account_id)
    if not acct:
        raise HTTPException(status_code=404, detail="Aucun compte Meta.")
    return _sync_status(acct)


# ─── Conversations ───────────────────────────────────────────────────────────


@app.get("/conversations", response_model=list[ConversationSummary])
def route_list_conversations(
    user: UserPublic = Depends(get_current_user),
) -> list[ConversationSummary]:
    rows = list_conversations(user.id)
    return [
        ConversationSummary(
            id=r["id"],
            title=r.get("title"),
            created_at=r["created_at"],
            updated_at=r.get("updated_at"),
        )
        for r in rows
    ]


@app.post("/conversations", response_model=ConversationSummary)
def route_create_conversation(
    user: UserPublic = Depends(get_current_user),
) -> ConversationSummary:
    conv_id = create_conversation(user.id)
    conv = get_conversation(conv_id, user.id)
    return ConversationSummary(
        id=conv["id"],
        title=conv.get("title"),
        created_at=conv["created_at"],
        updated_at=conv.get("updated_at"),
    )


@app.get("/conversations/{conversation_id}/messages", response_model=list[MessageOut])
def route_get_messages(
    conversation_id: str, user: UserPublic = Depends(get_current_user)
) -> list[MessageOut]:
    conv = get_conversation(conversation_id, user.id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    rows = load_messages(conversation_id)
    return [
        MessageOut(
            id=r["id"],
            role=r["role"],
            content=r["content"],
            created_at=r["created_at"],
            metadata=r.get("metadata") or {},
        )
        for r in rows
    ]


# ─── Chat ────────────────────────────────────────────────────────────────────


@app.post("/chat/upload-image", response_model=ChatImageUploadResponse)
async def route_chat_upload_image(
    file: UploadFile = File(...),
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> ChatImageUploadResponse:
    settings = _resolve_account(user.id, account_id, need_account=True)
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file.")
    if len(data) > 30 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (>30 MB).")
    image_hash, err = upload_image_bytes(
        settings["meta_access_token"], settings["meta_ad_account_id"], data
    )
    if err:
        return ChatImageUploadResponse(image_hash="", error=err)
    return ChatImageUploadResponse(image_hash=image_hash or "")


@app.post("/chat/upload-video", response_model=ChatVideoUploadResponse)
async def route_chat_upload_video(
    file: UploadFile = File(...),
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> ChatVideoUploadResponse:
    settings = _resolve_account(user.id, account_id, need_account=True)
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file.")
    if len(data) > 200 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (>200 MB).")
    video_id, err = upload_video_bytes(
        settings["meta_access_token"], settings["meta_ad_account_id"], data, file.filename or "video.mp4"
    )
    if err:
        return ChatVideoUploadResponse(video_id="", error=err)
    return ChatVideoUploadResponse(video_id=video_id or "")


@app.get("/chat/campaign-questionnaire", response_model=CampaignQuestionnaire)
def route_campaign_questionnaire(
    user: UserPublic = Depends(get_current_user),
) -> CampaignQuestionnaire:
    """QCM de création de campagne en JSON. Déterministe — utilisé par le bouton
    « Créer une campagne » du chat (affichage garanti, sans appel LLM)."""
    return build_campaign_questionnaire()


# Réponse courte (sans markdown) qui accompagne l'affichage du QCM.
_QCM_REPLY = (
    "J'affiche un questionnaire pour cadrer ta campagne. "
    "Réponds aux questions ci-dessous puis valide pour que je prépare ton brief."
)


@app.post("/chat", response_model=ChatResponse)
def route_chat(body: ChatRequest, user: UserPublic = Depends(get_current_user)) -> ChatResponse:
    # Garde-fou anti-rafale (review §5.7) : borne les messages par utilisateur
    # pour éviter qu'un agent en boucle ne sature /chat (et crée des campagnes
    # en série). 30 messages / minute.
    if not check_rate_limit(user.id, "chat", limit=30, window_s=60):
        raise HTTPException(
            status_code=429,
            detail="Trop de messages en peu de temps. Réessaie dans une minute.",
        )

    # L'agent agit sur le compte sélectionné dans l'UI (multi-clés).
    settings = get_meta_account(user.id, body.account_id)

    if body.conversation_id:
        conv = get_conversation(body.conversation_id, user.id)
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
        conversation_id = body.conversation_id
    else:
        title = body.message[:60] + ("…" if len(body.message) > 60 else "")
        conversation_id = create_conversation(user.id, title=title or "Nouvelle conversation")

    # If the user attached an image, prepend a system-style note so the agent
    # knows it can reuse the hash directly when creating a campaign.
    user_message = body.message
    if body.attached_image_hash:
        user_message = (
            f"[Image jointe par l'utilisateur — image_hash={body.attached_image_hash}]\n\n"
            + user_message
        )

    history = load_messages(conversation_id)
    save_message(
        conversation_id,
        user.id,
        "user",
        body.message,
        {"image_hash": body.attached_image_hash} if body.attached_image_hash else {},
    )

    # Court-circuit déterministe : si l'utilisateur veut créer une campagne (et
    # n'est pas en train de soumettre ses réponses au QCM), on renvoie le QCM en
    # JSON directement — sans dépendre du tool-calling du LLM (peu fiable ici).
    is_questionnaire_answer = body.message.lstrip().startswith("[Réponses au questionnaire")
    if wants_campaign_creation(body.message) and not is_questionnaire_answer:
        questionnaire = build_campaign_questionnaire()
        save_message(
            conversation_id,
            user.id,
            "assistant",
            _QCM_REPLY,
            {"structured": questionnaire.model_dump()},
        )
        touch_conversation(conversation_id)
        return ChatResponse(
            conversation_id=conversation_id,
            reply=_QCM_REPLY,
            tool_calls=[],
            structured=questionnaire,
        )

    lc_history = history_to_lc_messages(history)
    from langchain_core.messages import HumanMessage

    lc_history.append(HumanMessage(content=user_message))

    graph, persist = build_agent(settings)
    start = time.time()
    try:
        result = graph.invoke(
            {"messages": lc_history},
            config={"recursion_limit": 8},
        )
    except FacebookRequestError as exc:
        err = (
            f"Erreur Meta : {exc.api_error_message() or exc} "
            f"(code={exc.api_error_code()}, subcode={exc.api_error_subcode()})"
        )
        logger.warning("Meta API error in /chat: %s", err)
        save_message(conversation_id, user.id, "assistant", err, {"error": True})
        touch_conversation(conversation_id)
        return ChatResponse(conversation_id=conversation_id, reply=err, tool_calls=[])
    except Exception as exc:
        err = f"Erreur agent : {exc}"
        logger.exception("Unhandled error in /chat")
        save_message(conversation_id, user.id, "assistant", err, {"error": True})
        touch_conversation(conversation_id)
        raise HTTPException(status_code=500, detail=err)
    duration_ms = int((time.time() - start) * 1000)

    result_messages = result.get("messages", [])
    reply = extract_final_reply(result_messages)
    tool_calls_raw = extract_tool_calls(result_messages)

    # Detect structured output emitted by emit_* tools.
    structured: Optional[StructuredOutput] = None
    last_created = persist.get("last_created") if persist else None
    # Une campagne vient d'être créée → la carte de confirmation PAUSED prime sur
    # tout le reste (review §5.4 : mettre en avant le garde-fou sécurité).
    if last_created:
        try:
            structured = CampaignCreated(
                campaign_id=last_created["campaign_id"],
                adset_id=last_created.get("adset_id"),
                ad_id=last_created.get("ad_id"),
                name=last_created["name"],
                objective=last_created.get("objective"),
                daily_budget=last_created.get("daily_budget"),
            )
        except Exception:
            structured = None
    if structured is None and persist.get("last_brief"):
        from backend.schemas import CampaignBrief

        try:
            structured = CampaignBrief(**persist["last_brief"])
        except Exception:
            structured = None
    if persist.get("last_insight"):
        from backend.schemas import InsightAnswer

        try:
            # If both are present, brief takes precedence (user asked to create).
            if structured is None:
                structured = InsightAnswer(**persist["last_insight"])
        except Exception:
            pass
    if persist.get("last_questionnaire"):
        from backend.schemas import CampaignQuestionnaire

        try:
            # Le brief (création confirmée) prime toujours sur le QCM (cadrage).
            if structured is None:
                structured = CampaignQuestionnaire(**persist["last_questionnaire"])
        except Exception:
            pass

    msg_meta: dict = {}
    if tool_calls_raw:
        msg_meta["tool_calls"] = tool_calls_raw
    if structured is not None:
        msg_meta["structured"] = structured.model_dump()

    save_message(conversation_id, user.id, "assistant", reply, msg_meta)

    for tc in tool_calls_raw:
        log_tool_call(
            user.id,
            conversation_id,
            tc["name"],
            {},
            tc.get("output") or "",
            tc["status"],
            duration_ms,
        )

    # Audit trail de création (review §5.2) : on persiste le SUCCÈS comme l'ÉCHEC.
    if last_created:
        try:
            save_campaign_tree(
                user_id=user.id,
                campaign_meta_id=last_created["campaign_id"],
                name=last_created["name"],
                objective=last_created["objective"],
                daily_budget=last_created.get("daily_budget"),
                adset_meta_id=last_created.get("adset_id"),
                adset_name=f"{last_created['name']} - AdSet",
                optimization_goal=last_created.get("optimization_goal", "LINK_CLICKS"),
                billing_event="IMPRESSIONS",
                targeting=last_created.get("targeting"),
                ad_meta_id=last_created.get("ad_id"),
                ad_name=f"{last_created['name']} - Ad",
                creative_id=last_created.get("creative_id"),
                request_id=last_created.get("request_id"),
            )
        except Exception:
            logger.exception("save_campaign_tree failed")
    else:
        last_error = persist.get("last_error") if persist else None
        if last_error:
            campaign_name = last_error.get("name", "(campagne sans nom)")
            save_campaign_failure(
                user_id=user.id,
                name=campaign_name,
                objective=last_error.get("objective"),
                daily_budget=last_error.get("daily_budget"),
                error_log=last_error.get("error_message", ""),
                stage=last_error.get("stage"),
                request_id=last_error.get("request_id"),
            )
            notifications.create_notification(
                user.id,
                "campaign_failed",
                f"Échec de création : {campaign_name}",
                last_error.get("error_message") or "La création de la campagne a échoué.",
            )

    touch_conversation(conversation_id)

    return ChatResponse(
        conversation_id=conversation_id,
        reply=reply,
        tool_calls=[ToolCallInfo(**tc) for tc in tool_calls_raw],
        structured=structured,
    )
