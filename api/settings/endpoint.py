"""Logique des réglages Meta (mono-compte legacy + test de connexion)."""

from backend.db import get_user_settings, upsert_user_settings
from backend.meta_tools import test_connection
from backend.schemas import (
    MetaSettingsRequest,
    MetaSettingsResponse,
    MetaTestResponse,
    UserPublic,
)
from api.common import mask_settings


def get_settings(user: UserPublic) -> MetaSettingsResponse:
    return mask_settings(get_user_settings(user.id))


def put_settings(body: MetaSettingsRequest, user: UserPublic) -> MetaSettingsResponse:
    # Only the fields the client explicitly sent are present (exclude_unset).
    # A field sent as "" (or whitespace) means "clear this value" (→ NULL);
    # a field that is absent is left unchanged. See upsert_user_settings.
    patch = body.model_dump(exclude_unset=True)
    saved = upsert_user_settings(user.id, patch)
    return mask_settings(saved)


def test_settings(user: UserPublic) -> MetaTestResponse:
    settings = get_user_settings(user.id)
    if not settings or not settings.get("meta_access_token") or not settings.get("meta_ad_account_id"):
        return MetaTestResponse(ok=False, error="Token ou Ad Account ID manquant.")
    ok, info = test_connection(settings["meta_access_token"], settings["meta_ad_account_id"])
    if ok:
        return MetaTestResponse(ok=True, account_name=info)
    return MetaTestResponse(ok=False, error=info)
