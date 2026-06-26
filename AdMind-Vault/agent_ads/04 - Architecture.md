---
title: Architecture
type: concept
tags: [admind, architecture]
created: 2026-06-24
---

# 04 — Architecture

[[00 - 🏠 AdMind AI (Accueil)|← Retour à l'accueil]]

## Vue d'ensemble du flux

```
┌─────────────┐    ┌──────────────────┐    ┌────────────────────┐    ┌────────────┐
│ Utilisateur │──▶│  Frontend React   │──▶│  Backend FastAPI    │──▶│  Agent IA   │
│ (login/chat)│    │ (Vite, TS, UI)    │    │ (main.py, 19 routes)│    │ (LangGraph) │
└─────────────┘    └──────────────────┘    └─────────┬──────────┘    └─────┬──────┘
                                                      │                     │
                                                      ▼                     ▼
                                            ┌──────────────────┐    ┌─────────────┐
                                            │     SUPABASE      │    │  Meta Ads   │
                                            │ DB + auth + cache │    │  API v21.0  │
                                            └──────────────────┘    └─────────────┘
```

## Briques

- **Frontend** ([[06 - Frontend]]) — React/TS. Stocke le JWT en `localStorage`, l'envoie en `Authorization: Bearer`. Sur 401 → logout auto.
- **Backend** ([[05 - Backend]]) — FastAPI, point d'entrée `main.py`. Toutes les routes auth protégées par `get_current_user()`.
- **Agent IA** ([[07 - Agent IA]]) — reconstruit **à chaque appel `/chat`** avec les settings de l'utilisateur courant.
- **Supabase** ([[08 - Base de données]]) — PostgreSQL avec **Row Level Security (RLS)** : chaque user ne voit que ses données. Sert aussi de **cache analytics** (tables `fb_*` alimentées par un worker APScheduler).
- **Meta Ads API** — `facebook-business` SDK pour les campagnes + Graph API HTTP direct (v21.0) pour les pages.

## Pourquoi l'agent tourne séparément ?

Supabase exécute du Deno/TS, pas du Python. L'agent LangGraph (Python) tourne donc dans le process FastAPI, sur un hébergement Python distinct. Supabase reste un pur backend de données.

## Flux d'un tour de chat

1. `POST /chat` reçoit le message.
2. Le backend **charge l'historique** de la conversation depuis Supabase.
3. LangGraph invoque le LLM → décide quels [[07 - Agent IA|outils]] appeler.
4. Les outils exécutent les appels Meta API.
5. L'agent retourne la réponse + outputs structurés (brief, insight).
6. Messages **sauvegardés** dans Supabase.

## Liens connexes
- [[03 - Stack technique]]
- [[10 - API Routes]]
