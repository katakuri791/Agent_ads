---
title: Commandes & démarrage
type: reference
tags: [admind, commandes, dev, setup]
created: 2026-06-24
---

# 13 — Commandes & démarrage

[[00 - 🏠 AdMind AI (Accueil)|← Retour à l'accueil]]

## Backend (Python / `uv`)

```bash
# Installer les dépendances
uv sync

# Démarrer le serveur (port 8000, reload auto)
uv run uvicorn main:app --reload --port 8000
```

## Frontend (`pnpm`)

```bash
cd frontend

pnpm install      # installer
pnpm dev          # dev server (port 5173)
pnpm build        # build de prod
```

## Accès

| Service | URL |
|---------|-----|
| Backend API | `http://localhost:8000` |
| Docs Swagger | `http://localhost:8000/docs` |
| Frontend | `http://localhost:5173` |

## Variables d'environnement
Voir le détail dans [[03 - Stack technique]] :
- `.env` (racine) — OpenAI, Supabase, JWT.
- `frontend/.env.local` — `VITE_API_URL`.

## Commandes slash (skills Claude Code)

Définies dans `.claude/commands/`. À invoquer via `/nom` dans le chat :

| Commande | Description |
|----------|-------------|
| `/run-dev` | Démarre backend + frontend |
| `/create-component` | Composant React conforme au [[11 - Système de design]] |
| `/review-ui` | Audit UI contre les règles Mission Control |
| `/debug-agent` | Tracer la boucle ReAct → [[07 - Agent IA]] |
| `/debug-backend` | Debug FastAPI / Supabase |
| `/debug-meta` | Diagnostiquer erreurs Meta API |
| `/db-inspect` | Inspecter les tables Supabase → [[08 - Base de données]] |
| `/create-campaign` | Étendre le flux de création de campagne |
| `/manage-page` | Features de page Facebook |
| `/inspect-analytics` | Analytics dashboard |

## Liens connexes
- [[04 - Architecture]]
- [[05 - Backend]]
- [[06 - Frontend]]
