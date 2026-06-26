---
title: Stack technique
type: reference
tags: [admind, stack, technique]
created: 2026-06-24
---

# 03 — Stack technique

[[00 - 🏠 AdMind AI (Accueil)|← Retour à l'accueil]]

| Couche | Technologie |
|--------|-------------|
| Backend API | Python 3.11+, **FastAPI**, uvicorn |
| Agent IA | **LangChain 0.3+, LangGraph 0.2+** (pattern ReAct) |
| LLM | OpenAI **gpt-4o-mini** (instance self-hosted) |
| Meta Ads | `facebook-business` SDK v20+ |
| Graph API | Requêtes HTTP directes, **Graph v21.0** |
| Base de données | **Supabase** (PostgreSQL) |
| Auth | **JWT HS256 + bcrypt** (expiry 24h) |
| Frontend | **React 18 + TypeScript + Vite 6** |
| Styling | **Tailwind CSS 4** + shadcn/ui + Radix UI |
| Charts | Recharts 2 |
| Package manager | `pnpm` (frontend), `uv` (backend) |

> [!warning] Note d'architecture
> Supabase **ne peut pas** exécuter de Python (Edge Functions = Deno/TS). L'agent Python tourne donc sur un **hébergement séparé** (local en dev, Railway/Render/Fly en prod). Supabase = **DB + auth + cache** uniquement. Voir [[04 - Architecture]].

## Variables d'environnement

### `.env` (racine — backend)
```
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://toknroutertybot.tybotflow.com/
OPENAI_MODEL=gpt-4o-mini          # optionnel
SUPABASE_URL=https://....supabase.co
SUPABASE_SERVICE_KEY=eyJ...        # clé service role (admin)
JWT_SECRET=...                     # optionnel, auto-généré si absent
```

### `frontend/.env.local`
```
VITE_API_URL=http://localhost:8000
```

> [!info] Credentials Meta
> Le token, account ID, page ID, pixel ID sont stockés **par utilisateur** dans la table `user_settings` de Supabase — **pas** dans `.env`. Voir [[08 - Base de données]].

## Liens connexes
- [[05 - Backend]]
- [[06 - Frontend]]
- [[13 - Commandes & démarrage]]
