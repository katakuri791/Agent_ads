"""Package API feature-based.

Chaque sous-dossier est une *feature* (auth, campaigns, dashboard…) avec deux
fichiers :
  - `route.py`    : la couche HTTP pure (APIRouter, chemins, verbes, Depends,
                    Query, response_model). Elle extrait les valeurs des
                    dépendances FastAPI et délègue à `endpoint.py`.
  - `endpoint.py` : la logique du handler (aucun décorateur FastAPI).

Les helpers transverses sont dans `api/deps.py` et `api/common.py`.
`main.py` reste à la racine et assemble les routers via `include_router`.
"""
