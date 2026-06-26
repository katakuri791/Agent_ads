---
title: AdMind AI — Accueil
type: MOC
tags: [admind, accueil, index]
created: 2026-06-24
---

# 🏠 AdMind AI — Carte du projet (MOC)

> [!abstract] En une phrase
> **AdMind AI** est un **SaaS B2B** qui permet aux marketeurs de **créer et analyser des campagnes Meta Ads** (Facebook/Instagram) via une **interface en langage naturel** pilotée par un agent IA.

Cette note est le point d'entrée du vault. Suis les liens `[[...]]` pour naviguer.

---

## 🧭 Navigation rapide

### Comprendre le projet
- [[01 - Vue d'ensemble]] — ce que c'est, à quoi ça sert, pour qui
- [[02 - Vision produit & Personas]] — utilisateurs cibles, marque, principes
- [[09 - Glossaire]] — vocabulaire Meta Ads & technique

### Comprendre la technique
- [[03 - Stack technique]] — les technologies utilisées
- [[04 - Architecture]] — comment les briques communiquent
- [[05 - Backend]] — FastAPI, fichiers Python
- [[06 - Frontend]] — React, structure UI
- [[07 - Agent IA]] — LangGraph, outils, flux ReAct
- [[08 - Base de données]] — tables Supabase, RLS

### Référence
- [[10 - API Routes]] — toutes les routes FastAPI
- [[11 - Système de design]] — "Mission Control", couleurs, règles
- [[12 - Contraintes critiques]] — règles à ne jamais violer
- [[13 - Commandes & démarrage]] — lancer le projet en local
- [[14 - Nouveautés & Évolutions ads_v2]] — fonctionnalités ajoutées dans ads_v2

---

## 🗺️ Schéma mental

```
Utilisateur ──▶ Frontend React ──▶ Backend FastAPI ──▶ Agent IA (LangGraph)
                                          │                    │
                                          ▼                    ▼
                                      Supabase             Meta Ads API
                                   (DB + auth + cache)   (campagnes, pages)
```

---

## ✅ Fonctionnalités principales

- [ ] Dashboard analytics (KPIs, séries temporelles, démographie, top campagnes)
- [ ] Chat avec agent IA pour créer & analyser des campagnes
- [ ] Gestion de la page Facebook (posts, insights, publication)
- [ ] Authentification multi-utilisateur + paramètres Meta par compte
- [ ] Upload d'images pour les créatives publicitaires

> [!tip] Astuce Obsidian
> Ouvre la **vue graphe** (`Ctrl+G`) pour visualiser toutes les connexions entre ces notes. Les `#tags` permettent de filtrer.
