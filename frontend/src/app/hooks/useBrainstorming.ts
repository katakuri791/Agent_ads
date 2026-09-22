import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const BRAINSTORMING_API_URL = "https://api.tybotflow.com/api/v1/smart-db/tables/m8r4voakup6hkd5/records";
const TYBOT_API_KEY = "twx_4csaOnT9aItwn08I_107";

export interface BrainstormingRecord {
  Id: number;
  CreatedAt?: string;
  UpdatedAt?: string | null;
  Calendar: string; // Ex: "mai/2026", "juin/2026", "octobre/2026"
  Goals?: string | null;
}

export function useBrainstorming(enabled: boolean = true) {
  return useQuery({
    queryKey: ["tybot-brainstorming"],
    queryFn: async () => {
      const res = await fetch(`${BRAINSTORMING_API_URL}?limit=50&offset=0`, {
        headers: { Authorization: TYBOT_API_KEY },
      });
      if (!res.ok) throw new Error("Erreur de récupération des sessions de brainstorming");
      const data = await res.json();
      return (data.list || []) as BrainstormingRecord[];
    },
    enabled,
  });
}

export function useCreateBrainstorming() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { Calendar: string; Goals?: string | null }) => {
      const res = await fetch(BRAINSTORMING_API_URL, {
        method: "POST",
        headers: {
          Authorization: TYBOT_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Erreur de création: ${errText}`);
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tybot-brainstorming"] }),
  });
}

export function useUpdateBrainstorming() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { Id: number; Calendar?: string; Goals?: string | null }) => {
      const res = await fetch(BRAINSTORMING_API_URL, {
        method: "PATCH",
        headers: {
          Authorization: TYBOT_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Erreur de mise à jour: ${errText}`);
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tybot-brainstorming"] }),
  });
}

export function useDeleteBrainstorming() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(BRAINSTORMING_API_URL, {
        method: "DELETE",
        headers: {
          Authorization: TYBOT_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ Id: id }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Erreur de suppression: ${errText}`);
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tybot-brainstorming"] }),
  });
}
