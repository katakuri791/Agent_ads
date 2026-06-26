# Analyse concurrentielle — Agent Meta Ads (LangChain + LangGraph + Supabase)

> **Document destiné à Claude Code.** Ce fichier complète le `README.md` du projet
> avec une analyse de la concurrence : qui fait quelque chose de similaire, ce
> que les vrais clients en disent (positifs et négatifs), et les **implications
> concrètes pour notre développement**.
>
> **Lis ce fichier en entier avant de coder les composants exposés à
> l'utilisateur (billing, gestion d'erreurs, UX agent, sécurité).**

---

## 1. Positionnement du projet vs marché

Notre projet construit un **agent conversationnel** qui crée des campagnes Meta
Ads complètes (campagne → ad set → creative → ad) via langage naturel, avec
auth Supabase + historique de conversations.

**Important :** ce segment précis (chat → campagne complète Meta Ads) est
**encore embryonnaire**. La plupart des concurrents sont :
- soit des outils d'automatisation **par règles** (Revealbot, Madgicx),
- soit des plateformes d'optimisation IA avec **dashboard classique** (Smartly.io, Ryze AI),
- soit des générateurs **de créatives IA** (AdCreative.ai).

Le seul concurrent architecturalement très proche est **Pipeboard** (approche
MCP + LLM client) — à surveiller de très près.

---

## 2. Concurrents directs analysés

| # | Outil          | Type                        | Proximité avec notre projet |
|---|----------------|------------------------------|------------------------------|
| 1 | Madgicx        | AI optimization + rules      | ⭐⭐⭐ (feature "AI Marketer") |
| 2 | AdCreative.ai  | AI creative generation       | ⭐⭐ (Meta API + AI)          |
| 3 | Revealbot/Birch| Rule-based automation        | ⭐⭐ (Meta API + automation)  |
| 4 | Smartly.io     | Enterprise creative + ads ops| ⭐ (référence du marché)     |
| 5 | **Pipeboard**  | **MCP + LLM conversational** | ⭐⭐⭐⭐ **concurrent direct** |
| 6 | AdAmigo.ai     | AI media-buyer autonome      | ⭐⭐⭐                          |
| 7 | Ryze AI        | AI autonomous Meta+Google    | ⭐⭐⭐                          |

---

## 3. Analyse détaillée par concurrent

### 3.1 Madgicx — AI Marketer

**Notes moyennes :** G2 ~4.6/5 (211 avis), Capterra ~4.3/5 (58 avis).
**Pricing :** ad-spend-based, à partir de 44-99$/mois pour spend < 2500$/mois.

#### ✅ Points positifs récurrents

- Outils d'automatisation puissants, gain de temps significatif via règles intelligentes et insights IA.
- Cas réels rapportés : un CSO obtient ~300k$ de revenu en 1 mois sur sa première campagne FB ; un co-owner a remplacé son agence digitale grâce à Madgicx.
- AI Bidding et budget scaling jugés uniques sur le marché.
- Onboarding et support jugés réactifs et compétents par la majorité.

#### ❌ Points négatifs récurrents

- **Courbe d'apprentissage abrupte** — mots-clés négatifs G2 : "Steep Learning Curve" (27), "Complexity" (17), "Expensive" (16).
- **Règles automatisées peu fiables** — échecs d'exécution silencieux signalés.
- Plainte sérieuse d'un Head of Marketing : « support absent, dominé par des bots et réponses automatisées » — déconseille Madgicx.
- Pas de génération créative IA (visuels, vidéos) — limitation explicite.
- Pricing basé sur ad spend → cher pour les petits comptes.

---

### 3.2 AdCreative.ai — le cas d'école à NE PAS reproduire

**Notes :** G2 4.2/5, mais Trustpilot très contrasté (3 576+ avis).
**~3 millions d'utilisateurs.** Basé à Paris, racheté par Appier Group.

#### ✅ Points positifs

- Gain de temps important — génération rapide de nombreuses variantes d'annonces.
- Workflow simple pour équipes sans designer.
- Creative Performance Score (scoring prédictif) apprécié.
- Intégration directe Meta/Google.

#### ❌ Points négatifs MASSIFS et SYSTÉMIQUES

> ⚠️ **Lecture critique pour notre projet :** le problème n'est pas le produit,
> c'est le **billing**. C'est exactement ce qu'il faut éviter.

- **Prélèvements surprises après essai/annulation** — centaines de plaintes Trustpilot/Reddit similaires.
- Témoignage typique : essai 7 jours annulé en <24h ; 3 mois plus tard, email réclamant 339$ ; cartes conservées sans accord.
- Remboursements lents (semaines à mois), nécessitant souvent une dispute bancaire.
- ~30-40% des creatives générées jugées inutilisables et "trop IA-générées".
- Outputs jugés génériques et répétitifs, templates rigides.
- Support jugé "très inférieur aux concurrents nord-américains" par un Marketing Manager.

---

### 3.3 Revealbot (rebranded Birch)

**Note :** G2 4.8/5 — la plus haute du segment (mais base d'avis modérée).
**Pricing :** 69-299$/mois selon ad spend, transparent.

#### ✅ Points positifs

- Rule engine le plus profond de sa catégorie : conditions-actions granulaires, logique AND/OR, exécution sub-horaire.
- Support client extrêmement rapide (<10 minutes selon plusieurs avis G2).
- Supporte Meta + Google + TikTok + Snapchat depuis une seule interface.

#### ❌ Points négatifs récurrents

- « Revealbot sous-performe régulièrement, des erreurs apparaissent dans diverses automatisations » — avis G2.
- Interface peu intuitive — beaucoup de clics pour pousser une campagne, bugs et problèmes de permissions récurrents.
- Limite fondamentale du rule-based : ne s'adapte pas dynamiquement, rate les opportunités hors-règles.
- Setup pénible avec plusieurs automatisations simultanées.
- Pas d'IA générative ni d'agent conversationnel.

---

### 3.4 Smartly.io — enterprise

**Pricing :** % de l'ad spend, ad spend minimum significatif requis.
**Cible :** grandes marques et agences (50k$+/mois en ad spend).

#### ✅ Points positifs

- Cas concret : franchise multi-locations (~100 emplacements), lancement de campagnes localisées en quelques minutes au lieu de plusieurs jours.
- Reporting jugé exceptionnel.
- Support pour quasi toutes les fonctionnalités natives Meta Ads (DPA, DCO, Instant Form, etc.).
- Automatisation feed-to-ad via Google Sheets très appréciée.

#### ❌ Points négatifs

- Courbe d'apprentissage très raide — recommandation explicite d'embaucher un spécialiste d'onboarding.
- Tarification % de l'ad spend → très chère à grande échelle.
- Inaccessible aux PME et solos.

---

### 3.5 Pipeboard — ⚠️ CONCURRENT ARCHITECTURAL DIRECT

**Approche :** plateforme MCP qui permet à Claude/ChatGPT/Cursor de créer et
gérer des campagnes Meta/Google/TikTok/Snap via langage naturel.

#### Positionnement commercial

- Automation IA-native via MCP : description en langage naturel, exécution par
  l'assistant IA avec approbation utilisateur.
- Couverture write complète sur Meta, Google, TikTok et Snap depuis une
  conversation IA unique.
- Compatible avec tous les clients MCP : Claude (Pro, Max, Code), ChatGPT,
  Cursor, Windsurf, CLI dédiée.

#### ⚠️ Note critique

- **Pas d'avis utilisateurs vérifiés trouvés sur G2/Capterra** — produit récent
  ou faible base installée.
- C'est notre concurrent direct architecturalement. Aller voir leur site,
  documentation et pricing **avant de finaliser le MVP**.
- Différence avec notre projet : Pipeboard exige un client MCP externe
  (Claude/ChatGPT). Nous, on fournit l'agent + l'auth + l'historique en
  produit autonome. C'est notre angle.

---

### 3.6 AdAmigo.ai et Ryze AI — montée de la vague "AI agent"

Deux acteurs récents qui poussent l'angle "AI media-buyer autonome".

- **AdAmigo.ai** : revendique génération créative IA + scaling automatique +
  ROAS améliorés ; cible PME e-commerce.
- **Ryze AI** : autonome sur Meta + Google, 2 000+ marketers, 500M$+ gérés.

Pas assez de recul sur les avis utilisateurs vérifiés, mais signal clair :
**le marché bouge vite vers l'agentic AI**. Notre fenêtre n'est pas infinie.

---

## 4. Patterns transversaux — ce que TOUS les avis nous disent

### Pattern 1 — La fiabilité technique est LE point de douleur

Bugs, règles qui échouent silencieusement, synchronisations qui sautent. C'est
le top 1 des plaintes chez Madgicx, Revealbot et beaucoup d'autres outils
analytics (Vaizle, Agorapulse).

### Pattern 2 — Le billing détruit la confiance plus vite que le produit

AdCreative.ai est le cas d'école : produit correct, **réputation détruite** par
des pratiques de refund opaques. Renouvellement auto sans rappel, remboursements
sur des semaines/mois, support qui ghoste.

### Pattern 3 — La complexité tue les outils puissants

Madgicx, Smartly, Sprout, Brandwatch : tous critiqués pour leur courbe
d'apprentissage. Notre angle conversationnel est précisément un avantage —
si l'agent gère bien les ambiguïtés.

### Pattern 4 — Les notes moyennes sont trompeuses

Sur G2 et Capterra, beaucoup d'avis 5 étoiles sont incités par cartes-cadeaux.
Les avis détaillés (surtout négatifs) sont plus informatifs que la moyenne.

---

## 5. Implications CONCRÈTES pour le code

> Cette section est la plus importante pour Claude Code.
> Chaque point ci-dessous doit influencer directement nos décisions de
> développement.

### 5.1 Billing irréprochable (priorité ABSOLUE)

Quand on intégrera Stripe (ou équivalent) :

- [ ] **Email de rappel** envoyé 2-3 jours avant la fin d'un essai gratuit.
- [ ] **Cancellation en 1 clic** depuis l'interface utilisateur (pas
      d'enchaînement d'écrans pour décourager).
- [ ] **Refund automatique** si annulation dans les X jours suivant un
      prélèvement.
- [ ] **Pricing transparent** sur la landing page (pas de "contact us").
- [ ] **Log de tous les événements de facturation** dans une table Supabase
      `billing_events` pour audit et support.

### 5.2 Fiabilité d'exécution de `create_full_campaign`

Chaque appel à la Meta Marketing API doit :

- [ ] Être **loggé dans la table `campaigns`** avec son statut (success, error,
      partial — ex: campaign créée mais ad set échoué).
- [ ] Capturer le **message d'erreur Meta complet** dans un champ `error_log`
      pour debugging.
- [ ] Notifier l'utilisateur **clairement** en cas d'échec (pas un "Something
      went wrong" générique).
- [ ] Prévoir une **stratégie de rollback** : si l'ad set échoue, faut-il
      supprimer la campagne créée juste avant ? Décision à prendre.
- [ ] Idempotence : si l'utilisateur relance après une erreur, ne pas créer
      de doublons (utiliser un `request_id` côté agent).

Ajouter à la table `campaigns` du schéma `README.md` :

```sql
alter table campaigns add column status_detail text;       -- success | partial | failed
alter table campaigns add column error_log text;
alter table campaigns add column request_id text unique;   -- pour l'idempotence
```

### 5.3 UX agent — gestion des ambiguïtés

L'agent doit **demander des clarifications** plutôt qu'inventer des valeurs par
défaut silencieuses. Exemples :

- Utilisateur : « Crée une pub pour mon produit »
  → Agent doit demander : budget, audience, objectif, lien, image.
- Utilisateur : « Cible les jeunes »
  → Agent doit demander la tranche d'âge précise (18-25 ? 18-35 ?).

À implémenter dans le system prompt de l'agent (`agent.py`).

### 5.4 Le `PAUSED` par défaut = argument de vente

Les utilisateurs de Madgicx/Revealbot se plaignent que des règles auto **brûlent
du budget**. Notre garde-fou (toutes les ads créées en `PAUSED`) doit être :

- [ ] **Affiché explicitement** dans la réponse de l'agent après création.
- [ ] **Mis en avant** sur la landing page comme feature de sécurité.
- [ ] Documenté dans une FAQ : « Aucune campagne ne dépense un centime sans
      ton clic d'activation. »

### 5.5 Absence de génération créative — risque produit

Madgicx et AdCreative en font. Pas nous (pour l'instant). Si on vise les
e-commerçants solos, l'absence de création de visuels est un blocage majeur.

- [ ] **Court terme :** documenter clairement que l'utilisateur doit uploader
      son image avant de lancer la campagne. La tool `upload_image` doit être
      bien exposée à l'agent.
- [ ] **Moyen terme :** intégration DALL·E / Stable Diffusion / Replicate
      pour génération d'images. Pas dans le MVP, mais à prévoir dans
      l'architecture.
- [ ] **Moyen terme :** génération du `ad_message` (copy) via le LLM lui-même —
      l'agent peut proposer une accroche avant de la valider avec l'utilisateur.

### 5.6 Logging et observabilité

Aucun avis utilisateur ne mentionne ce point — c'est précisément pour ça que
c'est un différenciateur. Prévoir :

- [ ] Table `agent_traces` : pour chaque tour de conversation, logger les tools
      appelées, les paramètres, les réponses Meta. Précieux pour le support et
      le debugging.
- [ ] Endpoint admin `/admin/conversations/{id}/trace` pour inspecter un cas
      client en quelques secondes.

### 5.7 Sécurité — ne pas reproduire les erreurs des concurrents

Déjà couvert dans le `README.md` section 15, mais à rappeler :

- [ ] Token Meta dans Supabase Vault (pas en `.env` en clair en prod).
- [ ] RLS activée sur toutes les tables.
- [ ] `SUPABASE_SERVICE_KEY` jamais exposé côté client.
- [ ] Rate limiting sur les endpoints `/chat` pour éviter qu'un agent en boucle
      ne génère 1000 campagnes par accident.

---

## 6. Positionnement marketing — angles défendables

Trois angles à exploiter sur la landing page et la communication, basés sur
les douleurs documentées chez les concurrents :

### Angle 1 — « Zéro courbe d'apprentissage »

Tu parles. L'agent fait. Pas de dashboard à apprendre, pas de règles à
configurer. C'est le contraire direct des plaintes Madgicx/Smartly.

### Angle 2 — « Tu valides chaque campagne. Aucune dépense sans ton clic. »

`PAUSED` par défaut. C'est le contraire direct des plaintes Revealbot/Madgicx
sur les règles qui brûlent du budget.

### Angle 3 — « Billing transparent, annulation en 1 clic »

C'est le contraire direct du désastre AdCreative.ai. À condition de le tenir
réellement.

---

## 7. Risques à monitorer

| Risque                                         | Mitigation                                          |
|------------------------------------------------|-----------------------------------------------------|
| Pipeboard prend le segment "AI agent + Meta"   | Vitesse d'exécution, focus sur l'expérience solo    |
| Madgicx ajoute un vrai chat à son AI Marketer  | Notre différenciateur = produit standalone simple   |
| Meta change/restreint son Marketing API        | Découpler la business logic du SDK, abstraction     |
| Coûts LLM trop élevés à grande échelle         | Mettre en cache, choisir le bon tier (Haiku ?)      |
| Utilisateur crée 100 campagnes par erreur      | Rate limiting + confirmation explicite par l'agent  |

---

## 8. Sources

Avis compilés depuis :
- G2.com (Madgicx, Smartly, Revealbot, AdCreative.ai)
- Capterra.com (Madgicx, AdCreative.ai)
- Trustpilot (AdCreative.ai — particulièrement détaillé sur le billing)
- GetApp, Product Hunt (AdCreative.ai)
- Articles comparatifs : adlibrary.com, pipeboard.co, get-ryze.ai, adamigo.ai,
  ai-cmo.net, buildaiq.com, zeely.ai

Données consultées en juin 2026. Les conditions tarifaires et fonctionnelles
évoluent — vérifier les sites officiels avant toute décision.

---

## 9. TODO post-MVP (à ne PAS traiter dans le MVP, mais à garder en tête)

- [ ] Intégration de génération d'images (DALL·E / Replicate / Stable Diffusion).
- [ ] Génération de copy publicitaire par le LLM avec validation utilisateur.
- [ ] Reporting basique de performance des campagnes créées (lecture seule via
      Meta Insights API).
- [ ] Support multi-canal (Google Ads, TikTok Ads) si traction confirmée.
- [ ] Mode agence : gestion multi-comptes Meta sous un même utilisateur Supabase.
- [ ] White-label pour agences (logo custom, sous-domaine).
- [ ] Audit logs visibles côté utilisateur (qui a créé/activé quelle campagne).