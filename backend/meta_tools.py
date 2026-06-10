import re
from datetime import datetime, timedelta, timezone
from io import BytesIO
from typing import Any, Optional

import requests
from requests.adapters import HTTPAdapter
from facebook_business.adobjects.adaccount import AdAccount
from facebook_business.adobjects.adimage import AdImage
from facebook_business.adobjects.campaign import Campaign
from facebook_business.api import FacebookAdsApi
from facebook_business.exceptions import FacebookRequestError
from langchain_core.tools import tool

from . import meta_pages


# Le SDK facebook-business n'impose AUCUN timeout par défaut : un appel Graph lent
# ou injoignable bloque alors la requête HTTP indéfiniment (le frontend finit par
# rejeter le fetch avec « Failed to fetch »). On borne chaque appel ci-dessous.
SDK_TIMEOUT = 30  # secondes


class _TimeoutHTTPAdapter(HTTPAdapter):
    """Injecte un timeout par défaut sur chaque requête de la session du SDK."""

    def send(self, request, **kwargs):  # type: ignore[override]
        if kwargs.get("timeout") is None:
            kwargs["timeout"] = SDK_TIMEOUT
        return super().send(request, **kwargs)


def _init_api(access_token: str) -> None:
    """Initialise le SDK Meta ET borne ses appels HTTP (timeout).

    Remplace les `FacebookAdsApi.init(...)` directs : sans ce timeout, un seul
    appel Graph lent gèle toute la route (détail campagne, audience-reach…)."""
    FacebookAdsApi.init(access_token=access_token)
    try:
        session = FacebookAdsApi.get_default_api()._session.requests
        adapter = _TimeoutHTTPAdapter()
        session.mount("https://", adapter)
        session.mount("http://", adapter)
    except Exception:
        # Structure interne du SDK introuvable (version différente) : le
        # socket.setdefaulttimeout posé dans main.py reste le garde-fou.
        pass


# Compatible (objective, optimization_goal) pairs — keep the list short on
# purpose; the agent should pick from this whitelist.
COMPATIBLE_GOALS: dict[str, list[str]] = {
    "OUTCOME_TRAFFIC": ["LINK_CLICKS", "LANDING_PAGE_VIEWS"],
    "OUTCOME_AWARENESS": ["REACH", "IMPRESSIONS"],
    "OUTCOME_ENGAGEMENT": ["POST_ENGAGEMENT"],
    "OUTCOME_LEADS": ["LEAD_GENERATION"],
    "OUTCOME_SALES": ["OFFSITE_CONVERSIONS", "LINK_CLICKS"],
    "OUTCOME_APP_PROMOTION": ["APP_INSTALLS"],
}

_HEX_RE = re.compile(r"^[a-f0-9]{16,}$", re.IGNORECASE)


def _fmt_fb_error(exc: FacebookRequestError, ctx: str) -> str:
    msg = exc.api_error_message() or str(exc)
    sub = exc.api_error_subcode()
    code = exc.api_error_code()
    suffix = f" (code={code}, subcode={sub})" if code or sub else ""
    # Meta met la vraie cause exploitable dans error_user_title/error_user_msg
    # (le `message` générique est souvent juste "Invalid parameter").
    detail = ""
    try:
        err = (exc.body() or {}).get("error", {})
        title = err.get("error_user_title")
        user_msg = err.get("error_user_msg")
        parts = [p for p in (title, user_msg) if p]
        if parts:
            detail = " — " + " : ".join(parts)
    except Exception:
        pass
    return f"❌ Erreur Meta lors de {ctx} : {msg}{suffix}{detail}"


def _rollback_campaign(campaign_id: str) -> None:
    """Supprime une campagne partiellement créée (best-effort).

    create_full_campaign n'est pas atomique : si une étape échoue après la
    création de la campagne, on supprime celle-ci pour ne laisser aucun
    orphelin (sinon les retries du modèle accumulent des doublons).
    """
    try:
        Campaign(campaign_id).api_delete()
    except Exception:
        pass


def build_meta_tools(
    access_token: str,
    ad_account_id: str,
    page_id: str,
    meta_pixel_id: Optional[str] = None,
) -> tuple[list, dict[str, Any]]:
    _init_api(access_token)
    _persist: dict[str, Any] = {}

    @tool
    def create_full_campaign(
        campaign_name: str,
        objective: str,
        daily_budget: int,
        ad_message: str,
        link: str,
        image_hash: str,
        countries: list[str] = ["MA"],
        age_min: int = 18,
        age_max: int = 65,
        optimization_goal: str = "LINK_CLICKS",
    ) -> str:
        """Crée une campagne Meta Ads complète (campagne + ad set + creative + ad), tout en PAUSED.

        Args:
            campaign_name: nom de la campagne
            objective: OUTCOME_TRAFFIC, OUTCOME_SALES, OUTCOME_LEADS, OUTCOME_AWARENESS, OUTCOME_ENGAGEMENT, OUTCOME_APP_PROMOTION
            daily_budget: budget quotidien EN CENTIMES (1000 = 10.00 dans la devise du compte)
            ad_message: texte de l'annonce
            link: URL de destination
            image_hash: hash hex d'une image déjà uploadée (utiliser upload_image ou upload_image_from_url d'abord)
            countries: liste de codes pays ISO-2 (ex: ["MA", "FR"])
            age_min: âge minimum ciblé
            age_max: âge maximum ciblé
            optimization_goal: doit être compatible avec l'objective.
                OUTCOME_TRAFFIC → LINK_CLICKS | LANDING_PAGE_VIEWS
                OUTCOME_AWARENESS → REACH | IMPRESSIONS
                OUTCOME_ENGAGEMENT → POST_ENGAGEMENT
                OUTCOME_LEADS → LEAD_GENERATION
                OUTCOME_SALES → OFFSITE_CONVERSIONS | LINK_CLICKS
        """
        # ── Garde anti-doublon : une seule création réelle par tour ─────
        # Si une campagne a déjà été créée pendant cette invocation, ne
        # recommence pas (évite les rafales dues aux retries du modèle).
        already = _persist.get("last_created")
        if already:
            return (
                f"✅ Campagne déjà créée dans ce tour (ID {already['campaign_id']}). "
                "Ne la recrée pas — relaie ce résultat à l'utilisateur."
            )

        # ── Validations préalables ──────────────────────────────────────
        if not image_hash or not _HEX_RE.match(image_hash.strip()):
            return (
                "❌ image_hash manquant ou invalide. Demande à l'utilisateur "
                "un chemin d'image local (puis upload_image) ou une URL "
                "publique (puis upload_image_from_url), puis réessaie avec "
                "le hash retourné."
            )
        allowed = COMPATIBLE_GOALS.get(objective)
        if allowed and optimization_goal not in allowed:
            return (
                f"❌ optimization_goal '{optimization_goal}' incompatible avec "
                f"objective '{objective}'. Valeurs acceptées : {allowed}. "
                f"Reprends l'appel avec une valeur compatible."
            )

        # ── Pré-validation « objet promu » (bloquer AVANT toute création) ─
        # OUTCOME_SALES (conversions) et OUTCOME_LEADS exigent un
        # promoted_object (pixel + custom_event_type, ou formulaire). On ne
        # le câble pas ici : on refuse proprement pour ne pas créer de
        # campagne orpheline et déclencher une boucle de retries.
        needs_promoted = objective == "OUTCOME_LEADS" or (
            objective == "OUTCOME_SALES" and optimization_goal == "OFFSITE_CONVERSIONS"
        )
        if needs_promoted and not meta_pixel_id:
            return (
                f"❌ L'objectif {objective} nécessite un pixel/objet promu configuré, "
                "qui n'est pas disponible. Propose à l'utilisateur soit un objectif "
                "sans pixel (OUTCOME_TRAFFIC, OUTCOME_AWARENESS, OUTCOME_ENGAGEMENT), "
                "soit de configurer son pixel Meta dans la page Paramètres."
            )

        account = AdAccount(ad_account_id)

        # ── Garde anti-doublon par nom (entre tours / conversations) ─────
        try:
            existing = account.get_campaigns(fields=["name", "status"])
            for c in existing:
                if c.get("name") == campaign_name and c.get("status") not in (
                    "DELETED",
                    "ARCHIVED",
                ):
                    return (
                        f"⚠️ Une campagne nommée « {campaign_name} » existe déjà "
                        f"(id={c['id']}, statut={c.get('status', '?')}). Demande à "
                        "l'utilisateur s'il veut quand même en créer une autre ou "
                        "choisir un autre nom — ne crée rien sans sa confirmation."
                    )
        except FacebookRequestError:
            # Lecture best-effort : on ne bloque pas la création si la liste échoue.
            pass

        try:
            campaign = account.create_campaign(
                params={
                    "name": campaign_name,
                    "objective": objective,
                    "status": "PAUSED",
                    "special_ad_categories": [],
                    # Requis par les comptes ODAX quand le budget est géré au
                    # niveau ad set (pas de CBO) : Meta exige une valeur
                    # explicite, sinon Invalid parameter (100/4834011).
                    "is_adset_budget_sharing_enabled": False,
                }
            )
        except FacebookRequestError as e:
            return _fmt_fb_error(e, "la création de la campagne")

        try:
            adset = account.create_ad_set(
                params={
                    "name": f"{campaign_name} - AdSet",
                    "campaign_id": campaign["id"],
                    "daily_budget": daily_budget,
                    "billing_event": "IMPRESSIONS",
                    "optimization_goal": optimization_goal,
                    "bid_strategy": "LOWEST_COST_WITHOUT_CAP",
                    "targeting": {
                        "geo_locations": {"countries": countries},
                        "age_min": age_min,
                        "age_max": age_max,
                    },
                    "status": "PAUSED",
                }
            )
        except FacebookRequestError as e:
            _rollback_campaign(campaign["id"])
            return _fmt_fb_error(e, "la création de l'ad set")

        try:
            creative = account.create_ad_creative(
                params={
                    "name": f"{campaign_name} - Creative",
                    "object_story_spec": {
                        "page_id": page_id,
                        "link_data": {
                            "message": ad_message,
                            "link": link,
                            "image_hash": image_hash,
                        },
                    },
                }
            )
        except FacebookRequestError as e:
            _rollback_campaign(campaign["id"])
            return _fmt_fb_error(e, "la création du creative")

        try:
            ad = account.create_ad(
                params={
                    "name": f"{campaign_name} - Ad",
                    "adset_id": adset["id"],
                    "creative": {"creative_id": creative["id"]},
                    "status": "PAUSED",
                }
            )
        except FacebookRequestError as e:
            _rollback_campaign(campaign["id"])
            return _fmt_fb_error(e, "la création de l'ad")

        _persist["last_created"] = {
            "campaign_id": campaign["id"],
            "adset_id": adset["id"],
            "creative_id": creative["id"],
            "ad_id": ad["id"],
            "name": campaign_name,
            "objective": objective,
            "daily_budget": daily_budget,
            "targeting": {
                "geo_locations": {"countries": countries},
                "age_min": age_min,
                "age_max": age_max,
            },
            "optimization_goal": optimization_goal,
        }

        return (
            "✅ Campagne complète créée (toutes en PAUSED) :\n"
            f"- Campaign ID : {campaign['id']}\n"
            f"- AdSet ID    : {adset['id']}\n"
            f"- Creative ID : {creative['id']}\n"
            f"- Ad ID       : {ad['id']}"
        )

    @tool
    def upload_image(image_path: str) -> str:
        """Uploade une image locale sur le compte publicitaire et retourne son image_hash.

        Args:
            image_path: chemin local vers l'image (PNG/JPG)
        """
        try:
            image = AdImage(parent_id=ad_account_id)
            image[AdImage.Field.filename] = image_path
            image.remote_create()
            return f"✅ Image uploadée. image_hash = {image[AdImage.Field.hash]}"
        except FacebookRequestError as e:
            return _fmt_fb_error(e, "l'upload de l'image")
        except Exception as e:
            return f"❌ Erreur upload : {e}"

    @tool
    def upload_image_from_url(image_url: str) -> str:
        """Télécharge une image depuis une URL publique puis l'uploade sur le compte publicitaire.
        Retourne l'image_hash à utiliser dans create_full_campaign.

        Args:
            image_url: URL publique de l'image (PNG/JPG accessible sans auth)
        """
        try:
            r = requests.get(image_url, timeout=15)
            r.raise_for_status()
            if len(r.content) > 30 * 1024 * 1024:
                return "❌ Image trop volumineuse (>30 Mo)."
            image = AdImage(parent_id=ad_account_id)
            image[AdImage.Field.bytes] = r.content
            image.remote_create()
            return f"✅ Image téléchargée et uploadée. image_hash = {image[AdImage.Field.hash]}"
        except requests.RequestException as e:
            return f"❌ Téléchargement échoué : {e}"
        except FacebookRequestError as e:
            return _fmt_fb_error(e, "l'upload de l'image depuis URL")
        except Exception as e:
            return f"❌ Erreur upload depuis URL : {e}"

    @tool
    def list_active_campaigns() -> str:
        """Liste les campagnes Meta Ads existantes sur le compte (id, nom, objectif, statut)."""
        try:
            account = AdAccount(ad_account_id)
            campaigns = account.get_campaigns(fields=["id", "name", "objective", "status"])
        except FacebookRequestError as e:
            return _fmt_fb_error(e, "la récupération des campagnes")
        if not campaigns:
            return "Aucune campagne trouvée sur ce compte."
        lines = [
            f"- {c['name']} ({c.get('objective', '?')}) — {c.get('status', '?')} [id={c['id']}]"
            for c in campaigns
        ]
        return "Campagnes du compte :\n" + "\n".join(lines)

    # ── Page Facebook tools ────────────────────────────────────────────

    @tool
    def get_facebook_page_info() -> str:
        """Récupère les informations publiques de la Page Facebook connectée :
        nom, catégorie, description, nombre d'abonnés, lien public, etc.
        """
        try:
            info = meta_pages.get_page_info(page_id, access_token)
        except meta_pages.GraphError as e:
            return f"❌ Erreur Meta lors de la lecture de la page : {e}"
        lines = [
            f"**{info.get('name', '(sans nom)')}**",
            f"- Catégorie : {info.get('category', '—')}",
            f"- Abonnés (followers) : {info.get('followers_count', info.get('fan_count', '—'))}",
            f"- Lien : {info.get('link', '—')}",
        ]
        if info.get("about"):
            lines.append(f"- À propos : {info['about']}")
        if info.get("website"):
            lines.append(f"- Site web : {info['website']}")
        return "\n".join(lines)

    @tool
    def list_facebook_page_posts(limit: int = 5) -> str:
        """Liste les N dernières publications de la Page Facebook avec leurs
        statistiques d'engagement (réactions, commentaires, partages).

        Args:
            limit: nombre de posts à retourner (par défaut 5, max 25)
        """
        limit = max(1, min(limit, 25))
        try:
            posts = meta_pages.list_page_posts(page_id, access_token, limit)
        except meta_pages.GraphError as e:
            return f"❌ Erreur Meta lors de la lecture des posts : {e}"
        if not posts:
            return "Aucune publication trouvée sur cette page."
        out = [f"**{len(posts)} dernières publications :**"]
        for p in posts:
            msg = (p.get("message") or "(sans texte)").strip()
            if len(msg) > 140:
                msg = msg[:137] + "…"
            stats = (
                f"💙 {p.get('reactions', 0)}  💬 {p.get('comments', 0)}  🔁 {p.get('shares', 0)}"
            )
            out.append(f"\n— {p.get('created_time', '?')} — {stats}\n  {msg}")
            if p.get("permalink_url"):
                out.append(f"  🔗 {p['permalink_url']}")
        return "\n".join(out)

    @tool
    def post_to_facebook_page(message: str, link: str = "") -> str:
        """Publie un nouveau post sur la Page Facebook avec le message donné
        et un lien optionnel. ATTENTION : la publication est immédiate et
        publique. Confirme TOUJOURS le contenu exact avec l'utilisateur avant
        d'appeler cette tool.

        Args:
            message: texte de la publication
            link: URL optionnelle à attacher au post
        """
        if not message or not message.strip():
            return "❌ Le message ne peut pas être vide."
        try:
            res = meta_pages.create_page_post(
                page_id, access_token, message.strip(), link.strip() or None
            )
        except meta_pages.GraphError as e:
            return f"❌ Erreur Meta lors de la publication : {e}"
        post_id = res.get("id", "?")
        return f"✅ Publication créée sur la page (id={post_id})."

    @tool
    def get_facebook_page_insights(days: int = 28) -> str:
        """Statistiques agrégées de la Page Facebook sur les N derniers jours :
        impressions, utilisateurs engagés, engagement total, abonnés actuels.

        Args:
            days: période en jours (7, 14, 28). Par défaut 28.
        """
        days = max(1, min(days, 90))
        try:
            stats = meta_pages.get_page_insights(page_id, access_token, days)
        except meta_pages.GraphError as e:
            return f"❌ Erreur Meta lors de la lecture des insights : {e}"
        return (
            f"**Statistiques Page ({days} derniers jours)**\n"
            f"- Impressions : {stats.get('impressions', 0):,}\n"
            f"- Utilisateurs engagés : {stats.get('engaged_users', 0):,}\n"
            f"- Engagements (réactions, commentaires, partages) : {stats.get('post_engagements', 0):,}\n"
            f"- Abonnés actuels : {stats.get('fans', 0):,}"
        )

    tools = [
        create_full_campaign,
        upload_image,
        upload_image_from_url,
        list_active_campaigns,
        get_facebook_page_info,
        list_facebook_page_posts,
        post_to_facebook_page,
        get_facebook_page_insights,
    ]
    return tools, _persist


def test_connection(access_token: str, ad_account_id: str) -> tuple[bool, str]:
    try:
        _init_api(access_token)
        account = AdAccount(ad_account_id).api_get(fields=["name", "account_status"])
        return True, account.get("name", "(sans nom)")
    except Exception as exc:
        return False, str(exc)


# ─── Read-only helpers used by HTTP endpoints (not langchain tools) ──────────


def _safe_float(v: Any, default: float = 0.0) -> float:
    try:
        if v is None or v == "":
            return default
        return float(v)
    except (TypeError, ValueError):
        return default


def _safe_int(v: Any, default: int = 0) -> int:
    try:
        if v is None or v == "":
            return default
        return int(float(v))
    except (TypeError, ValueError):
        return default


def _count_conversions(actions: Any) -> int:
    if not isinstance(actions, list):
        return 0
    total = 0
    wanted = {"purchase", "offsite_conversion.fb_pixel_purchase", "lead", "complete_registration"}
    for a in actions:
        if isinstance(a, dict) and a.get("action_type") in wanted:
            total += _safe_int(a.get("value"))
    return total


def _extract_revenue(action_values: Any) -> float:
    """`action_values` (valeur monétaire des conversions) revient comme une liste
    de {action_type, value}. On somme les achats trackés par le pixel pour obtenir
    le revenu attribué — la base du ROI (« j'ai dépensé X, gagné Y »)."""
    if not isinstance(action_values, list):
        return 0.0
    total = 0.0
    wanted = {"purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"}
    for a in action_values:
        if isinstance(a, dict) and a.get("action_type") in wanted:
            total += _safe_float(a.get("value"))
    return round(total, 2)


def list_campaigns_with_insights(
    access_token: str,
    ad_account_id: str,
    date_preset: str = "last_30d",
    since: Optional[str] = None,
    until: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Return campaigns + aggregated insights for the given date preset or a
    custom since/until time range.

    date_preset: 'last_7d', 'last_14d', 'last_30d', 'last_90d', 'today', 'yesterday'.
    """
    _init_api(access_token)
    account = AdAccount(ad_account_id)
    dp = _date_params(date_preset, since, until)
    campaigns = account.get_campaigns(
        fields=["id", "name", "objective", "status", "daily_budget"]
    )
    out: list[dict[str, Any]] = []
    for c in campaigns:
        insights = []
        try:
            insights = c.get_insights(
                fields=["impressions", "clicks", "spend", "ctr", "cpc", "actions", "purchase_roas", "action_values"],
                params=dp,
            )
        except FacebookRequestError:
            insights = []
        agg = {
            "impressions": 0, "clicks": 0, "spend": 0.0, "ctr": 0.0, "cpc": 0.0,
            "conversions": 0, "roas": 0.0, "revenue": 0.0, "roi": 0.0,
        }
        if insights:
            row = insights[0]
            agg["impressions"] = _safe_int(row.get("impressions"))
            agg["clicks"] = _safe_int(row.get("clicks"))
            agg["spend"] = _safe_float(row.get("spend"))
            agg["ctr"] = _safe_float(row.get("ctr"))
            agg["cpc"] = _safe_float(row.get("cpc"))
            agg["conversions"] = _count_conversions(row.get("actions"))
            agg["revenue"] = _extract_revenue(row.get("action_values"))
            agg["roas"] = _extract_roas(row.get("purchase_roas"))
            # Si Meta ne renvoie pas purchase_roas mais qu'on a revenu + dépense,
            # on le calcule nous-mêmes (ROAS = revenu / dépense).
            if not agg["roas"] and agg["spend"] and agg["revenue"]:
                agg["roas"] = round(agg["revenue"] / agg["spend"], 2)
            # ROI % = (revenu − dépense) / dépense × 100.
            if agg["spend"]:
                agg["roi"] = round((agg["revenue"] - agg["spend"]) / agg["spend"] * 100, 1)
        daily_budget_cents = _safe_float(c.get("daily_budget"))
        out.append(
            {
                "id": c.get("id"),
                "name": c.get("name"),
                "objective": c.get("objective"),
                "status": c.get("status"),
                "daily_budget": daily_budget_cents / 100.0 if daily_budget_cents else None,
                **agg,
            }
        )
    return out


def _extract_roas(value: Any) -> float:
    """purchase_roas comes back as a list of {action_type, value}. Take the first."""
    if isinstance(value, list):
        for a in value:
            if isinstance(a, dict):
                try:
                    return round(float(a.get("value")), 2)
                except (TypeError, ValueError):
                    continue
    return 0.0


def _date_params(
    date_preset: str = "last_30d",
    since: Optional[str] = None,
    until: Optional[str] = None,
) -> dict[str, Any]:
    """Build the insights date selector: a custom time_range when both since and
    until are given, otherwise the named date_preset."""
    if since and until:
        return {"time_range": {"since": since, "until": until}}
    return {"date_preset": date_preset}


def _budget_usd(daily_budget: Any, lifetime_budget: Any) -> Optional[float]:
    """Meta budgets come back in account-currency *cents*. Prefer daily, fall
    back to lifetime; return USD (None when neither is set)."""
    cents = _safe_float(daily_budget) or _safe_float(lifetime_budget)
    return round(cents / 100.0, 2) if cents else None


def _summarize_targeting(targeting: Any) -> str:
    """Human-readable one-liner from an ad set's targeting spec: age range,
    countries and gender. Returns '—' when nothing usable is present."""
    if not isinstance(targeting, dict):
        return "—"
    parts: list[str] = []
    age_min = targeting.get("age_min")
    age_max = targeting.get("age_max")
    if age_min or age_max:
        parts.append(f"{age_min or 18}-{age_max or 65} ans")
    geo = targeting.get("geo_locations")
    if isinstance(geo, dict):
        countries = geo.get("countries")
        if isinstance(countries, list) and countries:
            parts.append(", ".join(countries[:5]) + ("…" if len(countries) > 5 else ""))
    genders = targeting.get("genders")
    if genders == [1]:
        parts.append("Hommes")
    elif genders == [2]:
        parts.append("Femmes")
    else:
        parts.append("Tous genres")
    return " · ".join(parts) if parts else "—"


_FORMAT_LABELS = {
    "VIDEO": "Vidéo",
    "PHOTO": "Image",
    "SHARE": "Lien",
    "STATUS": "Texte",
    "LINK": "Lien",
}


def _format_label(object_type: Any) -> str:
    if not object_type:
        return "—"
    return _FORMAT_LABELS.get(str(object_type).upper(), str(object_type).title())


def _detail_adsets(campaign: Campaign, dp: dict) -> list[dict[str, Any]]:
    """Ad sets : budget/audience depuis l'objet, métriques depuis les insights.

    NOTE : contrairement aux sections breakdown, une erreur Meta ici N'EST PAS
    avalée — elle remonte pour que la route renvoie un vrai message d'erreur au
    lieu d'un état « aucun ad set » trompeur."""
    adsets: list[dict[str, Any]] = []
    meta_by_id: dict[str, dict] = {}
    for a in campaign.get_ad_sets(
        fields=["name", "status", "daily_budget", "lifetime_budget", "optimization_goal", "targeting"]
    ):
        meta_by_id[a.get("id")] = {
            "name": a.get("name"),
            "status": a.get("status"),
            "budget": _budget_usd(a.get("daily_budget"), a.get("lifetime_budget")),
            "audience": _summarize_targeting(a.get("targeting")),
            "optimization_goal": a.get("optimization_goal"),
        }
    ins_by_id: dict[str, dict] = {}
    for r in campaign.get_insights(
        fields=["adset_id", "adset_name", "spend", "impressions", "clicks", "ctr", "cpc", "purchase_roas"],
        params={"level": "adset", **dp},
    ):
        ins_by_id[r.get("adset_id")] = r
    for aid in (meta_by_id.keys() or ins_by_id.keys()):
        m = meta_by_id.get(aid, {})
        r = ins_by_id.get(aid, {})
        adsets.append(
            {
                "name": m.get("name") or r.get("adset_name") or "Ad set",
                "status": (m.get("status") or "ACTIVE"),
                "budget": m.get("budget"),
                "audience": m.get("audience"),
                "optimization_goal": m.get("optimization_goal"),
                "impressions": _safe_int(r.get("impressions")),
                "clicks": _safe_int(r.get("clicks")),
                "spend": _safe_float(r.get("spend")),
                "cpc": round(_safe_float(r.get("cpc")), 2),
                "ctr": round(_safe_float(r.get("ctr")), 2),
                "roas": _extract_roas(r.get("purchase_roas")),
            }
        )
    return adsets


def _detail_ads(campaign: Campaign, dp: dict) -> list[dict[str, Any]]:
    """Ads : aperçu créatif/format depuis l'objet, métriques depuis les insights."""
    ads: list[dict[str, Any]] = []
    meta_by_id: dict[str, dict] = {}
    for a in campaign.get_ads(fields=["name", "status", "creative{thumbnail_url,object_type}"]):
        creative = a.get("creative") or {}
        meta_by_id[a.get("id")] = {
            "name": a.get("name"),
            "status": a.get("status"),
            "thumbnail_url": creative.get("thumbnail_url") if isinstance(creative, dict) else None,
            "format": (creative.get("object_type") if isinstance(creative, dict) else None) or "—",
        }
    ins_by_id: dict[str, dict] = {}
    for r in campaign.get_insights(
        fields=["ad_id", "ad_name", "ctr", "cpc", "spend", "impressions", "clicks", "actions"],
        params={"level": "ad", **dp},
    ):
        ins_by_id[r.get("ad_id")] = r
    for aid in (meta_by_id.keys() or ins_by_id.keys()):
        m = meta_by_id.get(aid, {})
        r = ins_by_id.get(aid, {})
        ads.append(
            {
                "name": m.get("name") or r.get("ad_name") or "Ad",
                "status": (m.get("status") or "ACTIVE"),
                "format": _format_label(m.get("format")),
                "thumbnail_url": m.get("thumbnail_url"),
                "impressions": _safe_int(r.get("impressions")),
                "clicks": _safe_int(r.get("clicks")),
                "ctr": round(_safe_float(r.get("ctr")), 2),
                "cpc": round(_safe_float(r.get("cpc")), 2),
                "spend": _safe_float(r.get("spend")),
                "conversions": _count_conversions(r.get("actions")),
            }
        )
    return ads


def _detail_demographics(campaign: Campaign, dp: dict) -> list[dict[str, Any]]:
    """Démographie : impressions par âge × genre (best-effort, jamais bloquant)."""
    demographics: list[dict[str, Any]] = []
    try:
        agg: dict[str, dict[str, int]] = {}
        for r in campaign.get_insights(
            fields=["impressions"],
            params={"breakdowns": "age,gender", **dp},
        ):
            age = r.get("age", "?")
            bucket = agg.setdefault(age, {"male": 0, "female": 0})
            imp = _safe_int(r.get("impressions"))
            if r.get("gender") == "male":
                bucket["male"] += imp
            elif r.get("gender") == "female":
                bucket["female"] += imp
        for age in sorted(agg.keys()):
            demographics.append({"age": age, "male": agg[age]["male"], "female": agg[age]["female"]})
    except FacebookRequestError:
        demographics = []
    return demographics


def _detail_placements(campaign: Campaign, dp: dict) -> list[dict[str, Any]]:
    """Placements : part des impressions par plateforme (best-effort)."""
    placements: list[dict[str, Any]] = []
    try:
        rows = list(
            campaign.get_insights(
                fields=["impressions"],
                params={"breakdowns": "publisher_platform", **dp},
            )
        )
        total = sum(_safe_int(r.get("impressions")) for r in rows) or 1
        for r in rows:
            imp = _safe_int(r.get("impressions"))
            name = (r.get("publisher_platform") or "?").replace("_", " ").title()
            placements.append({"name": name, "value": round(imp * 100 / total, 1)})
    except FacebookRequestError:
        placements = []
    return placements


# Sections valides pour le chargement à la demande (un onglet du panneau = une section).
_DETAIL_SECTIONS = ("adsets", "ads", "demographics", "placements")


def get_campaign_detail(
    access_token: str,
    campaign_id: str,
    date_preset: str = "last_30d",
    since: Optional[str] = None,
    until: Optional[str] = None,
    section: Optional[str] = None,
) -> dict[str, Any]:
    """Ad sets, ads, démographie et placements réels d'une campagne.

    `section` = "adsets" | "ads" | "demographics" | "placements" : si fournie,
    SEULE cette section déclenche des appels Meta (chargement à la demande par
    onglet → ~2 appels au lieu de 6, ce qui ménage la limite d'appels par
    utilisateur de Meta). `None` charge tout (compatibilité ascendante).
    Les clés non demandées restent des listes vides — le frontend lit seulement
    celle de l'onglet actif.
    """
    _init_api(access_token)
    campaign = Campaign(campaign_id)
    dp = _date_params(date_preset, since, until)
    out: dict[str, Any] = {"adsets": [], "ads": [], "demographics": [], "placements": []}
    if section in (None, "adsets"):
        out["adsets"] = _detail_adsets(campaign, dp)
    if section in (None, "ads"):
        out["ads"] = _detail_ads(campaign, dp)
    if section in (None, "demographics"):
        out["demographics"] = _detail_demographics(campaign, dp)
    if section in (None, "placements"):
        out["placements"] = _detail_placements(campaign, dp)
    return out


def list_custom_audiences(
    access_token: str,
    ad_account_id: str,
) -> list[dict[str, Any]]:
    """Real custom/lookalike/saved audiences for the account.

    Meta does not expose per-audience member demographics or linked campaigns,
    so we only return the metadata it actually provides.
    """
    from facebook_business.adobjects.customaudience import CustomAudience

    _init_api(access_token)
    account = AdAccount(ad_account_id)
    fields = [
        "name", "subtype", "approximate_count_lower_bound",
        "approximate_count_upper_bound", "operation_status", "delivery_status",
        "time_created", "time_updated", "description", "retention_days",
    ]
    try:
        rows = account.get_custom_audiences(fields=fields)
    except FacebookRequestError:
        return []

    def _type(subtype: str) -> str:
        s = (subtype or "").upper()
        if s == "LOOKALIKE":
            return "Lookalike"
        if s in ("CUSTOM", "WEBSITE", "ENGAGEMENT", "APP", "OFFLINE_CONVERSION", "VIDEO"):
            return "Custom"
        return "Saved"

    def _status(row: dict) -> str:
        st = row.get("operation_status") or {}
        code = st.get("code") if isinstance(st, dict) else None
        low = _safe_int(row.get("approximate_count_lower_bound"), -1)
        if low != -1 and low < 1000:
            return "Too Small"
        if code in (200, None):
            return "Ready"
        return "Updating"

    out: list[dict[str, Any]] = []
    for r in rows:
        low = _safe_int(r.get("approximate_count_lower_bound"), -1)
        high = _safe_int(r.get("approximate_count_upper_bound"), -1)
        out.append(
            {
                "id": r.get("id"),
                "name": r.get("name") or "(sans nom)",
                "type": _type(r.get("subtype")),
                "size_low": low if low >= 0 else 0,
                "size_high": high if high >= 0 else (low if low >= 0 else 0),
                "status": _status(r),
                "description": r.get("description"),
                "retention_days": _safe_int(r.get("retention_days")),
                "time_created": r.get("time_created"),
                "time_updated": r.get("time_updated"),
            }
        )
    return out


def _exact_windows(days: int) -> tuple[dict[str, str], dict[str, str]]:
    """Build the current and immediately-preceding time windows of exactly `days`
    days each, so "7 days" really means 7 days (not Meta's coarse last_7d/30d
    presets) and we can compute a real period-over-period change.

    Returns (current_range, previous_range), each a {"since", "until"} dict.
    """
    today = datetime.now(timezone.utc).date()
    cur_until = today
    cur_since = today - timedelta(days=days - 1)
    prev_until = cur_since - timedelta(days=1)
    prev_since = prev_until - timedelta(days=days - 1)
    return (
        {"since": cur_since.isoformat(), "until": cur_until.isoformat()},
        {"since": prev_since.isoformat(), "until": prev_until.isoformat()},
    )


def _pct_change(cur: float, prev: float) -> Optional[float]:
    """Period-over-period percentage change. None when there's no baseline
    (avoids a misleading 0%/inf when the previous period had no data)."""
    if not prev:
        return None
    return round((cur - prev) / prev * 100, 1)


def _account_kpi_row(account: AdAccount, sel: dict[str, Any]) -> dict[str, Any]:
    """`sel` is the date selector: {"time_range": {...}} or {"date_preset": "..."}."""
    try:
        rows = account.get_insights(
            fields=["impressions", "clicks", "spend", "ctr", "cpc", "cpm", "reach", "actions", "action_values"],
            params={**sel, "level": "account"},
        )
        if rows:
            return rows[0]
    except FacebookRequestError:
        pass
    return {}


def _custom_windows(since: str, until: str) -> tuple[dict[str, str], dict[str, str]]:
    """Current = [since, until]; previous = the equally-long window just before it
    (pour le calcul du change %). Façon « plage de dates Meta Ads »."""
    s = datetime.fromisoformat(since).date()
    u = datetime.fromisoformat(until).date()
    span = (u - s).days
    prev_until = s - timedelta(days=1)
    prev_since = prev_until - timedelta(days=span)
    return (
        {"since": s.isoformat(), "until": u.isoformat()},
        {"since": prev_since.isoformat(), "until": prev_until.isoformat()},
    )


def get_account_dashboard(
    access_token: str,
    ad_account_id: str,
    days: int = 30,
    all_time: bool = False,
    since: Optional[str] = None,
    until: Optional[str] = None,
) -> dict[str, Any]:
    """Return aggregated KPIs + time series + age/gender breakdowns for the account.

    Uses an exact `days`-long time window (and the matching previous window for
    real change %), never a coarse preset. When `all_time` is True, uses Meta's
    `maximum` preset to cover the account's whole history (no change %, since
    there is no comparable previous window). A custom `since`/`until` window
    (plage de dates façon Meta Ads) is also supported.
    """
    _init_api(access_token)
    account = AdAccount(ad_account_id)

    _prev_range: dict[str, str] = {}
    if all_time:
        sel: dict[str, Any] = {"date_preset": "maximum"}
    elif since and until:
        cur_range, _prev_range = _custom_windows(since, until)
        sel = {"time_range": cur_range}
    else:
        cur_range, _prev_range = _exact_windows(days)
        sel = {"time_range": cur_range}

    # Aggregate KPIs for the current window. Previous window only exists for a
    # bounded period (used for change %); all-time has no baseline.
    kpi_row = _account_kpi_row(account, sel)
    prev_row = {} if all_time else _account_kpi_row(account, {"time_range": _prev_range})

    def _chg(field: str, *, integer: bool = False) -> Optional[float]:
        if all_time:
            return None
        cur = _safe_int(kpi_row.get(field)) if integer else _safe_float(kpi_row.get(field))
        prev = _safe_int(prev_row.get(field)) if integer else _safe_float(prev_row.get(field))
        return _pct_change(cur, prev)

    # Revenu / ROAS / profit au niveau compte (pour les KPIs ROI de l'Overview).
    revenue = _extract_revenue(kpi_row.get("action_values"))
    spend_total = _safe_float(kpi_row.get("spend"))
    roas = round(revenue / spend_total, 2) if spend_total else 0.0
    profit = round(revenue - spend_total, 2)
    prev_revenue = _extract_revenue(prev_row.get("action_values"))

    changes = {
        "impressions": _chg("impressions", integer=True),
        "clicks": _chg("clicks", integer=True),
        "reach": _chg("reach", integer=True),
        "spend": _chg("spend"),
        "ctr": _chg("ctr"),
        "cpc": _chg("cpc"),
        "cpm": _chg("cpm"),
        "revenue": None if all_time else _pct_change(revenue, prev_revenue),
    }

    # Daily series for charts.
    series: list[dict[str, Any]] = []
    try:
        rows = account.get_insights(
            fields=["impressions", "reach", "clicks", "spend", "ctr"],
            params={**sel, "time_increment": 1, "level": "account"},
        )
        for r in rows:
            series.append(
                {
                    "date": r.get("date_start") or r.get("date_stop") or "",
                    "impressions": _safe_int(r.get("impressions")),
                    "reach": _safe_int(r.get("reach")),
                    "clicks": _safe_int(r.get("clicks")),
                    "spend": _safe_float(r.get("spend")),
                    "ctr": _safe_float(r.get("ctr")),
                }
            )
    except FacebookRequestError:
        pass

    # Age breakdown.
    age_breakdown: list[dict[str, Any]] = []
    try:
        rows = account.get_insights(
            fields=["impressions", "spend"],
            params={**sel, "breakdowns": "age", "level": "account"},
        )
        total = sum(_safe_int(r.get("impressions")) for r in rows) or 1
        for r in rows:
            imp = _safe_int(r.get("impressions"))
            age_breakdown.append(
                {"name": r.get("age", "?"), "value": round(imp * 100 / total, 1)}
            )
    except FacebookRequestError:
        pass

    # Gender breakdown.
    gender_breakdown: list[dict[str, Any]] = []
    try:
        rows = account.get_insights(
            fields=["impressions"],
            params={**sel, "breakdowns": "gender", "level": "account"},
        )
        total = sum(_safe_int(r.get("impressions")) for r in rows) or 1
        for r in rows:
            imp = _safe_int(r.get("impressions"))
            gender_breakdown.append(
                {"name": r.get("gender", "?"), "value": round(imp * 100 / total, 1)}
            )
    except FacebookRequestError:
        pass

    # Country breakdown (for the world map). Meta returns ISO alpha-2 codes.
    geo_breakdown: list[dict[str, Any]] = []
    try:
        rows = account.get_insights(
            fields=["impressions", "clicks", "spend", "ctr"],
            params={**sel, "breakdowns": "country", "level": "account"},
        )
        for r in rows:
            geo_breakdown.append(
                {
                    "code": r.get("country"),
                    "spend": _safe_float(r.get("spend")),
                    "impressions": _safe_int(r.get("impressions")),
                    "clicks": _safe_int(r.get("clicks")),
                    "ctr": _safe_float(r.get("ctr")),
                }
            )
    except FacebookRequestError:
        pass

    return {
        "kpi_row": kpi_row,
        "changes": changes,
        "series": series,
        "age_breakdown": age_breakdown,
        "gender_breakdown": gender_breakdown,
        "geo_breakdown": geo_breakdown,
        "revenue": revenue,
        "roas": roas,
        "profit": profit,
    }


def get_account_audience_reach(
    access_token: str,
    ad_account_id: str,
    days: int = 30,
    all_time: bool = False,
) -> dict[str, Any]:
    """The audience actually reached by the account's delivered campaigns over the
    last `days` days: age, gender and country breakdowns (share of impressions),
    placement split, and total people reached. When `all_time` is True, covers
    the account's whole history via Meta's `maximum` preset.

    This is the real engaged/reached audience — distinct from saved Custom
    Audiences, whose member demographics Meta never exposes.
    """
    _init_api(access_token)
    account = AdAccount(ad_account_id)
    sel: dict[str, Any] = {"date_preset": "maximum"} if all_time else {"time_range": _exact_windows(days)[0]}

    def _share_breakdown(breakdown: str, key: str) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        try:
            rows = list(
                account.get_insights(
                    fields=["impressions"],
                    params={**sel, "breakdowns": breakdown, "level": "account"},
                )
            )
            total = sum(_safe_int(r.get("impressions")) for r in rows) or 1
            for r in rows:
                imp = _safe_int(r.get("impressions"))
                name = r.get(key, "?")
                out.append({"name": name, "value": round(imp * 100 / total, 1)})
        except FacebookRequestError:
            pass
        return out

    age = _share_breakdown("age", "age")
    gender = _share_breakdown("gender", "gender")

    # Demographics grid (age × gender, raw impressions) for the GroupedBar chart.
    demographics: list[dict[str, Any]] = []
    try:
        agg: dict[str, dict[str, int]] = {}
        for r in account.get_insights(
            fields=["impressions"],
            params={**sel, "breakdowns": "age,gender", "level": "account"},
        ):
            a = r.get("age", "?")
            bucket = agg.setdefault(a, {"male": 0, "female": 0})
            imp = _safe_int(r.get("impressions"))
            if r.get("gender") == "male":
                bucket["male"] += imp
            elif r.get("gender") == "female":
                bucket["female"] += imp
        for a in sorted(agg.keys()):
            demographics.append({"age": a, "male": agg[a]["male"], "female": agg[a]["female"]})
    except FacebookRequestError:
        pass

    # Placements: share of impressions by publisher platform.
    placements: list[dict[str, Any]] = []
    try:
        rows = list(
            account.get_insights(
                fields=["impressions"],
                params={**sel, "breakdowns": "publisher_platform", "level": "account"},
            )
        )
        total = sum(_safe_int(r.get("impressions")) for r in rows) or 1
        for r in rows:
            imp = _safe_int(r.get("impressions"))
            name = (r.get("publisher_platform") or "?").replace("_", " ").title()
            placements.append({"name": name, "value": round(imp * 100 / total, 1)})
    except FacebookRequestError:
        pass

    # Country breakdown (reuses ISO alpha-2 codes for the world map).
    geo_breakdown: list[dict[str, Any]] = []
    try:
        rows = account.get_insights(
            fields=["impressions", "clicks", "spend", "ctr"],
            params={**sel, "breakdowns": "country", "level": "account"},
        )
        for r in rows:
            geo_breakdown.append(
                {
                    "code": r.get("country"),
                    "spend": _safe_float(r.get("spend")),
                    "impressions": _safe_int(r.get("impressions")),
                    "clicks": _safe_int(r.get("clicks")),
                    "ctr": _safe_float(r.get("ctr")),
                }
            )
    except FacebookRequestError:
        pass

    # Total people reached over the window.
    reach_total = 0
    try:
        rows = account.get_insights(
            fields=["reach"],
            params={**sel, "level": "account"},
        )
        if rows:
            reach_total = _safe_int(rows[0].get("reach"))
    except FacebookRequestError:
        pass

    return {
        "reach_total": reach_total,
        "age_breakdown": age,
        "gender_breakdown": gender,
        "demographics": demographics,
        "placements": placements,
        "geo_breakdown": geo_breakdown,
    }


def upload_image_bytes(
    access_token: str,
    ad_account_id: str,
    data: bytes,
) -> tuple[Optional[str], Optional[str]]:
    """Upload raw image bytes via a temp file. Returns (image_hash, error)."""
    import os, tempfile
    tmp_path: Optional[str] = None
    try:
        _init_api(access_token)
        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
            tmp.write(data)
            tmp_path = tmp.name
        image = AdImage(parent_id=ad_account_id)
        image[AdImage.Field.filename] = tmp_path
        image.remote_create()
        return image[AdImage.Field.hash], None
    except FacebookRequestError as e:
        return None, _fmt_fb_error(e, "l'upload de l'image")
    except Exception as e:
        return None, f"Erreur lors de l'upload : {e}"
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
