"""Notifications in-app (alertes utilisateur).

Le backend insère une notification quand un événement important survient (sync
Meta échoué, token expiré, création de campagne ratée). Le frontend les affiche
via une cloche dans la topbar + polling. Aucune dépendance email / tiers.

Anti-spam : `dedup=True` n'insère pas si une notification NON LUE du même type
existe déjà pour l'utilisateur (le worker de sync tourne toutes les 20 min — sans
ça, une erreur persistante créerait une notif à chaque passage)."""

import logging
from typing import Optional

from .config import supabase_admin

logger = logging.getLogger("metainsight")


def create_notification(
    user_id: str,
    type_: str,
    title: str,
    body: Optional[str] = None,
    dedup: bool = False,
) -> Optional[dict]:
    """Crée une notification. Renvoie la ligne créée, ou None si dédupliquée.

    Best-effort : une erreur ici ne doit jamais casser l'appelant (worker, /chat)."""
    try:
        if dedup:
            existing = (
                supabase_admin.table("notifications")
                .select("id")
                .eq("user_id", user_id)
                .eq("type", type_)
                .eq("read", False)
                .limit(1)
                .execute()
            )
            if existing.data:
                return None
        res = (
            supabase_admin.table("notifications")
            .insert({"user_id": user_id, "type": type_, "title": title, "body": body})
            .execute()
        )
        return res.data[0] if res.data else None
    except Exception:  # noqa: BLE001
        logger.exception("create_notification failed (user=%s, type=%s)", user_id, type_)
        return None


def list_notifications(user_id: str, limit: int = 20) -> dict:
    """Les `limit` dernières notifications (non lues d'abord), + total non lues."""
    res = (
        supabase_admin.table("notifications")
        .select("*")
        .eq("user_id", user_id)
        .order("read")  # False (=non lu) avant True
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    count_res = (
        supabase_admin.table("notifications")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .eq("read", False)
        .execute()
    )
    # SmartDB/NocoDB peut renvoyer `read = null` (le DEFAULT false Postgres n'a pas
    # suivi à la migration) → on force un vrai booléen, sinon le modèle Pydantic
    # `NotificationOut.read: bool` lève un ValidationError (500 brut) à la
    # sérialisation. Un null = jamais marqué lu = non lu.
    items = res.data or []
    for it in items:
        it["read"] = bool(it.get("read"))
    return {"items": items, "unread_count": count_res.count or 0}


def mark_read(user_id: str, notification_id: str) -> None:
    supabase_admin.table("notifications").update({"read": True}).eq(
        "user_id", user_id
    ).eq("id", notification_id).execute()


def mark_all_read(user_id: str) -> None:
    supabase_admin.table("notifications").update({"read": True}).eq(
        "user_id", user_id
    ).eq("read", False).execute()
