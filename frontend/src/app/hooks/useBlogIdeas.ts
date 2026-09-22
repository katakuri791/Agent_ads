import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const BLOG_IDEAS_API_URL = "https://api.tybotflow.com/api/v1/smart-db/tables/ms55cxivzya2wkg/records";
const TYBOT_API_KEY = "twx_4csaOnT9aItwn08I_107";

export interface BlogIdeaAttachment {
  url: string;
  title?: string;
  id?: string;
}

export interface BlogIdeaRecord {
  Id: number;
  CreatedAt: string;
  UpdatedAt?: string | null;
  Titre: string;
  "body blog"?: string | null;
  Image?: BlogIdeaAttachment[] | null;
  Keywords?: string | null;
  Domaine?: string | null;
  "Contenue final"?: string | null;
  Validation?: boolean | string | null;
}

export function useBlogIdeas(enabled: boolean = true) {
  return useQuery({
    queryKey: ["tybot-blog-ideas"],
    queryFn: async () => {
      const res = await fetch(`${BLOG_IDEAS_API_URL}?limit=50&offset=0`, {
        headers: { Authorization: TYBOT_API_KEY },
      });
      if (!res.ok) throw new Error("Erreur de récupération des idées de blog");
      const data = await res.json();
      return (data.list || []) as BlogIdeaRecord[];
    },
    enabled,
  });
}

export function useCreateBlogIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      Titre: string;
      "body blog"?: string | null;
      Keywords?: string | null;
      Domaine?: string | null;
      "Contenue final"?: string | null;
      Validation?: boolean | string | null;
      Image?: BlogIdeaAttachment[] | null;
    }) => {
      const res = await fetch(BLOG_IDEAS_API_URL, {
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tybot-blog-ideas"] }),
  });
}

export function useUpdateBlogIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      Id: number;
      Titre?: string;
      "body blog"?: string | null;
      Keywords?: string | null;
      Domaine?: string | null;
      "Contenue final"?: string | null;
      Validation?: boolean | string | null;
      Image?: BlogIdeaAttachment[] | null;
    }) => {
      const res = await fetch(BLOG_IDEAS_API_URL, {
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tybot-blog-ideas"] }),
  });
}

export function useDeleteBlogIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(BLOG_IDEAS_API_URL, {
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tybot-blog-ideas"] }),
  });
}
