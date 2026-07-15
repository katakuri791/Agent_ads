import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { ApiError, api, type CampaignDetailSection, type DateRange } from "../lib/api";
import { dashboardArgs, qk } from "../lib/queryKeys";
import { useAccount } from "../providers/AccountProvider";
import { useFilters } from "../providers/FiltersProvider";

/** HTTP status d'une erreur de requête (400 = Meta non configuré, etc.). */
export function errStatus(e: unknown): number | null {
  return e instanceof ApiError ? e.status : null;
}
export function errMessage(e: unknown): string | null {
  return e instanceof Error ? e.message : e ? String(e) : null;
}

// ── Dashboard (Overview) ─────────────────────────────────────────────────────
// `ignorePlatform` : l'Overview ne participe PAS au filtre Facebook/Instagram
//  (toujours « tout le compte »), même si Campaigns a persisté un choix `ui_platform`.
export function useDashboard(opts?: { ignorePlatform?: boolean }) {
  const { selectedAccountId } = useAccount();
  const { range, platform: ctxPlatform } = useFilters();
  const platform = opts?.ignorePlatform ? undefined : ctxPlatform;
  return useQuery({
    queryKey: qk.dashboard(selectedAccountId, range, platform),
    queryFn: () => {
      const { days, since, until } = dashboardArgs(range);
      return api.getDashboard(days, selectedAccountId, since, until, platform);
    },
    placeholderData: keepPreviousData,
  });
}

// ── Campagnes (liste + insights ROI) ─────────────────────────────────────────
export function useCampaigns(opts?: { ignorePlatform?: boolean }) {
  const { selectedAccountId } = useAccount();
  const { range, platform: ctxPlatform } = useFilters();
  const platform = opts?.ignorePlatform ? undefined : ctxPlatform;
  return useQuery({
    queryKey: qk.campaigns(selectedAccountId, range, platform),
    queryFn: () => api.getCampaigns(range, selectedAccountId, platform),
    placeholderData: keepPreviousData,
  });
}

// ── Campagnes sur UN jour précis (suivi budget/dépense de la page Paiement) ──
// Interroge les campagnes avec une fenêtre `since=until=<jour>` → la dépense
// renvoyée est celle de ce seul jour, comparable au budget quotidien.
export function useCampaignsOnDay(day: string) {
  const { selectedAccountId } = useAccount();
  return useQuery({
    queryKey: ["campaigns-day", selectedAccountId, day],
    queryFn: () => api.getCampaigns({ since: day, until: day }, selectedAccountId, null),
    placeholderData: keepPreviousData,
    enabled: !!day,
  });
}

/** Détail d'UN onglet (section) du panneau campagne, chargé à la demande.
 *  Une requête par onglet visité → ~2 appels Meta au lieu de 6, et chaque onglet
 *  déjà ouvert reste en cache (réouverture instantanée). */
export function useCampaignDetail(
  campaignId: string | null,
  range: DateRange,
  section: CampaignDetailSection,
) {
  const { selectedAccountId } = useAccount();
  return useQuery({
    queryKey: qk.campaignDetail(selectedAccountId, campaignId || "_", range, section),
    queryFn: () => api.getCampaignDetail(campaignId as string, range, selectedAccountId, section),
    enabled: !!campaignId,
  });
}

// ── Page Facebook (info + summary combinés) ──────────────────────────────────
export function usePageData() {
  const { selectedAccountId } = useAccount();
  return useQuery({
    queryKey: qk.page(selectedAccountId),
    queryFn: async () => {
      const [infoR, sumR] = await Promise.allSettled([
        api.getPageInfo(selectedAccountId),
        api.getPageSummary(selectedAccountId),
      ]);
      const info = infoR.status === "fulfilled" ? infoR.value : null;
      const summary = sumR.status === "fulfilled" ? sumR.value : null;
      const cfg = [infoR, sumR].find(
        (r) => r.status === "rejected" && (r as PromiseRejectedResult).reason instanceof ApiError && ((r as PromiseRejectedResult).reason as ApiError).status === 400,
      );
      const configError = cfg ? ((cfg as PromiseRejectedResult).reason as ApiError).message : null;
      const msgs: string[] = [];
      for (const r of [infoR, sumR]) {
        if (r.status === "rejected" && !(r.reason instanceof ApiError && r.reason.status === 400)) {
          const m = r.reason instanceof ApiError ? r.reason.message : "Erreur inconnue";
          if (!msgs.includes(m)) msgs.push(m);
        }
      }
      return { info, summary, configError, apiError: msgs.length ? msgs.join(" · ") : null };
    },
    placeholderData: keepPreviousData,
  });
}

// ── Audiences ────────────────────────────────────────────────────────────────
// L'audience est volontairement DÉCOUPLÉE du toggle plateforme (Instagram retiré
// de cette page) : elle agrège toujours toutes les plateformes. On ne lit donc
// PAS `platform` du provider ici.
export function useAudienceReach(days: number | "all", campaignId?: string | null) {
  const { selectedAccountId } = useAccount();
  return useQuery({
    queryKey: qk.audienceReach(selectedAccountId, days, campaignId || "_all", "all"),
    queryFn: () => api.getAudienceReach(days, selectedAccountId, campaignId || undefined, null),
    placeholderData: keepPreviousData,
  });
}
export function useAudiences() {
  const { selectedAccountId } = useAccount();
  return useQuery({
    queryKey: qk.audiences(selectedAccountId),
    queryFn: () => api.getAudiences(selectedAccountId),
  });
}

// ── Instagram (profil + posts) ───────────────────────────────────────────────
export function useInstagram() {
  const { selectedAccountId } = useAccount();
  return useQuery({
    queryKey: qk.instagram(selectedAccountId),
    queryFn: () => api.getInstagram(selectedAccountId),
    placeholderData: keepPreviousData,
  });
}

// ── Accès (personnes/rôles) + Facturation du compte pub Meta ─────────────────
export function useAccountUsers() {
  const { selectedAccountId } = useAccount();
  return useQuery({
    queryKey: qk.accountUsers(selectedAccountId),
    queryFn: () => api.getAccountUsers(selectedAccountId),
    placeholderData: keepPreviousData,
  });
}
export function useBilling() {
  const { selectedAccountId } = useAccount();
  return useQuery({
    queryKey: qk.billing(selectedAccountId),
    queryFn: () => api.getBilling(selectedAccountId),
    placeholderData: keepPreviousData,
  });
}

// ── Posts planifiés (Schedule) ───────────────────────────────────────────────
export function useScheduledPosts() {
  const { selectedAccountId } = useAccount();
  return useQuery({
    queryKey: qk.scheduledPosts(selectedAccountId),
    queryFn: () => api.getScheduledPosts(selectedAccountId),
    placeholderData: keepPreviousData,
  });
}

/** Invalide les caches data après une action mutante de l'agent (création de
 *  campagne, publication de post…). Remplace l'ancien clearCache(prefix). */
export function useInvalidateMetaData() {
  const qc = useQueryClient();
  return useCallback(() => {
    for (const key of ["dashboard", "campaigns", "audience-reach", "audiences", "page", "scheduled-posts"]) {
      qc.invalidateQueries({ queryKey: [key] });
    }
  }, [qc]);
}

// ── Sync (cache analytics Meta → Supabase) ───────────────────────────────────

/** État de la dernière synchro pour le compte sélectionné. Rafraîchi toutes les
 *  60 s pour que l'indicateur « Last updated » et le statut d'erreur restent à jour. */
export function useSyncStatus() {
  const { selectedAccountId } = useAccount();
  return useQuery({
    queryKey: ["sync-status", selectedAccountId],
    queryFn: () => api.getSyncStatus(selectedAccountId),
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
}

/** Déclenche un sync immédiat (bouton « Refresh »), puis invalide les caches data
 *  + le statut de sync. L'`accountId` doit être l'id résolu (cf. useSyncStatus). */
export function useTriggerSync() {
  const qc = useQueryClient();
  const invalidate = useInvalidateMetaData();
  return useMutation({
    mutationFn: (accountId: string) => api.triggerSync(accountId),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["sync-status"] });
    },
  });
}
