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
├── main.py                    # FastAPI app — 19 routes, point d'entrée
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
│   └── meta_pages.py          # Graph API — page info, posts, insights, publication
│
├── frontend/
│   ├── src/app/
│   │   ├── App.tsx            # Toute l'app React (monolithique — routes, pages, modals)
│   │   ├── components/ui/     # 40+ composants shadcn/ui
│   │   └── lib/
│   │       ├── api.ts         # Client HTTP typé vers le backend
│   │       └── auth.ts        # Gestion JWT côté frontend (localStorage)
│   ├── package.json
│   ├── vite.config.ts
│   └── .env.local             # VITE_API_URL=http://localhost:8000
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
| POST | `/auth/signup` | Créer un compte (email, password, full_name) |
| POST | `/auth/login` | Connexion → retourne JWT |
| GET | `/auth/me` | Profil utilisateur courant |
| PATCH | `/auth/me` | Modifier profil (full_name, first_name, last_name, company, avatar_url) |

### Paramètres Meta
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/settings` | Lire config Meta (token masqué) |
| PUT | `/settings` | Sauvegarder token, account ID, page ID, pixel ID, currency, timezone |
| POST | `/settings/test` | Valider les credentials Meta → retourne account_name ou erreur |

### Dashboard & Campagnes
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/meta/dashboard?days=30` | KPIs, série temporelle, démographie, top campagnes |
| GET | `/meta/campaigns?date_preset=last_30d` | Liste campagnes avec insights |
| GET | `/meta/page-info` | Métadonnées page Facebook |
| GET | `/meta/page-insights?days=28` | Stats page (impressions, engagement, followers) |
| GET | `/meta/page-posts?limit=10` | Posts récents avec métriques |
| GET | `/meta/search?q=...` | Recherche campagnes + posts + page |

### Chat / Agent
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/conversations` | Lister les conversations de l'utilisateur |
| POST | `/conversations` | Créer une nouvelle conversation |
| GET | `/conversations/{id}/messages` | Historique d'une conversation |
| POST | `/chat/upload-image` | Uploader une image → retourne `image_hash` |
| POST | `/chat` | Envoyer un message → réponse agent (avec tool calls optionnels) |

### Divers
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/health` | Health check |

---

## Base de données (Supabase)

Toutes les tables ont **Row Level Security (RLS)** activé — chaque utilisateur ne voit que ses données.

### Tables

**`users`**
```
id, email, password_hash, full_name, first_name, last_name, avatar_url, company
```

**`user_settings`**
```
user_id, meta_access_token, meta_ad_account_id, meta_page_id,
meta_pixel_id, preferred_currency, timezone
```

**`conversations`**
```
id, user_id, title, created_at, updated_at
```

**`messages`**
```
id, conversation_id, user_id, role (user|assistant|tool),
content, metadata (JSON), created_at
```

**`tool_logs`**
```
user_id, conversation_id, tool_name, tool_input, tool_output, status, duration_ms
```

**`campaigns` / `ad_sets` / `ads`**
```
Hiérarchie des campagnes créées via l'agent (audit trail)
campaigns: user_id, meta_campaign_id, name, objective, status, daily_budget
ad_sets: campaign_id, meta_ad_set_id, targeting, optimization_goal
ads: ad_set_id, meta_ad_id, creative_id
```

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
4. save_campaign_tree()    → audit trail dans Supabase
```

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

### Agent
- L'agent est reconstruit à chaque appel `/chat` avec les settings de l'utilisateur courant
- Si l'utilisateur n'a pas configuré ses credentials Meta → prompt de fallback (`SYSTEM_PROMPT_NO_META`)
- Les outputs structurés (`emit_campaign_brief`, `emit_insight`) sont capturés via un mécanisme de persist dans `agent.py`

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
