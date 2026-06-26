import { AuthUser, clearToken, getToken, setCachedUser, setToken } from "./auth";

const API_BASE: string =
  (import.meta as any).env?.VITE_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Au-delà de ce délai, une requête est considérée bloquée (Graph API trop lente,
// backend gelé…). Sans cette borne, un fetch peut « pendre » indéfiniment et le
// bouton Réessayer relance dans le vide. status=0 => erreur réseau/timeout.
const REQUEST_TIMEOUT_MS = 45_000;

/** `fetch` avec timeout (AbortController) et erreurs réseau converties en
 *  ApiError lisibles — au lieu des « Failed to fetch » / « Erreur inconnue »
 *  bruts qui ne disent rien à l'utilisateur. */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new ApiError("La requête a expiré (Meta met trop de temps à répondre). Réessaie.", 0);
    }
    // TypeError « Failed to fetch » = backend injoignable / coupé / CORS.
    throw new ApiError("Impossible de joindre le serveur. Vérifie que le backend est démarré.", 0);
  } finally {
    clearTimeout(timer);
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  authed = true,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (authed) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetchWithTimeout(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || body.message || JSON.stringify(body);
    } catch {
      /* ignore */
    }
    if (res.status === 401) clearToken();
    throw new ApiError(detail, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function requestForm<T>(path: string, form: FormData, timeoutMs?: number): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetchWithTimeout(`${API_BASE}${path}`, { method: "POST", body: form, headers }, timeoutMs);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || body.message || JSON.stringify(body);
    } catch {
      /* ignore */
    }
    if (res.status === 401) clearToken();
    throw new ApiError(detail, res.status);
  }
  return (await res.json()) as T;
}

interface AuthResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export interface MetaSettings {
  meta_access_token_set: boolean;
  meta_ad_account_id: string | null;
  meta_page_id: string | null;
  meta_pixel_id: string | null;
  preferred_currency: string | null;
  timezone: string | null;
}

export interface PageInfo {
  name?: string | null;
  category?: string | null;
  fan_count?: number | null;
  followers_count?: number | null;
  link?: string | null;
  picture_url?: string | null;
  about?: string | null;
  website?: string | null;
}

export interface PageInsights {
  days: number;
  impressions: number;
  engaged_users: number;
  post_engagements: number;
  fans: number;
}

export interface PagePost {
  id: string;
  message?: string | null;
  created_time?: string | null;
  permalink_url?: string | null;
  full_picture?: string | null;
  reactions: number;
  comments: number;
  shares: number;
}

export type ScheduledPostType = "text" | "image" | "video" | "link" | "carousel";
export interface ScheduledPost {
  id: string;
  message: string;
  type: ScheduledPostType;
  scheduled_time?: string | null; // ISO 8601 UTC
  created_time?: string | null;
  permalink_url?: string | null;
  full_picture?: string | null;
  status: "scheduled" | "published";
}
export interface ScheduledPostsResponse {
  posts: ScheduledPost[];
  blocked_reason?: string | null;
}

export interface CampaignSummary {
  id: string;
  name: string;
  objective?: string | null;
  status?: string | null;
  daily_budget?: number | null;
  impressions: number;
  clicks: number;
  spend: number;
  ctr: number;
  cpc: number;
  conversions: number;
  roas: number;
  revenue: number;
  roi: number;
  // Métrique de performance selon l'objectif (ROAS, CPL, CPE, CPM, CPC, CPI…).
  metric_name?: string | null;
  metric_value?: number | null;
  is_roas?: boolean | null;
}

/** État de la dernière synchronisation Meta → Supabase pour un compte. */
export interface SyncStatus {
  account_id: string;
  last_sync_at?: string | null;
  last_sync_status?: "success" | "error" | "running" | null;
  last_error?: string | null;
  insights_synced_until?: string | null;
  running: boolean;
}

/** Une clé API Meta connectée (multi-comptes). Le token n'est jamais renvoyé —
 *  seul `meta_access_token_set` indique s'il est configuré. */
export interface MetaAccount {
  id: string;
  label: string;
  meta_access_token_set: boolean;
  meta_ad_account_id: string | null;
  meta_page_id: string | null;
  meta_pixel_id: string | null;
  preferred_currency: string | null;
  timezone: string | null;
  is_default: boolean;
}

export interface DashboardKpi {
  label: string;
  value: string;
  change?: number | null;
  raw?: number | null;
}

export interface DashboardSeriesPoint {
  date: string;
  impressions: number;
  reach: number;
  spend: number;
  clicks: number;
  ctr: number;
  revenue: number;
  profit: number;
  cpc: number;
  cpm: number;
  roas: number;
}

export interface DashboardResponse {
  days: number;
  kpis: DashboardKpi[];
  series: DashboardSeriesPoint[];
  age_breakdown: Array<{ name: string; value: number }>;
  gender_breakdown: Array<{ name: string; value: number }>;
  geo_breakdown: Array<{ code: string; spend: number; impressions: number; clicks: number; ctr: number }>;
  top_campaigns: CampaignSummary[];
}

export type GeoDatum = DashboardResponse["geo_breakdown"][number];

export interface PageSummary {
  posts_count: number;
  reactions: number;
  comments: number;
  shares: number;
  reach_total: number;
  reach_organic: number;
  reach_paid: number;
  top_posts: PagePost[];
  posts: PagePost[];
  engagement_blocked?: boolean;
  // Raison Meta réelle quand l'engagement est indisponible (null si chargé).
  engagement_blocked_reason?: string | null;
}

export interface AdSetDetail {
  name: string;
  status: string;
  budget?: number | null;
  audience?: string | null;
  optimization_goal?: string | null;
  impressions: number;
  clicks: number;
  spend: number;
  cpc: number;
  ctr: number;
  roas: number;
}
export interface AdDetail {
  name: string;
  status: string;
  format: string;
  thumbnail_url?: string | null;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  spend: number;
  conversions: number;
}
export interface DemoDatum { age: string; male: number; female: number }
export interface PlacementDatum { name: string; value: number }
export interface CampaignDetail {
  adsets: AdSetDetail[];
  ads: AdDetail[];
  demographics: DemoDatum[];
  placements: PlacementDatum[];
}
/** Onglet du panneau de détail = section chargée à la demande côté backend. */
export type CampaignDetailSection = "adsets" | "ads" | "demographics" | "placements";

export interface AudienceSummary {
  id: string;
  name: string;
  type: string;
  size_low: number;
  size_high: number;
  status: string;
  description?: string | null;
  retention_days: number;
  time_created?: string | null;
  time_updated?: string | null;
}

export interface AudienceReach {
  reach_total: number;
  age_breakdown: Array<{ name: string; value: number }>;
  gender_breakdown: Array<{ name: string; value: number }>;
  demographics: DemoDatum[];
  placements: PlacementDatum[];
  geo_breakdown: GeoDatum[];
}

export interface SearchResultItem {
  kind: "campaign" | "post" | "page";
  id: string;
  title: string;
  subtitle?: string | null;
  url?: string | null;
}

export interface SearchResponse {
  query: string;
  results: SearchResultItem[];
}

// Structured chat output ──────────────────────────────────────────────────────

export interface AudienceSpec {
  age_min: number;
  age_max: number;
  countries: string[];
  interests: string[];
  genders?: string | null;
}

export interface AdCopy {
  headline: string;
  primary_text: string;
  description?: string | null;
  cta: string;
}

export interface CampaignBriefStructured {
  kind: "campaign_brief";
  name: string;
  objective: string;
  daily_budget_usd: number;
  audience: AudienceSpec;
  ad_copy: AdCopy;
  link?: string | null;
  image_prompt?: string | null;
  image_hash?: string | null;
  video_id?: string | null;
  estimated_reach?: string | null;
  notes?: string | null;
}

export interface InsightAnswerStructured {
  kind: "insight_answer";
  summary: string;
  key_metrics: Array<{ label: string; value: string; trend?: number | null }>;
  recommendations: string[];
}

export interface QuestionOptionT {
  value: string;
  label: string;
  hint?: string | null;
}

export interface QuestionT {
  id: string;
  label: string;
  type: "single" | "multi" | "text" | "media";
  options: QuestionOptionT[];
  allow_custom: boolean;
  placeholder?: string | null;
  required: boolean;
}

export interface CampaignQuestionnaireStructured {
  kind: "campaign_questionnaire";
  title: string;
  intro?: string | null;
  questions: QuestionT[];
  submit_label: string;
}

export interface CampaignCreatedStructured {
  kind: "campaign_created";
  campaign_id: string;
  adset_id?: string | null;
  ad_id?: string | null;
  name: string;
  objective?: string | null;
  daily_budget?: number | null; // en centimes (devise du compte)
  status: string; // toujours "PAUSED"
}

export type StructuredOutput =
  | CampaignBriefStructured
  | InsightAnswerStructured
  | CampaignQuestionnaireStructured
  | CampaignCreatedStructured;

export interface ChatResponseT {
  conversation_id: string;
  reply: string;
  tool_calls: Array<{ name: string; status: string; output?: string }>;
  structured?: StructuredOutput | null;
}

export type DateRange = { preset?: string; since?: string; until?: string };

function rangeQuery(r: DateRange): string {
  if (r.since && r.until) return `since=${encodeURIComponent(r.since)}&until=${encodeURIComponent(r.until)}`;
  return `date_preset=${encodeURIComponent(r.preset || "last_30d")}`;
}

/** `&account_id=…` pour cibler la clé Meta sélectionnée (multi-comptes). Vide si
 *  aucun compte n'est sélectionné → le backend retombe sur le compte par défaut. */
function acctParam(accountId?: string | null): string {
  return accountId ? `&account_id=${encodeURIComponent(accountId)}` : "";
}

export const api = {
  async signup(email: string, password: string, fullName?: string): Promise<AuthUser> {
    const data = await request<AuthResponse>(
      "/auth/signup",
      { method: "POST", body: JSON.stringify({ email, password, full_name: fullName }) },
      false,
    );
    setToken(data.access_token);
    setCachedUser(data.user);
    return data.user;
  },

  async login(email: string, password: string): Promise<AuthUser> {
    const data = await request<AuthResponse>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) },
      false,
    );
    setToken(data.access_token);
    setCachedUser(data.user);
    return data.user;
  },

  async me(): Promise<AuthUser> {
    const user = await request<AuthUser>("/auth/me");
    setCachedUser(user);
    return user;
  },

  async updateProfile(patch: Partial<{
    full_name: string;
    first_name: string;
    last_name: string;
    company: string;
    avatar_url: string;
  }>): Promise<AuthUser> {
    const user = await request<AuthUser>("/auth/me", {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    setCachedUser(user);
    return user;
  },

  logout(): void {
    clearToken();
  },

  getSettings: () => request<MetaSettings>("/settings"),

  updateSettings: (patch: Partial<{
    meta_access_token: string;
    meta_ad_account_id: string;
    meta_page_id: string;
    meta_pixel_id: string;
    preferred_currency: string;
    timezone: string;
  }>) => request<MetaSettings>("/settings", { method: "PUT", body: JSON.stringify(patch) }),

  testSettings: () =>
    request<{ ok: boolean; account_name?: string; error?: string }>(
      "/settings/test",
      { method: "POST" },
    ),

  // ── Comptes Meta (multi-clés) ──────────────────────────────────────────────
  listAccounts: () => request<MetaAccount[]>("/meta/accounts"),

  createAccount: (body: Partial<{
    label: string;
    meta_access_token: string;
    meta_ad_account_id: string;
    meta_page_id: string;
    meta_pixel_id: string;
    preferred_currency: string;
    timezone: string;
    is_default: boolean;
  }>) => request<MetaAccount>("/meta/accounts", { method: "POST", body: JSON.stringify(body) }),

  updateAccount: (id: string, body: Partial<{
    label: string;
    meta_access_token: string;
    meta_ad_account_id: string;
    meta_page_id: string;
    meta_pixel_id: string;
    preferred_currency: string;
    timezone: string;
    is_default: boolean;
  }>) => request<MetaAccount>(`/meta/accounts/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) }),

  deleteAccount: (id: string) =>
    request<{ ok: boolean }>(`/meta/accounts/${encodeURIComponent(id)}`, { method: "DELETE" }),

  testAccount: (id: string) =>
    request<{ ok: boolean; account_name?: string; error?: string }>(
      `/meta/accounts/${encodeURIComponent(id)}/test`,
      { method: "POST" },
    ),

  getPageInfo: (accountId?: string | null) =>
    request<PageInfo>(`/meta/page-info?_=1${acctParam(accountId)}`),
  getPageInsights: (days: number = 28, accountId?: string | null) =>
    request<PageInsights>(`/meta/page-insights?days=${days}${acctParam(accountId)}`),
  getPagePosts: (limit: number = 10, accountId?: string | null) =>
    request<PagePost[]>(`/meta/page-posts?limit=${limit}${acctParam(accountId)}`),

  getPageSummary: (accountId?: string | null) =>
    request<PageSummary>(`/meta/page-summary?_=1${acctParam(accountId)}`),

  /** Publie un post sur la page Facebook (texte, lien et/ou image). */
  createPagePost: (
    body: { message?: string; link?: string; image?: File | null; video?: File | null },
    accountId?: string | null,
  ) => {
    const form = new FormData();
    form.append("message", body.message || "");
    if (body.link) form.append("link", body.link);
    if (body.image) form.append("image", body.image);
    if (body.video) form.append("video", body.video);
    return requestForm<{ ok: boolean; post_id?: string | null }>(
      `/meta/page-posts?_=1${acctParam(accountId)}`,
      form,
    );
  },

  // ── Posts planifiés (Schedule) ─────────────────────────────────────────────
  getScheduledPosts: (accountId?: string | null) =>
    request<ScheduledPostsResponse>(`/meta/scheduled-posts?_=1${acctParam(accountId)}`),

  /** Planifie un post (texte/lien/photo/vidéo). `scheduledTime` = ISO 8601. */
  createScheduledPost: (
    body: { scheduledTime: string; message?: string; link?: string; image?: File | null; video?: File | null },
    accountId?: string | null,
  ) => {
    const form = new FormData();
    form.append("scheduled_time", body.scheduledTime);
    form.append("message", body.message || "");
    if (body.link) form.append("link", body.link);
    if (body.image) form.append("image", body.image);
    if (body.video) form.append("video", body.video);
    return requestForm<{ ok: boolean; post_id?: string | null }>(
      `/meta/scheduled-posts?_=1${acctParam(accountId)}`,
      form,
      180_000,
    );
  },

  publishScheduledPost: (postId: string, accountId?: string | null) =>
    request<{ ok: boolean }>(
      `/meta/scheduled-posts/${encodeURIComponent(postId)}/publish?_=1${acctParam(accountId)}`,
      { method: "POST" },
    ),

  deleteScheduledPost: (postId: string, accountId?: string | null) =>
    request<{ ok: boolean }>(
      `/meta/scheduled-posts/${encodeURIComponent(postId)}?_=1${acctParam(accountId)}`,
      { method: "DELETE" },
    ),

  // `section` charge un seul onglet du panneau de détail (adsets|ads|demographics|
  // placements) → ~2 appels Meta au lieu de 6. Les autres clés reviennent vides.
  getCampaignDetail: (
    campaignId: string,
    range: DateRange = { preset: "last_30d" },
    accountId?: string | null,
    section?: CampaignDetailSection | null,
  ) =>
    request<CampaignDetail>(
      `/meta/campaigns/${encodeURIComponent(campaignId)}/detail?${rangeQuery(range)}${acctParam(accountId)}${section ? `&section=${section}` : ""}`,
    ),

  getAudiences: (accountId?: string | null) =>
    request<AudienceSummary[]>(`/meta/audiences?_=1${acctParam(accountId)}`),

  getAudienceReach: (days: number | "all" = 30, accountId?: string | null) =>
    request<AudienceReach>(
      (days === "all" ? `/meta/audience-reach?period=all` : `/meta/audience-reach?days=${days}`) + acctParam(accountId),
    ),

  getCampaigns: (range: DateRange = { preset: "last_30d" }, accountId?: string | null) =>
    request<CampaignSummary[]>(`/meta/campaigns?${rangeQuery(range)}${acctParam(accountId)}`),

  updateCampaignStatus: (campaignId: string, status: "ACTIVE" | "PAUSED", accountId?: string | null) =>
    request<{ ok: boolean; status: string }>(
      `/meta/campaigns/${encodeURIComponent(campaignId)}/status?_=1${acctParam(accountId)}`,
      { method: "PATCH", body: JSON.stringify({ status }) },
    ),

  getDashboard: (days: number | "all" = 30, accountId?: string | null, since?: string, until?: string) =>
    request<DashboardResponse>(
      (days === "all"
        ? `/meta/dashboard?period=all`
        : since && until
          ? `/meta/dashboard?days=${days}&since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}`
          : `/meta/dashboard?days=${days}`) + acctParam(accountId),
    ),

  search: (q: string, accountId?: string | null) =>
    request<SearchResponse>(`/meta/search?q=${encodeURIComponent(q)}${acctParam(accountId)}`),

  // ── Sync (cache analytics) ─────────────────────────────────────────────────
  getSyncStatus: (accountId?: string | null) =>
    request<SyncStatus>(`/api/sync/status?_=1${acctParam(accountId)}`),

  triggerSync: (accountId: string) =>
    request<SyncStatus>(`/api/sync/${encodeURIComponent(accountId)}`, { method: "POST" }),

  uploadChatImage: (file: File, accountId?: string | null) => {
    const form = new FormData();
    form.append("file", file);
    return requestForm<{ image_hash: string; preview_url?: string; error?: string }>(
      `/chat/upload-image?_=1${acctParam(accountId)}`,
      form,
    );
  },

  uploadChatVideo: (file: File, accountId?: string | null) => {
    const form = new FormData();
    form.append("file", file);
    // Vidéo = upload plus lourd que les autres requêtes → timeout étendu (3 min).
    return requestForm<{ video_id: string; error?: string }>(
      `/chat/upload-video?_=1${acctParam(accountId)}`,
      form,
      180_000,
    );
  },

  listConversations: () =>
    request<Array<{ id: string; title: string | null; created_at: string; updated_at: string | null }>>(
      "/conversations",
    ),

  createConversation: () =>
    request<{ id: string; title: string | null; created_at: string; updated_at: string | null }>(
      "/conversations",
      { method: "POST" },
    ),

  getMessages: (conversationId: string) =>
    request<Array<{ id: string; role: string; content: string; created_at: string; metadata: Record<string, unknown> }>>(
      `/conversations/${conversationId}/messages`,
    ),

  // QCM de création de campagne (déterministe, généré côté backend en JSON).
  getCampaignQuestionnaire: () =>
    request<CampaignQuestionnaireStructured>("/chat/campaign-questionnaire"),

  chat: (message: string, conversationId?: string, attachedImageHash?: string | null, accountId?: string | null) =>
    request<ChatResponseT>("/chat", {
      method: "POST",
      body: JSON.stringify({
        message,
        conversation_id: conversationId,
        attached_image_hash: attachedImageHash || undefined,
        account_id: accountId || undefined,
      }),
    }),
};
