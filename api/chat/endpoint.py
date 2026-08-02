"""Logique du chat / agent IA (uploads média, questionnaire, conversation agent)."""

import logging
import time
from typing import Optional

from facebook_business.exceptions import FacebookRequestError
from fastapi import HTTPException, UploadFile

from backend import notifications
from backend.agent import (
    build_agent,
    build_campaign_questionnaire,
    extract_final_reply,
    extract_tool_calls,
    history_to_lc_messages,
    wants_campaign_creation,
)
from backend.db import (
    create_conversation,
    get_conversation,
    get_meta_account,
    load_messages,
    log_tool_call,
    save_campaign_failure,
    save_campaign_tree,
    save_message,
    touch_conversation,
)
from backend.meta_tools import upload_image_bytes, upload_video_bytes
from backend.ratelimit import check_rate_limit
from backend.schemas import (
    CampaignCreated,
    CampaignQuestionnaire,
    ChatImageUploadResponse,
    ChatRequest,
    ChatResponse,
    ChatVideoUploadResponse,
    StructuredOutput,
    ToolCallInfo,
    UserPublic,
)
from api.deps import resolve_account

logger = logging.getLogger("metainsight")

# Réponse courte (sans markdown) qui accompagne l'affichage du QCM.
_QCM_REPLY = (
    "J'affiche un questionnaire pour cadrer ta campagne. "
    "Réponds aux questions ci-dessous puis valide pour que je prépare ton brief."
)


async def upload_image(
    user: UserPublic, file: UploadFile, account_id: Optional[str]
) -> ChatImageUploadResponse:
    settings = resolve_account(user.id, account_id, need_account=True)
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


async def upload_video(
    user: UserPublic, file: UploadFile, account_id: Optional[str]
) -> ChatVideoUploadResponse:
    settings = resolve_account(user.id, account_id, need_account=True)
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


def campaign_questionnaire() -> CampaignQuestionnaire:
    """QCM de création de campagne en JSON. Déterministe — utilisé par le bouton
    « Créer une campagne » du chat (affichage garanti, sans appel LLM)."""
    return build_campaign_questionnaire()


def chat(body: ChatRequest, user: UserPublic) -> ChatResponse:
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
        from backend.schemas import CampaignQuestionnaire as _CampaignQuestionnaire

        try:
            # Le brief (création confirmée) prime toujours sur le QCM (cadrage).
            if structured is None:
                structured = _CampaignQuestionnaire(**persist["last_questionnaire"])
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
