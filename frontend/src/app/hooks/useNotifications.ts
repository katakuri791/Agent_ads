import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type NotificationsResponse } from "../lib/api";
import { qk } from "../lib/queryKeys";

/** Notifications de l'utilisateur, rafraîchies toutes les 60s tant que l'app est
 *  active (polling léger — pas de websocket). */
export function useNotifications() {
  return useQuery<NotificationsResponse>({
    queryKey: qk.notifications,
    queryFn: () => api.listNotifications(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

/** Marque une notif (ou toutes) comme lue, puis réinvalide la liste. */
export function useNotificationMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.notifications });
  const markRead = useMutation({ mutationFn: (id: string) => api.markNotificationRead(id), onSuccess: invalidate });
  const markAllRead = useMutation({ mutationFn: () => api.markAllNotificationsRead(), onSuccess: invalidate });
  return { markRead, markAllRead };
}
