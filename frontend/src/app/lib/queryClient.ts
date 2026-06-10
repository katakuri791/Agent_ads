import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";

// Client TanStack Query partagé par toute l'app.
//
// `staleTime` = 5 min : pendant une session de travail, revenir sur une date / un
// compte / une campagne déjà consulté·e est INSTANTANÉ et ne relance AUCUN appel
// Meta en arrière-plan (les données pub ne changent pas à la minute → 5 min de
// "fraîcheur" est largement acceptable et économise des appels Meta).
// `gcTime` = 30 min : on garde ces données en cache longtemps après avoir quitté
// la vue, donc le retour reste gratuit.
//
// `retry` intelligent : on NE réessaie PAS les erreurs renvoyées par le serveur
// (status >= 400 : Meta non configuré, rate-limit "User request limit reached",
// 502…). Réessayer un appel Meta déjà bloqué ne fait qu'ajouter un appel dans le
// vide et aggrave le throttling. On ne réessaie qu'une coupure réseau (status 0).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
  },
});
