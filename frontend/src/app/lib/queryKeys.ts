import type { CampaignDetailSection, DateRange } from "./api";

/** Identifiant stable d'une plage de dates pour les clés de cache. */
export function rangeId(r: DateRange): string {
  return r.since && r.until ? `${r.since}_${r.until}` : r.preset || "last_30d";
}

/** Fabrique centralisée des query keys. Chaque clé inclut le compte sélectionné
 *  (multi-comptes) + la plage de dates → le cache est segmenté par compte/période,
 *  ce qui rend instantané le retour à une sélection déjà consultée. */
export const qk = {
  accounts: ["accounts"] as const,
  dashboard: (accountId: string | null, range: DateRange) =>
    ["dashboard", accountId, rangeId(range)] as const,
  campaigns: (accountId: string | null, range: DateRange) =>
    ["campaigns", accountId, rangeId(range)] as const,
  campaignDetail: (accountId: string | null, id: string, range: DateRange, section: CampaignDetailSection) =>
    ["campaign-detail", accountId, id, rangeId(range), section] as const,
  page: (accountId: string | null) => ["page", accountId] as const,
  audienceReach: (accountId: string | null, days: number | "all") =>
    ["audience-reach", accountId, days] as const,
  audiences: (accountId: string | null) => ["audiences", accountId] as const,
  scheduledPosts: (accountId: string | null) => ["scheduled-posts", accountId] as const,
  conversations: ["conversations"] as const,
  messages: (id: string) => ["messages", id] as const,
};

/** Convertit la plage de dates globale (façon Meta Ads) en paramètres acceptés
 *  par l'endpoint dashboard : `all`, un nombre de jours, ou une fenêtre since/until. */
export function dashboardArgs(range: DateRange): { days: number | "all"; since?: string; until?: string } {
  if (range.since && range.until) return { days: 30, since: range.since, until: range.until };
  const preset = range.preset || "last_30d";
  if (preset === "maximum") return { days: "all" };
  const m = /^last_(\d+)d$/.exec(preset);
  if (m) return { days: Math.min(90, Math.max(1, parseInt(m[1], 10))) };
  return { days: 30 };
}
