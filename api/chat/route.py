"""Couche HTTP du chat / agent IA (délègue à `endpoint`)."""

from typing import Optional

from fastapi import APIRouter, Depends, File, Query, UploadFile

from api.chat import endpoint
from api.deps import get_current_user, get_user_or_public
from backend.schemas import (
    BotpressChatRequest,
    BotpressChatResponse,
    CampaignQuestionnaire,
    ChatImageUploadResponse,
    ChatRequest,
    ChatResponse,
    ChatVideoUploadResponse,
    UserPublic,
)

router = APIRouter(tags=["chat"])


@router.post("/chat/upload-image", response_model=ChatImageUploadResponse)
async def upload_image(
    file: UploadFile = File(...),
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> ChatImageUploadResponse:
    return await endpoint.upload_image(user, file, account_id)


@router.post("/chat/upload-video", response_model=ChatVideoUploadResponse)
async def upload_video(
    file: UploadFile = File(...),
    account_id: Optional[str] = Query(None),
    user: UserPublic = Depends(get_current_user),
) -> ChatVideoUploadResponse:
    return await endpoint.upload_video(user, file, account_id)


@router.get("/chat/campaign-questionnaire", response_model=CampaignQuestionnaire)
def campaign_questionnaire(
    user: UserPublic = Depends(get_current_user),
) -> CampaignQuestionnaire:
    return endpoint.campaign_questionnaire()


@router.post("/chat", response_model=ChatResponse)
def chat(body: ChatRequest, user: UserPublic = Depends(get_user_or_public)) -> ChatResponse:
    # Endpoint PUBLIC : JWT présent (frontend) → cet utilisateur ; aucun credential
    # (Botpress / extérieur) → utilisateur de démo fixe. L'appelant externe identifie
    # la personne via `body.user_id`. Voir get_user_or_public.
    return endpoint.chat(body, user)


@router.post("/chat/botpress", response_model=BotpressChatResponse)
def chat_botpress(
    body: BotpressChatRequest, user: UserPublic = Depends(get_user_or_public)
) -> BotpressChatResponse:
    # Variante PUBLIQUE au format Botpress : accepte l'entrée `input.txt`
    # (type/text/bot_Id/payload) et renvoie le tableau `responses`. Le `/chat`
    # ci-dessus (utilisé par le frontend) reste inchangé.
    return endpoint.chat_botpress(body, user)
