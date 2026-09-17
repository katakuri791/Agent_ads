"""Logique métier pour récupérer les idées créatives depuis SmartDB."""

import logging
from typing import Any, Optional

import httpx
from fastapi import HTTPException

from backend.config import CREATIVE_IDEAS_API_KEY, CREATIVE_IDEAS_TABLE_URL

logger = logging.getLogger("metainsight")


async def get_creative_ideas(
    limit: int = 50,
    offset: int = 0,
    search: Optional[str] = None,
) -> dict[str, Any]:
    """Récupère les idées créatives depuis l'API SmartDB avec pagination."""
    if not CREATIVE_IDEAS_TABLE_URL or not CREATIVE_IDEAS_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="La configuration de la table Creative Ideas est manquante.",
        )

    params: dict[str, Any] = {
        "limit": min(max(1, limit), 100),
        "offset": max(0, offset),
    }
    if search:
        # NocoDB supporte le filtrage de recherche
        params["where"] = f"(Generated idea,like,%{search}%)"

    headers = {
        "Authorization": CREATIVE_IDEAS_API_KEY,
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(
                CREATIVE_IDEAS_TABLE_URL,
                headers=headers,
                params=params,
            )

        if resp.status_code != 200:
            logger.error(
                "Échec de récupération Creative Ideas (statut %d) : %s",
                resp.status_code,
                resp.text[:300],
            )
            raise HTTPException(
                status_code=resp.status_code,
                detail=f"Erreur API SmartDB : {resp.text[:200]}",
            )

        data = resp.json()
        return data

    except httpx.RequestError as exc:
        logger.exception("Erreur réseau lors de l'appel SmartDB Creative Ideas : %s", exc)
        raise HTTPException(
            status_code=502,
            detail=f"Impossible de joindre le serveur SmartDB : {exc}",
        )
