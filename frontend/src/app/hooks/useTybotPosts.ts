import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const TYBOT_API_URL = "https://api.tybotflow.com/api/v1/smart-db/tables/mdozr119ylgl8tk/records";
const TYBOT_API_KEY = "twx_4csaOnT9aItwn08I_107";
// Hook to obtain a presigned URL for uploading a media file to Tybot storage
export function useTybotPresignedUrl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const body = JSON.stringify({ filename: file.name, mimetype: file.type });
      const res = await fetch("https://api.tybotflow.com/api/v1/smart-db/storage/presigned-url", {
        method: "POST",
        headers: {
          Authorization: TYBOT_API_KEY,
          "Content-Type": "application/json",
        },
        body,
      });
      if (!res.ok) throw new Error("Failed to obtain presigned URL for Tybot upload");
      const data = await res.json();
      return { uploadUrl: data.presignedURL as string, fileUrl: data.url as string | undefined };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tybot-presigned"] }),
  });
}

// Hook to upload media directly to Tybot domain storage (SocialMediaCalendrier)
export function useTybotUploadMedia() {
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file, file.name || "image.png");
      form.append("folderPath", "SocialMediaCalendrier");

      const response = await fetch(
        "https://api.tybotflow.com/api/v1/domains/tython/upload",
        {
          method: "POST",
          headers: {
            accept: "application/json, text/plain, */*",
            authorization: "twx_a2M4Apun3owMt-Eu_107",
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
        raw: responseData,
        fileName: file.name,
      };
    },
  });
}

export interface TybotPost {
  Id: number;
  CreatedAt: string;
  UpdatedAt: string;
  Calendar?: string;
  "Publishing date": string;
  "Post type"?: string;
  "Creative type"?: string;
  "Strategic objectives"?: string;
  "Content themes"?: string;
  Channels?: string;
  Language?: string;
  "Generated description"?: string;
  "Generated Hashtags"?: string;
  Improvement?: string | null;
  "Creative(Source)"?: string;
  "Generated idea"?: string;
  "Creative (Attachment)"?: { url: string; title: string; id: string }[];
  Statut?: string;
  "Content crea"?: string;
}

export function useTybotPosts(enabled: boolean = true) {
  return useQuery({
    queryKey: ["tybot-posts"],
    queryFn: async () => {
      const res = await fetch(`${TYBOT_API_URL}?limit=50&offset=0`, {
        headers: { Authorization: TYBOT_API_KEY },
      });
      if (!res.ok) throw new Error("Erreur de récupération des posts Tybot");
      const data = await res.json();
      return (data.list || []) as TybotPost[];
    },
    enabled,
  });
}

export function useCreateTybotPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (postData: Partial<TybotPost>) => {
      const res = await fetch(TYBOT_API_URL, {
        method: "POST",
        headers: {
          Authorization: TYBOT_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(postData),
      });
      if (!res.ok) throw new Error("Erreur lors de la création du post Tybot");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tybot-posts"] }),
  });
}

export function useDeleteTybotPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(TYBOT_API_URL, {
        method: "DELETE",
        headers: {
          Authorization: TYBOT_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ Id: id }),
      });
      if (!res.ok) throw new Error("Erreur lors de la suppression du post Tybot");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tybot-posts"] }),
  });
}

export function useUpdateTybotPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { Id: number; [key: string]: unknown }) => {
      const res = await fetch(TYBOT_API_URL, {
        method: "PATCH",
        headers: {
          Authorization: TYBOT_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Erreur lors de la mise à jour du post Tybot");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tybot-posts"] }),
  });
}
