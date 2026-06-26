---
title: Contraintes critiques
type: reference
tags: [admind, contraintes, securite, meta-ads]
created: 2026-06-24
---

# 12 — Contraintes critiques

[[00 - 🏠 AdMind AI (Accueil)|← Retour à l'accueil]]

> [!danger] Règles à ne JAMAIS violer

## Meta Ads
- **Campagnes toujours en PAUSED** — `create_full_campaign` ne crée jamais une campagne ACTIVE (une ad ACTIVE dépense de l'argent réel immédiatement).
- **Budget en centimes** — `1000` = €10.00 (pas en euros directement).
- **Pays en ISO-2** — `["MA", "FR", "US"]` (pas les noms complets).
- **Tranche d'âge** — min **18**, max **65** (contrainte Meta).
- **`image_hash` obligatoire** avant de créer une creative — format hex 16+ caractères.
- **Paires objective / optimization_goal** — validées contre `COMPATIBLE_GOALS` dans `meta_tools.py`.
- **Billing event** — toujours `IMPRESSIONS`.
- **Bid strategy** — toujours `LOWEST_COST_WITHOUT_CAP`.
- **Graph API version** — **v21.0** (ne pas downgrader).

## Publication & confirmation
- **Confirmation utilisateur requise** avant `post_to_facebook_page` (publication irréversible). Voir [[07 - Agent IA]].

## Sécurité
- **Jamais** de token / clé en dur dans le code ou commité dans git.
- `SUPABASE_SERVICE_KEY` reste **côté serveur uniquement**.
- **RLS activée** sur toutes les tables → [[08 - Base de données]].
- `.env` dans `.gitignore`.

## Données (préférence projet)
- **Pas de données fictives / placeholder / valeurs par défaut** — uniquement de vraies données Meta + des calculs corrects.
- Certaines métriques d'engagement de page (likes/comments/shares) sont **indisponibles** via l'API Meta (App Review "Page Public Content Access" requis) — ne pas inventer de valeurs.

## Liens connexes
- [[07 - Agent IA]]
- [[09 - Glossaire]]
