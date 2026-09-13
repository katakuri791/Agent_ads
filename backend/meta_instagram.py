"""Graph API helpers pour Instagram (compte IG Business lié à la Page Facebook).

Lecture seule : profil du compte Instagram + posts récents avec leur portée
(reach = « combien de gens ont vu cette publication ») et impressions.

On réutilise les helpers HTTP de meta_pages (GRAPH, _check, GraphError) car les
endpoints IG sont du simple HTTP Graph. Un compte IG est résolu depuis la Page
Facebook : Page → instagram_business_account → media.

Prérequis Meta : un compte Instagram **Business/Creator lié à la Page**, et les
scopes `instagram_basic` + `instagram_manage_insights` sur le token. Sans ça,
Meta renvoie une erreur explicite → remontée telle quelle (aucune donnée inventée).
"""
from __future__ import annotations

import logging
from typing import Any, Optional

import requests

from .meta_pages import GRAPH, TIMEOUT, GraphError, _check, list_token_scopes

logger = logging.getLogger("metainsight")

# Message (langage simple, sans jargon technique) quand aucun compte IG n'est lié.
NO_IG_LINKED = (
    "Aucun compte Instagram professionnel n'est encore relié à ta Page Facebook. "
    "Depuis Meta Business Suite, relie ton compte Instagram à la Page, puis "
    "reconnecte ton compte Meta dans les Paramètres."
)

# Message (langage simple) quand l'accès aux données Instagram n'a pas été autorisé.
MISSING_IG_SCOPE = (
    "L'accès à tes données Instagram n'a pas encore été autorisé. Reconnecte ton "
    "compte Meta dans les Paramètres et accepte l'accès à Instagram pour afficher "
    "tes publications et leur portée."
)

# Message quand on ne peut PAS distinguer les deux causes (typiquement un token
# System User, dont les permissions ne sont pas lisibles) → on donne une checklist
# claire couvrant les deux points, sans jargon technique.
IG_UNKNOWN_CHECKLIST = (
    "Instagram ne s'affiche pas encore. Vérifie ces deux points :\n"
    "1) Un compte Instagram professionnel (Business ou Créateur) doit être relié à "
    "ta Page Facebook (Meta Business Suite → Paramètres → Comptes Instagram).\n"
    "2) Ton compte Meta doit autoriser l'accès à Instagram et à ses statistiques — "
    "reconnecte-le dans les Paramètres en acceptant cet accès.\n"
    "Une fois les deux en place, la page se remplit automatiquement."
)


def resolve_ig_account(page_id: str, user_token: str) -> Optional[dict]:
    """Résout le compte IG Business lié à la Page. None si aucun n'est lié."""
    data = _check(requests.get(
        f"{GRAPH}/{page_id}",
        params={"access_token": user_token,
                "fields": "instagram_business_account{id,username,name,"
                          "followers_count,follows_count,media_count,"
                          "profile_picture_url,biography,website}"},
        timeout=TIMEOUT,
    ))
    return data.get("instagram_business_account") or None


def _insight_value(insights: Any, name: str) -> Optional[int]:
    """Extrait la valeur d'une métrique depuis l'objet insights d'un média
    (structure Meta : {data:[{name, values:[{value}]}]}). None si absente."""
    if not isinstance(insights, dict):
        return None
    for row in insights.get("data", []):
        if isinstance(row, dict) and row.get("name") == name:
            vals = row.get("values") or []
            if vals and isinstance(vals[0], dict):
                try:
                    return int(vals[0].get("value") or 0)
                except (TypeError, ValueError):
                    return None
    return None


def _post_from_media(m: dict) -> dict[str, Any]:
    """Convertit un média Graph IG en post normalisé pour le frontend."""
    insights = m.get("insights")
    reach = _insight_value(insights, "reach")
    impressions = _insight_value(insights, "impressions")
    return {
        "id": str(m.get("id")),
        "caption": m.get("caption"),
        "media_type": m.get("media_type"),                # IMAGE | VIDEO | CAROUSEL_ALBUM
        "media_product_type": m.get("media_product_type"),  # FEED | REELS | STORY | AD
        "media_url": m.get("media_url"),
        "thumbnail_url": m.get("thumbnail_url"),           # présent pour les vidéos
        "permalink": m.get("permalink"),
        "timestamp": m.get("timestamp"),
        "like_count": int(m.get("like_count") or 0),
        "comments_count": int(m.get("comments_count") or 0),
        # « Combien de gens ont vu » = reach (comptes uniques). impressions = vues totales.
        "reach": reach,
        "impressions": impressions,
    }


# Champs média demandés. `insights.metric(...)` = field expansion → la portée de
# CHAQUE post revient dans le MÊME appel (pas de N+1). On tente reach+impressions,
# puis on dégrade (certains types comme Reels rejettent `impressions` en v21).
_MEDIA_FIELDS_BASE = (
    "id,caption,media_type,media_product_type,media_url,thumbnail_url,"
    "permalink,timestamp,like_count,comments_count"
)
_MEDIA_INSIGHTS_VARIANTS = [
    ",insights.metric(reach,impressions)",
    ",insights.metric(reach)",
    "",  # dernier recours : sans portée (reach/impressions = None, jamais faux)
]


def list_ig_media(ig_id: str, user_token: str, limit: int = 24) -> list[dict[str, Any]]:
    """Posts récents du compte IG avec leur portée. Dégrade proprement si le scope
    insights manque ou si un type de média rejette une métrique."""
    last_err: Optional[GraphError] = None
    for variant in _MEDIA_INSIGHTS_VARIANTS:
        try:
            data = _check(requests.get(
                f"{GRAPH}/{ig_id}/media",
                params={"access_token": user_token,
                        "fields": _MEDIA_FIELDS_BASE + variant,
                        "limit": limit},
                timeout=TIMEOUT,
            ))
            return [_post_from_media(m) for m in data.get("data", [])]
        except GraphError as exc:
            last_err = exc
            logger.info("IG media fetch failed (variant insights=%r): %s", variant, exc)
            continue
    # Toutes les variantes ont échoué (rare) → on remonte la dernière erreur Meta.
    raise last_err or GraphError("Impossible de récupérer les posts Instagram.")


def get_overview(page_id: str, user_token: str, limit: int = 24) -> dict[str, Any]:
    """Profil IG + posts récents (avec portée). Lève GraphError avec un message
    clair si aucun compte Instagram n'est lié à la Page."""
    ig = resolve_ig_account(page_id, user_token)
    if not ig or not ig.get("id"):
        # Champ absent : soit pas de compte lié, soit token sans scope Instagram
        # (Meta masque alors le champ). On distingue via les scopes du token —
        # mais seulement si on peut les lire (set non vide) pour éviter un faux
        # « scope manquant » sur un token de page.
        scopes = list_token_scopes(user_token)
        if scopes:
            # Token utilisateur dont on PEUT lire les permissions → cause certaine.
            if "instagram_basic" not in scopes:
                raise GraphError(MISSING_IG_SCOPE)   # scope manquant, cause sûre
            raise GraphError(NO_IG_LINKED)           # scope présent → IG non lié
        # Scopes illisibles (token System User / token de page) → on ne peut pas
        # trancher entre « pas de scope » et « IG non lié » : checklist des deux.
        raise GraphError(IG_UNKNOWN_CHECKLIST)
    profile = {
        "id": str(ig.get("id")),
        "username": ig.get("username"),
        "name": ig.get("name"),
        "followers_count": int(ig.get("followers_count") or 0),
        "follows_count": int(ig.get("follows_count") or 0),
        "media_count": int(ig.get("media_count") or 0),
        "profile_picture_url": ig.get("profile_picture_url"),
        "biography": ig.get("biography"),
        "website": ig.get("website"),
    }
    posts = list_ig_media(ig["id"], user_token, limit=limit)
    return {"profile": profile, "posts": posts}


def publish_ig_now(
    page_id: str,
    access_token: str,
    caption: str,
    image_url: Optional[str] = None,
    video_url: Optional[str] = None,
) -> dict:
    """Publie IMMÉDIATEMENT un post sur le compte Instagram Business lié à la Page.

    L'API IG « Content Publishing » ne planifie pas : le flux est conteneur →
    media_publish. La planification différée est gérée en amont (on stocke la
    demande et ce helper est appelé à l'heure prévue par le job `ig_publish`).

    Requiert le scope `instagram_content_publish`. L'URL doit être HTTPS publique
    (pas de bytes directs). Une vidéo est publiée en Reel.

    Retourne {"ok": True, "post_id": <id>}.
    Lève GraphError (message clair) si IG non lié, URL invalide, ou échec d'encodage.
    """
    if not image_url and not video_url:
        raise GraphError(
            "Instagram nécessite une image ou une vidéo. "
            "Fournis l'URL HTTPS publique de ton fichier."
        )

    ig = resolve_ig_account(page_id, access_token)
    if not ig or not ig.get("id"):
        scopes = list_token_scopes(access_token)
        if scopes and "instagram_basic" not in scopes:
            raise GraphError(MISSING_IG_SCOPE)
        raise GraphError(NO_IG_LINKED if scopes else IG_UNKNOWN_CHECKLIST)

    ig_user_id = ig["id"]

    # Étape 1 : créer le conteneur média.
    params: dict = {"access_token": access_token, "caption": caption or ""}
    if video_url:
        params["video_url"] = video_url
        params["media_type"] = "REELS"
    else:
        params["image_url"] = image_url

    resp = _check(requests.post(f"{GRAPH}/{ig_user_id}/media", data=params, timeout=60))
    creation_id = resp.get("id")
    if not creation_id:
        raise GraphError(
            "Instagram n'a pas retourné d'identifiant pour ce media. Vérifie l'URL fournie."
        )

    # Étape 1bis : une vidéo/Reel doit finir son encodage avant publication.
    # On sonde le statut du conteneur (status_code : FINISHED/IN_PROGRESS/ERROR).
    if video_url:
        _wait_ig_container_ready(creation_id, access_token)

    # Étape 2 : publier le conteneur.
    pub = _check(requests.post(
        f"{GRAPH}/{ig_user_id}/media_publish",
        data={"access_token": access_token, "creation_id": creation_id},
        timeout=TIMEOUT,
    ))
    return {"ok": True, "post_id": str(pub.get("id") or creation_id)}


def _wait_ig_container_ready(
    creation_id: str, access_token: str, attempts: int = 20, delay: float = 6.0
) -> None:
    """Attend qu'un conteneur média IG soit FINISHED avant `media_publish`.
    Bloquant (appelé dans un thread de fond). Lève GraphError si ERROR/EXPIRED
    ou si l'encodage n'aboutit pas dans le temps imparti (~2 min)."""
    import time as _time

    for _ in range(attempts):
        st = _check(requests.get(
            f"{GRAPH}/{creation_id}",
            params={"access_token": access_token, "fields": "status_code"},
            timeout=TIMEOUT,
        ))
        code = (st.get("status_code") or "").upper()
        if code == "FINISHED":
            return
        if code in ("ERROR", "EXPIRED"):
            raise GraphError(
                "Instagram n'a pas pu traiter la vidéo (encodage échoué). "
                "Vérifie le format/durée du fichier."
            )
        _time.sleep(delay)
    raise GraphError(
        "La vidéo Instagram est encore en cours d'encodage. Réessaie dans un moment."
    )
