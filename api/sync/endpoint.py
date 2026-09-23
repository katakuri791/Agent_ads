"""Logique du sync (cache analytics Meta → SmartDB)."""

import asyncio
import logging
from typing import Optional

from fastapi import HTTPException

from backend import facebook_sync
from backend.db import get_fb_sync_state as db_get_fb_sync_state, get_meta_account
from backend.schemas import SyncStatusResponse, UserPublic

logger = logging.getLogger("metainsight")


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


async def sync_account(account_id: str, user: UserPublic) -> SyncStatusResponse:
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


def sync_status(user: UserPublic, account_id: Optional[str]) -> SyncStatusResponse:
    acct = get_meta_account(user.id, account_id)
    if not acct:
        raise HTTPException(status_code=404, detail="Aucun compte Meta.")
    return _sync_status(acct)
