from typing import Any, Literal, Optional, Union

from .config import is_agent_id

from pydantic import (
    AliasChoices,
    BaseModel,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserPublic(BaseModel):
    id: str
    email: str
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    company: Optional[str] = None


class AgentInfo(BaseModel):
    """Identité de l'agent IA (un seul agent dans la plateforme)."""

    id: str
    name: str
    description: str


class AgentListItem(BaseModel):
    """Agent conversationnel du workspace tybotflow (cf. `backend/workspace.py`).

    `id` = le `bot_id` de l'agent (ex. "fizzy"), `name` = son libellé, cible du
    `@mention` dans le chat. ⚠️ Ce `bot_id` désigne un AGENT, pas le compte Meta
    (le champ `bot_id` de `/chat/botpress` vaut, lui, `account_id`).
    """

    id: str
    name: str


class UserUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    company: Optional[str] = None
    avatar_url: Optional[str] = None


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    user: UserPublic
    # Login délégué (tybotflow) : on remonte TEL QUEL le corps de réponse de
    # l'endpoint /auth/login du client (access_token, userData, …) pour que
    # l'appelant dispose de toutes ses données. Vide (None) pour un login local.
    client_response: Optional[dict[str, Any]] = None
    # Token brut tybotflow, déjà extrait de client_response (cf. extract_identity) :
    # évite au frontend de deviner la clé dans client_response. Utilisé pour les
    # appels directs à des services tybotflow (ex. UCC) avec le même token que le
    # login. None pour un login local.
    client_token: Optional[str] = None


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class NotificationOut(BaseModel):
    id: str
    type: str
    title: str
    body: Optional[str] = None
    read: bool = False
    created_at: str


class NotificationsResponse(BaseModel):
    items: list[NotificationOut]
    unread_count: int


class MetaSettingsRequest(BaseModel):
    meta_access_token: Optional[str] = None
    meta_ad_account_id: Optional[str] = None
    meta_page_id: Optional[str] = None
    meta_pixel_id: Optional[str] = None
    preferred_currency: Optional[str] = None
    timezone: Optional[str] = None


class MetaSettingsResponse(BaseModel):
    meta_access_token_set: bool
    meta_ad_account_id: Optional[str] = None
    meta_page_id: Optional[str] = None
    meta_pixel_id: Optional[str] = None
    preferred_currency: Optional[str] = None
    timezone: Optional[str] = None


class MetaTestResponse(BaseModel):
    ok: bool
    account_name: Optional[str] = None
    error: Optional[str] = None


# ─── Meta accounts (multi-clés) ──────────────────────────────────────────────


class MetaAccountRequest(BaseModel):
    label: Optional[str] = None
    meta_access_token: Optional[str] = None
    meta_ad_account_id: Optional[str] = None
    meta_page_id: Optional[str] = None
    meta_pixel_id: Optional[str] = None
    preferred_currency: Optional[str] = None
    timezone: Optional[str] = None
    is_default: Optional[bool] = None


class MetaAccountResponse(BaseModel):
    id: str
    label: str
    meta_access_token_set: bool
    meta_ad_account_id: Optional[str] = None
    meta_page_id: Optional[str] = None
    meta_pixel_id: Optional[str] = None
    preferred_currency: Optional[str] = None
    timezone: Optional[str] = None
    is_default: bool = False
    token_status: str = "valid"  # "valid" | "expired"


# ─── Structured agent output ─────────────────────────────────────────────────


class AudienceSpec(BaseModel):
    age_min: int = 18
    age_max: int = 65
    countries: list[str] = Field(default_factory=lambda: ["MA"])
    interests: list[str] = Field(default_factory=list)
    genders: Optional[str] = None  # "all" | "men" | "women"
    # Ciblage géographique fin (optionnel) : une ville Meta (clé adgeolocation) +
    # sa région + un rayon en km autour d'elle. Quand `city_key` est présent, le
    # ciblage se fait par ville/rayon plutôt que par pays entier.
    city_key: Optional[str] = None
    city_name: Optional[str] = None
    region_name: Optional[str] = None
    radius_km: Optional[int] = None


class AdCopy(BaseModel):
    headline: str
    primary_text: str
    description: Optional[str] = None
    cta: str = "LEARN_MORE"


class CampaignBrief(BaseModel):
    kind: Literal["campaign_brief"] = "campaign_brief"
    name: str
    objective: str
    daily_budget_usd: float
    audience: AudienceSpec
    ad_copy: AdCopy
    link: Optional[str] = None
    image_prompt: Optional[str] = None
    image_hash: Optional[str] = None
    # video_id : si l'annonce utilise une vidéo plutôt qu'une image.
    video_id: Optional[str] = None
    estimated_reach: Optional[str] = None
    notes: Optional[str] = None


class Metric(BaseModel):
    label: str
    value: str
    trend: Optional[float] = None  # percentage change


class InsightAnswer(BaseModel):
    kind: Literal["insight_answer"] = "insight_answer"
    summary: str
    key_metrics: list[Metric] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)


class QuestionOption(BaseModel):
    value: str
    label: str
    hint: Optional[str] = None


class Question(BaseModel):
    id: str
    label: str
    # single = un seul choix ; multi = plusieurs ; text = champ libre ;
    # media = upload d'une photo ou d'une vidéo ; geo = sélecteur ville + région
    # + rayon (km) basé sur les vraies villes Meta.
    type: Literal["single", "multi", "text", "media", "geo"] = "single"
    options: list[QuestionOption] = Field(default_factory=list)
    # allow_custom = afficher un champ « Autre / préciser » sous le QCM quand
    # l'utilisateur ne trouve pas son choix dans la liste.
    allow_custom: bool = True
    placeholder: Optional[str] = None
    required: bool = True


class CampaignQuestionnaire(BaseModel):
    kind: Literal["campaign_questionnaire"] = "campaign_questionnaire"
    title: str = "Création de campagne"
    intro: Optional[str] = None
    questions: list[Question] = Field(default_factory=list)
    submit_label: str = "Générer le brief"


class CampaignCreated(BaseModel):
    """Carte de confirmation affichée APRÈS création réelle d'une campagne.

    Met en avant le statut PAUSED (garde-fou sécurité = argument de vente) :
    aucune dépense tant que l'utilisateur n'active pas manuellement.
    """

    kind: Literal["campaign_created"] = "campaign_created"
    campaign_id: str
    adset_id: Optional[str] = None
    ad_id: Optional[str] = None
    name: str
    objective: Optional[str] = None
    daily_budget: Optional[float] = None  # en centimes (devise du compte)
    status: str = "PAUSED"


StructuredOutput = Union[
    CampaignBrief, InsightAnswer, CampaignQuestionnaire, CampaignCreated
]


# ─── Chat ────────────────────────────────────────────────────────────────────


class ChatRequest(BaseModel):
    # `/chat` accepte deux formats sur le MÊME body :
    #  • frontend      → `message` (+ `account_id`)
    #  • Botpress/plat → `text` (= message) et `bot_id`/`bot_Id` (= account_id)
    # Le validateur ci-dessous replie `text→message` et `bot_id→account_id`
    # quand le champ principal est absent, donc `/chat` fonctionne tel quel avec
    # l'entrée `input.txt` (text, bot_id, user_id, conversation_id).
    model_config = {"populate_by_name": True}

    message: Optional[str] = None
    text: Optional[str] = None  # alias Botpress de `message`
    conversation_id: Optional[str] = None
    attached_image_hash: Optional[str] = None
    attached_image_url: Optional[str] = None
    account_id: Optional[str] = None
    # `bot_id` (= account_id, compte Meta ciblé). Accepte aussi la casse Botpress
    # `bot_Id` de input.txt. Vide → compte par défaut de l'utilisateur.
    bot_id: Optional[str] = Field(
        default=None, validation_alias=AliasChoices("bot_id", "bot_Id")
    )
    # Identité de l'appelant pour /chat public (ex. user_id tybotflow / Botpress).
    # Sert à séparer le rate-limit par personne et à tracer qui parle à l'agent.
    # Optionnel : absent → on retombe sur l'utilisateur de démo fixe.
    user_id: Optional[str] = None

    @model_validator(mode="after")
    def _accept_botpress_aliases(self) -> "ChatRequest":
        if not (self.message or "").strip() and (self.text or "").strip():
            self.message = self.text
        # `bot_id` ne se replie en `account_id` que s'il désigne bien un compte
        # Meta. Quand il nomme un AGENT conversationnel (« Meta_ads », « fizzy »),
        # il dit à QUI on parle : le replier ferait chercher un compte Meta nommé
        # « fizzy » (introuvable → compte par défaut silencieux).
        if (
            not (self.account_id or "").strip()
            and (self.bot_id or "").strip()
            and not is_agent_id(self.bot_id)
        ):
            self.account_id = self.bot_id
        if not (self.message or "").strip():
            raise ValueError("`message` (ou `text`) est requis.")
        return self


# ─── Botpress (format d'entrée/sortie de l'intégration externe) ───────────────
# Botpress envoie le message au format `input.txt` (type/text/bot_Id/payload) et
# attend en retour un tableau `responses` (voir « Botpress responses.docx »). On
# mappe ici ce format sur nos ChatRequest/ChatResponse internes sans toucher au
# `/chat` du frontend.


# Valeur d'exemple pré-remplie par Swagger UI : si l'utilisateur teste l'endpoint
# sans la remplacer, on la refuse avec un message clair plutôt que de laisser un
# faux identifiant filer plus loin (compte Meta introuvable → erreur confuse).
_PLACEHOLDER = "string"


def _reject_placeholder(value: str, field: str) -> str:
    # `min_length=1` de Pydantic compte les espaces : `" "` a une longueur de 1 et
    # passe donc la contrainte. On rejette ici toute valeur VIDE une fois les espaces
    # retirés (chaîne blanche = pas un vrai identifiant), et on renvoie la valeur
    # NETTOYÉE (strip) pour qu'aucun espace parasite ne file en aval.
    v = value.strip()
    if not v:
        raise ValueError(
            f"« {field} » ne peut pas être vide. Renseigne un {field} réel."
        )
    if v.lower() == _PLACEHOLDER:
        raise ValueError(
            f"« {field} » doit être une vraie valeur, pas l'exemple « string ». "
            f"Renseigne un {field} réel."
        )
    return v


class BotpressPayload(BaseModel):
    # `user_id` = identité de la personne qui parle, fournie par un appelant EXTERNE
    # (Botpress) qui n'a pas de JWT chez nous. Le fil est résolu à partir de lui.
    # ⚠️ Optionnel : le frontend est déjà authentifié, son identité vient du token.
    # L'exiger le forcerait à s'auto-déclarer, et la moindre divergence avec le JWT
    # créerait des fils invisibles depuis /conversations (cloisonné par user.id).
    user_id: Optional[str] = None
    # Fil ciblé. Vide → on reprend la dernière conversation de `user_id` (cas
    # Botpress, qui ne suit pas les fils). Fourni → honoré (le frontend a un
    # sélecteur de conversations).
    conversation_id: Optional[str] = None
    channel: str = "web"                   # toujours "web" côté Botpress (ignoré)

    @field_validator("user_id")
    @classmethod
    def _no_placeholder_user_id(cls, v: Optional[str]) -> Optional[str]:
        # Absent = frontend authentifié (identité tirée du JWT). Fourni = appelant
        # externe : on refuse alors le placeholder Swagger « string ».
        return _reject_placeholder(v, "user_id") if v is not None else None


class BotpressChatRequest(BaseModel):
    # `text` = le message ; `bot_id` = l'account_id (compte Meta ciblé) → OBLIGATOIRE ;
    # `payload.user_id` = identité (obligatoire). `payload.conversation_id` est ignoré.
    type: str = "text"
    # `text` = le message. Vide ou blanc (« », «   ») → refusé ICI : sans ça,
    # ChatRequest lève plus bas un ValidationError NON attrapé → HTTP 500 brut.
    # On ne refuse PAS l'exemple « string » comme pour les identifiants : un
    # message peut légitimement contenir n'importe quel mot.
    text: str = Field(..., min_length=1)
    # On accepte les DEUX casses : `bot_id` (minuscule, notre format) et `bot_Id`
    # (la casse historique de Botpress dans input.txt) — même choix que ChatRequest,
    # pour qu'aucun appelant existant ne casse.
    bot_id: str = Field(
        ..., min_length=1, validation_alias=AliasChoices("bot_id", "bot_Id")
    )
    # Compte Meta ciblé. Historiquement porté par `bot_id` — mais depuis que
    # `bot_id` peut nommer un AGENT (« fizzy »), il faut un champ distinct pour
    # que le frontend transmette le compte sélectionné dans l'UI. Absent → compte
    # par défaut de l'utilisateur (comportement inchangé pour Botpress).
    account_id: Optional[str] = None
    # Image jointe (upload préalable via /chat/upload-image). Botpress ne s'en
    # sert pas ; le frontend, si.
    attached_image_hash: Optional[str] = None
    payload: BotpressPayload

    @field_validator("text")
    @classmethod
    def _text_not_blank(cls, v: str) -> str:
        # Même règle que `_reject_placeholder` pour le vide : `min_length=1`
        # compte les espaces, donc «   » passerait la contrainte Pydantic.
        if not v.strip():
            raise ValueError(
                "« text » ne peut pas être vide. Écris un message."
            )
        return v

    @field_validator("bot_id")
    @classmethod
    def _no_placeholder_bot_id(cls, v: str) -> str:
        return _reject_placeholder(v, "bot_id")


class ToolCallInfo(BaseModel):
    name: str
    status: str
    output: Optional[str] = None


class ChatResponse(BaseModel):
    conversation_id: str
    reply: str
    tool_calls: list[ToolCallInfo] = []
    structured: Optional[StructuredOutput] = None
    # Agents UCC uniquement : la room WebSocket à rejoindre pour recevoir la
    # réponse du bot (événement `bot-message`). UCC étant un webhook, `reply` est
    # vide dans ce cas. None pour notre agent Meta Ads (réponse synchrone).
    ucc_conversation_id: Optional[str] = None


class BotpressChatResponse(BaseModel):
    # `responses` = liste hétérogène de messages Botpress (text / single-choice /
    # card…). On renvoie aussi `conversation_id` pour que Botpress le repasse au
    # prochain tour (continuité du fil).
    conversation_id: str
    responses: list[dict[str, Any]] = []
    # Champs additionnels pour que le frontend puisse utiliser CET endpoint sans
    # rien perdre par rapport à `/chat` : Botpress ignore ce qu'il ne connaît pas.
    #  • `reply`      : le texte brut, déjà présent dans `responses[0]`, mais sans
    #                   avoir à fouiller le tableau ;
    #  • `structured` : les cartes interactives (QCM de campagne) — `responses`
    #                   les aplatit en `single-choice`, ce qui perd l'état cliquable ;
    #  • `tool_calls` : ce que l'agent a exécuté → le front invalide ses caches
    #                   après une action mutante (création de campagne…).
    reply: str = ""
    tool_calls: list[ToolCallInfo] = []
    structured: Optional[StructuredOutput] = None
    # Room WebSocket à rejoindre quand l'agent ciblé est un bot UCC (cf. ChatResponse).
    ucc_conversation_id: Optional[str] = None


class ConversationSummary(BaseModel):
    id: str
    title: Optional[str] = None
    created_at: str
    updated_at: Optional[str] = None


class MessageOut(BaseModel):
    id: str
    role: str
    content: str
    created_at: str
    metadata: dict[str, Any] = {}


# ─── Session (toute la discussion d'UNE conversation) ─────────────────────────
# Une « session » = le fil complet d'une conversation : on fournit l'`id` de la
# conversation et on récupère ses métadonnées + TOUS ses messages (la discussion
# de bout en bout, dans l'ordre chronologique).


class SessionOut(BaseModel):
    conversation_id: str
    title: Optional[str] = None
    created_at: str
    updated_at: Optional[str] = None
    messages: list[MessageOut] = []


# ─── Meta data read endpoints ────────────────────────────────────────────────


class CampaignSummary(BaseModel):
    id: str
    name: str
    objective: Optional[str] = None
    status: Optional[str] = None
    created_time: Optional[str] = None
    daily_budget: Optional[float] = None
    impressions: int = 0
    clicks: int = 0
    spend: float = 0.0
    ctr: float = 0.0
    cpc: float = 0.0
    conversions: int = 0
    roas: float = 0.0
    revenue: float = 0.0
    roi: float = 0.0
    # Métrique de performance choisie selon l'objectif (ROAS, CPL, CPE, CPM, CPC,
    # CPI, Cost per message). Champs optionnels → non-breaking pour le frontend.
    metric_name: Optional[str] = None
    metric_value: Optional[float] = None
    is_roas: Optional[bool] = None
    # ── Métriques étendues (sélecteur de colonnes des campagnes) ──────────────
    # Toutes optionnelles avec défaut 0 → l'ancien frontend ignore ce qu'il ne
    # connaît pas, et une campagne sans vidéo renvoie simplement des 0.
    reach: int = 0
    frequency: float = 0.0
    cpm: float = 0.0
    cpp: float = 0.0
    purchases: int = 0
    leads: int = 0
    cost_per_purchase: float = 0.0
    cost_per_lead: float = 0.0
    add_to_cart: int = 0
    initiate_checkout: int = 0
    landing_page_views: int = 0
    link_clicks: int = 0
    inline_link_clicks: int = 0
    unique_clicks: int = 0
    outbound_clicks: int = 0
    link_ctr: float = 0.0
    post_engagement: int = 0
    post_reactions: int = 0
    post_comments: int = 0
    post_shares: int = 0
    post_saves: int = 0
    # Vidéo
    video_3s: int = 0
    thruplays: int = 0
    video_p25: int = 0
    video_p50: int = 0
    video_p75: int = 0
    video_p100: int = 0
    video_plays: int = 0
    cost_per_thruplay: float = 0.0
    hook_rate: float = 0.0
    hold_rate: float = 0.0


class CampaignStatusUpdate(BaseModel):
    status: Literal["ACTIVE", "PAUSED"]


class DashboardSeriesPoint(BaseModel):
    date: str
    impressions: int = 0
    reach: int = 0
    spend: float = 0.0
    clicks: int = 0
    ctr: float = 0.0
    revenue: float = 0.0
    profit: float = 0.0
    leads: float = 0.0
    cpc: float = 0.0
    cpm: float = 0.0
    roas: float = 0.0


class DashboardKpi(BaseModel):
    label: str
    value: str
    change: Optional[float] = None
    raw: Optional[float] = None


class DashboardResponse(BaseModel):
    days: int
    kpis: list[DashboardKpi]
    series: list[DashboardSeriesPoint]
    age_breakdown: list[dict[str, Any]] = []
    gender_breakdown: list[dict[str, Any]] = []
    geo_breakdown: list[dict[str, Any]] = []
    top_campaigns: list[CampaignSummary] = []
    # Dernier jour avec dépense réelle (ISO), indépendant de la période choisie.
    # None = aucune dépense en cache. Sert à signaler un compte à l'arrêt.
    last_activity_date: Optional[str] = None


class PagePost(BaseModel):
    id: str
    message: Optional[str] = None
    created_time: Optional[str] = None
    permalink_url: Optional[str] = None
    full_picture: Optional[str] = None
    # Type de média réel du post (photo|video|link|album…) et, pour une vidéo,
    # l'URL source (mp4) jouable directement dans un lecteur <video>.
    media_type: Optional[str] = None
    media_url: Optional[str] = None
    reactions: int = 0
    comments: int = 0
    shares: int = 0


class PageSummaryResponse(BaseModel):
    posts_count: int = 0
    reactions: int = 0
    comments: int = 0
    shares: int = 0
    reach_total: int = 0
    reach_organic: int = 0
    reach_paid: int = 0
    top_posts: list[PagePost] = []
    posts: list[PagePost] = []
    engagement_blocked: bool = False
    # Raison Meta réelle quand l'engagement est indisponible (token de page non
    # résolu, scope manquant, token expiré…). None si l'engagement est bien chargé.
    engagement_blocked_reason: Optional[str] = None


class ScheduledPost(BaseModel):
    id: str
    message: str = ""
    type: str = "text"            # text | image | video | link | carousel
    scheduled_time: Optional[str] = None  # ISO 8601 UTC
    created_time: Optional[str] = None
    permalink_url: Optional[str] = None
    full_picture: Optional[str] = None
    status: str = "scheduled"     # scheduled | published


class ScheduledPostsResponse(BaseModel):
    posts: list[ScheduledPost] = []
    # Raison Meta réelle si la planification est indisponible (scope
    # `pages_manage_posts` manquant, token de page non résolu…). None sinon.
    blocked_reason: Optional[str] = None


class CampaignDetailResponse(BaseModel):
    adsets: list[dict[str, Any]] = []
    ads: list[dict[str, Any]] = []
    demographics: list[dict[str, Any]] = []
    placements: list[dict[str, Any]] = []


class AudienceSummary(BaseModel):
    id: str
    name: str
    type: str
    size_low: int = 0
    size_high: int = 0
    status: str
    description: Optional[str] = None
    retention_days: int = 0
    time_created: Optional[str] = None
    time_updated: Optional[str] = None


class AudienceReachResponse(BaseModel):
    """The real audience reached/engaged by the account's delivered campaigns."""

    reach_total: int = 0
    age_breakdown: list[dict[str, Any]] = []
    gender_breakdown: list[dict[str, Any]] = []
    demographics: list[dict[str, Any]] = []
    placements: list[dict[str, Any]] = []
    geo_breakdown: list[dict[str, Any]] = []


class IgProfile(BaseModel):
    id: str
    username: Optional[str] = None
    name: Optional[str] = None
    followers_count: int = 0
    follows_count: int = 0
    media_count: int = 0
    profile_picture_url: Optional[str] = None
    biography: Optional[str] = None
    website: Optional[str] = None


class IgPost(BaseModel):
    id: str
    caption: Optional[str] = None
    media_type: Optional[str] = None
    media_product_type: Optional[str] = None
    media_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    permalink: Optional[str] = None
    timestamp: Optional[str] = None
    like_count: int = 0
    comments_count: int = 0
    # « Combien de gens ont vu » = reach (comptes uniques). None si indisponible.
    reach: Optional[int] = None
    impressions: Optional[int] = None


class InstagramResponse(BaseModel):
    profile: Optional[IgProfile] = None
    posts: list[IgPost] = []
    # Raison Meta réelle si Instagram est indisponible (aucun compte IG lié, scope
    # manquant…). None si les données sont bien chargées.
    blocked_reason: Optional[str] = None


class AccountUser(BaseModel):
    id: str
    name: str
    role: str = "—"           # Admin | Advertiser | Analyst | Draft | —
    tasks: list[str] = []     # permissions Meta brutes (MANAGE, ADVERTISE…)


class AccountUsersResponse(BaseModel):
    users: list[AccountUser] = []
    # Raison Meta réelle si l'accès est refusé (scope business_management manquant…).
    blocked_reason: Optional[str] = None


class BillingMonth(BaseModel):
    month: str                # YYYY-MM
    spend: float = 0.0
    impressions: int = 0
    clicks: int = 0


class BillingResponse(BaseModel):
    name: Optional[str] = None
    currency: Optional[str] = None
    account_status: Optional[str] = None
    amount_spent: Optional[float] = None
    balance: Optional[float] = None
    spend_cap: Optional[float] = None
    payment_type: Optional[str] = None       # ex. « Credit Card », « Paypal »
    payment_display: Optional[str] = None     # ex. « Visa ****1234 »
    card_count: int = 0                       # nb de moyens de paiement (source active Meta)
    history: list[BillingMonth] = []          # dépense mensuelle (vraies données)


class SearchResultItem(BaseModel):
    kind: str  # "campaign" | "post" | "page"
    id: str
    title: str
    subtitle: Optional[str] = None
    url: Optional[str] = None


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResultItem]


class ChatImageUploadResponse(BaseModel):
    image_hash: str
    preview_url: Optional[str] = None
    error: Optional[str] = None


class ChatVideoUploadResponse(BaseModel):
    video_id: str
    error: Optional[str] = None


# ─── Sync (cache analytics) ──────────────────────────────────────────────────


class SyncStatusResponse(BaseModel):
    account_id: str
    last_sync_at: Optional[str] = None
    last_sync_status: Optional[str] = None  # success | error | running
    last_error: Optional[str] = None
    insights_synced_until: Optional[str] = None
    running: bool = False
