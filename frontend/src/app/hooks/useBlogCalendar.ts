import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const BLOG_CALENDAR_API_URL = "https://api.tybotflow.com/api/v1/smart-db/tables/mq1jjw3s79ew5xs/records";
const TYBOT_API_KEY = "twx_4csaOnT9aItwn08I_107";

export interface BlogCalendarAttachment {
  url: string;
  title?: string;
  id?: string;
  mimetype?: string;
  size?: number;
}

export interface BlogCalendarRecord {
  Id: number;
  CreatedAt: string;
  UpdatedAt?: string | null;
  Calendrier?: string | null;
  Titre?: string | null;
  "body blog"?: string | null;
  Image?: BlogCalendarAttachment[] | null;
  Validation?: boolean | string | null;
  Keywords?: string | null;
  Domaine?: string | null;
  "Contenue final"?: string | null;
}

export function isBlogCalendarRecordValidated(val: any): boolean {
  if (val === true || val === 1 || val === "1") return true;
  if (typeof val === "string") {
    const s = val.trim().toLowerCase();
    return s === "true" || s === "valide" || s === "validé" || s === "yes";
  }
  return false;
}

export function useBlogCalendar(enabled: boolean = true) {
  return useQuery({
    queryKey: ["tybot-blog-calendar"],
    queryFn: async () => {
      const res = await fetch(`${BLOG_CALENDAR_API_URL}?limit=100&offset=0`, {
        headers: { Authorization: TYBOT_API_KEY },
      });
      if (!res.ok) throw new Error("Erreur de récupération du calendrier blog");
      const data = await res.json();
      return (data.list || []) as BlogCalendarRecord[];
    },
    enabled,
  });
}

export function useCreateBlogCalendarRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      Titre?: string | null;
      "body blog"?: string | null;
      Keywords?: string | null;
      Domaine?: string | null;
      "Contenue final"?: string | null;
      Validation?: boolean | string | null;
      Image?: BlogCalendarAttachment[] | null;
      CreatedAt?: string;
      Calendrier?: string | null;
    }) => {
      const res = await fetch(BLOG_CALENDAR_API_URL, {
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tybot-blog-calendar"] }),
  });
}

export function useUpdateBlogCalendarRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      Id: number;
      Titre?: string | null;
      "body blog"?: string | null;
      Keywords?: string | null;
      Domaine?: string | null;
      "Contenue final"?: string | null;
      Validation?: boolean | string | null;
      Image?: BlogCalendarAttachment[] | null;
      CreatedAt?: string;
      Calendrier?: string | null;
    }) => {
      const res = await fetch(BLOG_CALENDAR_API_URL, {
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tybot-blog-calendar"] }),
  });
}

export function useDeleteBlogCalendarRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(BLOG_CALENDAR_API_URL, {
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
      return { success: true, id };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tybot-blog-calendar"] }),
  });
}
