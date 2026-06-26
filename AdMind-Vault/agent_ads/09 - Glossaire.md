---
title: Glossaire
type: reference
tags: [admind, glossaire, meta-ads]
created: 2026-06-24
---

# 09 — Glossaire

[[00 - 🏠 AdMind AI (Accueil)|← Retour à l'accueil]]

## Hiérarchie Meta Ads

- **Campaign** — niveau le plus haut, définit l'**objectif** (ex. `OUTCOME_TRAFFIC`).
- **Ad Set** — ciblage, budget, optimisation, calendrier. Contient les ads.
- **Creative** — le contenu visuel + texte (lié à une **Page** via `object_story_spec`).
- **Ad** — l'annonce diffusée, lie un ad set à une creative.

```
Campaign ──▶ Ad Set ──▶ Ad ──▶ Creative
(objectif)   (ciblage)         (visuel+texte)
```

## Métriques pub

| Terme | Signification |
|-------|---------------|
| **CTR** | Click-Through Rate — % de clics sur impressions |
| **ROAS** | Return On Ad Spend — revenu / dépense pub |
| **CPM** | Cost Per Mille — coût pour 1000 impressions |
| **CPC** | Cost Per Click |
| **Impressions** | Nombre d'affichages |
| **Reach** | Nombre de personnes uniques touchées |

## Termes techniques

- **image_hash** — identifiant hex (16+ car.) d'une image uploadée, requis avant de créer une creative.
- **PAUSED / ACTIVE** — statut d'une campagne. AdMind crée **toujours en PAUSED**. Voir [[12 - Contraintes critiques]].
- **objective / optimization_goal** — doivent être une **paire compatible** (`COMPATIBLE_GOALS` dans `meta_tools.py`).
- **billing_event** — toujours `IMPRESSIONS`.
- **bid_strategy** — toujours `LOWEST_COST_WITHOUT_CAP`.
- **special_ad_categories** — catégories réglementées (emploi, crédit, logement, politique).
- **Pixel** — script de tracking Meta sur un site, pour mesurer conversions.

## Termes IA / backend

- **ReAct** — pattern Reasoning + Acting : le LLM raisonne puis appelle des outils. Voir [[07 - Agent IA]].
- **LangGraph** — orchestration de l'agent (graphe d'états).
- **RLS** — Row Level Security (PostgreSQL), isolation des données par user. Voir [[08 - Base de données]].
- **JWT** — JSON Web Token, jeton d'authentification. Voir [[05 - Backend]].
