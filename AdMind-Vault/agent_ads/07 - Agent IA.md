---
title: Agent IA
type: concept
tags: [admind, agent, langgraph, ia]
created: 2026-06-24
---

# 07 — Agent IA

[[00 - 🏠 AdMind AI (Accueil)|← Retour à l'accueil]]

Construit avec **LangChain + LangGraph**, pattern **ReAct** (Reasoning + Acting). Code dans `backend/agent.py` et outils dans `backend/meta_tools.py`. Voir [[05 - Backend]].

## Boucle ReAct

1. L'utilisateur envoie un message via `POST /chat`.
2. Le backend charge l'historique depuis Supabase ([[08 - Base de données]]).
3. LangGraph invoque le LLM → décide quels outils appeler.
4. Les outils exécutent les appels Meta API.
5. L'agent retourne la réponse finale + **outputs structurés** (brief, insight).
6. Messages sauvegardés dans Supabase.

> [!info] Reconstruction par appel
> L'agent est **reconstruit à chaque `/chat`** avec les settings Meta de l'utilisateur courant. Si l'utilisateur n'a pas configuré ses credentials → prompt de fallback `SYSTEM_PROMPT_NO_META`.

## 🛠️ Outils disponibles (`meta_tools.py`)

| Outil | Description |
|-------|-------------|
| `create_full_campaign` | Crée campagne + adset + creative + ad (**toujours PAUSED**) |
| `upload_image` | Upload image locale → retourne `image_hash` |
| `upload_image_from_url` | Upload image depuis URL publique → `image_hash` |
| `list_active_campaigns` | Liste les campagnes du compte |
| `get_facebook_page_info` | Métadonnées de la page FB |
| `list_facebook_page_posts` | Posts récents avec engagement |
| `post_to_facebook_page` | Publier un post (**confirmation requise**) |
| `get_facebook_page_insights` | Stats de la page |
| `emit_campaign_brief` | Output structuré : carte de preview avant création |
| `emit_insight` | Output structuré : carte d'analyse / recommandation |

> Les outputs structurés (`emit_campaign_brief`, `emit_insight`) sont capturés via un mécanisme de **persist dict** dans `agent.py`.

## 🔁 Flux de création de campagne

```
1. emit_campaign_brief()   → le frontend affiche la carte de preview
2. L'utilisateur confirme
3. create_full_campaign()  → création dans Meta (status PAUSED)
4. save_campaign_tree()    → audit trail dans Supabase
```

## ⚠️ Règles agent

Voir [[12 - Contraintes critiques]] — notamment : campagnes **toujours PAUSED**, budget **en centimes**, pays en **ISO-2**, `image_hash` obligatoire, confirmation avant publication.

## Liens connexes
- [[10 - API Routes]] (route `/chat`)
- [[08 - Base de données]] (tables `messages`, `tool_logs`, `campaigns`)
- [[09 - Glossaire]]
