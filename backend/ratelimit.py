"""Limiteur de débit partagé (sliding window via Redis).

Remplace l'ancien backend en mémoire process (dict de deques) qui ne tenait pas
en multi-worker : avec N workers uvicorn, chaque process avait son compteur → la
limite réelle était multipliée par N. Redis centralise le compteur entre tous les
workers / instances.

Algorithme : sliding window par (user_id, clé) via un sorted set Redis dont les
membres sont horodatés. À chaque appel on purge les hits hors fenêtre, on compte,
puis (si autorisé seulement) on enregistre le hit. Les hits rejetés ne sont PAS
comptés — on ne pénalise pas une requête déjà bloquée.

Robustesse : si Redis est injoignable (dev local sans Redis, panne), le limiteur
passe en **fail-open** (autorise tout) avec un warning unique, plutôt que de
crasher `/chat`. La protection est perdue en mode dégradé, mais le service reste
disponible — compromis assumé (cf. revue de plan).
"""

import logging
import time
import uuid

from .config import REDIS_URL

logger = logging.getLogger("metainsight")

try:
    import redis  # type: ignore

    # from_url ne se connecte pas tout de suite : la 1re commande établit la
    # connexion. socket_connect_timeout borne l'attente si Redis est absent.
    _redis = redis.from_url(REDIS_URL, decode_responses=True, socket_connect_timeout=2)
except Exception:  # noqa: BLE001 — paquet absent / URL invalide → mode dégradé
    _redis = None

_degraded = False


def _fail_open(reason: str) -> bool:
    """Mode dégradé : on autorise (True) et on log le motif une seule fois."""
    global _degraded
    if not _degraded:
        logger.warning(
            "ratelimit: Redis indisponible (%s) → rate limit désactivé (fail-open)", reason
        )
        _degraded = True
    return True


def check_rate_limit(user_id: str, key: str, limit: int, window_s: float) -> bool:
    """Retourne True si la requête est AUTORISÉE, False si la limite est dépassée
    sur la fenêtre glissante `window_s` (secondes). Fail-open si Redis est absent."""
    if _redis is None:
        return _fail_open("client non initialisé")

    now = time.time()
    bucket_key = f"rl:{user_id}:{key}"
    try:
        # 1) Purge des hits hors fenêtre + comptage de ce qui reste.
        pipe = _redis.pipeline()
        pipe.zremrangebyscore(bucket_key, 0, now - window_s)
        pipe.zcard(bucket_key)
        count = pipe.execute()[1]

        if count >= limit:
            return False

        # 2) Autorisé → on enregistre le hit (membre unique pour éviter qu'un
        #    second hit au même horodatage écrase le premier dans le sorted set).
        pipe = _redis.pipeline()
        pipe.zadd(bucket_key, {f"{now}-{uuid.uuid4().hex}": now})
        pipe.expire(bucket_key, int(window_s) + 1)
        pipe.execute()
        return True
    except Exception as exc:  # noqa: BLE001 — panne Redis en cours de route
        return _fail_open(str(exc))
