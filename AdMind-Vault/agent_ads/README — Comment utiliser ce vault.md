---
title: Comment utiliser ce vault Obsidian
type: guide
tags: [admind, obsidian, guide]
created: 2026-06-24
---

# 📖 Comment utiliser ce vault dans Obsidian

## 1. Ouvrir le vault

1. Ouvre **Obsidian** → `Ouvrir un autre coffre` → **Ouvrir un dossier comme coffre**.
2. Sélectionne le dossier `AdMind-Vault/`.
3. Commence par la note d'accueil : [[00 - 🏠 AdMind AI (Accueil)]].

## 2. Naviguer

- **Liens `[[...]]`** — clique pour sauter d'une note à l'autre.
- **Backlinks** (panneau de droite) — voir quelles notes pointent vers la note courante.
- **Vue graphe** (`Ctrl+G`) — visualise toutes les connexions.
- **Tags** — clique sur un `#tag` (ex. `#backend`, `#design`) pour filtrer.

## 3. Tags utilisés

`#admind` `#backend` `#frontend` `#agent` `#design` `#stack` `#api` `#supabase` `#contraintes` `#glossaire` `#produit`

## 4. Structure des notes

```
00 - 🏠 AdMind AI (Accueil)   ← MOC (point d'entrée)
01 - Vue d'ensemble
02 - Vision produit & Personas
03 - Stack technique
04 - Architecture
05 - Backend
06 - Frontend
07 - Agent IA
08 - Base de données
09 - Glossaire
10 - API Routes
11 - Système de design
12 - Contraintes critiques
13 - Commandes & démarrage
```

## 5. Callouts utilisés

Ces blocs (`> [!info]`, `> [!warning]`, `> [!danger]`, `> [!tip]`) s'affichent en couleur dans Obsidian — ils mettent en évidence les notes importantes et les pièges.

## 6. Maintenir à jour

Ces notes sont un **instantané du 2026-06-24** basé sur `CLAUDE.md`, `PRODUCT.md` et `README.md`. Quand le code évolue, mets à jour la note concernée (le frontmatter `created:` peut devenir `updated:`).

---

> [!tip] Conseil
> Garde ce vault **séparé du code** mais dans le repo : il documente le "pourquoi" et le "à quoi ça sert", là où le code documente le "comment".
