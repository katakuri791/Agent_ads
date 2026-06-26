---
title: API Routes
type: reference
tags: [admind, api, fastapi, routes]
created: 2026-06-24
---

# 10 — API Routes (FastAPI — `main.py`)

[[00 - 🏠 AdMind AI (Accueil)|← Retour à l'accueil]]

Toutes les routes sont dans `main.py`. Les routes authentifiées passent par `get_current_user()`. Voir [[05 - Backend]].

## 🔐 Auth
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/auth/signup` | Créer un compte (email, password, full_name) |
| POST | `/auth/login` | Connexion → retourne JWT |
| GET | `/auth/me` | Profil utilisateur courant |
| PATCH | `/auth/me` | Modifier profil |

## ⚙️ Paramètres Meta
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/settings` | Lire config Meta (token masqué) |
| PUT | `/settings` | Sauvegarder token, account/page/pixel ID, currency, timezone |
| POST | `/settings/test` | Valider les credentials Meta → `account_name` ou erreur |

## 📊 Dashboard & Campagnes
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/meta/dashboard?days=30` | KPIs, série temporelle, démographie, top campagnes |
| GET | `/meta/campaigns?date_preset=last_30d` | Liste campagnes + insights |
| GET | `/meta/page-info` | Métadonnées page FB |
| GET | `/meta/page-insights?days=28` | Stats page |
| GET | `/meta/page-posts?limit=10` | Posts récents + métriques |
| GET | `/meta/search?q=...` | Recherche campagnes + posts + page |

## 💬 Chat / Agent
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/conversations` | Lister les conversations |
| POST | `/conversations` | Créer une conversation |
| GET | `/conversations/{id}/messages` | Historique |
| POST | `/chat/upload-image` | Upload image → `image_hash` |
| POST | `/chat` | Envoyer message → réponse agent ([[07 - Agent IA]]) |

## 🩺 Divers
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/health` | Health check |

> [!tip] Docs Swagger
> Disponibles en local sur `http://localhost:8000/docs`. Voir [[13 - Commandes & démarrage]].

## Liens connexes
- [[04 - Architecture]]
- [[06 - Frontend]] (`lib/api.ts` consomme ces routes)
