import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const STRATEGY_API_URL = "https://api.tybotflow.com/api/v1/smart-db/tables/mlzq5a4ama6lmri/records";
const TYBOT_API_KEY = "twx_4csaOnT9aItwn08I_107";

export interface StrategyRecord {
  Id: number;
  CreatedAt?: string;
  UpdatedAt?: string | null;
  objective?: string | null;
  audiences?: string | null;
  "Content pillars"?: string | null;
  Formats?: string | null;
  frequency?: string | null;
  Chnnel?: string | null;
  tone_rules?: string | null;
  tone?: string | null;
  strategy_mode?: string | null;
}

export function useStrategies(enabled: boolean = true) {
  return useQuery({
    queryKey: ["tybot-strategies"],
    queryFn: async () => {
      const res = await fetch(`${STRATEGY_API_URL}?limit=50&offset=0`, {
        headers: { Authorization: TYBOT_API_KEY },
      });
      if (!res.ok) throw new Error("Erreur de récupération des stratégies Tybot");
      const data = await res.json();
      return (data.list || []) as StrategyRecord[];
    },
    enabled,
  });
}

export function useCreateStrategy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<StrategyRecord>) => {
      const res = await fetch(STRATEGY_API_URL, {
        method: "POST",
        headers: {
          Authorization: TYBOT_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Erreur lors de la création de la stratégie: ${errText}`);
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tybot-strategies"] }),
  });
}

export function useUpdateStrategy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { Id: number; [key: string]: unknown }) => {
      const res = await fetch(STRATEGY_API_URL, {
        method: "PATCH",
        headers: {
          Authorization: TYBOT_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Erreur lors de la mise à jour de la stratégie: ${errText}`);
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tybot-strategies"] }),
  });
}

export function useDeleteStrategy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(STRATEGY_API_URL, {
        method: "DELETE",
        headers: {
          Authorization: TYBOT_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ Id: id }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Erreur lors de la suppression de la stratégie: ${errText}`);
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tybot-strategies"] }),
  });
}
