"""Graph API helpers for Facebook Page operations.

We use plain `requests` rather than the facebook-business SDK here because the
Pages endpoints are simple HTTP and the SDK's verbose object model is overkill.

All functions take the USER access token. When a page-level action requires
a Page Access Token (publishing posts, reading some insights), we resolve it
on the fly via /me/accounts.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import requests

logger = logging.getLogger(__name__)

GRAPH = "https://graph.facebook.com/v21.0"
TIMEOUT = 20


class GraphError(RuntimeError):
    """Raised when Meta Graph returns an error."""


def _check(resp: requests.Response) -> dict:
    try:
        data = resp.json()
    except ValueError:
        raise GraphError(f"Réponse non JSON ({resp.status_code}) : {resp.text[:200]}")
    if not resp.ok or (isinstance(data, dict) and "error" in data):
        err = data.get("error", {}) if isinstance(data, dict) else {}
        msg = err.get("message") or resp.text[:200]
        code = err.get("code")
        sub = err.get("error_subcode")
        suffix = ""
        if code is not None or sub is not None:
            suffix = f" (code={code}, subcode={sub})"
        raise GraphError(f"{msg}{suffix}")
    return data


def resolve_page_token(user_token: str, page_id: str) -> str:
    """Résout le Page Access Token pour `page_id`. Gère les DEUX types de token :

    1. Token UTILISATEUR → on liste les pages gérées via /me/accounts (scope
       `pages_show_list`) et on en extrait l'access_token de la page cible.
    2. Token de PAGE déjà fourni → /me/accounts renvoie alors l'erreur (#100)
       « nonexisting field (accounts) » (un node Page n'a pas d'arête accounts).
       Dans ce cas on vérifie via /me que le token EST bien celui de la page cible
       et on le retourne tel quel.

    Un Page Access Token (+ `pages_read_engagement`) est requis pour lire les
    summaries d'engagement et pour publier."""
    # Cas 1 : token utilisateur — énumération des pages gérées.
    try:
        data = _check(requests.get(
            f"{GRAPH}/me/accounts",
            params={"access_token": user_token, "fields": "id,access_token,name"},
            timeout=TIMEOUT,
        ))
        for p in data.get("data", []):
            if str(p.get("id")) == str(page_id):
                token = p.get("access_token")
                if not token:
                    raise GraphError("Page trouvée mais aucun access_token retourné.")
                return token
        # Page absente de la liste : peut-être un token de page → on tente le cas 2.
    except GraphError as e:
        # /me/accounts échoue typiquement avec (#100) quand le token est DÉJÀ un
        # token de page (me = node Page, qui n'a pas de champ `accounts`).
        logger.info("/me/accounts indisponible (token de page probable ?) : %s", e)

    # Cas 2 : le token fourni est peut-être directement celui de la page cible.
    me = _check(requests.get(
        f"{GRAPH}/me",
        params={"access_token": user_token, "fields": "id,name"},
        timeout=TIMEOUT,
    ))
    if str(me.get("id")) == str(page_id):
        return user_token  # le token fourni EST le Page Access Token de la page cible

    raise GraphError(
        f"Page id={page_id} introuvable : le token n'énumère pas cette page "
        f"(/me/accounts) et n'est pas non plus le token de cette page "
        f"(/me.id={me.get('id')})."
    )


def get_page_info(page_id: str, user_token: str) -> dict[str, Any]:
    fields = (
        "name,category,about,fan_count,followers_count,link,website,picture.type(large)"
    )
    resp = requests.get(
        f"{GRAPH}/{page_id}",
        params={"access_token": user_token, "fields": fields},
        timeout=TIMEOUT,
    )
    data = _check(resp)
    # Flatten picture.data.url
    pic = data.get("picture", {})
    if isinstance(pic, dict):
        data["picture_url"] = pic.get("data", {}).get("url")
    return data


# `attachments{...}` porte le média du post : media_type (photo|video|link|album…)
# et, pour une vidéo, l'URL source (mp4) lisible directement dans un <video>.
_ATTACH = "attachments{media_type,type,media,target,url,subattachments}"
_POST_FIELDS = (
    "message,created_time,permalink_url,full_picture,"
    f"{_ATTACH},"
    "reactions.summary(total_count).limit(0),"
    "comments.summary(total_count).limit(0),"
    "shares"
)

# Engagement summaries (reactions/comments) require the `pages_read_engagement`
# permission. When a token lacks it Meta returns error (#10); we then fall back
# to these minimal fields so the posts themselves still load (engagement at 0).
_POST_FIELDS_MINIMAL = f"message,created_time,permalink_url,full_picture,{_ATTACH}"


def _fetch_posts(
    page_id: str, token: str, params: dict[str, Any]
) -> tuple[dict, Optional[str]]:
    """GET /{page}/posts. En cas d'erreur sur les champs d'engagement, on dégrade
    vers des champs minimaux MAIS on conserve le message Meta réel comme `reason`.

    Retourne (json, reason) où `reason` est None si l'engagement a bien été chargé,
    sinon la chaîne de l'erreur Meta exacte (message + code + subcode). On ne masque
    plus la cause derrière un simple booléen."""
    try:
        data = _check(requests.get(
            f"{GRAPH}/{page_id}/posts",
            params={**params, "fields": _POST_FIELDS},
            timeout=TIMEOUT,
        ))
        return data, None
    except GraphError as e:
        reason = str(e)  # ← on garde le message Meta exact (code/subcode)
        logger.warning("Engagement non chargé sur /%s/posts : %s", page_id, reason)
        # Re-essai en champs minimaux : si ça échoue encore, le token a un problème
        # plus profond, on laisse donc cette erreur remonter.
        data = _check(requests.get(
            f"{GRAPH}/{page_id}/posts",
            params={**params, "fields": _POST_FIELDS_MINIMAL},
            timeout=TIMEOUT,
        ))
        return data, reason


def _parse_attachment(row: dict[str, Any]) -> tuple[Optional[str], Optional[str]]:
    """Extrait (media_type, media_url) du premier attachment d'un post.

    - media_type ∈ {photo, video, link, album, status, …} (valeur Meta réelle,
      normalisée en minuscules) ou None si le post n'a pas de média.
    - media_url : pour une vidéo → l'URL source (mp4) jouable dans un <video> ;
      pour une photo → l'image pleine résolution. None si indisponible.
    On ne fabrique aucune donnée : si Meta ne renvoie pas la source, media_url reste
    None et le frontend retombe sur full_picture / le permalien."""
    atts = (row.get("attachments") or {}).get("data") or []
    if not atts:
        return None, None
    att = atts[0]
    raw_type = (att.get("media_type") or att.get("type") or "").lower()
    media = att.get("media") or {}
    media_url: Optional[str] = None
    if raw_type == "video":
        media_url = media.get("source") or None
    if not media_url:
        img = media.get("image") if isinstance(media.get("image"), dict) else None
        if img:
            media_url = img.get("src")
    return (raw_type or None), media_url


def _parse_post(row: dict[str, Any]) -> dict[str, Any]:
    media_type, media_url = _parse_attachment(row)
    return {
        "id": row.get("id"),
        "message": row.get("message"),
        "created_time": row.get("created_time"),
        "permalink_url": row.get("permalink_url"),
        "full_picture": row.get("full_picture"),
        "media_type": media_type,
        "media_url": media_url,
        "reactions": (row.get("reactions") or {}).get("summary", {}).get("total_count", 0),
        "comments": (row.get("comments") or {}).get("summary", {}).get("total_count", 0),
        "shares": (row.get("shares") or {}).get("count", 0),
    }


def _page_token_or_user(
    page_id: str, user_token: str
) -> tuple[str, bool, Optional[str]]:
    """Lire les posts d'une Page (et leurs summaries réactions/commentaires) exige
    un Page Access Token. Si on ne peut pas le résoudre, on retombe sur le token
    utilisateur MAIS on journalise et on expose la raison — au lieu de prétendre
    silencieusement que c'est un problème d'App Review.

    Retourne (token, used_page_token, token_error) où `used_page_token` indique si
    on a bien obtenu un Page Access Token, et `token_error` la raison de l'échec."""
    try:
        return resolve_page_token(user_token, page_id), True, None
    except GraphError as e:
        msg = str(e)
        logger.warning("Page token non résolu pour page=%s : %s", page_id, msg)
        return user_token, False, msg


def list_page_posts(
    page_id: str, user_token: str, limit: int = 5
) -> list[dict[str, Any]]:
    token, _used_page_token, _token_error = _page_token_or_user(page_id, user_token)
    data, _reason = _fetch_posts(page_id, token, {"access_token": token, "limit": limit})
    return [_parse_post(row) for row in data.get("data", [])]


def get_page_post_summary(
    page_id: str, user_token: str, limit: int = 100
) -> dict[str, Any]:
    """Aggregate the page's recent posts: counts + likes/comments/shares totals,
    plus the top 3 posts by engagement. Everything from the real /posts edge.

    Dégradation gracieuse : si l'engagement est réellement indisponible, les posts
    se chargent quand même (engagement à 0) et `engagement_blocked_reason` porte la
    VRAIE raison Meta (token de page non résolu, scope manquant, token expiré…)."""
    token, used_page_token, token_error = _page_token_or_user(page_id, user_token)
    base = {"access_token": token, "limit": limit}
    # `summary=true` gives an exact total_count but is not supported on every
    # edge — fall back to a plain request and count what we fetched.
    try:
        data, reason = _fetch_posts(page_id, token, {**base, "summary": "true"})
    except GraphError:
        data, reason = _fetch_posts(page_id, token, base)
    posts = [_parse_post(row) for row in data.get("data", [])]

    # La VRAIE raison vient du chargement effectif de l'engagement sur /posts :
    # `reason` est autoritaire. Un échec de résolution du Page Token (`token_error`)
    # n'est ajouté qu'en CONTEXTE — car un token de page utilisé directement peut
    # très bien charger l'engagement même si /me/accounts a échoué (#100).
    engagement_blocked_reason: Optional[str]
    if reason and token_error:
        engagement_blocked_reason = (
            f"{reason} — résolution du Page Token : {token_error} "
            "(scopes requis : pages_read_engagement + pages_show_list)."
        )
    elif reason:
        engagement_blocked_reason = reason
    else:
        # Engagement chargé correctement → pas de blocage, même si on a dû recourir
        # à un token de repli (on le journalise seulement à titre informatif).
        if token_error:
            logger.info("Engagement chargé malgré la résolution token : %s", token_error)
        engagement_blocked_reason = None

    total = (data.get("summary") or {}).get("total_count")
    posts_count = int(total) if isinstance(total, (int, float)) else len(posts)

    reactions = sum(p["reactions"] for p in posts)
    comments = sum(p["comments"] for p in posts)
    shares = sum(p["shares"] for p in posts)
    top_posts = sorted(
        posts, key=lambda p: p["reactions"] + p["comments"] + p["shares"], reverse=True
    )[:3]

    return {
        "posts_count": posts_count,
        "reactions": reactions,
        "comments": comments,
        "shares": shares,
        "top_posts": top_posts,
        "posts": posts,
        # bool conservé pour rétro-compatibilité ; la raison réelle est exposée à côté.
        "engagement_blocked": bool(engagement_blocked_reason),
        "engagement_blocked_reason": engagement_blocked_reason,
    }


def create_page_post(
    page_id: str,
    user_token: str,
    message: str,
    link: Optional[str] = None,
) -> dict[str, Any]:
    """Publish a new post. Requires a Page Access Token (auto-resolved)."""
    page_token = resolve_page_token(user_token, page_id)
    params: dict[str, Any] = {"message": message, "access_token": page_token}
    if link:
        params["link"] = link
    resp = requests.post(
        f"{GRAPH}/{page_id}/feed",
        data=params,
        timeout=TIMEOUT,
    )
    return _check(resp)


def create_page_photo_post(
    page_id: str,
    user_token: str,
    image_bytes: bytes,
    message: Optional[str] = None,
    filename: str = "upload.jpg",
) -> dict[str, Any]:
    """Publish a photo post (image + optional caption). Uses /{page-id}/photos
    with the uploaded bytes as `source`. Requires a Page Access Token."""
    page_token = resolve_page_token(user_token, page_id)
    data: dict[str, Any] = {"access_token": page_token}
    if message:
        data["message"] = message
    resp = requests.post(
        f"{GRAPH}/{page_id}/photos",
        data=data,
        files={"source": (filename, image_bytes)},
        timeout=TIMEOUT,
    )
    return _check(resp)


def create_page_video_post(
    page_id: str,
    user_token: str,
    video_bytes: bytes,
    message: Optional[str] = None,
    filename: str = "video.mp4",
) -> dict[str, Any]:
    """Publish a video post (video + optional caption). Uses /{page-id}/videos with
    the uploaded bytes as `source`. Requires a Page Access Token. L'upload vidéo est
    plus lourd → timeout étendu (3 min)."""
    page_token = resolve_page_token(user_token, page_id)
    data: dict[str, Any] = {"access_token": page_token}
    if message:
        data["description"] = message
    resp = requests.post(
        f"{GRAPH}/{page_id}/videos",
        data=data,
        files={"source": (filename, video_bytes)},
        timeout=180,
    )
    return _check(resp)


# ─── Posts planifiés (publication automatique par Meta) ──────────────────────
# Facebook publie nativement à `scheduled_publish_time` quand `published=false`.
# La fenêtre Meta autorisée : entre +10 min et +6 mois.
_SCHED_FIELDS = (
    "id,message,created_time,scheduled_publish_time,is_published,"
    "permalink_url,full_picture,attachments{media_type}"
)
_SCHED_MAX_DELAY = 180 * 24 * 60 * 60  # ~6 mois


def _post_type(item: dict[str, Any]) -> str:
    """Déduit un type d'affichage (image/video/link/text) depuis les attachments."""
    atts = (item.get("attachments") or {}).get("data") or []
    if atts:
        mt = (atts[0].get("media_type") or "").lower()
        if mt in ("photo", "image"):
            return "image"
        if mt == "video":
            return "video"
        if mt in ("link", "share"):
            return "link"
        if mt == "album":
            return "carousel"
    return "text"


# ─── Compte publicitaire : personnes/rôles + facturation ──────────────────────
# Données réelles du compte pub Meta via Graph API (mêmes credentials que le reste).
# La liste des personnes requiert le scope `business_management` ; sans lui Meta
# renvoie une erreur explicite → on la remonte telle quelle (aucune donnée inventée).

# Les "tasks" Meta (permissions granulaires) → un libellé de rôle lisible, du plus
# privilégié au moins. Un utilisateur avec MANAGE est administrateur, etc.
_TASK_ROLE_ORDER: list[tuple[str, str]] = [
    ("MANAGE", "Admin"),
    ("ADVERTISE", "Advertiser"),
    ("ANALYZE", "Analyst"),
    ("DRAFT", "Draft"),
]


# Message (langage simple) affiché quand Meta refuse de lister les membres du
# compte (accès non autorisé / erreur `business is required`). On ne montre PAS
# l'erreur technique brute à l'utilisateur.
ACCESS_BLOCKED_MSG = (
    "L'accès à la liste des personnes de ce compte publicitaire n'a pas encore été "
    "autorisé. Reconnecte ton compte Meta dans les Paramètres en acceptant la "
    "gestion des membres du compte pour afficher les personnes et leurs rôles."
)


def _role_from_tasks(tasks: list[str]) -> str:
    upper = {str(t).upper() for t in (tasks or [])}
    for task, label in _TASK_ROLE_ORDER:
        if task in upper:
            return label
    return "—"


def resolve_business_id(ad_account_id: str, user_token: str) -> Optional[str]:
    """ID du Business Manager propriétaire du compte pub, ou None si le compte
    n'appartient à aucun Business (ou si le champ n'est pas lisible). Best-effort :
    ne lève pas — l'appelant décide quoi faire d'un None."""
    try:
        data = _check(requests.get(
            f"{GRAPH}/{ad_account_id}",
            params={"access_token": user_token, "fields": "business"},
            timeout=TIMEOUT,
        ))
    except GraphError:
        return None
    biz = data.get("business") or {}
    bid = biz.get("id")
    return str(bid) if bid else None


def account_users(ad_account_id: str, user_token: str) -> list[dict[str, Any]]:
    """Personnes ayant accès au compte publicitaire + leur rôle (via l'arête
    `assigned_users`). Requiert `business_management`. Lève GraphError sinon.

    Meta EXIGE le paramètre `business=<id>` sur `assigned_users` quand le compte
    appartient à un Business Manager (sinon `(#100) The parameter business is
    required`). On résout donc d'abord ce business_id et on le passe à l'appel."""
    business_id = resolve_business_id(ad_account_id, user_token)
    params: dict[str, Any] = {
        "access_token": user_token, "fields": "id,name,tasks", "limit": 200,
    }
    if business_id:
        params["business"] = business_id
    data = _check(requests.get(
        f"{GRAPH}/{ad_account_id}/assigned_users",
        params=params,
        timeout=TIMEOUT,
    ))
    out: list[dict[str, Any]] = []
    for u in data.get("data", []):
        tasks = u.get("tasks") or []
        out.append({
            "id": str(u.get("id")),
            "name": u.get("name") or "(sans nom)",
            "tasks": [str(t) for t in tasks],
            "role": _role_from_tasks(tasks),
        })
    return out


# Statuts numériques d'un compte publicitaire Meta → libellé lisible.
_ACCOUNT_STATUS: dict[int, str] = {
    1: "Actif", 2: "Désactivé", 3: "Impayé", 7: "En attente de revue",
    8: "Pending settlement", 9: "In grace period", 100: "Pending closure",
    101: "Fermé", 201: "Any active", 202: "Any closed",
}


def account_billing(ad_account_id: str, user_token: str) -> dict[str, Any]:
    """Type de paiement + solde/dépense/seuil du compte pub (données réelles Meta).
    Les montants Meta sont en unités mineures (centimes) → convertis en unités."""
    data = _check(requests.get(
        f"{GRAPH}/{ad_account_id}",
        params={
            "access_token": user_token,
            "fields": "name,currency,account_status,amount_spent,balance,"
                      "spend_cap,funding_source_details",
        },
        timeout=TIMEOUT,
    ))

    def _units(v: Any) -> Optional[float]:
        try:
            return round(float(v) / 100.0, 2) if v not in (None, "") else None
        except (TypeError, ValueError):
            return None

    fs = data.get("funding_source_details") or {}
    # `funding_source_details.type` peut être un ENTIER (enum Meta) ou une chaîne
    # selon le moyen de paiement → on ne fait `.replace` que sur une vraie chaîne.
    # Le libellé lisible vient de `display_string` (ex. « Visa ****1234 »).
    raw_type = fs.get("type")
    if isinstance(raw_type, str) and raw_type.strip():
        payment_type = raw_type.replace("_", " ").title()
    else:
        # `type` entier (enum non documenté) → on n'invente pas de libellé ; le
        # moyen de paiement lisible reste `display_string` (ex. « Visa ****1234 »).
        payment_type = None

    status = data.get("account_status")
    account_status = None
    if status is not None:
        try:
            account_status = _ACCOUNT_STATUS.get(int(status), str(status))
        except (TypeError, ValueError):
            account_status = str(status)

    # Nombre de moyens de paiement enregistrés. Meta n'expose de façon fiable que la
    # source de paiement ACTIVE (`funding_source_details`, déjà récupérée ci-dessus) :
    # 1 si une carte active est présente, 0 sinon. Aucune donnée inventée, et pas
    # d'appel Graph redondant (le champ multi-cartes n'existe pas de façon fiable).
    card_count = 1 if fs.get("display_string") else 0

    return {
        "name": data.get("name"),
        "currency": data.get("currency"),
        "account_status": account_status,
        "amount_spent": _units(data.get("amount_spent")),
        "balance": _units(data.get("balance")),
        "spend_cap": _units(data.get("spend_cap")),
        "payment_type": payment_type,
        "payment_display": fs.get("display_string"),
        "card_count": card_count,
    }


def list_token_scopes(user_token: str) -> set[str]:
    """Permissions accordées au token (via /me/permissions). Set vide si le token
    est un token de PAGE (pas d'arête permissions) ou en cas d'erreur."""
    try:
        data = _check(requests.get(
            f"{GRAPH}/me/permissions",
            params={"access_token": user_token},
            timeout=TIMEOUT,
        ))
    except GraphError:
        return set()
    return {
        p.get("permission")
        for p in data.get("data", [])
        if p.get("status") == "granted" and p.get("permission")
    }


# Message réutilisé : la planification ET la suppression de posts de page exigent
# `pages_manage_posts`. Sans ce scope, un upload « réussit » comme média non publié
# (autorisé par pages_manage_ads) mais devient un orphelin invisible/indélébile.
MANAGE_POSTS_MISSING = (
    "La permission Meta « pages_manage_posts » est requise pour planifier, gérer "
    "et supprimer des posts de page. Ton token ne l'a pas : régénère-le en cochant "
    "« pages_manage_posts » (en plus de pages_show_list et pages_read_engagement)."
)


def ensure_can_manage_posts(user_token: str) -> None:
    """Lève GraphError si le token ne peut pas gérer les posts de page.

    On ne bloque QUE si on a pu lire les scopes ET que pages_manage_posts en est
    absent. Un token de page (scopes illisibles → set vide) n'est pas bloqué ici :
    il dispose intrinsèquement des droits de sa page."""
    scopes = list_token_scopes(user_token)
    if scopes and "pages_manage_posts" not in scopes:
        raise GraphError(MANAGE_POSTS_MISSING)


def list_scheduled_posts(
    page_id: str, user_token: str
) -> tuple[list[dict[str, Any]], Optional[str]]:
    """Liste les posts planifiés (non encore publiés) de la page.

    Essaie l'arête `scheduled_posts` puis `promotable_posts?is_published=false`.
    Retourne (posts, reason) — `reason` non-None si Meta a refusé (permission
    `pages_manage_posts` manquante, etc.), sans masquer la cause réelle."""
    try:
        page_token = resolve_page_token(user_token, page_id)
    except GraphError as e:
        return [], str(e)

    last_err: Optional[str] = None
    for edge in ("scheduled_posts", "promotable_posts"):
        params: dict[str, Any] = {
            "access_token": page_token, "fields": _SCHED_FIELDS, "limit": 100,
        }
        if edge == "promotable_posts":
            params["is_published"] = "false"
        try:
            data = _check(requests.get(
                f"{GRAPH}/{page_id}/{edge}", params=params, timeout=TIMEOUT,
            ))
        except GraphError as e:
            last_err = str(e)
            continue
        out: list[dict[str, Any]] = []
        for item in data.get("data", []):
            spt = item.get("scheduled_publish_time")
            if not spt:
                continue  # on ne garde que les posts réellement planifiés
            ts = int(spt)
            out.append({
                "id": item.get("id"),
                "message": item.get("message") or "",
                "type": _post_type(item),
                "scheduled_time": datetime.fromtimestamp(ts, tz=timezone.utc).isoformat(),
                "created_time": item.get("created_time"),
                "permalink_url": item.get("permalink_url"),
                "full_picture": item.get("full_picture"),
                "status": "scheduled" if ts > datetime.now(timezone.utc).timestamp() else "published",
            })
        out.sort(key=lambda p: p["scheduled_time"])

        # Historique : posts publiés récemment qui avaient un scheduled_publish_time.
        # Meta retire ces posts de `scheduled_posts` une fois publiés → on les récupère
        # via promotable_posts?is_published=true sur les 60 derniers jours.
        try:
            since_ts = int((datetime.now(timezone.utc) - timedelta(days=60)).timestamp())
            hist_data = _check(requests.get(
                f"{GRAPH}/{page_id}/promotable_posts",
                params={
                    "access_token": page_token,
                    "fields": _SCHED_FIELDS,
                    "is_published": "true",
                    "since": str(since_ts),
                    "limit": 50,
                },
                timeout=TIMEOUT,
            ))
            existing_ids = {p["id"] for p in out}
            for item in hist_data.get("data", []):
                spt = item.get("scheduled_publish_time")
                if not spt:
                    continue  # ne garder que les posts qui étaient planifiés
                post_id = item.get("id")
                if post_id in existing_ids:
                    continue  # éviter les doublons
                ts = int(spt)
                out.append({
                    "id": post_id,
                    "message": item.get("message") or "",
                    "type": _post_type(item),
                    "scheduled_time": datetime.fromtimestamp(ts, tz=timezone.utc).isoformat(),
                    "created_time": item.get("created_time"),
                    "permalink_url": item.get("permalink_url"),
                    "full_picture": item.get("full_picture"),
                    "status": "published",
                })
        except (GraphError, Exception):
            pass  # historique non critique : ne bloque pas l'affichage des futurs

        out.sort(key=lambda p: p["scheduled_time"])
        return out, None
    return [], last_err


def create_scheduled_post(
    page_id: str,
    user_token: str,
    message: str,
    scheduled_ts: int,
    *,
    link: Optional[str] = None,
    image_bytes: Optional[bytes] = None,
    video_bytes: Optional[bytes] = None,
    filename: str = "upload",
) -> dict[str, Any]:
    """Planifie un post (texte / photo / vidéo / lien) qui sera publié
    automatiquement par Meta à `scheduled_ts` (epoch secondes UTC)."""
    now = datetime.now(timezone.utc).timestamp()
    if scheduled_ts > now + _SCHED_MAX_DELAY:
        raise GraphError("La planification ne peut pas dépasser 6 mois.")

    page_token = resolve_page_token(user_token, page_id)
    base: dict[str, Any] = {
        "access_token": page_token,
        "published": "false",
        "scheduled_publish_time": int(scheduled_ts),
    }
    if image_bytes is not None:
        if message:
            base["message"] = message
        resp = requests.post(
            f"{GRAPH}/{page_id}/photos", data=base,
            files={"source": (filename or "upload.jpg", image_bytes)}, timeout=180,
        )
    elif video_bytes is not None:
        if message:
            base["description"] = message
        resp = requests.post(
            f"{GRAPH}/{page_id}/videos", data=base,
            files={"source": (filename or "video.mp4", video_bytes)}, timeout=300,
        )
    else:
        base["message"] = message
        if link:
            base["link"] = link
        resp = requests.post(f"{GRAPH}/{page_id}/feed", data=base, timeout=TIMEOUT)
    return _check(resp)


def publish_scheduled_post(post_id: str, user_token: str, page_id: str) -> dict[str, Any]:
    """Publie immédiatement un post planifié (`is_published=true`)."""
    page_token = resolve_page_token(user_token, page_id)
    resp = requests.post(
        f"{GRAPH}/{post_id}",
        data={"access_token": page_token, "is_published": "true"},
        timeout=TIMEOUT,
    )
    return _check(resp)


def delete_scheduled_post(post_id: str, user_token: str, page_id: str) -> dict[str, Any]:
    """Supprime un post planifié."""
    page_token = resolve_page_token(user_token, page_id)
    resp = requests.delete(
        f"{GRAPH}/{post_id}", params={"access_token": page_token}, timeout=TIMEOUT,
    )
    return _check(resp)


def get_fans_online_by_hour(page_id: str, user_token: str) -> dict[str, Any]:
    """Renvoie l'activité RÉELLE des abonnés de la page par heure de la journée.

    S'appuie sur le metric Meta `page_fans_online_per_day` (nombre d'abonnés en
    ligne à chaque heure, par jour). On moyenne sur les jours renvoyés pour obtenir
    une courbe 0h–23h, puis on en déduit les meilleures heures de publication.

    Dégradation gracieuse : si Meta n'expose pas la donnée (page trop récente, peu
    d'abonnés, scope manquant), on renvoie `available: false` sans rien inventer."""
    try:
        page_token = resolve_page_token(user_token, page_id)
    except GraphError as e:
        logger.warning("Page token non résolu pour fans_online page=%s : %s", page_id, e)
        page_token = user_token

    hourly = [0.0] * 24
    days_counted = 0
    reason: Optional[str] = None
    try:
        resp = requests.get(
            f"{GRAPH}/{page_id}/insights",
            params={"access_token": page_token, "metric": "page_fans_online_per_day", "period": "day"},
            timeout=TIMEOUT,
        )
        data = _check(resp)
        for series in data.get("data", []):
            for v in series.get("values", []):
                val = v.get("value")
                if isinstance(val, dict) and val:
                    days_counted += 1
                    for hour_str, count in val.items():
                        try:
                            h = int(hour_str)
                        except (TypeError, ValueError):
                            continue
                        if 0 <= h < 24 and isinstance(count, (int, float)):
                            hourly[h] += float(count)
    except (GraphError, requests.RequestException) as e:
        reason = str(e)
        logger.info("page_fans_online_per_day indisponible page=%s : %s", page_id, reason)

    if days_counted > 0:
        hourly = [round(x / days_counted, 1) for x in hourly]
        # Meilleures heures = top 3 par activité (ignore les heures à zéro).
        ranked = sorted(range(24), key=lambda h: hourly[h], reverse=True)
        best_hours = [h for h in ranked if hourly[h] > 0][:3]
        return {"available": True, "hourly": hourly, "best_hours": best_hours, "days": days_counted}
    return {"available": False, "hourly": [0.0] * 24, "best_hours": [], "days": 0, "reason": reason}


def get_page_insights(
    page_id: str, user_token: str, days: int = 28
) -> dict[str, int]:
    """Aggregate page insights over the last N days.

    Sums the daily values of: page_impressions, page_engaged_users,
    page_post_engagements. Also returns the current followers/fans count.
    """
    since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    until = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    try:
        page_token = resolve_page_token(user_token, page_id)
    except GraphError as e:
        # Fallback sur le token utilisateur (peut encore marcher pour certains
        # metrics) — mais on journalise la raison au lieu de l'avaler.
        logger.warning("Page token non résolu pour insights page=%s : %s", page_id, e)
        page_token = user_token

    totals: dict[str, int] = {
        "impressions": 0, "engaged_users": 0, "post_engagements": 0,
        "reach_total": 0, "reach_organic": 0, "reach_paid": 0,
    }
    name_map = {
        "page_impressions": "impressions",
        "page_engaged_users": "engaged_users",
        "page_post_engagements": "post_engagements",
        "page_impressions_unique": "reach_total",
        "page_impressions_organic_unique": "reach_organic",
        "page_impressions_paid_unique": "reach_paid",
    }

    def _sum_metrics(metric_csv: str) -> None:
        """Fetch and accumulate a group of metrics. Guarded independently so a
        single deprecated metric never zeroes out the others (Meta fails the
        whole call when ANY requested metric is invalid)."""
        try:
            resp = requests.get(
                f"{GRAPH}/{page_id}/insights",
                params={
                    "access_token": page_token,
                    "metric": metric_csv,
                    "period": "day",
                    "since": since,
                    "until": until,
                },
                timeout=TIMEOUT,
            )
            data = _check(resp)
        except (GraphError, requests.RequestException):
            return  # garde les totaux à zéro pour ce groupe
        for series in data.get("data", []):
            key = name_map.get(series.get("name"))
            if not key:
                continue
            for v in series.get("values", []):
                val = v.get("value", 0)
                if isinstance(val, (int, float)):
                    totals[key] += int(val)
                elif isinstance(val, dict):
                    # Some metrics return a dict (breakdowns) — sum nested ints.
                    totals[key] += sum(int(x) for x in val.values() if isinstance(x, (int, float)))

    # Engagement metrics and reach metrics in separate calls (see _sum_metrics).
    _sum_metrics("page_impressions,page_engaged_users,page_post_engagements")
    _sum_metrics("page_impressions_unique,page_impressions_organic_unique,page_impressions_paid_unique")

    # Current fan/follower count is a separate field, not an insight metric.
    try:
        info = get_page_info(page_id, user_token)
        totals["fans"] = int(info.get("followers_count") or info.get("fan_count") or 0)
    except GraphError:
        totals["fans"] = 0

    return totals


def _raw_error(resp: requests.Response) -> Optional[dict[str, Any]]:
    """Extrait l'objet `error` brut de Meta (message + code + subcode +
    error_user_msg) sans le tronquer comme le fait `_check`. Retourne None si la
    réponse est un succès JSON."""
    try:
        data = resp.json()
    except ValueError:
        return {"message": f"Réponse non JSON ({resp.status_code})", "raw": resp.text[:300]}
    if isinstance(data, dict) and "error" in data:
        err = data["error"]
        return {
            "message": err.get("message"),
            "type": err.get("type"),
            "code": err.get("code"),
            "error_subcode": err.get("error_subcode"),
            "error_user_title": err.get("error_user_title"),
            "error_user_msg": err.get("error_user_msg"),
            "fbtrace_id": err.get("fbtrace_id"),
        }
    if not resp.ok:
        return {"message": resp.text[:300], "code": resp.status_code}
    return None


def diagnose_page_engagement(page_id: str, user_token: str) -> dict[str, Any]:
    """Utilitaire de diagnostic : à partir du token utilisateur, met en évidence
    la VRAIE cause de l'absence d'engagement (et non le faux message « App Review »).

    Retourne un dict structuré :
    - `accounts` : pages listées par /me/accounts, avec un booléen `has_token` par
      page (le token n'est jamais exposé en clair), et des flags pour la page cible.
    - `token_resolution` : a-t-on obtenu un Page Access Token, sinon pourquoi.
    - `posts_probe` : appel brut sur /{page}/posts avec les summaries d'engagement,
      utilisant le Page Access Token quand il est disponible. En cas d'erreur, le
      message Meta exact (code/subcode/error_user_msg) est remonté tel quel.
    """
    out: dict[str, Any] = {"page_id": page_id, "graph_version": GRAPH}

    # 0) /me — quel type de node ce token désigne-t-il ? Si me.id == page_id, le
    # token est DÉJÀ un Page Access Token (et non un token utilisateur).
    try:
        me = _check(requests.get(
            f"{GRAPH}/me",
            params={"access_token": user_token, "fields": "id,name"},
            timeout=TIMEOUT,
        ))
        out["token_identity"] = {
            "me_id": str(me.get("id")),
            "me_name": me.get("name"),
            "is_page_token": str(me.get("id")) == str(page_id),
        }
    except GraphError as e:
        out["token_identity"] = {"error": str(e)}

    # 1) /me/accounts — la page cible apparaît-elle, avec un access_token ?
    try:
        resp = requests.get(
            f"{GRAPH}/me/accounts",
            params={"access_token": user_token, "fields": "id,name,access_token"},
            timeout=TIMEOUT,
        )
        err = _raw_error(resp)
        if err:
            out["accounts"] = {"error": err}
        else:
            pages = resp.json().get("data", [])
            listed = [
                {
                    "id": str(p.get("id")),
                    "name": p.get("name"),
                    "has_token": bool(p.get("access_token")),
                }
                for p in pages
            ]
            target = next((p for p in listed if p["id"] == str(page_id)), None)
            out["accounts"] = {
                "count": len(listed),
                "pages": listed,
                "target_page_found": target is not None,
                "target_page_has_token": bool(target and target["has_token"]),
            }
    except requests.RequestException as e:
        out["accounts"] = {"error": {"message": f"Requête /me/accounts échouée : {e}"}}

    # 2) Résolution du Page Access Token (pour la sonde /posts).
    token, used_page_token, token_error = _page_token_or_user(page_id, user_token)
    out["token_resolution"] = {
        "used_page_token": used_page_token,
        "token_error": token_error,
    }

    # 3) Sonde brute /{page}/posts avec les summaries d'engagement.
    probe_fields = (
        "message,reactions.summary(total_count),"
        "comments.summary(total_count),shares"
    )
    try:
        resp = requests.get(
            f"{GRAPH}/{page_id}/posts",
            params={"access_token": token, "fields": probe_fields, "limit": 3},
            timeout=TIMEOUT,
        )
        err = _raw_error(resp)
        if err:
            out["posts_probe"] = {"ok": False, "error": err}
        else:
            rows = resp.json().get("data", [])
            out["posts_probe"] = {
                "ok": True,
                "sample_count": len(rows),
                "first_post": rows[0] if rows else None,
            }
    except requests.RequestException as e:
        out["posts_probe"] = {"ok": False, "error": {"message": f"Requête /posts échouée : {e}"}}

    return out
