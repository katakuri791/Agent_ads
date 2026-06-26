from typing import Any, Literal, Optional, Union

from pydantic import BaseModel, EmailStr, Field


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


class UserUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    company: Optional[str] = None
    avatar_url: Optional[str] = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


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


# ─── Structured agent output ─────────────────────────────────────────────────


class AudienceSpec(BaseModel):
    age_min: int = 18
    age_max: int = 65
    countries: list[str] = Field(default_factory=lambda: ["MA"])
    interests: list[str] = Field(default_factory=list)
    genders: Optional[str] = None  # "all" | "men" | "women"


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
    # media = upload d'une photo ou d'une vidéo.
    type: Literal["single", "multi", "text", "media"] = "single"
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
    message: str
    conversation_id: Optional[str] = None
    attached_image_hash: Optional[str] = None
    attached_image_url: Optional[str] = None
    account_id: Optional[str] = None


class ToolCallInfo(BaseModel):
    name: str
    status: str
    output: Optional[str] = None


class ChatResponse(BaseModel):
    conversation_id: str
    reply: str
    tool_calls: list[ToolCallInfo] = []
    structured: Optional[StructuredOutput] = None


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


# ─── Meta data read endpoints ────────────────────────────────────────────────


class CampaignSummary(BaseModel):
    id: str
    name: str
    objective: Optional[str] = None
    status: Optional[str] = None
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


class PagePost(BaseModel):
    id: str
    message: Optional[str] = None
    created_time: Optional[str] = None
    permalink_url: Optional[str] = None
    full_picture: Optional[str] = None
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
