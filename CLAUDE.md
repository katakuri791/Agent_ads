# AdMind AI — Guide Claude Code

## Vue d'ensemble

**AdMind AI** est un SaaS B2B qui permet aux marketeurs de créer et analyser des campagnes Meta Ads (Facebook/Instagram) via une interface en langage naturel. L'agent IA comprend les demandes en français ou en anglais, propose un brief de campagne, et crée l'arborescence complète (campaign → adset → creative → ad) via l'API Meta.

**Fonctionnalités principales :**
- Dashboard analytics (KPIs, séries temporelles, démographie, top campagnes)
- Chat avec agent IA pour créer et analyser des campagnes
- Gestion de la page Facebook (posts, insights, publication)
- Authentification multi-utilisateur avec paramètres Meta par compte
- Upload d'images pour les créatives publicitaires

---

## Tech Stack

| Couche | Technologie |
|--------|-------------|
| Backend API | Python 3.11+, FastAPI, uvicorn |
| Agent IA | LangChain 0.3+, LangGraph 0.2+ (pattern ReAct) |
| LLM | OpenAI gpt-4o-mini (instance self-hosted) |
| Meta Ads | `facebook-business` SDK v20+ |
| Graph API | Requêtes HTTP directes, Graph v21.0 |
| Base de données | Supabase (PostgreSQL) |
| Auth | JWT HS256 + bcrypt (24h expiry) |
| Frontend | React 18 + TypeScript + Vite 6 |
| Styling | Tailwind CSS 4 + shadcn/ui + Radix UI |
| Charts | Recharts 2 |
| Package manager | pnpm (frontend), uv (backend) |

---

## Structure des fichiers

```
Agent_ads/
├── main.py                    # FastAPI app — 35+ routes, point d'entrée
├── pyproject.toml             # Dépendances Python (uv)
├── .env                       # Secrets (ne jamais committer)
│
├── backend/
│   ├── config.py              # Chargement .env, client Supabase, constantes
│   ├── auth.py                # JWT, bcrypt, signup/login, get_current_user()
│   ├── db.py                  # CRUD Supabase (users, settings, conversations, messages)
│   ├── schemas.py             # Modèles Pydantic pour toutes les routes
│   ├── agent.py               # Construction agent LangGraph, prompts système
│   ├── meta_tools.py          # Outils Meta Ads (création campagne, upload image, etc.)
│   ├── meta_pages.py          # Graph API — page info, posts, insights, publication, planification
│   ├── dashboard.py           # Lecture du cache Supabase (fb_*) pour dashboard + campagnes
│   ├── facebook_sync.py       # Worker APScheduler — sync Meta → Supabase (toutes les 20 min)
│   ├── ratelimit.py           # Limiteur de débit en mémoire (sliding window, /chat)
│   └── metrics.py             # Utilitaires de calcul de métriques
│
├── frontend/
│   ├── src/app/
│   │   ├── App.tsx            # Toute l'app React (monolithique — routes, pages, modals)
│   │   ├── components/
│   │   │   ├── ui/            # 40+ composants shadcn/ui
│   │   │   └── ms/
│   │   │       ├── motion.tsx  # Système d'animation (FadeIn, Blob, useCountUp, courbes spring)
│   │   │       └── ...
│   │   ├── pages/
│   │   │   ├── SchedulePage.tsx  # Planning éditorial (calendrier Jour/Semaine/Mois)
│   │   │   └── ...
│   │   ├── providers/
│   │   │   ├── ThemeProvider.tsx  # Thème dark/light/dim/system + couleur d'accent
│   │   │   └── ...
│   │   └── lib/
│   │       ├── api.ts         # Client HTTP typé vers le backend
│   │       └── auth.ts        # Gestion JWT côté frontend (localStorage)
│   ├── package.json
│   ├── vite.config.ts
│   └── .env.local             # VITE_API_URL=http://localhost:8000
│
├── supabase/
│   └── migrations/
│       ├── 0001_core_schema.sql   # Schéma reproductible complet (IF NOT EXISTS)
│       └── 0003_campaign_audit.sql # Colonnes d'audit campagne (status_detail, error_log, request_id)
│
├── DESIGN.md                  # Système de design complet (lire avant tout travail UI)
├── PRODUCT.md                 # Vision produit, brand, personas
└── README.md                  # Spec fonctionnelle détaillée (français)
```

---

## Commandes

### Backend
```bash
# Installer les dépendances
uv sync

# Démarrer le serveur (port 8000, reload auto)
uv run uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend

# Installer les dépendances
pnpm install

# Démarrer le dev server (port 5173)
pnpm dev

# Build de production
pnpm build
```

### Tests
```bash
# Backend (pytest) — depuis la racine
uv run pytest tests/ -v

# Frontend (Vitest) — depuis frontend/
pnpm test            # ou : pnpm exec vitest run
```

### Docker (dév local : API + Redis)
```bash
docker compose up --build       # API sur :8000 + Redis sur :6379
docker build -t admind-api .    # build de l'image backend seule
```

### CI
`.github/workflows/ci.yml` lance à chaque push (main/develop/ads_v3) et PR :
backend (`uv sync` + `pytest`) et frontend (`pnpm install` + `vitest` + `vite build`).

### Accès
- Backend API : `http://localhost:8000`
- Docs API (Swagger) : `http://localhost:8000/docs`
- Frontend : `http://localhost:5173`

---

## Variables d'environnement

### `.env` (racine — backend)
```
# OpenAI (instance self-hosted)
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://toknroutertybot.tybotflow.com/
OPENAI_MODEL=gpt-4o-mini          # optionnel, valeur par défaut

# Supabase
SUPABASE_URL=https://emsnlnnswapgrntepokm.supabase.co
SUPABASE_SERVICE_KEY=eyJ...       # clé service role (admin)

# JWT (optionnel — auto-généré si absent)
JWT_SECRET=...

# Observabilité (optionnel)
SENTRY_DSN=                       # vide → Sentry désactivé (no-op)
ENV=development                   # environnement signalé à Sentry

# Rate limiter (optionnel — requis en multi-worker)
REDIS_URL=redis://localhost:6379/0   # injoignable → fail-open (limiteur désactivé)
```

### `frontend/.env.local`
```
VITE_API_URL=http://localhost:8000
```

Les credentials Meta Ads (token, account ID, page ID, pixel ID) sont stockés **par utilisateur** dans la table `user_settings` de Supabase — pas dans `.env`.

---

## API Routes (FastAPI — `main.py`)

### Auth
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/auth/signup` | Créer un compte (email, password, full_name) → access + refresh token |
| POST | `/auth/login` | Connexion → access token (24h) + refresh token (30j) |
| POST | `/auth/refresh` | Renouvelle l'access token via refresh token (rotation one-time use) |
| POST | `/auth/logout` | Invalide le refresh token courant |
| GET | `/auth/me` | Profil utilisateur courant |
| PATCH | `/auth/me` | Modifier profil (full_name, first_name, last_name, company, avatar_url) |

### Paramètres Meta
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/settings` | Lire config Meta (token masqué) |
| PUT | `/settings` | Sauvegarder token, account ID, page ID, pixel ID, currency, timezone |
| POST | `/settings/test` | Valider les credentials Meta → retourne account_name ou erreur |

### Comptes Meta (multi-comptes)
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/meta/accounts` | Lister les comptes Meta de l'utilisateur |
| POST | `/meta/accounts` | Créer un nouveau compte Meta |
| PUT | `/meta/accounts/{id}` | Modifier un compte Meta |
| DELETE | `/meta/accounts/{id}` | Supprimer un compte Meta |
| POST | `/meta/accounts/{id}/test` | Valider les credentials d'un compte |

### Dashboard & Campagnes
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/meta/dashboard?days=30` | KPIs, série temporelle, démographie, top campagnes (depuis cache) |
| GET | `/meta/campaigns?date_preset=last_30d` | Liste campagnes avec insights (depuis cache) |
| GET | `/meta/campaigns/{id}/detail?section=...` | Détail campagne : adsets/ads/demographics/placements |
| PATCH | `/meta/campaigns/{id}/status` | Activer (ACTIVE) ou mettre en pause (PAUSED) une campagne |
| GET | `/meta/audiences` | Liste des audiences personnalisées du compte |
| GET | `/meta/audience-reach` | Portée estimée par tranche d'âge/genre |
| GET | `/meta/page-info` | Métadonnées page Facebook |
| GET | `/meta/page-insights?days=28` | Stats page (impressions, engagement, followers) |
| GET | `/meta/page-posts?limit=10` | Posts récents avec métriques |
| GET | `/meta/page-summary` | Résumé page : reach total/organic/paid + stats agrégées |
| GET | `/meta/page-engagement-debug` | Diagnostic engagement (scopes, token de page, cause réelle) |
| GET | `/meta/scheduled-posts` | Posts planifiés sur la page |
| POST | `/meta/scheduled-posts` | Planifier un post (texte/image/vidéo/lien) |
| POST | `/meta/scheduled-posts/{id}/publish` | Publier immédiatement un post planifié |
| DELETE | `/meta/scheduled-posts/{id}` | Supprimer un post planifié |
| POST | `/meta/page-posts` | Publier un post immédiat (texte/image/vidéo/lien) |
| GET | `/meta/search?q=...` | Recherche campagnes + posts + page |

### Sync cache Meta → Supabase
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/sync/status?account_id=...` | État de la dernière synchronisation |
| POST | `/api/sync/{account_id}` | Forcer un sync immédiat (bouton Refresh) |

### Chat / Agent
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/conversations` | Lister les conversations de l'utilisateur |
| POST | `/conversations` | Créer une nouvelle conversation |
| GET | `/conversations/{id}/messages` | Historique d'une conversation |
| POST | `/chat/upload-image` | Uploader une image → retourne `image_hash` |
| POST | `/chat/upload-video` | Uploader une vidéo → retourne `video_id` |
| POST | `/chat` | Envoyer un message → réponse agent (avec tool calls optionnels) |

### Divers
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/health` | Health check |

---

## Base de données (Supabase)

Toutes les tables ont **Row Level Security (RLS)** activé sans policy — le backend accède via la service-role key (bypass RLS). Le frontend ne lit jamais les tables directement.

### Migrations
- `supabase/migrations/0001_core_schema.sql` — Schéma complet reproductible (`IF NOT EXISTS`)
- `supabase/migrations/0003_campaign_audit.sql` — Colonnes d'audit campagne sur bases déjà déployées

### Tables applicatives

**`users`**
```
id, email, password_hash, full_name, first_name, last_name, avatar_url, company, created_at
```

**`user_settings`** *(modèle mono-clé — déprécié, encore lu pour compatibilité)*
```
user_id, meta_access_token, meta_ad_account_id, meta_page_id,
meta_pixel_id, preferred_currency, timezone
```

**`meta_accounts`** *(modèle courant — multi-comptes)*
```
id, user_id, label, meta_access_token, meta_ad_account_id, meta_page_id,
meta_pixel_id, preferred_currency, timezone, is_default
Index unique : un seul is_default=true par user_id
```

**`conversations`**
```
id, user_id, title, created_at, updated_at
```

**`messages`**
```
id, conversation_id, user_id, role (user|assistant|tool|system),
content, metadata (JSON), created_at
```

**`tool_logs`**
```
user_id, conversation_id, tool_name, tool_input, tool_output, status, duration_ms, created_at
```

**`campaigns` / `ad_sets` / `ads`** *(audit trail créations agent)*
```
campaigns: user_id, meta_campaign_id, name, objective, status, daily_budget,
           status_detail (success|partial|failed), error_log, request_id (idempotence)
ad_sets: campaign_id, meta_ad_set_id, name, status, daily_budget,
         optimization_goal, billing_event, targeting (JSONB)
ads: ad_set_id, meta_ad_id, name, status, creative_id
```

### Tables de cache (sync Meta → Supabase)

Le worker `facebook_sync.py` écrit dans ces tables toutes les 20 min. Le dashboard et les listes de campagnes lisent uniquement depuis ce cache (pas d'appels Meta live).

**`fb_sync_state`** — État de sync par ad account
```
meta_ad_account_id, last_sync_at, last_sync_status (success|error|running),
last_error, insights_synced_until
```

**`fb_campaigns`** — Campagnes et métriques
```
meta_ad_account_id, campaign_id, name, objective, status, daily_budget, ...metrics
```

**`fb_ad_sets`** / **`fb_ads`** — Ad sets et annonces du compte

**`fb_insights_daily`** — Insights agrégés par jour (impressions, clicks, spend, reach, conversions…)

---

## Agent IA (LangGraph)

### Architecture
L'agent utilise le pattern **ReAct** (Reasoning + Acting) via LangGraph :
1. L'utilisateur envoie un message via `POST /chat`
2. Le backend charge l'historique de la conversation depuis Supabase
3. LangGraph invoque le LLM → décide quels outils appeler
4. Les outils executent les appels Meta API
5. L'agent retourne la réponse finale + outputs structurés (brief, insight)
6. Messages sauvegardés dans Supabase

Le rate limiter (`ratelimit.py`) bloque `/chat` au-delà du seuil par fenêtre glissante (process-local, mono-worker).

### Outils disponibles (`backend/meta_tools.py`)

| Outil | Description |
|-------|-------------|
| `create_full_campaign` | Crée campagne + adset + creative + ad (toujours PAUSED) |
| `upload_image` | Upload image locale → retourne `image_hash` |
| `upload_image_from_url` | Upload image depuis URL publique → retourne `image_hash` |
| `list_active_campaigns` | Liste les campagnes du compte |
| `get_facebook_page_info` | Métadonnées de la page Facebook |
| `list_facebook_page_posts` | Posts récents avec engagement |
| `post_to_facebook_page` | Publier un post (requiert confirmation explicite) |
| `get_facebook_page_insights` | Stats de la page |
| `emit_campaign_brief` | Output structuré : carte de preview avant création |
| `emit_insight` | Output structuré : carte d'analyse/recommandation |

### Flux création campagne
```
1. emit_campaign_brief()   → frontend affiche la carte de preview
2. Utilisateur confirme
3. create_full_campaign()  → création dans Meta (status PAUSED)
4. save_campaign_tree()    → audit trail dans Supabase (avec status_detail + request_id)
```

## Architecture Sync (cache Meta)

Le dashboard ne fait **plus d'appels Meta live** — il lit le cache Supabase :

```
APScheduler (toutes les 20 min, configurable via FB_SYNC_INTERVAL_MINUTES)
    └─ facebook_sync.sync_all_accounts()
         ├─ Chaque meta_accounts row avec token+ad_account → sync_account()
         ├─ Écrit fb_campaigns, fb_ad_sets, fb_ads, fb_insights_daily
         └─ Met à jour fb_sync_state (last_sync_at, status, erreur)

dashboard.py lit fb_* → endpoint /meta/dashboard, /meta/campaigns
POST /api/sync/{account_id} → force un sync immédiat (asyncio.to_thread)
```

**Variables d'environnement sync :**
```
FB_SYNC_INTERVAL_MINUTES=20   # Intervalle entre syncs (défaut : 20)
FB_SYNC_ON_STARTUP=true       # Sync au démarrage du serveur (défaut : true)
```

## Fonctionnalités UI nouvelles

### Planning éditorial (`SchedulePage.tsx`)
Calendrier de publication avec 3 vues (Jour / Semaine / Mois) :
- Créer un post planifié (texte, photo, vidéo, lien) via `POST /meta/scheduled-posts`
- Voir les posts planifiés et publiés par créneau
- Publier immédiatement un post planifié ou le supprimer
- Alerte si le scope `pages_manage_posts` manque (`blocked_reason`)
- Validation client : créneau minimum +10 min dans le futur

### Thème (`ThemeProvider.tsx`)
4 modes : `dark` (défaut), `light`, `dim`, `system` (suit l'OS).
- Persisté dans `localStorage` (`ui_theme`)
- Couleur d'accent personnalisable (`ui_accent`, défaut `#1877F2`)
- Basculement rapide dark ↔ light via bouton topbar (cross-fade 450 ms)
- `useTheme()` / `useResolvedTheme()` disponibles dans toute l'app

### Système d'animation (`motion.tsx`)
- `FadeIn` — entrée JS-driven (opacity + translate + scale), sûre en arrière-plan
- `useCountUp(value)` — anime un chiffre de 0 → cible (ease-out cubic, 1150 ms)
- `Blob` — glyphe décoratif SVG (heart, star, sparkle, blob, wave, donut)
- `blobFor(idx)` — glyphe + couleur déterministe par index KPI
- Courbes `EASE` : spring, springSoft, smooth, snappy

---

## Système de Design

> Lire `DESIGN.md` en entier avant tout travail UI. Résumé des règles critiques :

### Thème : "Mission Control"
Espace de travail sombre, précision analytique. **Aucune couleur chaude** (pas de crème, sable, blanc cassé).

### Palette de couleurs
```
Fond principal :    #060D1F  (Void)
Sidebar :           #070F1E
Surface carte :     #0B1628
Carte élevée :      #121F38

Violet primaire :   #7C3AED  (actions, états actifs — max 15% de l'écran)
Violet doux :       #A78BFA  (nav active, accents lisibles)
Cyan signal :       #06B6D4  (données live, accents secondaires)

Texte principal :   #E2E8F0
Texte secondaire :  #CBD5E1
Texte dim :         #64748B

Alerte :            #F43F5E  (Rose)
Succès/Live :       #10B981  (Emerald)
Budget/Warning :    #F59E0B  (Amber)
```

### Typographie
```
Display/Titre page :  Bricolage Grotesque 500, 1.5rem
Titre carte :         Bricolage Grotesque 500, 1.25rem
Label section :       Inter 600, 1rem
Corps/prose :         Inter 400, 0.875rem (max 65ch)
Label/nav :           Inter 500, 0.75rem
CHIFFRES/KPIs :       JetBrains Mono 700, 0.875rem  ← OBLIGATOIRE pour tous les nombres financiers
```

### Règles absolues
- **One-Accent Rule** : Le violet apparaît sur ≤15% du poids visuel de l'écran
- **Mono-Owns-Numbers** : Tous les montants, KPIs, IDs → JetBrains Mono, jamais Inter
- **No-Tint** : Fonds uniquement en navy (jamais crème/sand/warm)
- **Tonal Priority** : Élévation via changement de fond (`#0B1628` → `#121F38`), pas de box-shadow
- **Motion** : 150–200ms `cubic-bezier(0.4,0,0.2,1)` pour les transitions d'état uniquement
- **Shadows** : Uniquement pour éléments flottants — `0 12px 32px rgba(0,0,0,0.50)`

---

## Contraintes critiques

> Ces règles ne doivent **jamais** être violées :

- **Campagnes toujours en PAUSED** — `create_full_campaign` ne crée jamais une campagne ACTIVE
- **Budget en centimes** — `1000` = €10.00 (pas en euros directement)
- **Pays en ISO-2** — `["MA", "FR", "US"]` (pas les noms complets)
- **Tranche d'âge** — min 18, max 65 (contrainte Meta)
- **image_hash obligatoire** avant de créer une creative — format hex 16+ caractères
- **Paires objective/optimization_goal** — validées contre `COMPATIBLE_GOALS` dans `meta_tools.py`
- **Confirmation utilisateur requise** avant `post_to_facebook_page` (publication irréversible)
- **Billing event** : toujours `IMPRESSIONS`
- **Bid strategy** : toujours `LOWEST_COST_WITHOUT_CAP`
- **Graph API version** : v21.0 (ne pas downgrader)

---

## Conventions de code

### Backend
- Toutes les routes FastAPI sont dans `main.py` — ne pas créer de routers séparés sans raison
- La dépendance `get_current_user()` dans `backend/auth.py` protège toutes les routes authentifiées
- Les opérations Supabase passent toutes par `backend/db.py`
- Les erreurs Meta API (`FacebookRequestError`) sont catchées dans `meta_tools.py`

### Frontend
- `App.tsx` est volontairement monolithique — ne pas refactorer en pages séparées sans décision explicite
- `frontend/src/app/lib/api.ts` contient tous les appels HTTP vers le backend
- JWT stocké dans `localStorage`, envoyé dans `Authorization: Bearer <token>`
- Sur 401 → logout automatique
- `fetchWithTimeout` (45 s) wrap tous les appels — timeout → `ApiError` lisible, pas `Failed to fetch`
- `ThemeProvider` doit envelopper l'app entière ; utiliser `useTheme()` pour lire/modifier le thème

### Agent
- L'agent est reconstruit à chaque appel `/chat` avec les settings de l'utilisateur courant
- Si l'utilisateur n'a pas configuré ses credentials Meta → prompt de fallback (`SYSTEM_PROMPT_NO_META`)
- Les outputs structurés (`emit_campaign_brief`, `emit_insight`) sont capturés via un mécanisme de persist dans `agent.py`
- `/chat` est rate-limité via `ratelimit.check_rate_limit()` — mono-process uniquement

### Multi-comptes Meta
- `meta_accounts` remplace `user_settings` pour les nouvelles features ; `user_settings` reste pour compat
- `_resolve_account(user_id, account_id)` dans `main.py` résout le compte sélectionné (ou le défaut)
- Toutes les routes Meta acceptent `?account_id=<uuid>` pour cibler un compte spécifique
- Un seul compte peut avoir `is_default=true` par utilisateur (index unique)

---

## Commandes Slash (Skills)

Ces skills fournissent un contexte détaillé pour les tâches courantes. Les invoquer via `/nom-du-skill` dans le chat. Tous les fichiers se trouvent dans `.claude/commands/`.

| Commande | Description |
|----------|-------------|
| `/run-dev` | Démarrer backend (port 8000) + frontend (port 5173) |
| `/create-component` | Créer un composant React conforme au design system Mission Control |
| `/review-ui` | Auditer l'UI contre les 5 règles Mission Control (Do/Don't) |
| `/debug-agent` | Tracer la boucle ReAct LangGraph — tool calls, persist dict, réponses |
| `/debug-backend` | Debug FastAPI — routes, Supabase, erreurs Python |
| `/debug-meta` | Diagnostiquer erreurs Meta API — token, campagnes, image_hash |
| `/db-inspect` | Inspecter les tables Supabase (users, conversations, campaigns…) |
| `/create-campaign` | Implémenter ou étendre le flux de création de campagne (brief → confirm → create → save) |
| `/manage-page` | Travailler avec les features de page Facebook (posts, insights, publication) |
| `/inspect-analytics` | Analytics dashboard — KPIs, séries temporelles, campagnes par performance |
