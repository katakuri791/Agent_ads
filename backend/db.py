import re
from datetime import datetime, timezone
from typing import Any, Optional

from .config import supabase_admin


def get_user_settings(user_id: str) -> Optional[dict]:
    res = (
        supabase_admin.table("user_settings")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def _normalize_settings_patch(patch: dict) -> dict:
    """Map blank strings to None (explicit clear → NULL) and drop None keys.

    The HTTP layer only forwards fields the client explicitly sent, so a key
    present here was intentionally set: a non-empty value updates it, a blank
    string ("" / whitespace) clears it. Keys absent from `patch` are untouched.
    """
    clean: dict = {}
    for k, v in patch.items():
        if v is None:
            continue
        if isinstance(v, str) and v.strip() == "":
            clean[k] = None  # explicit clear
        else:
            clean[k] = v
    return clean


def upsert_user_settings(user_id: str, patch: dict) -> dict:
    existing = get_user_settings(user_id)
    clean = _normalize_settings_patch(patch)
    if existing:
        if not clean:
            return existing
        res = (
            supabase_admin.table("user_settings")
            .update(clean)
            .eq("user_id", user_id)
            .execute()
        )
        return res.data[0]
    payload = {"user_id": user_id, **{k: v for k, v in clean.items() if v is not None}}
    res = supabase_admin.table("user_settings").insert(payload).execute()
    return res.data[0]


# ─── Meta accounts (multi-clés) ──────────────────────────────────────────────
# Une ligne `meta_accounts` = une clé API connectée (token + ad account + page +
# pixel). L'utilisateur peut en connecter plusieurs ; le dashboard en sélectionne
# une à la fois via `get_meta_account`.


def _normalize_account_id(value: Any) -> Optional[str]:
    """Accepte `1234567890` OU `act_1234567890` et renvoie toujours `act_<digits>`.

    L'utilisateur n'a plus à taper le préfixe `act_` : on l'ajoute ici, et on
    nettoie tout caractère non numérique. Renvoie None si vide.
    """
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    if s.lower().startswith("act_"):
        s = s[4:]
    digits = re.sub(r"\D", "", s)
    return f"act_{digits}" if digits else None


def list_meta_accounts(user_id: str) -> list[dict]:
    res = (
        supabase_admin.table("meta_accounts")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at")
        .execute()
    )
    return res.data or []


def _get_account_row(user_id: str, account_id: str) -> Optional[dict]:
    """Lookup exact (sans fallback) d'un compte de l'utilisateur."""
    res = (
        supabase_admin.table("meta_accounts")
        .select("*")
        .eq("user_id", user_id)
        .eq("id", account_id)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def get_meta_account(user_id: str, account_id: Optional[str] = None) -> Optional[dict]:
    """Résout LE compte à utiliser : celui demandé, sinon le `is_default`, sinon
    le premier. Si `account_id` est fourni mais introuvable (ex. compte supprimé),
    on retombe sur le compte par défaut pour ne pas casser le dashboard."""
    accounts = list_meta_accounts(user_id)
    if not accounts:
        return None
    if account_id:
        for a in accounts:
            if a["id"] == account_id:
                return a
    for a in accounts:
        if a.get("is_default"):
            return a
    return accounts[0]


def create_meta_account(user_id: str, patch: dict) -> dict:
    clean = _normalize_settings_patch(patch)
    if "meta_ad_account_id" in clean:
        clean["meta_ad_account_id"] = _normalize_account_id(clean["meta_ad_account_id"])
    existing = list_meta_accounts(user_id)
    payload = {
        "user_id": user_id,
        # Le premier compte connecté devient le compte par défaut.
        "is_default": not existing,
        **{k: v for k, v in clean.items() if v is not None},
    }
    if not payload.get("label"):
        payload["label"] = f"Compte {len(existing) + 1}"
    res = supabase_admin.table("meta_accounts").insert(payload).execute()
    return res.data[0]


def update_meta_account(user_id: str, account_id: str, patch: dict) -> Optional[dict]:
    clean = _normalize_settings_patch(patch)
    if "meta_ad_account_id" in clean:
        clean["meta_ad_account_id"] = _normalize_account_id(clean["meta_ad_account_id"])
    if not clean:
        return _get_account_row(user_id, account_id)
    clean["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = (
        supabase_admin.table("meta_accounts")
        .update(clean)
        .eq("user_id", user_id)
        .eq("id", account_id)
        .execute()
    )
    return res.data[0] if res.data else None


def set_default_meta_account(user_id: str, account_id: str) -> Optional[dict]:
    """Marque un compte comme défaut et démarque les autres (l'index unique
    partiel `meta_accounts_one_default_per_user` n'autorise qu'un seul défaut)."""
    supabase_admin.table("meta_accounts").update({"is_default": False}).eq(
        "user_id", user_id
    ).execute()
    res = (
        supabase_admin.table("meta_accounts")
        .update({"is_default": True})
        .eq("user_id", user_id)
        .eq("id", account_id)
        .execute()
    )
    return res.data[0] if res.data else None


def delete_meta_account(user_id: str, account_id: str) -> None:
    supabase_admin.table("meta_accounts").delete().eq("user_id", user_id).eq(
        "id", account_id
    ).execute()
    # Si on vient de supprimer le compte par défaut, en promouvoir un autre.
    remaining = list_meta_accounts(user_id)
    if remaining and not any(a.get("is_default") for a in remaining):
        set_default_meta_account(user_id, remaining[0]["id"])


def list_conversations(user_id: str) -> list[dict]:
    res = (
        supabase_admin.table("conversations")
        .select("id, title, created_at, updated_at")
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
        .execute()
    )
    return res.data or []


def create_conversation(user_id: str, title: str = "Nouvelle conversation") -> str:
    res = (
        supabase_admin.table("conversations")
        .insert({"user_id": user_id, "title": title})
        .execute()
    )
    return res.data[0]["id"]


def get_conversation(conversation_id: str, user_id: str) -> Optional[dict]:
    res = (
        supabase_admin.table("conversations")
        .select("*")
        .eq("id", conversation_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def touch_conversation(conversation_id: str) -> None:
    from datetime import datetime, timezone

    supabase_admin.table("conversations").update(
        {"updated_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", conversation_id).execute()


def load_messages(conversation_id: str) -> list[dict]:
    res = (
        supabase_admin.table("messages")
        .select("id, role, content, metadata, created_at")
        .eq("conversation_id", conversation_id)
        .order("created_at")
        .execute()
    )
    return res.data or []


def save_message(
    conversation_id: str,
    user_id: str,
    role: str,
    content: str,
    metadata: Optional[dict[str, Any]] = None,
) -> dict:
    res = (
        supabase_admin.table("messages")
        .insert(
            {
                "conversation_id": conversation_id,
                "user_id": user_id,
                "role": role,
                "content": content,
                "metadata": metadata or {},
            }
        )
        .execute()
    )
    return res.data[0]


def log_tool_call(
    user_id: str,
    conversation_id: str,
    tool_name: str,
    tool_input: dict,
    tool_output: str,
    status: str,
    duration_ms: int,
) -> None:
    supabase_admin.table("tool_logs").insert(
        {
            "user_id": user_id,
            "conversation_id": conversation_id,
            "tool_name": tool_name,
            "tool_input": tool_input,
            "tool_output": tool_output[:8000] if tool_output else None,
            "status": status,
            "duration_ms": duration_ms,
        }
    ).execute()


# ─── Cache analytics Meta (fb_* tables) ──────────────────────────────────────
# Alimenté par le worker backend/facebook_sync.py, lu par les endpoints dashboard
# via les fonctions d'agrégation SQL (rpc_fb_*). fb_account_id = meta_accounts.id.


def _chunked(rows: list, size: int = 500):
    for i in range(0, len(rows), size):
        yield rows[i : i + size]


def _upsert_chunked(table: str, rows: list[dict], on_conflict: str) -> None:
    """Upsert par lots (le backfill 'maximum' peut produire des milliers de
    lignes — on évite un payload géant et on reste sous les limites PostgREST)."""
    for batch in _chunked(rows):
        supabase_admin.table(table).upsert(batch, on_conflict=on_conflict).execute()


def upsert_fb_campaigns(rows: list[dict]) -> None:
    if rows:
        _upsert_chunked("fb_campaigns", rows, "id")


def upsert_fb_adsets(rows: list[dict]) -> None:
    if rows:
        _upsert_chunked("fb_adsets", rows, "id")


def upsert_fb_ads(rows: list[dict]) -> None:
    if rows:
        _upsert_chunked("fb_ads", rows, "id")


def upsert_fb_insights(rows: list[dict]) -> None:
    if rows:
        _upsert_chunked("fb_insights_daily", rows, "ad_account_id,ad_id,date")


def upsert_fb_breakdowns(rows: list[dict]) -> None:
    if rows:
        _upsert_chunked(
            "fb_insights_breakdowns", rows, "ad_account_id,date,breakdown_type,key1,key2"
        )


def get_fb_sync_state(ad_account_id: str) -> Optional[dict]:
    res = (
        supabase_admin.table("fb_sync_state")
        .select("*")
        .eq("ad_account_id", ad_account_id)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def set_fb_sync_state(ad_account_id: str, **fields: Any) -> None:
    payload = {
        "ad_account_id": ad_account_id,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        **fields,
    }
    supabase_admin.table("fb_sync_state").upsert(
        payload, on_conflict="ad_account_id"
    ).execute()


# ── Wrappers RPC (agrégation SQL) ────────────────────────────────────────────


def _rpc(name: str, params: dict) -> list[dict]:
    res = supabase_admin.rpc(name, params).execute()
    return res.data or []


def rpc_fb_summary(account_id: str, start: str, end: str) -> dict:
    rows = _rpc("fb_summary", {"p_account": account_id, "p_start": start, "p_end": end})
    return rows[0] if rows else {}


def rpc_fb_campaign_agg(account_id: str, start: str, end: str) -> list[dict]:
    return _rpc("fb_campaign_agg", {"p_account": account_id, "p_start": start, "p_end": end})


def rpc_fb_adset_agg(
    account_id: str, start: str, end: str, campaign_id: Optional[str] = None
) -> list[dict]:
    return _rpc(
        "fb_adset_agg",
        {"p_account": account_id, "p_start": start, "p_end": end, "p_campaign": campaign_id},
    )


def rpc_fb_ad_agg(
    account_id: str,
    start: str,
    end: str,
    campaign_id: Optional[str] = None,
    adset_id: Optional[str] = None,
) -> list[dict]:
    return _rpc(
        "fb_ad_agg",
        {
            "p_account": account_id,
            "p_start": start,
            "p_end": end,
            "p_campaign": campaign_id,
            "p_adset": adset_id,
        },
    )


def rpc_fb_timeseries(account_id: str, start: str, end: str) -> list[dict]:
    return _rpc("fb_timeseries", {"p_account": account_id, "p_start": start, "p_end": end})


def rpc_fb_breakdown(account_id: str, start: str, end: str, btype: str) -> list[dict]:
    return _rpc(
        "fb_breakdown",
        {"p_account": account_id, "p_start": start, "p_end": end, "p_type": btype},
    )


def save_campaign_tree(
    user_id: str,
    campaign_meta_id: str,
    name: str,
    objective: str,
    daily_budget: Optional[float],
    adset_meta_id: Optional[str] = None,
    adset_name: Optional[str] = None,
    optimization_goal: Optional[str] = None,
    billing_event: Optional[str] = None,
    targeting: Optional[dict] = None,
    ad_meta_id: Optional[str] = None,
    ad_name: Optional[str] = None,
    creative_id: Optional[str] = None,
) -> dict:
    campaign_row = (
        supabase_admin.table("campaigns")
        .insert(
            {
                "user_id": user_id,
                "meta_campaign_id": campaign_meta_id,
                "name": name,
                "objective": objective,
                "status": "PAUSED",
                "daily_budget": daily_budget,
            }
        )
        .execute()
        .data[0]
    )

    adset_row = None
    if adset_meta_id:
        adset_row = (
            supabase_admin.table("ad_sets")
            .insert(
                {
                    "campaign_id": campaign_row["id"],
                    "meta_ad_set_id": adset_meta_id,
                    "name": adset_name or f"{name} - AdSet",
                    "status": "PAUSED",
                    "daily_budget": daily_budget,
                    "optimization_goal": optimization_goal,
                    "billing_event": billing_event,
                    "targeting": targeting or {},
                }
            )
            .execute()
            .data[0]
        )

    ad_row = None
    if ad_meta_id and adset_row:
        ad_row = (
            supabase_admin.table("ads")
            .insert(
                {
                    "ad_set_id": adset_row["id"],
                    "meta_ad_id": ad_meta_id,
                    "name": ad_name or f"{name} - Ad",
                    "status": "PAUSED",
                    "creative_id": creative_id,
                }
            )
            .execute()
            .data[0]
        )

    return {"campaign": campaign_row, "ad_set": adset_row, "ad": ad_row}
