import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const TYBOT_SETTINGS_API_URL = "https://api.tybotflow.com/api/v1/smart-db/tables/mtdeh2vguowgflu/records";
const TYBOT_API_KEY = "twx_4csaOnT9aItwn08I_107";
const TYBOT_UPLOAD_KEY = "twx_a2M4Apun3owMt-Eu_107";

export interface TybotAttachmentItem {
  id?: string;
  url: string;
  title?: string;
}

export interface TybotSettingRecord {
  Id: number;
  CreatedAt?: string;
  UpdatedAt?: string;
  "About Brand"?: string;
  Channels?: string;
  "Content Themes"?: string;
  "Strategic objectives"?: string;
  "Publishing frequency"?: number;
  "Stories Frequency"?: number;
  Language?: string;
  Status?: string;
  "Creative type"?: string;
  Logo?: TybotAttachmentItem[];
  "Design Inspiration"?: string | TybotAttachmentItem[];
  "Social Media Strategy (Details)"?: string | null;
  "SM Links"?: string;
}

export function useTybotSettings(enabled: boolean = true) {
  return useQuery({
    queryKey: ["tybot-settings"],
    queryFn: async () => {
      const res = await fetch(`${TYBOT_SETTINGS_API_URL}?limit=50&offset=0`, {
        headers: { Authorization: TYBOT_API_KEY },
      });
      if (!res.ok) throw new Error("Erreur de récupération des paramètres Tybot");
      const data = await res.json();
      return (data.list || []) as TybotSettingRecord[];
    },
    enabled,
  });
}

export function useCreateTybotSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<TybotSettingRecord>) => {
      const res = await fetch(TYBOT_SETTINGS_API_URL, {
        method: "POST",
        headers: {
          Authorization: TYBOT_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Erreur lors de la création des paramètres: ${errText}`);
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tybot-settings"] }),
  });
}

export function useUpdateTybotSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { Id: number; [key: string]: unknown }) => {
      const res = await fetch(TYBOT_SETTINGS_API_URL, {
        method: "PATCH",
        headers: {
          Authorization: TYBOT_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Erreur lors de la mise à jour: ${errText}`);
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tybot-settings"] }),
  });
}

export function useDeleteTybotSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(TYBOT_SETTINGS_API_URL, {
        method: "DELETE",
        headers: {
          Authorization: TYBOT_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ Id: id }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Erreur lors de la suppression: ${errText}`);
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tybot-settings"] }),
  });
}

// Hook d'upload de fichiers (Logos, inspirations, etc.)
export function useTybotSettingUpload() {
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file, file.name || "logo.png");
      form.append("folderPath", "SocialMediaCalendrier");

      const response = await fetch(
        "https://api.tybotflow.com/api/v1/domains/tython/upload",
        {
          method: "POST",
          headers: {
            accept: "application/json, text/plain, */*",
            authorization: TYBOT_UPLOAD_KEY,
          },
          body: form,
        }
      );

      const responseText = await response.text();
      let responseData: any;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { rawResponse: responseText };
      }

      if (!response.ok) {
        throw new Error(
          `Upload failed (${response.status}): ${JSON.stringify(responseData)}`
        );
      }

      const uploadedUrl: string =
        responseData.url ||
        responseData.fileUrl ||
        responseData.publicUrl ||
        responseData.presignedURL ||
        responseData.path ||
        responseData.data?.url ||
        responseData.data?.fileUrl ||
        responseData.response?.url ||
        (Array.isArray(responseData) && responseData[0]?.url) ||
        (typeof responseData === "string" ? responseData : "");

      return {
        url: uploadedUrl,
        title: file.name,
      };
    },
  });
}
