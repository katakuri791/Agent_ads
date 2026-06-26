---
title: Vue d'ensemble
type: concept
tags: [admind, overview]
created: 2026-06-24
---

# 01 — Vue d'ensemble

[[00 - 🏠 AdMind AI (Accueil)|← Retour à l'accueil]]

## Qu'est-ce que c'est ?

**AdMind AI** est un **SaaS B2B** destiné aux marketeurs. Il combine deux choses :

1. **Un agent IA conversationnel** qui comprend les demandes en **français ou anglais**, propose un brief de campagne, puis crée l'arborescence complète **campaign → adset → creative → ad** via l'API Meta.
2. **Un dashboard analytics** qui affiche les performances (KPIs, séries temporelles, démographie, top campagnes, analytics de page Facebook).

## À quoi ça sert ?

Le but : qu'un annonceur puisse **briefer et lancer une campagne en moins de 2 minutes**, et **lire les performances de sa semaine sans quitter l'app**.

L'agent IA n'est pas un gadget : il
- présente un **brief structuré** à valider **avant** d'agir,
- fait remonter des **insights qui changent une décision** (pas juste des résumés),
- parle la **langue de l'utilisateur** (FR/EN).

## Sur quoi est-ce basé ?

- **Agent** : [[07 - Agent IA|LangChain + LangGraph]] (pattern ReAct)
- **API publicitaire** : [[09 - Glossaire|Meta Marketing API]] (`facebook-business` SDK + Graph API v21.0)
- **Backend** : [[05 - Backend|FastAPI / Python]]
- **Base de données** : [[08 - Base de données|Supabase (PostgreSQL)]]
- **Frontend** : [[06 - Frontend|React + TypeScript + Vite]]

Détails complets : [[03 - Stack technique]] et [[04 - Architecture]].

## Pour qui ?

Voir [[02 - Vision produit & Personas]] — principalement des **performance marketers** et des **account managers d'agence**.

## Liens connexes
- [[04 - Architecture]]
- [[12 - Contraintes critiques]]
