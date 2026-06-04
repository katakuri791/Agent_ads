import logging
import socket
import time
from typing import Optional

import requests
from facebook_business.exceptions import FacebookRequestError
from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from backend.agent import (
    build_agent,
    extract_final_reply,
    extract_tool_calls,
    history_to_lc_messages,
)
from backend.auth import (
    get_current_user,
    login as auth_login,
    signup as auth_signup,
    update_user_profile,
)
from backend.config import CORS_ORIGINS
from backend.db import (
    create_conversation,
    get_conversation,
    get_user_settings,
    list_conversations,
    load_messages,
    log_tool_call,
    save_campaign_tree,
    save_message,
    touch_conversation,
    upsert_user_settings,
)
from backend import meta_pages
from backend.meta_tools import (
    _exact_windows,
    get_account_audience_reach,
    get_account_dashboard,
    get_campaign_detail,
    list_campaigns_with_insights,
    list_custom_audiences,
    test_connection,
    upload_image_bytes,
)
from backend.schemas import (
    AudienceReachResponse,
    AudienceSummary,
    AuthResponse,
    CampaignDetailResponse,
    CampaignSummary,
    ChatImageUploadResponse,
    ChatRequest,
    ChatResponse,
    ConversationSummary,
    DashboardKpi,
    DashboardResponse,
    DashboardSeriesPoint,
    LoginRequest,
    MessageOut,
    MetaSettingsRequest,
    MetaSettingsResponse,
    MetaTestResponse,
    PagePost,
    PageSummaryResponse,
    SearchResponse,
    SearchResultItem,
    SignupRequest,
    StructuredOutput,
    ToolCallInfo,
    UserPublic,
    UserUpdateRequest,
)

logger = logging.getLogger("metainsight")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

app = FastAPI(title="MetaInsight Agent API")

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
    token, user = auth_signup(body.email, body.password, body.full_name)
    return AuthResponse(access_token=token, user=user)


@app.post("/auth/login", response_model=AuthResponse)
def route_login(body: LoginRequest) -> AuthResponse:
    token, user = auth_login(body.email, body.password)
    return AuthResponse(access_token=token, user=user)


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


def _require_meta_settings(user_id: str, need_account: bool = False, need_page: bool = False) -> dict:
    settings = get_user_settings(user_id)
    if not settings or not settings.get("meta_access_token"):
        raise HTTPException(status_code=400, detail="Meta access token is required.")
    if need_account and not settings.get("meta_ad_account_id"):
        raise HTTPException(status_code=400, detail="Meta ad account id is required.")
    if need_page and not settings.get("meta_page_id"):
        raise HTTPException(status_code=400, detail="Meta page id is required.")
    return settings


@app.get("/meta/page-info")
def route_meta_page_info(user: UserPublic = Depends(get_current_user)) -> dict:
    settings = _require_meta_settings(user.id, need_page=True)
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
    user: UserPublic = Depends(get_current_user),
) -> dict:
    settings = _require_meta_settings(user.id, need_page=True)
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
    user: UserPublic = Depends(get_current_user),
) -> list[PagePost]:
    settings = _require_meta_settings(user.id, need_page=True)
    try:
        posts = meta_pages.list_page_posts(
            settings["meta_page_id"], settings["meta_access_token"], limit=limit
        )
    except Exception as exc:
        raise _meta_http_error(exc)
    return [PagePost(**p) for p in posts]


@app.get("/meta/page-summary", response_model=PageSummaryResponse)
def route_meta_page_summary(
    user: UserPublic = Depends(get_current_user),
) -> PageSummaryResponse:
    settings = _require_meta_settings(user.id, need_page=True)
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


@app.get("/meta/campaigns/{campaign_id}/detail", response_model=CampaignDetailResponse)
def route_meta_campaign_detail(
    campaign_id: str,
    date_preset: str = Query("last_30d"),
    since: Optional[str] = Query(None),
    until: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> CampaignDetailResponse:
    settings = _require_meta_settings(user.id, need_account=True)
    try:
        detail = get_campaign_detail(
            settings["meta_access_token"], campaign_id,
            date_preset=date_preset, since=since, until=until,
        )
    except Exception as exc:
        raise _meta_http_error(exc)
    return CampaignDetailResponse(**detail)


@app.get("/meta/audiences", response_model=list[AudienceSummary])
def route_meta_audiences(
    user: UserPublic = Depends(get_current_user),
) -> list[AudienceSummary]:
    settings = _require_meta_settings(user.id, need_account=True)
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
    user: UserPublic = Depends(get_current_user),
) -> AudienceReachResponse:
    settings = _require_meta_settings(user.id, need_account=True)
    all_time = (period or "").lower() == "all"
    try:
        reach = get_account_audience_reach(
            settings["meta_access_token"], settings["meta_ad_account_id"],
            days=days, all_time=all_time,
        )
    except Exception as exc:
        raise _meta_http_error(exc)
    return AudienceReachResponse(**reach)


@app.get("/meta/campaigns", response_model=list[CampaignSummary])
def route_meta_campaigns(
    date_preset: str = Query("last_30d"),
    since: Optional[str] = Query(None),
    until: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> list[CampaignSummary]:
    settings = _require_meta_settings(user.id, need_account=True)
    try:
        rows = list_campaigns_with_insights(
            settings["meta_access_token"],
            settings["meta_ad_account_id"],
            date_preset=date_preset,
            since=since,
            until=until,
        )
    except Exception as exc:
        raise _meta_http_error(exc)
    return [CampaignSummary(**r) for r in rows]


@app.get("/meta/dashboard", response_model=DashboardResponse)
def route_meta_dashboard(
    days: int = Query(30, ge=1, le=90),
    period: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> DashboardResponse:
    settings = _require_meta_settings(user.id, need_account=True)
    all_time = (period or "").lower() == "all"
    try:
        data = get_account_dashboard(
            settings["meta_access_token"], settings["meta_ad_account_id"],
            days=days, all_time=all_time,
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

    ch = data.get("changes") or {}
    kpis = [
        DashboardKpi(label="Impressions", value=fmt_int(impressions), raw=impressions, change=ch.get("impressions")),
        DashboardKpi(label="Clicks", value=fmt_int(clicks), raw=clicks, change=ch.get("clicks")),
        DashboardKpi(label="Reach", value=fmt_int(reach), raw=reach, change=ch.get("reach")),
        DashboardKpi(label="Spend", value=f"${spend:,.2f}", raw=spend, change=ch.get("spend")),
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
        if all_time:
            camps = list_campaigns_with_insights(
                settings["meta_access_token"],
                settings["meta_ad_account_id"],
                date_preset="maximum",
            )
        else:
            cur_range, _ = _exact_windows(days)
            camps = list_campaigns_with_insights(
                settings["meta_access_token"],
                settings["meta_ad_account_id"],
                since=cur_range["since"],
                until=cur_range["until"],
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
    user: UserPublic = Depends(get_current_user),
) -> SearchResponse:
    settings = get_user_settings(user.id) or {}
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
    user: UserPublic = Depends(get_current_user),
) -> ChatImageUploadResponse:
    settings = _require_meta_settings(user.id, need_account=True)
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


@app.post("/chat", response_model=ChatResponse)
def route_chat(body: ChatRequest, user: UserPublic = Depends(get_current_user)) -> ChatResponse:
    settings = get_user_settings(user.id)

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
    if persist.get("last_brief"):
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

    last_created = persist.get("last_created") if persist else None
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
                optimization_goal="LINK_CLICKS",
                billing_event="IMPRESSIONS",
                targeting=last_created.get("targeting"),
                ad_meta_id=last_created.get("ad_id"),
                ad_name=f"{last_created['name']} - Ad",
                creative_id=last_created.get("creative_id"),
            )
        except Exception as exc:
            print(f"[warn] save_campaign_tree failed: {exc}")

    touch_conversation(conversation_id)

    return ChatResponse(
        conversation_id=conversation_id,
        reply=reply,
        tool_calls=[ToolCallInfo(**tc) for tc in tool_calls_raw],
        structured=structured,
    )
