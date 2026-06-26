"""Limiteur de débit en mémoire (review §5.7 + tableau des risques).

But : empêcher qu'une boucle de l'agent ou un abus ne sature `/chat` (et donc la
création de campagnes). Volontairement minimal — pas de dépendance externe.

Limite : sliding window par (user_id, clé). Stockage process-local via un dict de
deques. Suffisant pour un déploiement mono-process (uvicorn 1 worker).

⚠️ Pour un déploiement multi-worker / multi-instance, remplacer ce backend par un
store partagé (Redis). Hors périmètre actuel.
"""

import threading
import time
from collections import defaultdict, deque

_lock = threading.Lock()
_hits: dict[tuple[str, str], deque] = defaultdict(deque)


def check_rate_limit(user_id: str, key: str, limit: int, window_s: float) -> bool:
    """Enregistre un hit et retourne True s'il est AUTORISÉ, False si la limite
    est dépassée sur la fenêtre glissante `window_s` (en secondes).

    Le hit n'est compté que s'il est autorisé (on ne pénalise pas les requêtes
    déjà rejetées)."""
    now = time.monotonic()
    cutoff = now - window_s
    bucket_key = (user_id, key)
    with _lock:
        bucket = _hits[bucket_key]
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            return False
        bucket.append(now)
        return True
