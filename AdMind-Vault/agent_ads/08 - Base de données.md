---
title: Base de données
type: reference
tags: [admind, supabase, database, postgres]
created: 2026-06-24
---

# 08 — Base de données (Supabase)

[[00 - 🏠 AdMind AI (Accueil)|← Retour à l'accueil]]

**Supabase / PostgreSQL**. Toutes les tables ont **Row Level Security (RLS)** activé → chaque utilisateur ne voit que ses données. Accès backend via `backend/db.py` ([[05 - Backend]]).

## Tables

### `users`
```
id, email, password_hash, full_name, first_name, last_name, avatar_url, company
```

### `user_settings`
```
user_id, meta_access_token, meta_ad_account_id, meta_page_id,
meta_pixel_id, preferred_currency, timezone
```
> Les credentials Meta sont stockés **ici, par utilisateur** — jamais dans `.env`.

### `conversations`
```
id, user_id, title, created_at, updated_at
```

### `messages`
```
id, conversation_id, user_id, role (user|assistant|tool),
content, metadata (JSON), created_at
```

### `tool_logs`
```
user_id, conversation_id, tool_name, tool_input, tool_output, status, duration_ms
```

### `campaigns` / `ad_sets` / `ads` (audit trail)
```
campaigns: user_id, meta_campaign_id, name, objective, status, daily_budget
ad_sets:   campaign_id, meta_ad_set_id, targeting, optimization_goal
ads:       ad_set_id, meta_ad_id, creative_id
```
Hiérarchie des campagnes créées via l'[[07 - Agent IA|agent]].

## 🗄️ Cache analytics (`fb_*`)

> [!important] Le dashboard ne lit PAS Meta en direct
> Les analytics du dashboard sont lues depuis un **cache Supabase** (tables `fb_*`), alimenté par un **worker APScheduler**. Le cache est keyé par `meta_ad_account_id` (plusieurs lignes `meta_accounts` peuvent partager un même ad account).

## Migrations
`supabase/migrations/` — ex : `0001_core_schema.sql`, `0003_campaign_audit.sql`.

## Liens connexes
- [[05 - Backend]]
- [[07 - Agent IA]]
- [[12 - Contraintes critiques]]
