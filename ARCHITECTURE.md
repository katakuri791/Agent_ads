# ARCHITECTURE — Rendu & Thème (frontend)

> Document vivant. Section initiale créée lors du plan-review des défauts de design
> "thème clair" (captures dans `Nouveau dossier/`). Décrit le **contrat de rendu**
> que tout composant visuel doit respecter pour fonctionner dans les 4 thèmes
> (`dark` défaut, `light`, `dim`, `system`).

## Pipeline de couleur

```
ThemeProvider (providers/ThemeProvider.tsx)
   └─ pose data-theme + classe sur <html>  (persisté localStorage: ui_theme / ui_accent)
        └─ styles/theme.css : blocs :root(.dark) / .dim / .light définissent les CSS vars
             └─ composants : consomment UNIQUEMENT les tokens var(--*) (jamais de couleur figée)
```

### Tokens de référence (`styles/theme.css`)
| Token | Rôle |
|-------|------|
| `--bg` | Fond de page |
| `--surf-card`, `--surf-pop`, `--surf-inset` | Surfaces (élévation par changement de fond) |
| `--bd`, `--bd-weak`, `--bd-strong` | Bordures |
| `--tx`, `--tx-2`, `--tx-3`, `--tx-dim` | Texte (du plus fort au plus faible) |
| `--accent`, `--accent-foreground` | Accent (Meta-Blue #1877F2 par défaut, surchargé par `ui_accent`) |

## Contrat de rendu (règles invariantes)

1. **Token-only** — aucun composant ne hardcode une couleur de **fond** ou de **texte**.
   Toujours `var(--…)`. Exceptions tolérées : couleurs **sémantiques** d'état
   (succès `#22C55E`, alerte `#EF4444`, warning `#F59E0B`) car identiques sur tous les thèmes.

2. **Fond figé ⇒ texte figé** — si un bloc impose un fond **non-tokenisé** (ex. bannière
   en gradient sombre), son texte **doit** être figé clair lui aussi (`#fff`/`rgba(255…)`),
   jamais `var(--tx*)`. Sinon le texte devient illisible quand le thème inverse les tokens.
   *(Violé par `PageAnalysisPage.tsx` bannière — à corriger.)*

3. **Ids SVG sûrs et uniques** — tout `<linearGradient>`/`<clipPath>` référencé par
   `url(#id)` doit avoir un `id` :
   - **valide** : `^[A-Za-z][\w-]*$` — **ne jamais** le dériver d'une valeur CSS
     (`var(--accent)` contient `(`, `)`, `-` → `url()` cassée → fallback **noir**).
   - **unique** par instance : utiliser `useId()` (React 18) — sinon collision quand
     plusieurs graphes coexistent (`Sparkline`, `LineChart` lcSpend/lcImpr, `FollowersChart` fgrow).
   *(Violé par `charts.tsx` Sparkline — `id` construit depuis `color`.)*

4. **One-Accent** — au plus une teinte d'accent par écran. Les décorations multi-teintes
   (`Blob`/`blobFor`) doivent rester discrètes et ne pas introduire une 2ᵉ/3ᵉ couleur vive
   dominante, surtout sur surfaces claires. *(À arbitrer — décision produit ouverte.)*

5. **Parité Dark/Light** — toute correction visuelle se vérifie **dans les deux thèmes**
   avant merge. Vitest ne rend pas le SVG → vérification visuelle manuelle obligatoire.

## Contrat d'états interactifs (hover / focus / active)

Tout élément cliquable doit avoir un **feedback de survol perceptible dans les 4 thèmes**.

6. **Hover par changement de couleur, pas par `filter: brightness`** — `brightness()` sur
   une surface déjà claire (thème Light, boutons `outline`/`ghost`/`soft` à fond
   transparent ou blanc) est **imperceptible**. Le hover doit modifier `background` /
   `border-color` via tokens (`var(--hover)`, `var(--bd-strong)`), pas la luminosité.
   *(Violé par `theme.css` `.ms-btn:hover { filter: brightness(1.12) }`.)*

7. **Transition explicite sur tout état interactif** — un changement de couleur sans
   `transition` produit un « snap » abrupt. Chaque sélecteur interactif (`.ms-nav`,
   cartes, swatches) doit déclarer une `transition` sur les props animées.
   *(Violé par `.ms-nav` — aucune transition de base → hover déconnexion brutal.)*

8. **Hover sur conteneur à style inline = piège de spécificité** — un `<div>` avec
   `border`/`background` **inline** ne sera pas surclassé par `.ms-card:hover` (sans
   `!important`). Pour un hover sur ce type de carte : animer une prop non posée en inline
   (`transform`, `box-shadow`) ou utiliser une classe dédiée avec `!important` ciblé.
   *(Concerne `AccountCard` dans `SettingsPage.tsx`.)*

9. **Pas de contrôle décoratif non fonctionnel** — un bouton qui ne déclenche rien
   (ex. « Upload photo » sans handler ni endpoint) est du faux-UI. Le câbler réellement
   ou le retirer. *(Voir mémoire « No fake/default data ».)*

## Composants graphiques

`frontend/src/app/components/ms/charts.tsx` — SVG bespoke, sans dépendance :
`Sparkline`, `LineChart`, `DonutChart`, `BarChart`, `GroupedBar`, `StackedBar`, `FollowersChart`.
Tous doivent respecter les règles 2 et 3 ci-dessus.

## Schéma DB & migrations (piège connu)

`CREATE TABLE IF NOT EXISTS` **n'altère pas** une table existante : si une table a été
créée par une version antérieure, ajouter des colonnes au `CREATE` dans une migration
ultérieure est un **no-op** silencieux. Les colonnes n'apparaissent jamais en base alors
que le code (et le `.sql` reproductible) les croit présentes.

→ Pour toute évolution additive de schéma : migration dédiée avec
`ALTER TABLE … ADD COLUMN IF NOT EXISTS …` (cf. `0008_users_profile_columns.sql`).

Le backend `update_user_profile` lit les colonnes réelles via `select("*")` et dégrade
gracieusement (drop des colonnes absentes) — ce qui **masquait** le bug : `full_name`
était persisté puis re-splitté, et `company` perdu silencieusement.

## Dette connue (au moment du plan-review) + décisions

- [ ] **A** — `charts.tsx` Sparkline : `id` dérivé de la couleur → aire noire (règle 3).
      **Fix :** `id` via `useId()`, indépendant de `color`.
- [ ] **A′** — `charts.tsx` : ids statiques `fgrow`/`lcSpend`/`lcImpr` → risque de collision (règle 3).
      **Fix :** `useId()` sur ces gradients aussi.
- [ ] **B** — `PageAnalysisPage.tsx` bannière : fond sombre figé + texte tokenisé (règle 2).
      **Décision :** *cover sombre conservé sur les 2 thèmes + texte forcé clair* (`#fff` / `rgba(255,255,255,.7)`).
- [ ] **C** — `primitives.tsx`/`motion.tsx` Blobs : multi-teintes sur cartes claires (règle 4).
      **Décision :** *supprimés* — `decorate={false}` sur les KPICard.
