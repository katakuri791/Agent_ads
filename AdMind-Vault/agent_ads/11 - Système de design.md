---
title: Système de design
type: reference
tags: [admind, design, ui, mission-control]
created: 2026-06-24
---

# 11 — Système de design ("Mission Control")

[[00 - 🏠 AdMind AI (Accueil)|← Retour à l'accueil]]

> [!important]
> Lire `DESIGN.md` en entier avant tout travail UI. Cette note en est le résumé. Principes produit → [[02 - Vision produit & Personas]].

## Thème
**"Mission Control"** — espace de travail sombre, précision analytique. **Aucune couleur chaude** (pas de crème, sable, blanc cassé).

## 🎨 Palette

```
Fond principal :    #060D1F  (Void)
Sidebar :           #070F1E
Surface carte :     #0B1628
Carte élevée :      #121F38

Violet primaire :   #7C3AED  (actions, états actifs — max 15% écran)
Violet doux :       #A78BFA  (nav active, accents lisibles)
Cyan signal :       #06B6D4  (données live, accents secondaires)

Texte principal :   #E2E8F0
Texte secondaire :  #CBD5E1
Texte dim :         #64748B

Alerte :            #F43F5E  (Rose)
Succès/Live :       #10B981  (Emerald)
Budget/Warning :    #F59E0B  (Amber)
```

## ✍️ Typographie

```
Display / Titre page : Bricolage Grotesque 500, 1.5rem
Titre carte :          Bricolage Grotesque 500, 1.25rem
Label section :        Inter 600, 1rem
Corps / prose :        Inter 400, 0.875rem (max 65ch)
Label / nav :          Inter 500, 0.75rem
CHIFFRES / KPIs :      JetBrains Mono 700, 0.875rem  ← OBLIGATOIRE pour les nombres
```

## 🚦 Règles absolues

- **One-Accent Rule** — le violet sur ≤ **15%** du poids visuel.
- **Mono-Owns-Numbers** — tous montants, KPIs, IDs → **JetBrains Mono**, jamais Inter.
- **No-Tint** — fonds uniquement en navy (jamais crème/sable/warm).
- **Tonal Priority** — élévation via changement de fond (`#0B1628` → `#121F38`), pas de box-shadow.
- **Motion** — 150–200 ms `cubic-bezier(0.4,0,0.2,1)`, transitions d'état uniquement.
- **Shadows** — uniquement éléments flottants : `0 12px 32px rgba(0,0,0,0.50)`.

## Liens connexes
- [[06 - Frontend]] (composants `ms/`, `theme.css`)
- [[02 - Vision produit & Personas]]
