---
title: Backend
type: reference
tags: [admind, backend, python, fastapi]
created: 2026-06-24
---

# 05 — Backend

[[00 - 🏠 AdMind AI (Accueil)|← Retour à l'accueil]]

Stack : **Python 3.11+ / FastAPI / uvicorn**. Voir [[03 - Stack technique]].

## Fichiers (`backend/`)

| Fichier | Rôle |
|---------|------|
| `main.py` (racine) | App FastAPI — **19 routes**, point d'entrée |
| `config.py` | Chargement `.env`, client Supabase, constantes |
| `auth.py` | JWT, bcrypt, signup/login, `get_current_user()` |
| `db.py` | CRUD Supabase (users, settings, conversations, messages) |
| `schemas.py` | Modèles Pydantic pour toutes les routes |
| `agent.py` | Construction agent LangGraph, prompts système → [[07 - Agent IA]] |
| `meta_tools.py` | Outils Meta Ads (création campagne, upload image…) |
| `meta_pages.py` | Graph API — page info, posts, insights, publication |

## Conventions backend

- Toutes les routes FastAPI sont dans `main.py` — **ne pas** créer de routers séparés sans raison.
- La dépendance `get_current_user()` (`auth.py`) protège toutes les routes authentifiées.
- **Toutes** les opérations Supabase passent par `db.py`.
- Les erreurs Meta (`FacebookRequestError`) sont catchées dans `meta_tools.py`.

## Authentification

- **JWT HS256 + bcrypt**, expiry **24h**.
- Le JWT identifie l'utilisateur sur chaque requête.
- Stocké côté frontend en `localStorage` → envoyé en header `Authorization: Bearer <token>`.

## Liens connexes
- [[10 - API Routes]]
- [[08 - Base de données]]
- [[07 - Agent IA]]
