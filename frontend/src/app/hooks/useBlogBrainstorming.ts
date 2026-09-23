import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const BLOG_BRAINSTORMING_API_URL = "https://api.tybotflow.com/api/v1/smart-db/tables/mazdd74gdq30p9j/records";
const TYBOT_API_KEY = "twx_4csaOnT9aItwn08I_107";

export interface BlogBrainstormingRecord {
  Id: number;
  CreatedAt?: string;
  UpdatedAt?: string | null;
  Calendrier: string; // Date (ex: "2026-03-18")
  "Idées"?: string | null;
  Objectif?: string | null;
}

export function useBlogBrainstorming(enabled: boolean = true) {
  return useQuery({
    queryKey: ["tybot-blog-brainstorming"],
    queryFn: async () => {
      const res = await fetch(`${BLOG_BRAINSTORMING_API_URL}?limit=50&offset=0`, {
        headers: { Authorization: TYBOT_API_KEY },
      });
      if (!res.ok) throw new Error("Erreur de récupération des sessions de brainstorming blog");
      const data = await res.json();
      return (data.list || []) as BlogBrainstormingRecord[];
    },
    enabled,
  });
}

export function useCreateBlogBrainstorming() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { Calendrier: string; "Idées"?: string | null; Objectif?: string | null }) => {
      const res = await fetch(BLOG_BRAINSTORMING_API_URL, {
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tybot-blog-brainstorming"] }),
  });
}

export function useUpdateBlogBrainstorming() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { Id: number; Calendrier?: string; "Idées"?: string | null; Objectif?: string | null }) => {
      const res = await fetch(BLOG_BRAINSTORMING_API_URL, {
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tybot-blog-brainstorming"] }),
  });
}

export function useDeleteBlogBrainstorming() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(BLOG_BRAINSTORMING_API_URL, {
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tybot-blog-brainstorming"] }),
  });
}
