"""Helpers HTTP transverses partagés par plusieurs features.

Regroupe ce qui était éparpillé en tête de `main.py` : conversion d'erreur Meta
en HTTP lisible, normalisation du filtre plateforme, traduction date_preset →
jours, et masquage des lignes DB en réponses Pydantic (jamais le token en clair).
"""

import logging
import socket
from typing import Optional

import requests
from facebook_business.exceptions import FacebookRequestError
from fastapi import HTTPException

from backend import meta_pages
from backend.schemas import MetaAccountResponse, MetaSettingsResponse

logger = logging.getLogger("metainsight")

_VALID_PLATFORMS = {"facebook", "instagram", "audience_network", "messenger"}


def meta_http_error(exc: Exception) -> HTTPException:
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


def norm_platform(platform: Optional[str]) -> Optional[str]:
    """Normalise le filtre plateforme (toggle Facebook/Instagram). None = toutes
    plateformes (comportement historique). Une valeur inconnue est ignorée."""
    p = (platform or "").strip().lower()
    return p if p in _VALID_PLATFORMS else None


def preset_to_days(date_preset: Optional[str]) -> tuple[int, bool]:
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


def mask_settings(row: Optional[dict]) -> MetaSettingsResponse:
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


def mask_account(row: dict) -> MetaAccountResponse:
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
