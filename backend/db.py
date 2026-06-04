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
