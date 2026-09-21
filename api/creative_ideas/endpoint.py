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


async def create_creative_idea(payload: dict[str, Any]) -> dict[str, Any]:
    """Crée une nouvelle idée créative dans SmartDB."""
    if not CREATIVE_IDEAS_TABLE_URL or not CREATIVE_IDEAS_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="La configuration de la table Creative Ideas est manquante.",
        )

    headers = {
        "Authorization": CREATIVE_IDEAS_API_KEY,
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                CREATIVE_IDEAS_TABLE_URL,
                headers=headers,
                json=payload,
            )

        if resp.status_code not in (200, 201):
            logger.error(
                "Échec de création Creative Idea (statut %d) : %s",
                resp.status_code,
                resp.text[:300],
            )
            raise HTTPException(
                status_code=resp.status_code,
                detail=f"Erreur API SmartDB : {resp.text[:200]}",
            )

        return resp.json()

    except httpx.RequestError as exc:
        logger.exception("Erreur réseau lors de la création SmartDB Creative Ideas : %s", exc)
        raise HTTPException(
            status_code=502,
            detail=f"Impossible de joindre le serveur SmartDB : {exc}",
        )


async def update_creative_idea(idea_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    """Met à jour une idée créative existante dans SmartDB."""
    if not CREATIVE_IDEAS_TABLE_URL or not CREATIVE_IDEAS_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="La configuration de la table Creative Ideas est manquante.",
        )

    headers = {
        "Authorization": CREATIVE_IDEAS_API_KEY,
        "Content-Type": "application/json",
    }

    # Données avec la PK "Id"
    patch_item = {**payload, "Id": idea_id}

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            # 1. Tentative avec objet direct {"Id": ..., ...}
            resp = await client.patch(
                CREATIVE_IDEAS_TABLE_URL,
                headers=headers,
                json=patch_item,
            )
            # 2. Si non-2xx, tentative avec tableau d'objets [{"Id": ..., ...}]
            if resp.status_code not in (200, 201, 204):
                resp = await client.patch(
                    CREATIVE_IDEAS_TABLE_URL,
                    headers=headers,
                    json=[patch_item],
                )

        if resp.status_code not in (200, 201, 204):
            logger.error(
                "Échec de mise à jour Creative Idea (statut %d) : %s",
                resp.status_code,
                resp.text[:300],
            )
            raise HTTPException(
                status_code=resp.status_code,
                detail=f"Erreur API SmartDB : {resp.text[:200]}",
            )

        try:
            return resp.json()
        except Exception:
            return {"success": True, "id": idea_id}

    except httpx.RequestError as exc:
        logger.exception("Erreur réseau lors de la mise à jour SmartDB Creative Ideas : %s", exc)
        raise HTTPException(
            status_code=502,
            detail=f"Impossible de joindre le serveur SmartDB : {exc}",
        )


async def delete_creative_idea(idea_id: int) -> dict[str, Any]:
    """Supprime une idée créative dans SmartDB."""
    if not CREATIVE_IDEAS_TABLE_URL or not CREATIVE_IDEAS_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="La configuration de la table Creative Ideas est manquante.",
        )

    headers = {
        "Authorization": CREATIVE_IDEAS_API_KEY,
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            # 1. Tentative avec tableau d'IDs [idea_id] (format NocoDB habituel)
            resp = await client.request(
                "DELETE",
                CREATIVE_IDEAS_TABLE_URL,
                headers=headers,
                json=[idea_id],
            )
            # 2. Si échec, tentative avec tableau d'objets [{"Id": idea_id}]
            if resp.status_code not in (200, 204):
                resp = await client.request(
                    "DELETE",
                    CREATIVE_IDEAS_TABLE_URL,
                    headers=headers,
                    json=[{"Id": idea_id}],
                )
            # 3. Si échec, tentative sur l'URL directe /records/{id}
            if resp.status_code not in (200, 204):
                resp = await client.delete(
                    f"{CREATIVE_IDEAS_TABLE_URL.rstrip('/')}/{idea_id}",
                    headers=headers,
                )

        if resp.status_code not in (200, 204):
            logger.error(
                "Échec de suppression Creative Idea (statut %d) : %s",
                resp.status_code,
                resp.text[:300],
            )
            raise HTTPException(
                status_code=resp.status_code,
                detail=f"Erreur API SmartDB : {resp.text[:200]}",
            )

        return {"success": True, "id": idea_id}

    except httpx.RequestError as exc:
        logger.exception("Erreur réseau lors de la suppression SmartDB Creative Ideas : %s", exc)
        raise HTTPException(
            status_code=502,
            detail=f"Impossible de joindre le serveur SmartDB : {exc}",
        )
