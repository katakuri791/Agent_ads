"""Worker de synchronisation Meta Ads → Supabase.

Au lieu d'appeler l'API Graph à chaque changement de date côté dashboard (lent,
rate-limit), ce worker récupère périodiquement campagnes / ad sets / ads /
insights quotidiens / breakdowns et les écrit dans les tables `fb_*`. Les
endpoints de lecture n'interrogent ensuite que Supabase (cf. main.py).

Robustesse : `sync_all_accounts` isole chaque compte dans un try/except — une
erreur (token expiré, rate-limit, compte inactif) marque ce compte en erreur
dans `fb_sync_state` sans interrompre la synchro des autres.
"""

import json
import logging
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from facebook_business.adobjects.adaccount import AdAccount
from facebook_business.exceptions import FacebookRequestError

from . import db, metrics, notifications
from .config import supabase_admin
from .meta_tools import _init_api, _safe_float, _safe_int

logger = logging.getLogger("metainsight")

# Re-sync des N derniers jours à chaque passage : Meta met à jour rétroactivement
# (conversions tardives, attribution) → les jours récents changent après coup.
RESYNC_TAIL_DAYS = 3

# Meta refuse un get_insights non borné avec time_increment=1 (date_preset=maximum
# → erreur 500). On découpe donc le backfill en fenêtres de ce nombre de jours.
CHUNK_DAYS = 30

# Profondeur max du backfill (Meta ne conserve les insights que ~37 mois ; on
# borne aussi pour éviter un backfill infini si une campagne n'a pas de start_time).
MAX_BACKFILL_DAYS = 1095

# Champs insights demandés au niveau ad (un appel paginé, time_increment=1).
_INSIGHT_FIELDS = [
    "spend", "impressions", "clicks", "reach", "frequency", "cpc", "cpm", "ctr",
    "actions", "action_values", "campaign_id", "adset_id", "ad_id",
]

# (type stocké, paramètre breakdowns Meta, clé primaire, clé secondaire)
_BREAKDOWN_CONFIGS: list[tuple[str, str, str, Optional[str]]] = [
    ("age", "age", "age", None),
    ("gender", "gender", "gender", None),
    ("country", "country", "country", None),
    ("publisher_platform", "publisher_platform", "publisher_platform", None),
    ("age_gender", "age,gender", "age", "gender"),
]


def _budget_units(value: Any) -> Optional[float]:
    """Les budgets Meta sont en *centimes* de la devise du compte. On stocke en
    unités (÷100) pour coller à ce qu'attend le dashboard."""
    cents = _safe_float(value)
    return round(cents / 100.0, 2) if cents else None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _plain(obj: Any) -> Any:
    """Convertit récursivement les objets du SDK facebook-business (Targeting,
    TargetingGeoLocation, AdCreative, AbstractObject…) en structures JSON pures
    pour le stockage JSONB. dict() suffit niveau par niveau, json.dumps descend
    dans l'arbre via `default`."""
    if obj is None:
        return None

    def default(o: Any) -> Any:
        try:
            return dict(o)
        except Exception:
            return str(o)

    return json.loads(json.dumps(obj, default=default))


def _backfill_start(account_id: str, today: date) -> date:
    """Date de départ du backfill : la date de la plus ancienne campagne du compte
    (déjà synchronisée dans fb_campaigns), bornée à MAX_BACKFILL_DAYS."""
    floor = today - timedelta(days=MAX_BACKFILL_DAYS)
    try:
        res = (
            supabase_admin.table("fb_campaigns")
            .select("start_time")
            .eq("ad_account_id", account_id)
            .not_.is_("start_time", "null")
            .order("start_time")
            .limit(1)
            .execute()
        )
        if res.data and res.data[0].get("start_time"):
            earliest = date.fromisoformat(str(res.data[0]["start_time"])[:10])
            return max(earliest, floor)
    except Exception:
        logger.warning("backfill start lookup failed for %s", account_id, exc_info=True)
    return floor


def _date_windows(account_id: str, state: Optional[dict]) -> tuple[list[tuple[str, str]], bool]:
    """Fenêtres (since, until) à synchroniser, découpées en tranches de CHUNK_DAYS
    (Meta refuse une plage non bornée en daily). Retourne (windows, is_backfill).

    1er sync → depuis la plus ancienne campagne jusqu'à aujourd'hui. Sinon →
    fenêtre incrémentale (insights_synced_until - RESYNC_TAIL_DAYS → aujourd'hui).
    """
    today = date.today()
    synced_until = (state or {}).get("insights_synced_until")
    last: Optional[date] = None
    if synced_until:
        try:
            last = date.fromisoformat(str(synced_until))
        except ValueError:
            last = None

    if last is None:
        start = _backfill_start(account_id, today)
        is_backfill = True
    else:
        start = last - timedelta(days=RESYNC_TAIL_DAYS)
        is_backfill = False

    windows: list[tuple[str, str]] = []
    cur = start
    while cur <= today:
        wend = min(cur + timedelta(days=CHUNK_DAYS - 1), today)
        windows.append((cur.isoformat(), wend.isoformat()))
        cur = wend + timedelta(days=1)
    return windows, is_backfill


# ─── Synchronisation des entités (campaigns / adsets / ads) ───────────────────


def _sync_campaigns(account: AdAccount, account_id: str) -> None:
    rows = []
    for c in account.get_campaigns(
        fields=["name", "objective", "status", "daily_budget", "lifetime_budget",
                "created_time", "start_time", "stop_time"]
    ):
        rows.append({
            "id": c.get("id"),
            "ad_account_id": account_id,
            "name": c.get("name"),
            "objective": c.get("objective"),
            "status": c.get("status"),
            "daily_budget": _budget_units(c.get("daily_budget")),
            "lifetime_budget": _budget_units(c.get("lifetime_budget")),
            "created_time": c.get("created_time"),
            "start_time": c.get("start_time"),
            "stop_time": c.get("stop_time"),
            "updated_at": _now_iso(),
        })
    db.upsert_fb_campaigns(rows)
    logger.info("sync[%s]: %d campaigns", account_id, len(rows))


def _sync_adsets(account: AdAccount, account_id: str) -> None:
    rows = []
    for a in account.get_ad_sets(
        fields=["name", "status", "campaign_id", "daily_budget", "lifetime_budget",
                "optimization_goal", "targeting"]
    ):
        rows.append({
            "id": a.get("id"),
            "ad_account_id": account_id,
            "campaign_id": a.get("campaign_id"),
            "name": a.get("name"),
            "status": a.get("status"),
            "daily_budget": _budget_units(a.get("daily_budget")),
            "lifetime_budget": _budget_units(a.get("lifetime_budget")),
            "optimization_goal": a.get("optimization_goal"),
            "targeting": _plain(a.get("targeting")),
            "updated_at": _now_iso(),
        })
    db.upsert_fb_adsets(rows)
    logger.info("sync[%s]: %d ad sets", account_id, len(rows))


def _sync_ads(account: AdAccount, account_id: str) -> None:
    rows = []
    for a in account.get_ads(
        fields=["name", "status", "adset_id", "campaign_id",
                "creative{thumbnail_url,object_type}"]
    ):
        creative = a.get("creative") or {}
        if not isinstance(creative, dict):
            creative = {}
        rows.append({
            "id": a.get("id"),
            "ad_account_id": account_id,
            "adset_id": a.get("adset_id"),
            "campaign_id": a.get("campaign_id"),
            "name": a.get("name"),
            "status": a.get("status"),
            "creative": _plain(creative) or None,
            "thumbnail_url": creative.get("thumbnail_url"),
            "format": creative.get("object_type"),
            "updated_at": _now_iso(),
        })
    db.upsert_fb_ads(rows)
    logger.info("sync[%s]: %d ads", account_id, len(rows))


def _sync_insights(account: AdAccount, account_id: str, windows: list[tuple[str, str]],
                   is_backfill: bool) -> None:
    total = 0
    for since, until in windows:
        params = {"time_range": {"since": since, "until": until},
                  "level": "ad", "time_increment": 1}
        rows = []
        for r in account.get_insights(fields=_INSIGHT_FIELDS, params=params):
            actions = _plain(r.get("actions"))
            action_values = _plain(r.get("action_values"))
            conv = metrics.extract_conversion_columns(actions, action_values)
            rows.append({
                "ad_account_id": account_id,
                "ad_id": r.get("ad_id"),
                "adset_id": r.get("adset_id"),
                "campaign_id": r.get("campaign_id"),
                "date": r.get("date_start"),
                "spend": _safe_float(r.get("spend")),
                "impressions": _safe_int(r.get("impressions")),
                "clicks": _safe_int(r.get("clicks")),
                "reach": _safe_int(r.get("reach")),
                "frequency": _safe_float(r.get("frequency")),
                "cpc": _safe_float(r.get("cpc")),
                "cpm": _safe_float(r.get("cpm")),
                "ctr": _safe_float(r.get("ctr")),
                **conv,
                "actions": actions,
                "action_values": action_values,
                "updated_at": _now_iso(),
            })
        db.upsert_fb_insights(rows)
        total += len(rows)
        if is_backfill:
            time.sleep(0.3)  # respiration anti rate-limit pendant le gros backfill
    logger.info(
        "sync[%s]: %d daily insight rows over %d window(s) (%s)",
        account_id, total, len(windows), "backfill" if is_backfill else "incremental",
    )


def _sync_breakdowns(account: AdAccount, account_id: str, windows: list[tuple[str, str]],
                     is_backfill: bool) -> None:
    for btype, breakdowns_param, k1, k2 in _BREAKDOWN_CONFIGS:
        total = 0
        try:
            for since, until in windows:
                params = {"time_range": {"since": since, "until": until},
                          "level": "account", "time_increment": 1,
                          "breakdowns": breakdowns_param}
                rows = []
                for r in account.get_insights(
                    fields=["impressions", "clicks", "spend", "reach"], params=params
                ):
                    rows.append({
                        "ad_account_id": account_id,
                        "date": r.get("date_start"),
                        "breakdown_type": btype,
                        "key1": str(r.get(k1) or "?"),
                        "key2": str(r.get(k2) or "") if k2 else "",
                        "impressions": _safe_int(r.get("impressions")),
                        "clicks": _safe_int(r.get("clicks")),
                        "spend": _safe_float(r.get("spend")),
                        "reach": _safe_int(r.get("reach")),
                        "updated_at": _now_iso(),
                    })
                db.upsert_fb_breakdowns(rows)
                total += len(rows)
                if is_backfill:
                    time.sleep(0.3)
            logger.info("sync[%s]: %d %s breakdown rows", account_id, total, btype)
        except FacebookRequestError as exc:
            # Un breakdown indisponible ne doit pas faire échouer tout le compte.
            logger.warning("sync[%s]: breakdown %s failed: %s", account_id, btype,
                           exc.api_error_message() or exc)


# ─── Détection token Meta expiré ──────────────────────────────────────────────

# OAuthException : tout problème de token Meta remonte avec le code 190. Les
# sous-codes précisent la cause. On marque alors le compte token_status='expired'
# pour qu'une bannière UI invite l'utilisateur à renouveler son token.
_TOKEN_ERROR_CODE = 190
_TOKEN_SUBCODES = {463: "expired", 460: "password_changed"}


def _classify_token_error(exc: Exception) -> Optional[str]:
    """Retourne une raison ('expired' | 'password_changed' | 'invalid') si l'erreur
    Meta indique un token mort, sinon None (erreur transitoire / autre).

    Duck-typing sur `api_error_code()`/`api_error_subcode()` (présents sur
    FacebookRequestError) : une exception générique sans ces méthodes → None.
    Évite une dépendance dure au SDK et reste testable sans Supabase."""
    code_fn = getattr(exc, "api_error_code", None)
    if not callable(code_fn):
        return None
    try:
        code = code_fn()
    except Exception:  # noqa: BLE001 — le SDK peut ne pas exposer le code
        return None
    if code != _TOKEN_ERROR_CODE:
        return None
    subcode = None
    sub_fn = getattr(exc, "api_error_subcode", None)
    if callable(sub_fn):
        try:
            subcode = sub_fn()
        except Exception:  # noqa: BLE001
            subcode = None
    return _TOKEN_SUBCODES.get(subcode, "invalid")


def record_sync_error(account: dict, exc: Exception) -> None:
    """Enregistre l'échec d'un sync : état d'erreur dans `fb_sync_state` et, si
    c'est un token mort, marque le compte `token_status='expired'` (alerte UI).

    Utilisé par le worker (sync_all_accounts) ET par l'endpoint de sync manuel."""
    ad_account_id = account.get("meta_ad_account_id")
    msg = exc.api_error_message() if isinstance(exc, FacebookRequestError) else str(exc)
    if ad_account_id:
        try:
            db.set_fb_sync_state(
                ad_account_id,
                last_sync_at=_now_iso(),
                last_sync_status="error",
                last_error=(msg or "Erreur inconnue")[:1000],
            )
        except Exception:  # noqa: BLE001
            logger.exception("fb_sync: could not record error state for %s", ad_account_id)
    user_id = account.get("user_id")
    label = account.get("label") or "compte Meta"
    reason = _classify_token_error(exc)
    if reason and account.get("id"):
        try:
            db.set_account_token_status(account["id"], "expired")
            logger.warning(
                "fb_sync: token mort pour le compte %s (raison=%s)", account["id"], reason
            )
        except Exception:  # noqa: BLE001
            logger.exception("fb_sync: could not flag token for %s", account["id"])
        if user_id:
            notifications.create_notification(
                user_id,
                "token_expired",
                f"Token Meta expiré — {label}",
                "La synchronisation est interrompue. Mets à jour le token dans Paramètres.",
                dedup=True,
            )
    elif reason is None:
        # Erreur de sync inattendue (≠ token expiré) → Sentry (no-op sans DSN).
        try:
            import sentry_sdk

            sentry_sdk.capture_exception(exc)
        except Exception:  # noqa: BLE001 — l'observabilité ne doit jamais casser le sync
            pass
        if user_id:
            notifications.create_notification(
                user_id,
                "sync_error",
                f"Échec de synchronisation — {label}",
                (msg or "Erreur inconnue")[:300],
                dedup=True,
            )


# ─── Point d'entrée par compte / global ───────────────────────────────────────


def sync_account(account: dict) -> dict:
    """Synchronise UN compte publicitaire (résolu depuis une ligne meta_accounts).

    Le cache est keyé par `meta_ad_account_id` : plusieurs lignes meta_accounts
    peuvent pointer le même ad account (même Business Manager) → on ne stocke
    qu'une copie par ad account. Lève en cas d'échec ; l'isolation est faite par
    `sync_all_accounts` (ou l'appelant de l'endpoint manuel)."""
    token = account.get("meta_access_token")
    ad_account_id = account.get("meta_ad_account_id")
    if not token or not ad_account_id:
        raise ValueError("Compte sans token ou ad_account_id — rien à synchroniser.")

    state = db.get_fb_sync_state(ad_account_id)
    db.set_fb_sync_state(ad_account_id, last_sync_status="running", last_error=None)

    _init_api(token)
    fb_account = AdAccount(ad_account_id)

    _sync_campaigns(fb_account, ad_account_id)
    _sync_adsets(fb_account, ad_account_id)
    _sync_ads(fb_account, ad_account_id)
    # Les fenêtres dépendent des campagnes (date la plus ancienne) → on les calcule
    # APRÈS _sync_campaigns.
    windows, is_backfill = _date_windows(ad_account_id, state)
    _sync_insights(fb_account, ad_account_id, windows, is_backfill)
    _sync_breakdowns(fb_account, ad_account_id, windows, is_backfill)

    db.set_fb_sync_state(
        ad_account_id,
        last_sync_at=_now_iso(),
        last_sync_status="success",
        last_error=None,
        insights_synced_until=date.today().isoformat(),
    )
    # Sync réussi → le token est forcément valide : on lève toute alerte résiduelle.
    if account.get("id"):
        try:
            db.set_account_token_status(account["id"], "valid")
        except Exception:  # noqa: BLE001
            logger.exception("fb_sync: could not clear token flag for %s", account.get("id"))
    return db.get_fb_sync_state(ad_account_id) or {}


def _distinct_ad_accounts() -> list[dict]:
    """Une ligne meta_accounts par ad account DISTINCT (avec token). Évite de
    synchroniser 3× le même ad account quand l'utilisateur a plusieurs entrées
    pointant le même Business Manager."""
    res = supabase_admin.table("meta_accounts").select("*").execute()
    seen: dict[str, dict] = {}
    for a in res.data or []:
        ad_acct = a.get("meta_ad_account_id")
        if a.get("meta_access_token") and ad_acct and ad_acct not in seen:
            seen[ad_acct] = a
    return list(seen.values())


def sync_all_accounts() -> dict:
    """Synchronise chaque ad account distinct. Isole les erreurs par compte.
    Renvoie un petit récapitulatif {ok, errors, total}."""
    accounts = _distinct_ad_accounts()
    ok, errors = 0, 0
    logger.info("fb_sync: starting sync of %d distinct ad account(s)", len(accounts))
    for acct in accounts:
        ad_account_id = acct["meta_ad_account_id"]
        try:
            sync_account(acct)
            ok += 1
        except Exception as exc:  # noqa: BLE001 — on isole CHAQUE compte
            errors += 1
            logger.exception("fb_sync: ad account %s failed", ad_account_id)
            record_sync_error(acct, exc)
    logger.info("fb_sync: done (ok=%d, errors=%d)", ok, errors)
    return {"ok": ok, "errors": errors, "total": len(accounts)}
