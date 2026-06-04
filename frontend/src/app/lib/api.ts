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
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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

async function requestForm<T>(path: string, form: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetchWithTimeout(`${API_BASE}${path}`, { method: "POST", body: form, headers });
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
  estimated_reach?: string | null;
  notes?: string | null;
}

export interface InsightAnswerStructured {
  kind: "insight_answer";
  summary: string;
  key_metrics: Array<{ label: string; value: string; trend?: number | null }>;
  recommendations: string[];
}

export type StructuredOutput = CampaignBriefStructured | InsightAnswerStructured;

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

  getPageInfo: () => request<PageInfo>("/meta/page-info"),
  getPageInsights: (days: number = 28) =>
    request<PageInsights>(`/meta/page-insights?days=${days}`),
  getPagePosts: (limit: number = 10) =>
    request<PagePost[]>(`/meta/page-posts?limit=${limit}`),

  getPageSummary: () => request<PageSummary>("/meta/page-summary"),

  getCampaignDetail: (campaignId: string, range: DateRange = { preset: "last_30d" }) =>
    request<CampaignDetail>(`/meta/campaigns/${encodeURIComponent(campaignId)}/detail?${rangeQuery(range)}`),

  getAudiences: () => request<AudienceSummary[]>("/meta/audiences"),

  getAudienceReach: (days: number | "all" = 30) =>
    request<AudienceReach>(
      days === "all" ? `/meta/audience-reach?period=all` : `/meta/audience-reach?days=${days}`,
    ),

  getCampaigns: (range: DateRange = { preset: "last_30d" }) =>
    request<CampaignSummary[]>(`/meta/campaigns?${rangeQuery(range)}`),

  getDashboard: (days: number | "all" = 30) =>
    request<DashboardResponse>(
      days === "all" ? `/meta/dashboard?period=all` : `/meta/dashboard?days=${days}`,
    ),

  search: (q: string) =>
    request<SearchResponse>(`/meta/search?q=${encodeURIComponent(q)}`),

  uploadChatImage: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return requestForm<{ image_hash: string; preview_url?: string; error?: string }>(
      "/chat/upload-image",
      form,
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

  chat: (message: string, conversationId?: string, attachedImageHash?: string | null) =>
    request<ChatResponseT>("/chat", {
      method: "POST",
      body: JSON.stringify({
        message,
        conversation_id: conversationId,
        attached_image_hash: attachedImageHash || undefined,
      }),
    }),
};
