# Spécification — Agent Meta Ads (LangChain + LangGraph + Supabase)

> Document destiné à Claude Code. Il décrit le projet à développer, ce qui existe
> déjà, ce qu'il reste à faire, et toutes les contraintes techniques.
> **Lis ce fichier en entier avant de commencer à coder.**

---

## 1. Objectif du projet

Construire un **agent conversationnel** capable de créer des campagnes
publicitaires complètes sur **Meta Ads** (Facebook/Instagram) à partir
d'instructions en langage naturel.

L'agent est construit avec **LangChain + LangGraph en Python**. Il expose une
**tool unique** qui crée en une seule fois : campagne → ad set → creative → ad.

Le projet inclut aussi une couche applicative : **authentification (login /
signup)** et **stockage de l'historique des conversations**, le tout sur
**Supabase**.

---

## 2. Stack technique imposée

| Composant            | Technologie                                   |
|----------------------|-----------------------------------------------|
| Langage agent        | Python 3.11+                                   |
| Framework agent      | LangChain + LangGraph                          |
| API publicitaire     | Meta Marketing API (SDK `facebook-business`)   |
| Base de données      | Supabase (PostgreSQL)                          |
| Auth                 | Supabase Auth                                  |
| Secrets              | Supabase Vault                                 |
| Modèle LLM           | au choix (OpenAI, Anthropic…) — à paramétrer   |

> ⚠️ **Contrainte d'architecture importante.** Supabase ne peut PAS exécuter de
> code Python (les Edge Functions tournent en Deno/TypeScript). L'agent Python
> doit donc tourner sur un hébergement Python séparé (Railway, Render, une VM,
> Fly.io, ou en local pour le dev). **Supabase sert uniquement de base de
> données + auth + coffre à secrets.** Voir section 8.

---

## 3. Architecture cible

```
┌─────────────────┐      ┌──────────────────────────┐      ┌─────────────┐
│   Utilisateur   │─────▶│   Agent Python (serveur) │─────▶│  Meta Ads   │
│  (login/chat)   │      │  LangChain + LangGraph    │      │     API     │
└─────────────────┘      │  + tool create_campaign   │      └─────────────┘
        │                └──────────────────────────┘
        │                          │
        ▼                          ▼
┌──────────────────────────────────────────────┐
│                  SUPABASE                      │
│  • Auth (login / signup)                       │
│  • Table conversations (historique chat)       │
│  • Table messages                              │
│  • Table campaigns (log des campagnes créées)  │
│  • Vault (token Meta chiffré)                  │
└──────────────────────────────────────────────┘
```

---

## 4. État du projet — ce que J'AI déjà ✅

- [x] **Token Meta** (access token valide avec les permissions ads).
- [x] **Ad Account ID** (format `act_XXXXXXXXXX`).
- [x] Compte Supabase créé.

> Note pour Claude Code : ne pas régénérer ces éléments, ils existent. Les lire
> depuis les variables d'environnement / Supabase Vault.

---

## 5. État du projet — ce qu'il RESTE À FAIRE ❌

- [ ] Vérifier / récupérer le **Page ID** de la Page Facebook (nécessaire pour le creative).
- [ ] Vérifier que le **token est long-lived** (System User Token) et pas un token 1h.
- [ ] Écrire la **tool unique** `create_full_campaign` (section 6).
- [ ] Construire **l'agent LangGraph** qui utilise la tool (section 7).
- [ ] Mettre en place le **schéma Supabase** : auth, conversations, messages, campaigns (section 9).
- [ ] Implémenter **login / signup** via Supabase Auth (section 10).
- [ ] Implémenter le **stockage de l'historique** des conversations (section 11).
- [ ] Mettre le **token Meta dans Supabase Vault** au lieu d'un `.env` en clair (section 12).
- [ ] Choisir et configurer **l'hébergement Python** (section 8).

---

## 6. La tool unique — `create_full_campaign`

Crée une campagne **complète** en un seul appel. **Tout est créé en `PAUSED`**
par sécurité (une ad `ACTIVE` dépense de l'argent réel immédiatement).

```python
import os
from langchain_core.tools import tool
from facebook_business.api import FacebookAdsApi
from facebook_business.adobjects.adaccount import AdAccount

FacebookAdsApi.init(access_token=os.environ["META_ACCESS_TOKEN"])
AD_ACCOUNT_ID = os.environ["META_AD_ACCOUNT_ID"]   # "act_XXXXXXXXXX"
PAGE_ID = os.environ["META_PAGE_ID"]


@tool
def create_full_campaign(
    campaign_name: str,
    objective: str,
    daily_budget: int,
    ad_message: str,
    link: str,
    image_hash: str,
    countries: list[str] = ["MA"],
    age_min: int = 18,
    age_max: int = 65,
) -> str:
    """Crée une campagne Meta Ads complète : campagne, ad set, creative et ad.
    Tout est créé en PAUSED par sécurité.

    Args:
        campaign_name: nom de la campagne
        objective: OUTCOME_TRAFFIC, OUTCOME_SALES, OUTCOME_LEADS, OUTCOME_AWARENESS
        daily_budget: budget quotidien EN CENTIMES (1000 = 10.00)
        ad_message: le texte de l'annonce
        link: l'URL de destination
        image_hash: hash de l'image déjà uploadée sur le compte
        countries: liste de codes pays (ex: ["MA", "FR"])
        age_min / age_max: tranche d'âge ciblée
    """
    account = AdAccount(AD_ACCOUNT_ID)

    campaign = account.create_campaign(params={
        "name": campaign_name,
        "objective": objective,
        "status": "PAUSED",
        "special_ad_categories": [],
    })

    adset = account.create_ad_set(params={
        "name": f"{campaign_name} - AdSet",
        "campaign_id": campaign["id"],
        "daily_budget": daily_budget,
        "billing_event": "IMPRESSIONS",
        "optimization_goal": "LINK_CLICKS",
        "bid_strategy": "LOWEST_COST_WITHOUT_CAP",
        "targeting": {
            "geo_locations": {"countries": countries},
            "age_min": age_min,
            "age_max": age_max,
        },
        "status": "PAUSED",
    })

    creative = account.create_ad_creative(params={
        "name": f"{campaign_name} - Creative",
        "object_story_spec": {
            "page_id": PAGE_ID,
            "link_data": {
                "message": ad_message,
                "link": link,
                "image_hash": image_hash,
            },
        },
    })

    ad = account.create_ad(params={
        "name": f"{campaign_name} - Ad",
        "adset_id": adset["id"],
        "creative": {"creative_id": creative["id"]},
        "status": "PAUSED",
    })

    return (
        f"Campagne complète créée (toutes en PAUSED) :\n"
        f"- Campaign ID : {campaign['id']}\n"
        f"- AdSet ID    : {adset['id']}\n"
        f"- Creative ID : {creative['id']}\n"
        f"- Ad ID       : {ad['id']}"
    )
```

### Tool annexe nécessaire — upload d'image

L'`image_hash` doit exister avant de créer le creative. Prévoir une tool ou une
fonction utilitaire :

```python
@tool
def upload_image(image_path: str) -> str:
    """Uploade une image sur le compte publicitaire et retourne son image_hash."""
    from facebook_business.adobjects.adimage import AdImage
    image = AdImage(parent_id=AD_ACCOUNT_ID)
    image[AdImage.Field.filename] = image_path
    image.remote_create()
    return image[AdImage.Field.hash]
```

### Points de validation Meta à respecter

- `objective` et `optimization_goal` sont **liés** : toutes les combinaisons ne
  sont pas valides. Si Meta renvoie une erreur de validation, c'est presque
  toujours ça.
- `daily_budget` est **en centimes** dans la devise du compte.
- Toute ad doit être rattachée à une **Page** (`PAGE_ID`).
- Garder `status: "PAUSED"` partout. Prévoir éventuellement une tool séparée
  `activate_campaign(campaign_id)` que l'utilisateur déclenche manuellement.

---

## 7. L'agent LangGraph

```python
from langgraph.prebuilt import create_react_agent
from langchain_openai import ChatOpenAI   # ou ChatAnthropic

tools = [create_full_campaign, upload_image]

agent = create_react_agent(
    model=ChatOpenAI(model="gpt-4o"),
    tools=tools,
)

result = agent.invoke({
    "messages": [("user",
        "Crée une campagne de trafic 'Promo été' à 10€/jour ciblant le Maroc")]
})
```

L'agent doit :
1. Charger l'historique de conversation depuis Supabase (section 11).
2. Traiter le message utilisateur.
3. Appeler la/les tool(s) si besoin.
4. Sauvegarder la réponse dans Supabase.

---

## 8. Hébergement Python (à décider) ❌

Supabase **n'exécute pas** l'agent Python. Choisir UNE option :

| Option            | Pour                              | Note                         |
|-------------------|-----------------------------------|------------------------------|
| **Local**         | dev / tests                       | `.env` + `python main.py`    |
| **Railway**       | déploiement simple                | recommandé pour démarrer     |
| **Render**        | déploiement simple                | équivalent Railway           |
| **Fly.io / VM**   | contrôle total                    | plus de config               |

L'agent peut être exposé via une petite **API FastAPI** (endpoint `/chat`) que
le frontend appelle.

---

## 9. Schéma Supabase (SQL)

```sql
-- Conversations (une par session de chat)
create table conversations (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) not null,
    title text,
    created_at timestamptz default now()
);

-- Messages (historique du chat)
create table messages (
    id uuid default gen_random_uuid() primary key,
    conversation_id uuid references conversations(id) on delete cascade not null,
    role text not null,            -- 'user' | 'assistant' | 'tool'
    content text not null,
    created_at timestamptz default now()
);

-- Log des campagnes créées par l'agent
create table campaigns (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id),
    conversation_id uuid references conversations(id),
    campaign_id text not null,
    adset_id text,
    creative_id text,
    ad_id text,
    name text,
    status text default 'PAUSED',
    created_at timestamptz default now()
);

-- Row Level Security : chaque user ne voit que ses données
alter table conversations enable row level security;
alter table messages enable row level security;
alter table campaigns enable row level security;

create policy "own_conversations" on conversations
    for all using (auth.uid() = user_id);

create policy "own_messages" on messages
    for all using (
        conversation_id in (select id from conversations where user_id = auth.uid())
    );

create policy "own_campaigns" on campaigns
    for all using (auth.uid() = user_id);
```

---

## 10. Authentification — login / signup ❌

Utiliser **Supabase Auth** (gère le hash des mots de passe, les sessions, etc.).

```python
from supabase import create_client

supabase = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_ANON_KEY"],   # côté client/login
)

# --- Sign up ---
def sign_up(email: str, password: str):
    return supabase.auth.sign_up({"email": email, "password": password})

# --- Login ---
def sign_in(email: str, password: str):
    return supabase.auth.sign_in_with_password(
        {"email": email, "password": password}
    )

# --- Récupérer l'utilisateur courant ---
def get_user(jwt: str):
    return supabase.auth.get_user(jwt)
```

À faire :
- Endpoints `/signup` et `/login` (FastAPI).
- Le `access_token` (JWT) retourné identifie l'utilisateur sur les appels suivants.
- Toutes les requêtes DB passent le JWT pour que la RLS filtre par user.

---

## 11. Stockage de l'historique des conversations ❌

```python
def save_message(conversation_id: str, role: str, content: str):
    supabase.table("messages").insert({
        "conversation_id": conversation_id,
        "role": role,
        "content": content,
    }).execute()

def load_history(conversation_id: str) -> list[dict]:
    res = (supabase.table("messages")
           .select("role, content")
           .eq("conversation_id", conversation_id)
           .order("created_at")
           .execute())
    return res.data

def create_conversation(user_id: str, title: str = "Nouvelle conversation"):
    res = supabase.table("conversations").insert({
        "user_id": user_id, "title": title,
    }).execute()
    return res.data[0]["id"]
```

Flux d'un tour de chat :
1. `load_history(conversation_id)` → reconstruire les messages pour l'agent.
2. `save_message(..., "user", message)`.
3. Invoquer l'agent.
4. `save_message(..., "assistant", reponse)`.
5. Si une campagne est créée → insérer dans `campaigns`.

---

## 12. Config Meta + secrets ❌

### Variables d'environnement nécessaires

```bash
META_ACCESS_TOKEN=          # ✅ je l'ai (vérifier qu'il est long-lived)
META_AD_ACCOUNT_ID=         # ✅ je l'ai (act_XXXXXXXXXX)
META_PAGE_ID=               # ❌ à récupérer
META_APP_ID=                # optionnel pour le SDK
META_APP_SECRET=            # optionnel pour le SDK

SUPABASE_URL=               # ✅ compte créé
SUPABASE_ANON_KEY=          # pour l'auth côté client
SUPABASE_SERVICE_KEY=       # pour les écritures serveur (NE JAMAIS exposer au client)

OPENAI_API_KEY=             # ou ANTHROPIC_API_KEY selon le modèle
```

### Sécuriser le token Meta avec Supabase Vault

Plutôt que de laisser `META_ACCESS_TOKEN` en clair :

```sql
-- Stocker le secret (une fois)
select vault.create_secret('LE_TOKEN_META', 'meta_access_token');
```

```python
# Le récupérer côté serveur au démarrage de l'agent
res = supabase.rpc("read_secret", {"secret_name": "meta_access_token"}).execute()
META_ACCESS_TOKEN = res.data
```

### Récupérer le Page ID (si pas connu)

```python
from facebook_business.adobjects.user import User
pages = User(fbid="me").get_accounts()   # liste les Pages + leurs IDs
```

---

## 13. Structure de fichiers suggérée

```
meta-ads-agent/
├── main.py               # API FastAPI (endpoints /signup /login /chat)
├── agent.py              # construction de l'agent LangGraph
├── tools/
│   └── meta_ads.py       # create_full_campaign + upload_image
├── db/
│   ├── auth.py           # sign_up / sign_in
│   ├── conversations.py  # save_message / load_history
│   └── campaigns.py      # log des campagnes
├── config.py             # chargement env + Vault
├── requirements.txt
└── .env                  # local uniquement, JAMAIS commité
```

### `requirements.txt`

```
langchain
langgraph
langchain-openai      # ou langchain-anthropic
facebook-business
supabase
fastapi
uvicorn
python-dotenv
```

---

## 14. Ordre de développement recommandé

1. Setup projet + `requirements.txt` + `config.py`.
2. Schéma Supabase (section 9) + RLS.
3. Tool `create_full_campaign` + test isolé avec un vrai appel Meta (en PAUSED).
4. Agent LangGraph (section 7) testé en local sans DB.
5. Auth Supabase (section 10).
6. Stockage conversations (section 11).
7. API FastAPI reliant tout.
8. Migration du token vers Vault (section 12).
9. Déploiement (section 8).

---

## 15. Règles de sécurité (à respecter impérativement)

- **Jamais** de token / clé en dur dans le code ou commité dans git.
- `SUPABASE_SERVICE_KEY` reste **côté serveur uniquement**.
- Ads créées en **PAUSED** — l'activation est une action manuelle séparée.
- RLS activée sur toutes les tables.
- `.env` dans `.gitignore`.