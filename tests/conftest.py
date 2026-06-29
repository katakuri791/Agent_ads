"""Fixtures partagées + bootstrap d'environnement pour les tests.

`backend/config.py` lit SUPABASE_URL / SUPABASE_SERVICE_KEY à l'import et crée un
client Supabase. On injecte des valeurs factices AVANT tout import backend pour
que la suite tourne sans `.env` (CI). `create_client` ne fait aucun appel réseau
à la construction — seules les requêtes le feraient, et on les mocke."""

import os

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
