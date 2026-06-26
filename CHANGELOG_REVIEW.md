# Nouveautés — Alignement sur `review.md`

> Ce document décrit les fonctionnalités et garde-fous ajoutés suite à l'analyse
> concurrentielle (`review.md`, section 5 « Implications CONCRÈTES pour le code »).
> Objectif : corriger les faiblesses réelles du projet et ajouter les garde-fous
> que les concurrents (Madgicx, Revealbot, AdCreative.ai) ratent.
>
> **Hors périmètre (volontairement) :** aucun billing / paiement / Stripe, pas de
> génération d'images IA, pas de chiffrement Vault. Ces points sont post-MVP.

---

## Vue d'ensemble

| # | Nouveauté | Pourquoi (review) | Statut |
|---|-----------|-------------------|--------|
| 1 | Audit-trail de création de campagne | §5.2 Fiabilité d'exécution | ✅ |
| 2 | Rate limiting (`/chat` + création campagne) | §5.7 + tableau des risques | ✅ |
| 3 | Carte de confirmation **PAUSED** | §5.4 PAUSED = argument de vente | ✅ |
| 4 | Migration SQL du schéma core + RLS | Finding sécurité (schéma non reproductible) | ✅ |

---

## 1. Audit-trail de création de campagne (review §5.2)

### Le problème
Avant, on ne sauvegardait une campagne en base **que si elle réussissait**. Un
échec Meta (objectif incompatible, pixel manquant, vidéo en traitement…) ne
laissait **aucune trace** exploitable pour le support/debug. De plus l'échec
d'écriture en base était avalé dans un simple `print`.

### Ce qui a été ajouté
- **3 nouvelles colonnes** sur la table `campaigns` :
  - `status_detail` → `success` | `partial` | `failed`
  - `error_log` → message d'erreur Meta **complet** (titre + message utilisateur)
  - `request_id` → identifiant unique d'idempotence (1 création réelle par appel `/chat`)
- **Persistance des échecs** : chaque erreur Meta est désormais enregistrée en
  base avec son étape (`stage` : campaign / adset / creative / ad / video_thumbnail).
- **Idempotence** : un `request_id` unique par construction d'agent empêche les
  doublons en base (index unique côté SQL).
- **Plus de `print` silencieux** : remplacé par `logger.exception(...)`.

### Comment ça marche
```
create_full_campaign (meta_tools.py)
 ├─ succès → _persist["last_created"]  (avec request_id)
 └─ échec  → _persist["last_error"]    (stage + message Meta complet)

/chat (main.py)
 ├─ last_created présent → save_campaign_tree(..., status_detail="success")
 └─ last_error présent   → save_campaign_failure(..., status_detail="failed")
```

### Fichiers touchés
- `backend/meta_tools.py` — `request_id`, `_record_failure`, garde anti-rafale
- `backend/db.py` — `save_campaign_tree` (colonnes audit) + `save_campaign_failure` + `count_recent_campaigns`
- `main.py` — branchement succès/échec, `optimization_goal` réel, `logger.exception`

---

## 2. Rate limiting (review §5.7 + tableau des risques)

### Le problème
Aucune limite : une boucle de l'agent ou un abus pouvait saturer `/chat` et
**créer des dizaines de campagnes par erreur** (« 100 campagnes par accident »
dans le tableau des risques).

### Ce qui a été ajouté
- **Limiteur de débit en mémoire** (`backend/ratelimit.py`) — fenêtre glissante,
  sans dépendance externe.
- **`/chat`** : max **30 messages / minute / utilisateur** → réponse `429` claire
  en français au-delà.
- **Création de campagne** : max **10 campagnes / heure / utilisateur**. Au-delà,
  l'agent refuse proprement et demande une confirmation explicite au lieu de créer.

> ℹ️ Le stockage est process-local : suffisant pour un déploiement mono-worker.
> Pour du multi-worker, il faudra un store partagé (Redis) — hors périmètre.

### Fichiers touchés
- `backend/ratelimit.py` *(nouveau)*
- `main.py` — appel `check_rate_limit` au début de `/chat`
- `backend/meta_tools.py` — garde de comptage dans `create_full_campaign`

---

## 3. Carte de confirmation PAUSED (review §5.4)

### Le problème
Toutes les campagnes sont créées en `PAUSED` (garde-fou sécurité = argument de
vente), mais ce statut n'apparaissait **que noyé dans le texte du chat**. Or
c'est un différenciateur majeur (« Aucune dépense sans ton clic »).

### Ce qui a été ajouté
Une **carte de confirmation visuelle** affichée après chaque création réussie :
- Badge **● PAUSED** ambre proéminent.
- Nom, objectif, budget de la campagne.
- IDs Meta (Campaign / Ad set / Ad) en police monospace.
- Message rassurant : « Aucune dépense tant que tu ne l'actives pas ».
- Bouton **« Voir mes campagnes »** (navigation directe vers la page Campagnes).

Côté technique : nouveau type de sortie structurée `campaign_created`, prioritaire
sur le brief / l'analyse / le questionnaire dans la réponse de l'agent.

### Fichiers touchés
- `backend/schemas.py` — modèle `CampaignCreated` + ajout à l'union `StructuredOutput`
- `main.py` — construction de `CampaignCreated` depuis `last_created`
- `frontend/src/app/pages/AIAgentPage.tsx` — composant `CampaignCreatedCard`
- `frontend/src/app/lib/api.ts` — type `CampaignCreatedStructured`
- `frontend/src/app/components/layout/AppShell.tsx` — passage de `onNavigate`

---

## 4. Migration SQL du schéma core + RLS (finding sécurité)

### Le problème
Les tables de base (`users`, `conversations`, `messages`, `campaigns`…) n'étaient
définies **que dans la documentation markdown**, pas en SQL. Le schéma n'était
donc **pas reproductible** (nouvel environnement, CI, reset local) et les
policies RLS « mentionnées » n'existaient pas réellement.

### Ce qui a été ajouté
- **`0001_core_schema.sql`** — définition SQL complète du schéma applicatif
  (9 tables), 100 % `IF NOT EXISTS` → **non destructif** sur la base déjà déployée.
- **`0003_campaign_audit.sql`** — `ALTER ... ADD COLUMN IF NOT EXISTS` pour les
  colonnes d'audit (§1) sur une base **déjà existante**.
- **RLS activée** sur toutes les tables, **sans policy** — cohérent avec
  `0002_fb_cache.sql` : le backend accède via la *service-role key* (bypass RLS)
  et le frontend ne lit jamais les tables en direct (il passe par l'API FastAPI).
  L'app utilise un JWT custom (pas Supabase Auth), donc `auth.uid()` n'est pas
  câblé ; RLS sans policy = deny-all pour les accès directs = le verrou voulu.

### Fichiers touchés
- `supabase/migrations/0001_core_schema.sql` *(nouveau)*
- `supabase/migrations/0003_campaign_audit.sql` *(nouveau)*

---

## ⚠️ Action requise : appliquer les migrations

Le nouveau code écrit les colonnes `status_detail / error_log / request_id`.
**Tant que la migration n'est pas appliquée**, ces écritures échouent (proprement
loggées, sans bloquer la création Meta) et le garde-fou de comptage reste neutre.

Deux options :

```bash
# Option A — Supabase CLI (depuis la racine du projet)
supabase db push

# Option B — exécuter manuellement le contenu de
#   supabase/migrations/0003_campaign_audit.sql
# dans le SQL Editor de Supabase (idempotent, non destructif)
```

Sur une base **déjà déployée**, seule `0003` est strictement nécessaire (`0001`
sert surtout à reconstruire un environnement neuf à l'identique).

---

## Vérification

1. **Migrations** : après application, vérifier que `campaigns` possède bien
   `status_detail`, `error_log`, `request_id`.
2. **Création réussie** → 1 ligne `campaigns` `status_detail='success'` +
   `request_id` rempli, et la carte PAUSED s'affiche dans le chat.
3. **Création en échec** (objectif incompatible / sans pixel) → 1 ligne
   `status_detail='failed'` avec `error_log` = message Meta complet.
4. **Spam `/chat`** au-delà de 30/min → réponse `429`.
5. **Frontend** : `pnpm build` ✓ (la carte et la navigation fonctionnent).
