# AdMind AI — Roadmap Améliorations Production

> Document de travail pour Claude Code. Chaque section contient le contexte exact,
> les fichiers à modifier, et le comportement attendu après implémentation.
> Billing/paiement exclu — hors périmètre actuel (projet freelance).

---

## 1. JWT Refresh Token

### Problème actuel
`backend/auth.py` — `create_jwt()` génère un token HS256 avec expiry fixe de 24h
(`JWT_EXPIRES_HOURS`). Il n'existe aucun endpoint de refresh. Quand le token expire,
`decode_jwt()` lève `401 Token expired` → le frontend (`api.ts`) logout l'utilisateur
automatiquement. Un outil de travail quotidien ne peut pas forcer une reconnexion
toutes les 24h.

### Ce qu'il faut implémenter

**Backend (`backend/auth.py` + `main.py`)**

1. Ajouter une table Supabase `refresh_tokens` :
   ```sql
   CREATE TABLE refresh_tokens (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     token TEXT NOT NULL UNIQUE,
     expires_at TIMESTAMPTZ NOT NULL,
     created_at TIMESTAMPTZ DEFAULT now()
   );
   ```

2. Modifier `create_jwt()` pour retourner aussi un refresh token (UUID v4, 30 jours).

3. Modifier `login()` et `signup()` pour persister le refresh token dans Supabase et
   le retourner dans la réponse.

4. Ajouter dans `main.py` :
   ```
   POST /auth/refresh
   Body : { "refresh_token": "..." }
   → Valide le refresh token en base, vérifie qu'il n'est pas expiré
   → Retourne un nouveau access token (JWT 24h) + nouveau refresh token (rotation)
   → Invalide l'ancien refresh token (one-time use)
   ```

5. Ajouter `POST /auth/logout` qui invalide le refresh token en base.

**Frontend (`frontend/src/app/lib/auth.ts` + `api.ts`)**

1. Stocker le refresh token dans `localStorage` sous la clé `metainsight.refresh_token`.

2. Dans `api.ts`, intercepter les réponses `401` : au lieu de logout immédiat,
   tenter `POST /auth/refresh` avec le refresh token stocké.
   - Si succès → sauvegarder le nouveau access token + retry la requête originale.
   - Si échec (refresh token expiré/invalide) → logout.

### Comportement attendu
L'utilisateur reste connecté 30 jours sans action. La session se renouvelle
silencieusement en arrière-plan.

---

## 2. Redis Rate Limiter

### Problème actuel
`backend/ratelimit.py` utilise un `dict[deque]` + `threading.Lock` en mémoire process.
Le commentaire en tête de fichier le reconnaît explicitement :
> "Pour un déploiement multi-worker / multi-instance, remplacer par Redis."

Avec 2+ workers uvicorn (`--workers 2`) ou un déploiement multi-instance, chaque
process a son propre compteur → le rate limit réel est multiplié par le nombre
de workers.

### Ce qu'il faut implémenter

1. Ajouter la dépendance : `redis>=5.0` dans `pyproject.toml`.

2. Ajouter dans `backend/config.py` :
   ```python
   REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
   ```

3. Réécrire `backend/ratelimit.py` avec l'algorithme sliding window via Redis :
   ```python
   import redis
   import time

   _redis = redis.from_url(REDIS_URL, decode_responses=True)

   def check_rate_limit(user_id: str, key: str, limit: int, window_s: float) -> bool:
       now = time.time()
       bucket_key = f"rl:{user_id}:{key}"
       pipe = _redis.pipeline()
       pipe.zremrangebyscore(bucket_key, 0, now - window_s)
       pipe.zadd(bucket_key, {str(now): now})
       pipe.zcard(bucket_key)
       pipe.expire(bucket_key, int(window_s) + 1)
       _, _, count, _ = pipe.execute()
       return count <= limit
   ```

4. Ajouter `REDIS_URL` dans `.env.example` et dans la section Variables d'environnement
   du `CLAUDE.md`.

5. Ajouter un fallback gracieux : si Redis est indisponible au démarrage, logger un
   warning et désactiver le rate limit plutôt que crasher (mode dégradé acceptable
   en dev local sans Redis).

### Variable d'environnement à ajouter
```
REDIS_URL=redis://localhost:6379/0
```

---

## 3. Détection et Alerte Tokens Meta Expirés

### Problème actuel
`backend/facebook_sync.py` — `sync_account()` attrape `FacebookRequestError` et écrit
l'erreur dans `fb_sync_state.last_error`, mais rien n'alerte l'utilisateur. Les tokens
Facebook long-lived expirent ~60 jours après leur création. Le dashboard commence
à afficher des données figées sans que l'utilisateur comprenne pourquoi.

### Ce qu'il faut implémenter

**Détection dans `facebook_sync.py`**

1. Dans le `except FacebookRequestError` de `sync_account()`, détecter les codes
   d'erreur d'expiration token :
   - Code `190` avec subcode `463` (token expiré)
   - Code `190` avec subcode `460` (mot de passe changé)
   - Code `190` sans subcode (token invalide générique)

2. Si token expiré détecté, écrire dans `meta_accounts` un nouveau champ
   `token_status` = `"expired"` (vs `"valid"`).

**Migration Supabase à créer (`supabase/migrations/0004_token_status.sql`)**
```sql
ALTER TABLE meta_accounts
  ADD COLUMN IF NOT EXISTS token_status TEXT DEFAULT 'valid',
  ADD COLUMN IF NOT EXISTS token_expires_hint TIMESTAMPTZ;
```

**Endpoint backend (`main.py`)**

Modifier `GET /meta/accounts` pour inclure `token_status` dans la réponse.

**Frontend**

Dans la page Settings (`SettingsPage.tsx`) et dans la sidebar/topbar, afficher
une bannière d'alerte si un compte a `token_status = "expired"` :
```
⚠️ Le token Meta du compte "[label]" a expiré. Mettez-le à jour dans Paramètres.
```

La bannière doit utiliser la couleur `#F43F5E` (Alerte) du design system Mission Control.

### Comportement attendu
L'utilisateur voit une alerte claire dès que son token expire, avec un lien direct
vers la page Settings pour le renouveler.

---

## 4. Observabilité — Sentry + Structured Logging

### Problème actuel
`main.py` utilise `logging.basicConfig` basique. `facebook_sync.py` utilise
`logger = logging.getLogger("metainsight")`. Aucun agrégateur d'erreurs en production.
En cas de bug, il faut accéder aux logs serveur manuellement.

### Ce qu'il faut implémenter

**Sentry (backend)**

1. Ajouter `sentry-sdk[fastapi]>=2.0` dans `pyproject.toml`.

2. Ajouter dans `backend/config.py` :
   ```python
   SENTRY_DSN = os.getenv("SENTRY_DSN", "")
   ```

3. Dans `main.py`, initialiser Sentry avant la création de l'app FastAPI :
   ```python
   import sentry_sdk
   from sentry_sdk.integrations.fastapi import FastApiIntegration

   if SENTRY_DSN:
       sentry_sdk.init(
           dsn=SENTRY_DSN,
           integrations=[FastApiIntegration()],
           traces_sample_rate=0.1,
           environment=os.getenv("ENV", "development"),
       )
   ```

4. Dans `facebook_sync.py`, capturer les erreurs critiques :
   ```python
   import sentry_sdk
   sentry_sdk.capture_exception(exc)
   ```

**Structured Logging**

1. Ajouter `structlog>=24.0` dans `pyproject.toml`.

2. Configurer structlog dans `backend/config.py` pour sortir en JSON en production
   et en format lisible en développement (basé sur `ENV`).

3. Remplacer les `logger.info/error` dans `facebook_sync.py`, `meta_tools.py`,
   et `agent.py` par `structlog.get_logger()` avec des champs structurés :
   ```python
   log = structlog.get_logger()
   log.info("sync.complete", account_id=account_id, campaigns=n_campaigns)
   log.error("sync.failed", account_id=account_id, error=str(exc), code=code)
   ```

**Variables d'environnement à ajouter**
```
SENTRY_DSN=https://...@sentry.io/...
ENV=production   # ou development
```

### Comportement attendu
Toute exception non gérée en production remonte dans Sentry avec le contexte complet
(user, route, tool call). Les logs sont JSON-parsables par n'importe quel agrégateur
(Datadog, Logtail, etc.).

---

## 5. Tests

### Problème actuel
Zéro test dans le projet. Aucun fichier `test_*.py` ni `*.test.ts`. Chaque modification
du backend ou du frontend est un saut dans le vide.

### Structure à créer

```
tests/
├── conftest.py              # Fixtures partagées (client FastAPI, mock Supabase, mock Meta)
├── test_auth.py             # Tests signup, login, refresh token, logout
├── test_ratelimit.py        # Tests sliding window (limites, fenêtre, multi-user)
├── test_facebook_sync.py    # Tests détection token expiré, gestion erreurs Meta
├── test_campaigns.py        # Tests création campagne (PAUSED, budget centimes, pays ISO-2)
└── test_dashboard.py        # Tests lecture cache fb_*
```

**Backend (pytest)**

1. Ajouter dans `pyproject.toml` (groupe dev) :
   ```
   pytest>=8.0
   pytest-asyncio>=0.23
   httpx>=0.27         # TestClient async pour FastAPI
   pytest-mock>=3.12
   ```

2. `conftest.py` — fournir :
   - `client` : `TestClient(app)` avec override de `get_current_user`
   - `mock_supabase` : mock des appels Supabase via `pytest-mock`
   - `mock_meta` : mock `FacebookRequestError` pour simuler token expiré

3. Tests prioritaires à écrire en premier :
   - `test_auth.py::test_login_success` / `test_login_wrong_password`
   - `test_auth.py::test_refresh_token_rotation`
   - `test_ratelimit.py::test_limit_enforced` / `test_window_resets`
   - `test_facebook_sync.py::test_expired_token_sets_status`
   - `test_campaigns.py::test_campaign_always_paused`

**Frontend (Vitest)**

1. Vitest est déjà compatible avec Vite 6. Ajouter dans `frontend/package.json` :
   ```json
   "devDependencies": {
     "vitest": "^2.0",
     "@testing-library/react": "^16.0",
     "@testing-library/user-event": "^14.0",
     "jsdom": "^25.0"
   }
   ```

2. Ajouter dans `frontend/vite.config.ts` :
   ```ts
   test: {
     environment: "jsdom",
     globals: true,
   }
   ```

3. Tests prioritaires :
   - `auth.test.ts` — `getToken`, `setToken`, `clearToken`, logique refresh
   - `format.test.ts` — formatage budget centimes → euros, dates, pourcentages
   - `api.test.ts` — retry automatique sur 401 avec refresh token

### Commandes
```bash
# Backend
uv run pytest tests/ -v

# Frontend
cd frontend && pnpm test
```

---

## 6. CI/CD — GitHub Actions + Docker

### Problème actuel
Aucun fichier `.github/`, aucun `Dockerfile`. Le déploiement est manuel. Impossible
de garantir la reproductibilité ou d'automatiser les vérifications à chaque commit.

### Ce qu'il faut créer

**`.github/workflows/ci.yml`**
```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v3
      - run: uv sync
      - run: uv run pytest tests/ -v

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - run: cd frontend && pnpm install --frozen-lockfile
      - run: cd frontend && pnpm test --run
      - run: cd frontend && pnpm build
```

**`Dockerfile`** (backend)
```dockerfile
FROM python:3.11-slim
WORKDIR /app
RUN pip install uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY . .
EXPOSE 8000
CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**`docker-compose.yml`** (développement local avec Redis)
```yaml
services:
  api:
    build: .
    ports: ["8000:8000"]
    env_file: .env
    depends_on: [redis]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
```

**`.dockerignore`**
```
.venv/
__pycache__/
.git/
frontend/
*.pyc
.env
```

### Comportement attendu
Chaque push sur `main` ou `develop` lance les tests backend + frontend + build
automatiquement. Le build Docker est reproductible et inclut Redis pour le rate limit.

---

## 7. Notifications et Alertes In-App

### Problème actuel
Aucun système de notification. L'utilisateur ne sait pas quand :
- Un sync Meta a échoué (token expiré, rate limit, compte inactif)
- Une campagne créée par l'agent a un `status_detail = "failed"` ou `"partial"`
- Le budget journalier d'une campagne active est épuisé

### Ce qu'il faut implémenter

**Table Supabase (`supabase/migrations/0005_notifications.sql`)**
```sql
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,        -- 'sync_error' | 'campaign_failed' | 'token_expired'
  title TEXT NOT NULL,
  body TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read, created_at DESC);
```

**Backend**

1. Créer `backend/notifications.py` avec une fonction `create_notification(user_id, type, title, body)`.

2. Appeler `create_notification` depuis :
   - `facebook_sync.py` quand un sync échoue : `type="sync_error"`
   - `facebook_sync.py` quand token expiré détecté : `type="token_expired"`
   - `main.py` route `POST /chat` quand `status_detail = "failed"` après création campagne : `type="campaign_failed"`

3. Ajouter dans `main.py` :
   ```
   GET /notifications          → liste les 20 dernières (non lues en premier)
   PATCH /notifications/{id}   → marquer comme lue
   PATCH /notifications/read-all → tout marquer comme lu
   ```

**Frontend**

1. Ajouter une icône cloche dans la topbar avec un badge rouge affichant le nombre
   de notifications non lues.

2. Cliquer sur la cloche ouvre un dropdown listant les notifications récentes,
   avec timestamp relatif (ex : "il y a 3 min").

3. Chaque notification `token_expired` doit avoir un bouton "Mettre à jour le token"
   qui navigue vers Settings.

4. Polling léger : `GET /notifications` toutes les 60 secondes quand l'app est active.

### Comportement attendu
L'utilisateur est informé en temps quasi-réel des événements importants sans quitter
l'interface. Aucune dépendance email ou service tiers requis pour cette version.

---

## Ordre d'implémentation recommandé

| Priorité | Item | Raison |
|----------|------|--------|
| 1 | Détection tokens Meta expirés (#3) | Brise silencieusement le produit |
| 2 | JWT Refresh Token (#1) | UX quotidienne bloquante |
| 3 | Observabilité Sentry (#4) | Nécessaire avant tout déploiement prod |
| 4 | Redis Rate Limiter (#2) | Requis pour passer à plusieurs workers |
| 5 | Notifications in-app (#7) | Complète la détection token (#3) |
| 6 | Tests (#5) | Filet de sécurité pour les items suivants |
| 7 | CI/CD Docker (#6) | En dernier — les tests doivent exister d'abord |
