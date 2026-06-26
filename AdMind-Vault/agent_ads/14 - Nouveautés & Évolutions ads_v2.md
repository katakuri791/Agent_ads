---
title: Nouveautés & Évolutions — branche ads_v2
type: changelog
tags: [admind, nouveautés, ads_v2, changelog]
created: 2026-06-25
---

# 14 — Nouveautés & Évolutions `ads_v2`

[[00 - 🏠 AdMind AI (Accueil)|← Retour à l'accueil]]

Ce fichier documente toutes les fonctionnalités et améliorations ajoutées dans la branche **`ads_v2`**, par rapport à l'état initial du projet.

---

## 🗄️ Base de données

### Migrations SQL (dossier `supabase/migrations/`)

| Fichier | Contenu |
|---------|---------|
| `0001_core_schema.sql` | Schéma reproductible complet — toutes les tables avec `IF NOT EXISTS` |
| `0003_campaign_audit.sql` | Colonnes d'audit sur `campaigns` : `status_detail`, `error_log`, `request_id` |

### Nouvelle table `meta_accounts` (multi-comptes)

> [!info] Remplacement de `user_settings`
> `user_settings` reste lu pour compatibilité, mais le nouveau modèle multi-comptes passe par `meta_accounts`.

```sql
meta_accounts(
  id, user_id, label,
  meta_access_token, meta_ad_account_id, meta_page_id, meta_pixel_id,
  preferred_currency, timezone,
  is_default   -- un seul true par user_id (index unique)
)
```

### Tables de cache Meta (`fb_*`)

Le worker de sync écrit dans ces tables. Le dashboard les lit (pas d'appels Meta live).

- `fb_sync_state` — état de la dernière sync (timestamp, statut, erreur)
- `fb_campaigns` — campagnes + métriques du compte
- `fb_ad_sets` / `fb_ads` — ad sets et annonces
- `fb_insights_daily` — insights agrégés par jour

Voir [[08 - Base de données]] pour le schéma complet.

---

## ⚙️ Backend

### Nouveaux fichiers Python

| Fichier | Rôle |
|---------|------|
| `backend/dashboard.py` | Lit le cache `fb_*` pour les endpoints `/meta/dashboard` et `/meta/campaigns` |
| `backend/facebook_sync.py` | Worker APScheduler — sync Meta → Supabase toutes les 20 min |
| `backend/ratelimit.py` | Limiteur de débit sliding-window (mono-process) pour `/chat` |
| `backend/metrics.py` | Utilitaires de calcul de métriques |

### Architecture sync (cache Meta)

```
APScheduler (toutes les 20 min, FB_SYNC_INTERVAL_MINUTES)
    └─ sync_all_accounts()
         ├─ Chaque meta_accounts row → sync_account()
         ├─ Écrit fb_campaigns, fb_ad_sets, fb_ads, fb_insights_daily
         └─ Met à jour fb_sync_state
```

Variables d'environnement associées :
```
FB_SYNC_INTERVAL_MINUTES=20
FB_SYNC_ON_STARTUP=true
```

### Système multi-comptes Meta

- `_resolve_account(user_id, account_id)` — résout le compte ciblé (ou le compte par défaut)
- Toutes les routes Meta acceptent `?account_id=<uuid>` pour cibler un compte
- Un seul `is_default=true` par utilisateur (contrainte BDD)

### Rate limiter (`backend/ratelimit.py`)

`ratelimit.check_rate_limit()` bloque `/chat` au-delà du seuil par fenêtre glissante.

> [!warning] Limitation
> Mono-process uniquement (état en mémoire, pas Redis).

---

## 🖥️ Frontend

### Nouvelle page : Planning éditorial (`SchedulePage.tsx`)

Calendrier de publication avec **3 vues** :

| Vue | Description |
|-----|-------------|
| **Mois** | Vue calendrier mensuel — pastilles colorées par type de post |
| **Semaine** | 7 colonnes — cartes de post avec heure + extrait du message |
| **Jour** | Timeline horaire (6h → 23h) — positionnement absolu des posts |

**Fonctionnalités :**
- Créer un post planifié (texte, photo, vidéo, lien) → `POST /meta/scheduled-posts`
- Voir les posts planifiés et l'historique des publiés (60 derniers jours)
- Publier immédiatement un post planifié ou le supprimer
- Alerte si le scope `pages_manage_posts` manque (`blocked_reason`)
- Smart default : cliquer sur "aujourd'hui" → heure = `now + 15 min` arrondie ; jour futur → `09:00`
- Attribut `min` dynamique sur l'input heure (grise les heures invalides si date = aujourd'hui)

**Codes couleur des types de post :**

| Type | Couleur |
|------|---------|
| `text` | `#22C55E` (vert) |
| `image` | `#1877F2` (bleu Facebook) |
| `video` | `#A855F7` (violet) |
| `link` | `#06B6D4` (cyan) |
| `carousel` | `#F59E0B` (ambre) |

**Posts passés (historique) :**
- Les posts dont l'heure est passée reçoivent `filter: saturate(0.22) brightness(0.65)` → couleur grisée (vert grisé, bleu grisé, etc.)
- Label "Publié" affiché dans les vues Semaine et Jour

### Nouveau provider : Thème (`ThemeProvider.tsx`)

4 modes : `dark` (défaut), `light`, `dim`, `system` (suit l'OS).

- Persisté dans `localStorage` (`ui_theme`)
- Couleur d'accent personnalisable (`ui_accent`, défaut `#1877F2`)
- Basculement rapide dark ↔ light via bouton topbar (cross-fade 450 ms)
- Hooks disponibles : `useTheme()` / `useResolvedTheme()`

### Système d'animation (`components/ms/motion.tsx`)

| Export | Description |
|--------|-------------|
| `FadeIn` | Entrée JS-driven (opacity + translate + scale), sûre en arrière-plan |
| `useCountUp(value)` | Anime un chiffre 0 → cible (ease-out cubic, 1150 ms) |
| `Blob` | Glyphe décoratif SVG (heart, star, sparkle, blob, wave, donut) |
| `blobFor(idx)` | Glyphe + couleur déterministe par index (pour les KPIs) |
| `EASE` | Courbes nommées : `spring`, `springSoft`, `smooth`, `snappy` |

### Animations calendrier (hover effects)

Classes CSS ajoutées dans `theme.css` :

| Classe | Effet |
|--------|-------|
| `.ms-sched-chip` | Pastille mois : monte + scale au hover |
| `.ms-sched-week-card` | Carte semaine : soulève de 2px + ombre |
| `.ms-sched-day-event` | Bloc timeline : scale + z-index au hover |

---

## 🔌 Nouvelles routes API

### Comptes Meta (multi-comptes)

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/meta/accounts` | Lister les comptes Meta |
| POST | `/meta/accounts` | Créer un compte |
| PUT | `/meta/accounts/{id}` | Modifier un compte |
| DELETE | `/meta/accounts/{id}` | Supprimer un compte |
| POST | `/meta/accounts/{id}/test` | Valider les credentials |

### Posts planifiés

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/meta/scheduled-posts` | Posts planifiés + historique 60 jours |
| POST | `/meta/scheduled-posts` | Planifier un post |
| POST | `/meta/scheduled-posts/{id}/publish` | Publier immédiatement |
| DELETE | `/meta/scheduled-posts/{id}` | Supprimer |

### Sync cache

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/sync/status?account_id=...` | État de la dernière sync |
| POST | `/api/sync/{account_id}` | Forcer un sync immédiat |

### Médias

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/chat/upload-video` | Uploader une vidéo → retourne `video_id` |

Voir [[10 - API Routes]] pour la liste complète.

---

## 🐛 Corrections importantes

### Fix 502 calendrier (bug planification minuit)

> [!bug] Problème
> Cliquer sur une case du calendrier passait `initialDate` = minuit (00:00) du jour → heure passée → Meta rejetait → **502 Bad Gateway**.

**Fix :**
1. Smart `useEffect` dans `ComposeModal` → calcule une heure valide selon le jour choisi
2. `main.py` → pré-check 10 min avant d'appeler Meta → retourne **400** (message clair) au lieu de **502**
3. `backend/meta_pages.py` → suppression du check bloquant côté Python (déplacé dans `main.py`)

### Historique des posts publiés

> [!info]
> Meta retire les posts de `scheduled_posts` une fois publiés. Le backend fetch maintenant aussi `promotable_posts?is_published=true` (60 derniers jours) et les fusionne dans la réponse.

---

## 🔗 Liens connexes

- [[05 - Backend]] — fichiers Python
- [[06 - Frontend]] — structure UI
- [[08 - Base de données]] — schéma complet
- [[10 - API Routes]] — toutes les routes
- [[12 - Contraintes critiques]] — règles Meta à ne jamais violer
