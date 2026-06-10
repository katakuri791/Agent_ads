# Résumé du code — AdMind AI

Ce document explique **comment le code est organisé**, **pourquoi ces choix ont été faits**, et **où modifier quoi**. Il est volontairement court : chaque partie tient en quelques lignes + un exemple.

---

## 1. Vue rapide

```
Navigateur (React)  ──HTTP──►  Backend (FastAPI)  ──►  Meta / Supabase / IA
   frontend/                      main.py + backend/
```

- Le **frontend** affiche les pages, gère les filtres et appelle le backend.
- Le **backend** vérifie l'utilisateur, parle à Meta (publicités/page), à Supabase (base de données) et à l'IA (agent).

---

# PARTIE BACKEND (Python / FastAPI)

## 2. `main.py` — la porte d'entrée (toutes les routes)

C'est le **standard téléphonique** : chaque URL (`/meta/dashboard`, `/chat`, `/settings`…) est une fonction.

### Pourquoi tout dans un seul fichier ?
Le projet est de taille moyenne. Garder les ~25 routes au même endroit rend la recherche immédiate (« où est la route X ? » → toujours dans `main.py`). On évite la complexité de routers multiples tant que ce n'est pas nécessaire.

### Deux idées importantes à comprendre

**a) `Depends(get_current_user)` — la sécurité automatique**
Chaque route protégée reçoit l'utilisateur connecté sans que tu écrives la vérification du token toi-même.

```python
@app.get("/settings")
def route_get_settings(user: UserPublic = Depends(get_current_user)):
    # 'user' est déjà vérifié. Si le token est invalide → erreur 401 automatique.
    return _mask_settings(get_user_settings(user.id))
```
👉 *Pour ajouter une route protégée, copie simplement ce `user = Depends(get_current_user)`.*

**b) `_meta_http_error()` — les erreurs Meta deviennent lisibles**
Au lieu d'un « 500 Internal Error » incompréhensible, on traduit l'erreur Meta en message clair (timeout, réseau, token invalide…) :

```python
try:
    info = meta_pages.get_page_info(...)
except Exception as exc:
    raise _meta_http_error(exc)   # → 502 + message en français
```
👉 *Toute nouvelle route qui appelle Meta doit être entourée de ce `try/except`.*

### `_resolve_account()` — le multi-comptes
Un utilisateur peut avoir **plusieurs comptes Meta**. Cette fonction récupère le bon compte et vérifie que les identifiants nécessaires existent.

```python
settings = _resolve_account(user.id, account_id, need_account=True)
# Si pas de token / pas d'ad account → erreur 400 "Meta ad account id is required."
```

---

## 3. `backend/agent.py` — l'agent IA (le cerveau)

L'agent suit le pattern **ReAct** (Raisonner → Agir) : le modèle lit la demande, décide quel **outil** appeler, regarde le résultat, recommence si besoin, puis répond.

### Pourquoi cette méthode ?
On ne veut pas que l'IA « invente » des campagnes. On lui donne une **liste d'outils précis** (`create_full_campaign`, `upload_image`…). L'IA ne peut faire **que** ce que les outils permettent → sécurité et contrôle.

### Le concept clé : le dictionnaire `persist`
Quand l'IA appelle un outil, l'outil renvoie du texte au modèle, **mais** on a aussi besoin de récupérer le résultat « brut » côté backend (ex : l'aperçu de campagne à afficher). On utilise un petit dictionnaire partagé :

```python
def emit_campaign_brief(...):
    persist["last_brief"] = brief.model_dump()   # on "dépose" le résultat ici
    return "✅ Brief envoyé à l'utilisateur."     # ce que l'IA voit
```
Ensuite `main.py` lit `persist["last_brief"]` pour l'envoyer joliment au frontend (la carte de preview).

### Le prompt système = les règles de l'IA
`SYSTEM_PROMPT_BASE` contient les règles écrites en français (budget en centimes, campagne toujours PAUSED, montrer un brief avant de créer…).
👉 *Pour changer le comportement de l'IA, tu modifies ce texte — pas le code.* C'est l'endroit le plus simple à ajuster.

Il existe aussi `SYSTEM_PROMPT_NO_META` : utilisé quand l'utilisateur n'a pas configuré Meta (l'IA répond alors aux questions générales seulement).

---

## 4. `backend/meta_tools.py` — les outils Meta

Contient la logique réelle : créer une campagne, uploader une image, lister les performances.

### Choix à connaître
- **Timeout 30 s** (`SDK_TIMEOUT`) : sans ça, un appel Meta lent **gèle** toute la page. On force une limite.
- **`COMPATIBLE_GOALS`** : une liste blanche des paires objectif/optimisation autorisées. L'IA doit choisir dedans → évite les erreurs Meta.

```python
COMPATIBLE_GOALS = {
    "OUTCOME_TRAFFIC": ["LINK_CLICKS", "LANDING_PAGE_VIEWS"],
    "OUTCOME_SALES":   ["OFFSITE_CONVERSIONS", "LINK_CLICKS"],
    ...
}
```
👉 *Pour autoriser un nouvel objectif, ajoute une ligne ici ET dans le prompt de l'agent.*

---

## 5. Les autres fichiers backend (en une ligne)

| Fichier | Rôle |
|---------|------|
| `auth.py` | Inscription/connexion, JWT, mot de passe chiffré |
| `db.py` | **Toutes** les opérations Supabase passent par ici |
| `schemas.py` | Les « formes » de données (Pydantic) — valide les entrées/sorties |
| `meta_pages.py` | Appels Graph API pour la Page Facebook (posts, insights) |
| `config.py` | Lecture du `.env` (clés secrètes) |

👉 *Règle d'or : ne parle jamais à Supabase directement dans `main.py` — passe toujours par `db.py`.*

---

# PARTIE FRONTEND (React / TypeScript)

> Le frontend a été **refactorisé** : avant tout était dans `App.tsx` (monolithique). Maintenant c'est découpé en **pages / providers / hooks**. Voici pourquoi.

## 6. La nouvelle architecture en couches

```
App.tsx                → porte d'authentification (fine)
 └─ AppProviders        → fournit les données globales (cache, compte, filtres)
     └─ AppShell        → sidebar + topbar + choix de la page
         └─ pages/*     → une page = un écran (Overview, Campaigns…)
             └─ hooks/* → vont chercher les données du backend
```

### `App.tsx` — volontairement minuscule
Il ne fait qu'une chose : **es-tu connecté ?** Si non → page de login. Si oui → l'app.

```tsx
if (!user) return <LoginPage .../>;
return <AppProviders><AppShell user={user} /></AppProviders>;
```
👉 *Toute la logique métier a quitté ce fichier. C'est voulu : il reste lisible.*

---

## 7. Les **Providers** — la mémoire partagée de l'app

Un *provider* met une information à disposition de **toutes** les pages, sans avoir à la passer manuellement de composant en composant.

| Provider | Ce qu'il partage |
|----------|------------------|
| `AccountProvider` | Le compte Meta sélectionné (multi-comptes) |
| `FiltersProvider` | La plage de dates choisie (ex : « 30 derniers jours ») |
| `QueryProvider` | Le cache de données (TanStack Query) |
| `ToastProvider` | Les petites notifications |

### Exemple : pourquoi un provider ?
La plage de dates est utilisée par la page Overview **et** la page Campagnes. Au lieu de la dupliquer, on la stocke une fois :

```tsx
const { range } = useFilters();      // dans n'importe quelle page
const { selectedAccountId } = useAccount();
```
👉 *Pour ajouter un filtre global (ex : une devise), tu crées un provider sur le même modèle.*

---

## 8. Les **Hooks** + TanStack Query — la récupération de données

`hooks/useMetaData.ts` contient des fonctions comme `useDashboard()`, `useCampaigns()`. Chaque hook va chercher des données au backend **et gère automatiquement** : le chargement, les erreurs, le cache.

### Pourquoi TanStack Query plutôt que `fetch` à la main ?
Avant, il fallait gérer manuellement « en chargement… », « erreur ! », « garde l'ancienne valeur ». Maintenant c'est automatique :

```tsx
const dash = useDashboard();
dash.isFetching   // true pendant le chargement
dash.isError      // true en cas d'erreur
dash.data         // les données quand elles arrivent
```

### Les 2 réglages malins à comprendre

**a) Le cache par clé (`queryKeys.ts`)**
Chaque requête a une « clé » unique qui inclut **le compte + la période** :

```ts
dashboard: (accountId, range) => ["dashboard", accountId, rangeId(range)]
```
Résultat : si tu reviens sur un compte/période déjà vu → **affichage instantané** (c'est en cache, pas de rechargement).

**b) `keepPreviousData` + `staleTime`**
Quand tu changes de filtre, l'ancien écran **reste affiché** pendant le chargement du nouveau (pas d'écran blanc qui clignote). Les données sont gardées « fraîches » 30 s.

👉 *Pour ajouter un nouvel appel backend : ajoute la clé dans `queryKeys.ts`, puis un hook dans `useMetaData.ts` sur le même modèle.*

### L'invalidation après une action
Quand l'IA crée une campagne, les chiffres affichés sont périmés. On « invalide » le cache pour forcer un rechargement :

```tsx
const invalidate = useInvalidateMetaData();
invalidate();   // dashboard, campagnes… se rechargent
```

---

## 9. Les **Pages** et composants

| Dossier | Rôle |
|---------|------|
| `pages/` | Un écran complet (`OverviewPage`, `CampaignsPage`, `AIAgentPage`…) |
| `components/layout/` | La structure : `Sidebar`, `Topbar`, `AppShell` |
| `components/ms/` | Briques « Mission Control » : `KPICard`, `LineChart`, `WorldMap` |
| `components/shared/` | États communs : chargement, erreur, « connecte ton compte » |
| `components/ui/` | Boutons, modales… (shadcn/ui, ne pas réinventer) |
| `lib/api.ts` | **Tous** les appels HTTP vers le backend |
| `lib/format.ts` | Formatage des nombres/montants (`fmtMoney`, `fmtNum`) |

### Comment une page est construite (exemple Overview)
```tsx
const dash = useDashboard();              // 1. récupère les données (hook)
if (dash.isError) return <ErrorState/>;   // 2. gère les états (shared)
if (!dash.data) return <LoadingOverlay/>;
return <KPICard ... />;                    // 3. affiche (composants ms)
```
👉 *Schéma à reproduire pour toute nouvelle page : **hook → états → affichage**.*

### Le routage (sans librairie de routes)
`AppShell` choisit la page avec un simple objet — pas besoin de React Router ici :
```tsx
const pages = { overview: <OverviewPage/>, campaigns: <CampaignsPage/>, ... };
return pages[page];
```
👉 *Pour ajouter une page : 1 entrée dans cet objet + 1 entrée dans la `Sidebar`.*

---

# 10. Récapitulatif : « je veux modifier… où ? »

| Je veux… | Fichier à toucher |
|----------|-------------------|
| Changer le comportement de l'IA | `agent.py` → `SYSTEM_PROMPT_BASE` (texte) |
| Ajouter un outil à l'IA | `meta_tools.py` (+ le décrire dans le prompt) |
| Ajouter une route backend | `main.py` (+ `db.py` si base de données) |
| Ajouter un appel de données frontend | `queryKeys.ts` + `useMetaData.ts` |
| Ajouter un écran | `pages/` + `AppShell` + `Sidebar` |
| Ajouter un filtre global | nouveau fichier dans `providers/` |
| Changer un style/couleur | voir `DESIGN.md` + `components/ms/` |
| Formater un nombre/montant | `lib/format.ts` |

---

# 11. Les 3 principes derrière toute l'architecture

1. **Séparation des responsabilités** — chaque fichier a un seul rôle. (Backend : route ≠ logique métier ≠ base de données. Frontend : page ≠ données ≠ état global.)
2. **Une seule source de vérité** — les appels HTTP dans `api.ts`, la base dans `db.py`, les filtres dans les providers. On ne duplique pas.
3. **Le frontend ne calcule pas, il affiche** — les KPIs, le ROAS, les agrégations sont calculés côté backend (données Meta réelles), le frontend se contente de les présenter.
