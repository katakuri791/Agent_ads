---
title: Frontend
type: reference
tags: [admind, frontend, react, typescript]
created: 2026-06-24
---

# 06 — Frontend

[[00 - 🏠 AdMind AI (Accueil)|← Retour à l'accueil]]

Stack : **React 18 + TypeScript + Vite 6**, **Tailwind CSS 4** + shadcn/ui + Radix UI, charts **Recharts 2**. Voir [[03 - Stack technique]].

## Structure (`frontend/src/app/`)

```
src/app/
├── App.tsx              # racine de l'app React (routing)
├── components/
│   ├── ui/              # 40+ composants shadcn/ui
│   ├── layout/          # AppShell, Sidebar, Topbar
│   ├── filters/         # AccountFilter, DateRangeFilter
│   ├── ms/              # composants "Mission Control" (charts, primitives, worldmap, motion)
│   └── shared/          # SyncIndicator, states…
├── pages/               # Overview, Campaigns, Audiences, PageAnalysis, AIAgent, Settings, Schedule, auth
├── hooks/               # useMetaData…
├── providers/           # ToastProvider, ThemeProvider
└── lib/
    ├── api.ts           # client HTTP typé vers le backend
    ├── auth.ts          # gestion JWT (localStorage)
    └── queryKeys.ts     # clés React Query
```

## Conventions frontend

- `frontend/src/app/lib/api.ts` contient **tous** les appels HTTP vers le backend ([[10 - API Routes]]).
- JWT stocké dans `localStorage`, envoyé dans `Authorization: Bearer <token>`.
- Sur **401 → logout automatique**.

> [!note] Évolution architecture
> Historiquement `App.tsx` était monolithique. La branche `ads_v2` a refondu le frontend en **pages séparées** (`pages/`) + composants `ms/` (Mission Control) + providers. Le design suit [[11 - Système de design]].

## Pages principales

- **Overview** — dashboard KPIs / vue d'ensemble
- **Campaigns** — liste des campagnes + insights
- **Audiences** — données démographiques
- **PageAnalysis** — analytics de la page Facebook
- **AIAgent** — chat avec l'agent IA → [[07 - Agent IA]]
- **Settings** — config Meta par utilisateur
- **Schedule** — planification

## Liens connexes
- [[11 - Système de design]]
- [[10 - API Routes]]
