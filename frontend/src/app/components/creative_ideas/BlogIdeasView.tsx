import { useState, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  FileText, Plus, Edit3, Trash2, Search,
  RefreshCw, Sparkles, Check, Loader2, Eye,
  Copy, LayoutGrid, List, Image as ImageIcon,
  Tag, Compass, Wand2, Calendar, Globe,
  CheckCircle2, ArrowRight, ExternalLink, Maximize2,
  Upload,
} from "lucide-react";
import { MSButton, SlidePanel } from "../ms/primitives";
import { useToast } from "../../providers/ToastProvider";
import { useImageLightbox } from "../shared/ImageLightboxModal";
import { useTybotUploadMedia } from "../../hooks/useTybotPosts";
import {
  useBlogIdeas,
  useCreateBlogIdea,
  useUpdateBlogIdea,
  useDeleteBlogIdea,
  type BlogIdeaRecord,
} from "../../hooks/useBlogIdeas";

export function isBlogValidated(val: any): boolean {
  if (val === true || val === 1 || val === "1") return true;
  if (typeof val === "string") {
    const s = val.trim().toLowerCase();
    return s === "true" || s === "valide" || s === "validé" || s === "yes";
  }
  return false;
}

export function renderBlogStatusBadge(validation: any) {
  const isValid = isBlogValidated(validation);
  if (isValid) {
    return (
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          padding: "2px 8px",
          borderRadius: 999,
          background: "rgba(34, 197, 94, 0.15)",
          color: "#22C55E",
          border: "1px solid rgba(34, 197, 94, 0.35)",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          backdropFilter: "blur(4px)",
        }}
      >
        <CheckCircle2 size={11} />
        Valide
      </span>
    );
  }
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 500,
        padding: "2px 8px",
        borderRadius: 999,
        background: "rgba(148, 163, 184, 0.12)",
        color: "var(--tx-dim)",
        border: "1px dashed var(--bd)",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        backdropFilter: "blur(4px)",
      }}
    >
      À valider
    </span>
  );
}

const DOMAIN_SUGGESTIONS = [
  "Intelligence Artificielle",
  "Automatisation B2B",
  "Marketing Digital",
  "SaaS & Tech",
  "Productivité",
  "Transformation Digitale",
];

export function BlogIdeasView({
  onAskAgent,
  onNavigate,
}: {
  onAskAgent?: (prompt?: string) => void;
  onNavigate?: (pageId: string) => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const { openLightbox } = useImageLightbox();
  const { data: records, isLoading, isError, refetch, isRefetching } = useBlogIdeas();
  const createM = useCreateBlogIdea();
  const updateM = useUpdateBlogIdea();
  const deleteM = useDeleteBlogIdea();
  const uploadMediaM = useTybotUploadMedia();

  const detailFileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "valide" | "pending">("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Modales & Panels
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<BlogIdeaRecord | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<BlogIdeaRecord | null>(null);
  const [detailRecord, setDetailRecord] = useState<BlogIdeaRecord | null>(null);
  // States pour Webhooks en cours
  const [regeneratingBlogId, setRegeneratingBlogId] = useState<number | null>(null);
  const [generatingImageId, setGeneratingImageId] = useState<number | null>(null);
  const [validatingBlogId, setValidatingBlogId] = useState<number | null>(null);

  // Form State
  const [formTitre, setFormTitre] = useState<string>("");
  const [formBody, setFormBody] = useState<string>("");
  const [formKeywords, setFormKeywords] = useState<string>("");
  const [formDomaine, setFormDomaine] = useState<string>("");

  const openCreate = () => {
    setSelectedRecord(null);
    setFormTitre("");
    setFormBody("");
    setFormKeywords("");
    setFormDomaine("Intelligence Artificielle");
    setModalMode("create");
  };

  const openEdit = (record: BlogIdeaRecord) => {
    setSelectedRecord(record);
    setFormTitre(record.Titre || "");
    setFormBody(record["body blog"] || "");
    setFormKeywords(record.Keywords || "");
    setFormDomaine(record.Domaine || "");
    setModalMode("edit");
  };

  const handleDetailImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !detailRecord) return;

    if (!file.type.startsWith("image/")) {
      toast("Format non supporté", { kind: "error", msg: "Veuillez choisir un fichier image (PNG, JPG, WebP...)." });
      return;
    }

    try {
      setIsUploadingImage(true);
      const res = await uploadMediaM.mutateAsync(file);
      if (!res?.url) {
        throw new Error("L'URL de l'image n'a pas été renvoyée par le serveur.");
      }

      await updateM.mutateAsync({
        Id: detailRecord.Id,
        Image: [{ title: file.name, url: res.url }],
      });

      setDetailRecord((prev) => (prev ? { ...prev, Image: [{ title: file.name, url: res.url }] } : null));
      toast("Image téléversée avec succès !", { kind: "success" });
      qc.invalidateQueries({ queryKey: ["tybot-blog-ideas"] });
    } catch (err: any) {
      toast("Échec de l'upload", { kind: "error", msg: err?.message || "Impossible de téléverser l'image." });
    } finally {
      setIsUploadingImage(false);
      if (detailFileInputRef.current) detailFileInputRef.current.value = "";
    }
  };

  const handleSave = async () => {
    if (!formTitre.trim()) {
      toast("Veuillez renseigner un titre pour l'article", { kind: "error" });
      return;
    }

    try {
      if (modalMode === "create") {
        await createM.mutateAsync({
          Titre: formTitre.trim(),
          "body blog": formBody.trim() || null,
          Keywords: formKeywords.trim() || null,
          Domaine: formDomaine.trim() || null,
        });
        toast("Idée de blog créée avec succès !", { kind: "success" });
      } else if (modalMode === "edit" && selectedRecord) {
        await updateM.mutateAsync({
          Id: selectedRecord.Id,
          Titre: formTitre.trim(),
          "body blog": formBody.trim() || null,
          Keywords: formKeywords.trim() || null,
          Domaine: formDomaine.trim() || null,
        });
        toast("Idée de blog mise à jour avec succès !", { kind: "success" });
      }
      setModalMode(null);
    } catch (err: any) {
      toast("Erreur lors de l'enregistrement", { kind: "error", msg: err?.message });
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteM.mutateAsync(deleteConfirm.Id);
      toast("Idée de blog supprimée !", { kind: "success" });
      if (detailRecord?.Id === deleteConfirm.Id) {
        setDetailRecord(null);
      }
      setDeleteConfirm(null);
    } catch (err: any) {
      toast("Erreur lors de la suppression", { kind: "error", msg: err?.message });
    }
  };

  // 1. Webhook: Régénérer le blog (https://webhook.tybotflow.com/webhook/generate-blog)
  const handleRegenerateBlog = async (record: BlogIdeaRecord) => {
    if (regeneratingBlogId !== null) return;
    setRegeneratingBlogId(record.Id);

    const prevUpdatedAt = record.UpdatedAt || "";
    const prevBody = record["body blog"] || "";

    try {
      const res = await fetch("https://webhook.tybotflow.com/webhook/generate-blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `Erreur serveur HTTP ${res.status}`);
      }

      toast("Régénération du blog lancée", {
        kind: "success",
        msg: "L'IA est en train de réécrire l'article de blog. Veuillez patienter…",
      });

      // Polling de la table ms55cxivzya2wkg pour récupérer l'article mis à jour
      const pollInterval = 2500;
      const maxAttempts = 36; // 90s max
      let updated = false;

      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((r) => setTimeout(r, pollInterval));
        try {
          const checkRes = await fetch("https://api.tybotflow.com/api/v1/smart-db/tables/ms55cxivzya2wkg/records?limit=50&offset=0", {
            headers: { Authorization: "twx_4csaOnT9aItwn08I_107" },
          });
          if (checkRes.ok) {
            const listData = await checkRes.json();
            const rec = (listData.list || []).find((r: any) => r.Id === record.Id);
            if (rec && (rec["body blog"] !== prevBody || (rec.UpdatedAt && rec.UpdatedAt !== prevUpdatedAt))) {
              updated = true;
              if (detailRecord?.Id === record.Id) {
                setDetailRecord(rec);
              }
              break;
            }
          }
        } catch {
          // ignore & continue polling
        }
      }

      await refetch();
      if (updated) {
        toast("Article régénéré avec succès !", { kind: "success", msg: "Le nouveau texte a été enregistré." });
      }
    } catch (err: any) {
      toast("Échec de la régénération", { kind: "error", msg: err?.message || "Erreur lors de la régénération du blog" });
    } finally {
      setRegeneratingBlogId(null);
    }
  };

  // 2. Webhook: Générer l'image du blog (https://webhook.tybotflow.com/webhook/generate_image)
  const handleGenerateImage = async (record: BlogIdeaRecord) => {
    if (generatingImageId !== null) return;
    setGeneratingImageId(record.Id);

    const prevImageUrl = record.Image?.[0]?.url || "";
    const prevUpdatedAt = record.UpdatedAt || "";

    try {
      // Envoi de toutes les infos du blog dans le body
      const res = await fetch("https://webhook.tybotflow.com/webhook/generate_image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `Erreur serveur HTTP ${res.status}`);
      }

      toast("Génération d'image initiée", {
        kind: "success",
        msg: "L'IA crée le visuel du blog. L'aperçu se mettra à jour automatiquement dès réception.",
      });

      // Polling de la table pour récupérer la nouvelle image
      const pollInterval = 2500;
      const maxAttempts = 36; // 90s max
      let newImageFound = false;

      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((r) => setTimeout(r, pollInterval));
        try {
          const checkRes = await fetch("https://api.tybotflow.com/api/v1/smart-db/tables/ms55cxivzya2wkg/records?limit=50&offset=0", {
            headers: { Authorization: "twx_4csaOnT9aItwn08I_107" },
          });
          if (checkRes.ok) {
            const listData = await checkRes.json();
            const rec = (listData.list || []).find((r: any) => r.Id === record.Id);
            const attUrl = rec?.Image?.[0]?.url;
            if (attUrl && (attUrl !== prevImageUrl || (rec.UpdatedAt && rec.UpdatedAt !== prevUpdatedAt))) {
              newImageFound = true;
              if (detailRecord?.Id === record.Id) {
                setDetailRecord(rec);
              }
              break;
            }
          }
        } catch {
          // ignore
        }
      }

      await refetch();
      if (newImageFound) {
        toast("Image générée avec succès !", { kind: "success", msg: "Le visuel a été enregistré dans l'article." });
      }
    } catch (err: any) {
      toast("Échec de la génération d'image", { kind: "error", msg: err?.message || "Erreur lors de la génération" });
    } finally {
      setGeneratingImageId(null);
    }
  };

  // ─── Webhook: Validation du blog vers Calendrier_blog ──────────────────────
  const handleValidateBlog = async (record: BlogIdeaRecord) => {
    if (validatingBlogId !== null) return;
    setValidatingBlogId(record.Id);

    // 1. Mise à jour optimiste en temps réel
    const previousData = qc.getQueryData<BlogIdeaRecord[]>(["tybot-blog-ideas"]);
    qc.setQueryData<BlogIdeaRecord[]>(["tybot-blog-ideas"], (old) => {
      if (!old) return [];
      return old.map((r) => (r.Id === record.Id ? { ...r, Validation: true } : r));
    });

    if (detailRecord && detailRecord.Id === record.Id) {
      setDetailRecord((prev) => (prev ? { ...prev, Validation: true } : null));
    }

    try {
      // 2. Appel au webhook Calendrier_blog
      const webhookPromise = fetch("https://webhook.tybotflow.com/webhook/Calendrier_blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: record.Id,
          Id: record.Id,
          Titre: record.Titre,
          Domaine: record.Domaine,
          Keywords: record.Keywords,
          "body blog": record["body blog"],
          "Contenue final": record["Contenue final"],
          Image: record.Image,
          Validation: true,
          Status: "Valide",
        }),
      });

      // 3. Persistance dans la base de données
      const dbPromise = updateM.mutateAsync({
        Id: record.Id,
        Validation: true,
      }).catch((err) => {
        console.warn("Avertissement persistance DB Blog :", err);
      });

      const [res] = await Promise.all([webhookPromise, dbPromise]);
      if (!res.ok) throw new Error(`Erreur webhook : ${res.status}`);

      toast("Blog validé avec succès !", {
        kind: "success",
        msg: "L'article a été validé et envoyé à Calendrier_blog.",
      });
    } catch (err: any) {
      // Rollback en cas d'erreur
      if (previousData) {
        qc.setQueryData(["tybot-blog-ideas"], previousData);
      }
      if (detailRecord && detailRecord.Id === record.Id) {
        setDetailRecord(record);
      }
      toast(err?.message || "Erreur lors de la validation du blog", { kind: "error" });
    } finally {
      setValidatingBlogId(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast("Texte copié dans le presse-papiers !", { kind: "success" });
  };

  // Liste des domaines disponibles pour filtre
  const availableDomains = useMemo(() => {
    const s = new Set<string>();
    (records || []).forEach((r) => {
      if (r.Domaine?.trim()) s.add(r.Domaine.trim());
    });
    return Array.from(s);
  }, [records]);

  // Filtrage
  const filteredList = useMemo(() => {
    return (records || []).filter((r) => {
      if (domainFilter !== "all" && r.Domaine !== domainFilter) return false;
      const isValid = isBlogValidated(r.Validation);
      if (statusFilter === "valide" && !isValid) return false;
      if (statusFilter === "pending" && isValid) return false;

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const titre = (r.Titre || "").toLowerCase();
      const body = (r["body blog"] || "").toLowerCase();
      const kw = (r.Keywords || "").toLowerCase();
      const dom = (r.Domaine || "").toLowerCase();
      return titre.includes(q) || body.includes(q) || kw.includes(q) || dom.includes(q);
    });
  }, [records, domainFilter, statusFilter, search]);

  const totalWithImage = useMemo(() => {
    return (records || []).filter((r) => !!r.Image?.[0]?.url).length;
  }, [records]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%" }}>
      {/* En-tête */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "linear-gradient(135deg, rgba(236, 72, 153, 0.15), rgba(168, 85, 247, 0.2))",
                color: "#EC4899",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <FileText size={20} />
            </div>
            <h1 style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: 24, color: "var(--tx)", margin: 0 }}>
              Idées & Articles de Blog
            </h1>
            <span style={{ fontSize: 11, fontWeight: 600, background: "rgba(236, 72, 153, 0.15)", color: "#F472B6", padding: "3px 9px", borderRadius: 12 }}>
              Tybot Smart-DB (Blog Ideas)
            </span>
          </div>
          <p style={{ fontSize: 13, color: "var(--tx-dim)", margin: "6px 0 0" }}>
            Générez, personnalisez et planifiez vos articles de blog avec l'IA. Régénérez le contenu ou les images en un clic.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <MSButton
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            icon={<RefreshCw size={14} className={isRefetching ? "animate-spin" : ""} />}
          >
            Actualiser
          </MSButton>
          <MSButton
            variant="primary"
            icon={<Plus size={16} />}
            onClick={openCreate}
            style={{ background: "linear-gradient(135deg, #DB2777, #9333EA)", borderColor: "#DB2777" }}
          >
            Nouvelle Idée de Blog
          </MSButton>
        </div>
      </div>

      {/* Cartes KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        <div style={{ background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 12, padding: "16px 18px", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--tx-dim)" }}>
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>Total Articles</span>
            <FileText size={16} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--tx)", marginTop: 8, fontFamily: "DM Sans, sans-serif" }}>
            {records?.length || 0}
          </div>
          <div style={{ fontSize: 12, color: "var(--tx-dim)", marginTop: 4 }}>
            Articles enregistrés dans la base
          </div>
        </div>

        <div style={{ background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 12, padding: "16px 18px", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--tx-dim)" }}>
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>Avec Image Visuelle</span>
            <ImageIcon size={16} style={{ color: "#EC4899" }} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#EC4899", marginTop: 8, fontFamily: "DM Sans, sans-serif" }}>
            {totalWithImage}
          </div>
          <div style={{ fontSize: 12, color: "var(--tx-dim)", marginTop: 4 }}>
            Articles avec visuels prêts à publier
          </div>
        </div>

        <div style={{ background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 12, padding: "16px 18px", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--tx-dim)" }}>
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>Régénération Webhooks</span>
            <Wand2 size={16} style={{ color: "#A855F7" }} />
          </div>
          <div style={{ fontSize: 13, color: "var(--tx)", marginTop: 8, lineHeight: 1.4 }}>
            Connecté à <b>generate-blog</b> &amp; <b>generate_image</b>.
          </div>
          <div style={{ fontSize: 11.5, color: "var(--tx-dim)", marginTop: 4 }}>
            Mise à jour en temps réel par IA
          </div>
        </div>

        <div style={{ background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 12, padding: "16px 18px", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--tx-dim)" }}>
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>Assistance Agent</span>
            <Sparkles size={16} style={{ color: "#F59E0B" }} />
          </div>
          <div style={{ fontSize: 13, color: "var(--tx)", marginTop: 8, lineHeight: 1.4 }}>
            Générez des plans d'articles ou des listes d'idées SEO.
          </div>
          {onAskAgent && (
            <button
              onClick={() => onAskAgent("Propose-moi 5 sujets d'articles de blog à fort potentiel pour attirer des clients B2B")}
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#EC4899",
                background: "transparent",
                border: "none",
                padding: 0,
                marginTop: 6,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              Demander des sujets <Sparkles size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Barre de Recherche et Filtres */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 280, maxWidth: 600 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--tx-dim)" }} />
            <input
              type="text"
              placeholder="Rechercher un titre, extrait de blog, mot-clé..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "9px 12px 9px 36px",
                borderRadius: 10,
                border: "1px solid var(--bd)",
                background: "var(--surf-card)",
                color: "var(--tx)",
                fontSize: 13,
                outline: "none",
              }}
            />
          </div>

          {availableDomains.length > 0 && (
            <select
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
              style={{
                padding: "9px 12px",
                borderRadius: 10,
                border: "1px solid var(--bd)",
                background: "var(--surf-card)",
                color: "var(--tx)",
                fontSize: 13,
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="all">Tous les domaines</option>
              {availableDomains.map((dom) => (
                <option key={dom} value={dom}>{dom}</option>
              ))}
            </select>
          )}

          {/* Filtre par statut */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            style={{
              padding: "9px 12px",
              borderRadius: 10,
              border: "1px solid var(--bd)",
              background: "var(--surf-card)",
              color: "var(--tx)",
              fontSize: 13,
              outline: "none",
              cursor: "pointer",
            }}
          >
            <option value="all">Tous les statuts ({records?.length || 0})</option>
            <option value="valide">Valides ({records?.filter((r) => isBlogValidated(r.Validation)).length || 0})</option>
            <option value="pending">À valider ({records?.filter((r) => !isBlogValidated(r.Validation)).length || 0})</option>
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setViewMode("grid")}
            style={{
              padding: "7px 11px",
              borderRadius: 8,
              border: "1px solid " + (viewMode === "grid" ? "#EC4899" : "var(--bd)"),
              background: viewMode === "grid" ? "rgba(236, 72, 153, 0.15)" : "var(--surf-card)",
              color: viewMode === "grid" ? "#EC4899" : "var(--tx-dim)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            <LayoutGrid size={14} /> Grille
          </button>
          <button
            onClick={() => setViewMode("table")}
            style={{
              padding: "7px 11px",
              borderRadius: 8,
              border: "1px solid " + (viewMode === "table" ? "#EC4899" : "var(--bd)"),
              background: viewMode === "table" ? "rgba(236, 72, 153, 0.15)" : "var(--surf-card)",
              color: viewMode === "table" ? "#EC4899" : "var(--tx-dim)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            <List size={14} /> Tableau
          </button>
        </div>
      </div>

      {/* État de chargement / Erreur / Liste */}
      {isLoading ? (
        <div style={{ padding: 60, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <Loader2 size={32} className="animate-spin" style={{ color: "#EC4899" }} />
          <div style={{ fontSize: 13, color: "var(--tx-dim)" }}>Chargement des articles de blog…</div>
        </div>
      ) : isError ? (
        <div style={{ padding: 40, textAlign: "center", background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 12 }}>
          <div style={{ color: "#EF4444", fontWeight: 600, fontSize: 14 }}>Erreur de connexion</div>
          <div style={{ fontSize: 12.5, color: "var(--tx-dim)", marginTop: 4 }}>Impossible de charger les données de la table Blog Ideas.</div>
          <MSButton variant="outline" size="sm" onClick={() => refetch()} style={{ marginTop: 12 }}>
            Réessayer
          </MSButton>
        </div>
      ) : filteredList.length === 0 ? (
        <div style={{ padding: 60, textAlign: "center", background: "var(--surf-card)", border: "1px dashed var(--bd)", borderRadius: 14 }}>
          <FileText size={36} style={{ color: "var(--tx-dim)", opacity: 0.5, margin: "0 auto 12px" }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--tx)" }}>Aucun article de blog trouvé</div>
          <div style={{ fontSize: 13, color: "var(--tx-dim)", marginTop: 4, maxWidth: 380, margin: "4px auto 16px" }}>
            {search ? "Aucun enregistrement ne correspond à vos filtres." : "Commencez par ajouter votre première idée d'article de blog."}
          </div>
          <MSButton
            variant="primary"
            icon={<Plus size={15} />}
            onClick={openCreate}
            style={{ background: "linear-gradient(135deg, #DB2777, #9333EA)", borderColor: "#DB2777" }}
          >
            Créer une idée de blog
          </MSButton>
        </div>
      ) : viewMode === "grid" ? (
        /* Grille des cartes */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16 }}>
          {filteredList.map((record) => {
            const hasImg = !!record.Image?.[0]?.url;
            const imgUrl = record.Image?.[0]?.url;
            const isRegenBlog = regeneratingBlogId === record.Id;
            const isGenImg = generatingImageId === record.Id;

            return (
              <div
                key={record.Id}
                style={{
                  background: "var(--surf-card)",
                  border: "1px solid var(--bd)",
                  borderRadius: 14,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
                  position: "relative",
                  transition: "transform .15s ease, border-color .15s ease",
                }}
              >
                {/* Aperçu Visuel / Placeholder */}
                <div
                  style={{
                    position: "relative",
                    height: 160,
                    background: hasImg
                      ? "#000"
                      : "linear-gradient(135deg, rgba(236, 72, 153, 0.12), rgba(168, 85, 247, 0.18))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  {hasImg ? (
                    <>
                      <img
                        src={imgUrl}
                        alt={record.Titre}
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openLightbox(imgUrl, record.Titre || "Article de blog");
                        }}
                        title="Voir l'image en grand format"
                        style={{
                          position: "absolute",
                          bottom: 8,
                          right: 8,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 26,
                          height: 26,
                          borderRadius: 6,
                          background: "rgba(10, 14, 28, 0.82)",
                          backdropFilter: "blur(4px)",
                          border: "1px solid rgba(255, 255, 255, 0.2)",
                          color: "#fff",
                          cursor: "zoom-in",
                          zIndex: 2,
                        }}
                      >
                        <Maximize2 size={13} />
                      </button>
                    </>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: "var(--tx-dim)" }}>
                      <ImageIcon size={32} style={{ opacity: 0.4 }} />
                      <span style={{ fontSize: 11, fontFamily: "JetBrains Mono" }}>SANS IMAGE</span>
                    </div>
                  )}

                  {/* Badges d'état superposés */}
                  <div style={{ position: "absolute", top: 10, left: 10, display: "flex", gap: 6, alignItems: "center" }}>
                    {record.Domaine && (
                      <span style={{ fontSize: 10.5, fontWeight: 600, background: "rgba(0,0,0,0.65)", color: "#fff", backdropFilter: "blur(4px)", padding: "2px 8px", borderRadius: 6 }}>
                        {record.Domaine}
                      </span>
                    )}
                    {renderBlogStatusBadge(record.Validation)}
                  </div>

                  <div style={{ position: "absolute", top: 10, right: 10 }}>
                    <span style={{ fontSize: 10, fontFamily: "JetBrains Mono", background: "rgba(0,0,0,0.65)", color: "var(--tx-3)", padding: "2px 6px", borderRadius: 4 }}>
                      #{record.Id}
                    </span>
                  </div>

                  {/* Overlays pendant régénération */}
                  {isGenImg && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background: "rgba(15, 23, 42, 0.85)",
                        backdropFilter: "blur(4px)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        color: "#fff",
                        zIndex: 10,
                      }}
                    >
                      <Loader2 size={24} className="animate-spin" style={{ color: "#EC4899" }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#F472B6" }}>Génération d'image…</span>
                    </div>
                  )}
                </div>

                {/* Contenu carte */}
                <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: 16, color: "var(--tx)", lineHeight: 1.35 }}>
                      {record.Titre}
                    </div>
                  </div>

                  {record.Keywords && record.Keywords !== record["body blog"] && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Tag size={12} style={{ color: "var(--tx-dim)", flexShrink: 0 }} />
                      <span
                        style={{
                          fontSize: 11.5,
                          color: "var(--tx-dim)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          maxWidth: 280,
                        }}
                        title={record.Keywords}
                      >
                        {record.Keywords.length > 50 ? record.Keywords.slice(0, 50) + "…" : record.Keywords}
                      </span>
                    </div>
                  )}

                  {/* Extrait du contenu TRONQUÉ & RÉDUIT */}
                  <div
                    style={{
                      fontSize: 12.5,
                      color: "var(--tx-2)",
                      lineHeight: 1.5,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxHeight: 38,
                    }}
                  >
                    {record["body blog"] || <span style={{ color: "var(--tx-dim)", fontStyle: "italic" }}>Aucun contenu rédigé pour le moment.</span>}
                  </div>

                  {/* Bouton Lire pour voir l'article complet */}
                  <button
                    type="button"
                    onClick={() => setDetailRecord(record)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--accent)",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: 0,
                      alignSelf: "flex-start",
                      transition: "opacity 0.15s",
                    }}
                    title="Cliquer pour afficher tout l'article"
                  >
                    <Eye size={13} /> Lire l'article complet →
                  </button>

                  {/* Boutons Webhooks IA dédiés */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: "auto", paddingTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => handleRegenerateBlog(record)}
                      disabled={isRegenBlog || isGenImg || validatingBlogId === record.Id}
                      className="ms-btn"
                      title="Régénérer le texte de l'article via le webhook generate-blog"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        padding: "8px 10px",
                        borderRadius: 8,
                        background: "var(--surf-inset)",
                        border: "1px solid var(--bd)",
                        color: "var(--tx)",
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: (isRegenBlog || isGenImg) ? "wait" : "pointer",
                      }}
                    >
                      {isRegenBlog ? (
                        <>
                          <Loader2 size={13} className="animate-spin" />
                          <span>Rédaction…</span>
                        </>
                      ) : (
                        <>
                          <Wand2 size={13} style={{ color: "var(--accent)" }} />
                          <span>Régénérer blog</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleGenerateImage(record)}
                      disabled={isRegenBlog || isGenImg || validatingBlogId === record.Id}
                      className="ms-btn"
                      title="Générer l'image du blog via le webhook generate_image"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        padding: "8px 10px",
                        borderRadius: 8,
                        background: "rgba(236, 72, 153, 0.12)",
                        border: "1px solid rgba(236, 72, 153, 0.35)",
                        color: "#F472B6",
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: (isRegenBlog || isGenImg) ? "wait" : "pointer",
                      }}
                    >
                      {isGenImg ? (
                        <>
                          <Loader2 size={13} className="animate-spin" />
                          <span>Création…</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={13} />
                          <span>Générer image</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Actions CRUD Footer avec bouton Valider */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--bd)", paddingTop: 10, marginTop: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <MSButton variant="ghost" size="sm" onClick={() => setDetailRecord(record)} icon={<Eye size={13} />}>
                        Lire
                      </MSButton>

                      {/* Bouton Valider Calendrier_blog */}
                      {(() => {
                        const isValid = isBlogValidated(record.Validation);
                        const isValidating = validatingBlogId === record.Id;
                        return (
                          <button
                            type="button"
                            onClick={() => handleValidateBlog(record)}
                            disabled={isValidating || isRegenBlog || isGenImg}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              padding: "5px 10px",
                              borderRadius: 7,
                              background: isValid ? "rgba(34, 197, 94, 0.12)" : "linear-gradient(135deg, #22C55E, #16A34A)",
                              border: isValid ? "1px solid rgba(34, 197, 94, 0.35)" : "none",
                              color: isValid ? "#22C55E" : "#fff",
                              fontSize: 11.5,
                              fontWeight: 600,
                              cursor: isValidating ? "wait" : "pointer",
                              transition: "all 0.15s ease",
                            }}
                            title={isValid ? "Article validé. Cliquez pour renvoyer au calendrier." : "Valider cet article (Calendrier_blog)"}
                          >
                            {isValidating ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <CheckCircle2 size={12} />
                            )}
                            {isValidating ? "Validation…" : isValid ? "Validé ✓" : "Valider"}
                          </button>
                        );
                      })()}
                    </div>

                    <div style={{ display: "flex", gap: 6 }}>
                      <MSButton variant="outline" size="sm" onClick={() => openEdit(record)} icon={<Edit3 size={13} />}>
                        Modifier
                      </MSButton>
                      <MSButton variant="outline" size="sm" danger onClick={() => setDeleteConfirm(record)} icon={<Trash2 size={13} />}>
                        Supprimer
                      </MSButton>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Tableau */
        <div style={{ background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 14, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--surf-inset)", borderBottom: "1px solid var(--bd)", color: "var(--tx-dim)", fontSize: 11.5, textTransform: "uppercase" }}>
                <th style={{ padding: "12px 16px" }}>Visuel</th>
                <th style={{ padding: "12px 16px" }}>Titre de l'article</th>
                <th style={{ padding: "12px 16px" }}>Domaine &amp; Mots-clés</th>
                <th style={{ padding: "12px 16px" }}>Statut</th>
                <th style={{ padding: "12px 16px" }}>Actions IA</th>
                <th style={{ padding: "12px 16px", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.map((record) => {
                const hasImg = !!record.Image?.[0]?.url;
                const isRegenBlog = regeneratingBlogId === record.Id;
                const isGenImg = generatingImageId === record.Id;
                const isValid = isBlogValidated(record.Validation);
                const isValidating = validatingBlogId === record.Id;

                return (
                  <tr key={record.Id} style={{ borderBottom: "1px solid var(--bd-weak)", transition: "background .15s" }}>
                    <td style={{ padding: "12px 16px", width: 60 }}>
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 8,
                          overflow: "hidden",
                          background: "var(--surf-inset)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: hasImg ? "zoom-in" : "default",
                        }}
                        onClick={(e) => {
                          if (hasImg) {
                            e.stopPropagation();
                            openLightbox(record.Image![0].url, record.Titre || "Article de blog");
                          }
                        }}
                        title={hasImg ? "Cliquer pour afficher l'image complète" : undefined}
                      >
                        {hasImg ? (
                          <img src={record.Image![0].url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <ImageIcon size={18} style={{ color: "var(--tx-dim)" }} />
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", maxWidth: 300 }}>
                      <div style={{ fontWeight: 600, color: "var(--tx)" }}>{record.Titre}</div>
                      <div style={{ fontSize: 11, color: "var(--tx-dim)", fontFamily: "JetBrains Mono" }}>ID #{record.Id}</div>
                    </td>
                    <td style={{ padding: "12px 16px", maxWidth: 220 }}>
                      {record.Domaine && (
                        <div style={{ fontSize: 11.5, fontWeight: 600, color: "#EC4899", marginBottom: 2 }}>
                          {record.Domaine}
                        </div>
                      )}
                      <div style={{ fontSize: 11.5, color: "var(--tx-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>
                        {record.Keywords || "-"}
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {renderBlogStatusBadge(record.Validation)}
                    </td>
                    <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => handleRegenerateBlog(record)}
                          disabled={isRegenBlog || isGenImg || isValidating}
                          style={{
                            padding: "5px 9px",
                            borderRadius: 6,
                            background: "var(--surf-inset)",
                            border: "1px solid var(--bd)",
                            color: "var(--tx)",
                            fontSize: 11.5,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          {isRegenBlog ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                          <span>Régénérer</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleGenerateImage(record)}
                          disabled={isRegenBlog || isGenImg || isValidating}
                          style={{
                            padding: "5px 9px",
                            borderRadius: 6,
                            background: "rgba(236, 72, 153, 0.12)",
                            border: "1px solid rgba(236, 72, 153, 0.3)",
                            color: "#F472B6",
                            fontSize: 11.5,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          {isGenImg ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                          <span>Image</span>
                        </button>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <button
                          type="button"
                          onClick={() => handleValidateBlog(record)}
                          disabled={isValidating || isRegenBlog || isGenImg}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "5px 8px",
                            borderRadius: 6,
                            background: isValid ? "rgba(34, 197, 94, 0.12)" : "linear-gradient(135deg, #22C55E, #16A34A)",
                            border: isValid ? "1px solid rgba(34, 197, 94, 0.35)" : "none",
                            color: isValid ? "#22C55E" : "#fff",
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: isValidating ? "wait" : "pointer",
                          }}
                          title={isValid ? "Article validé." : "Valider cet article (Calendrier_blog)"}
                        >
                          {isValidating ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                          {isValidating ? "…" : isValid ? "Validé" : "Valider"}
                        </button>
                        <MSButton variant="ghost" size="sm" onClick={() => setDetailRecord(record)} icon={<Eye size={13} />} />
                        <MSButton variant="outline" size="sm" onClick={() => openEdit(record)} icon={<Edit3 size={13} />} />
                        <MSButton variant="outline" size="sm" danger onClick={() => setDeleteConfirm(record)} icon={<Trash2 size={13} />} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Création / Édition */}
      {modalMode && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(5px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setModalMode(null)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 620,
              background: "var(--surf-pop)",
              border: "1px solid var(--bd)",
              borderRadius: 16,
              padding: 24,
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              maxHeight: "90vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--bd)", paddingBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <FileText size={20} style={{ color: "#EC4899" }} />
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--tx)", margin: 0, fontFamily: "DM Sans, sans-serif" }}>
                  {modalMode === "create" ? "Nouvelle Idée de Blog" : "Modifier l'Article de Blog"}
                </h3>
              </div>
              <button
                onClick={() => setModalMode(null)}
                style={{ background: "transparent", border: "none", color: "var(--tx-dim)", cursor: "pointer", fontSize: 18 }}
              >
                ✕
              </button>
            </div>

            {/* Titre */}
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase", marginBottom: 6 }}>
                Titre de l'Article *
              </label>
              <input
                type="text"
                placeholder="Ex: Comment l'automatisation transforme la gestion des réseaux sociaux"
                value={formTitre}
                onChange={(e) => setFormTitre(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--bd)",
                  background: "var(--surf-2)",
                  color: "var(--tx)",
                  fontSize: 13.5,
                  fontWeight: 600,
                  outline: "none",
                }}
              />
            </div>

            {/* Domaine & Mots-clés */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase", marginBottom: 6 }}>
                  Domaine / Thématique
                </label>
                <input
                  type="text"
                  placeholder="Ex: Intelligence Artificielle"
                  value={formDomaine}
                  onChange={(e) => setFormDomaine(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--bd)",
                    background: "var(--surf-2)",
                    color: "var(--tx)",
                    fontSize: 13,
                    outline: "none",
                    marginBottom: 6,
                  }}
                />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {DOMAIN_SUGGESTIONS.slice(0, 3).map((dom) => (
                    <button
                      key={dom}
                      type="button"
                      onClick={() => setFormDomaine(dom)}
                      style={{
                        padding: "2px 6px",
                        borderRadius: 4,
                        fontSize: 10.5,
                        background: "var(--surf-inset)",
                        border: "1px solid var(--bd)",
                        color: "var(--tx-2)",
                        cursor: "pointer",
                      }}
                    >
                      {dom}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase", marginBottom: 6 }}>
                  Mots-clés (SEO)
                </label>
                <input
                  type="text"
                  placeholder="Ex: IA, automatisation, productivité..."
                  value={formKeywords}
                  onChange={(e) => setFormKeywords(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--bd)",
                    background: "var(--surf-2)",
                    color: "var(--tx)",
                    fontSize: 13,
                    outline: "none",
                  }}
                />
              </div>
            </div>

            {/* Contenu / Body */}
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase", marginBottom: 6 }}>
                Contenu de l'Article (Markdown / Texte)
              </label>
              <textarea
                rows={8}
                placeholder="Rédigez ou collez ici le corps de l'article de blog..."
                value={formBody}
                onChange={(e) => setFormBody(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--bd)",
                  background: "var(--surf-2)",
                  color: "var(--tx)",
                  fontSize: 13,
                  lineHeight: 1.55,
                  outline: "none",
                  resize: "vertical",
                }}
              />
            </div>

            {/* Footer Modal */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", borderTop: "1px solid var(--bd)", paddingTop: 14 }}>
              <MSButton variant="outline" onClick={() => setModalMode(null)}>
                Annuler
              </MSButton>
              <MSButton
                variant="primary"
                onClick={handleSave}
                disabled={createM.isPending || updateM.isPending}
                icon={createM.isPending || updateM.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                style={{ background: "linear-gradient(135deg, #DB2777, #9333EA)", borderColor: "#DB2777" }}
              >
                {modalMode === "create" ? "Créer l'article" : "Enregistrer les modifications"}
              </MSButton>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmation de Suppression */}
      {deleteConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 210,
            background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 440,
              background: "var(--surf-pop)",
              border: "1px solid var(--bd)",
              borderRadius: 14,
              padding: 22,
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ color: "#EF4444", marginBottom: 12 }}>
              <Trash2 size={24} />
            </div>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: 17, color: "var(--tx)", marginBottom: 6 }}>
              Supprimer cet article de blog ?
            </div>
            <div style={{ fontSize: 13, color: "var(--tx-dim)", lineHeight: 1.5, marginBottom: 20 }}>
              « {deleteConfirm.Titre} » (#{deleteConfirm.Id}) sera définitivement retiré de la base Tybot Smart-DB.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <MSButton variant="outline" onClick={() => setDeleteConfirm(null)}>
                Annuler
              </MSButton>
              <MSButton
                variant="primary"
                danger
                onClick={handleDelete}
                disabled={deleteM.isPending}
                icon={deleteM.isPending ? <Loader2 size={14} className="animate-spin" /> : undefined}
                style={{ background: "#EF4444", borderColor: "#EF4444", color: "#fff" }}
              >
                Confirmer la suppression
              </MSButton>
            </div>
          </div>
        </div>
      )}

      {/* SlidePanel de Lecture Complète */}
      <SlidePanel open={!!detailRecord} onClose={() => setDetailRecord(null)} width={540}>
        {detailRecord && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--surf-card)" }}>
            {/* Image Header du SlidePanel */}
            <div
              style={{
                position: "relative",
                height: 200,
                background: detailRecord.Image?.[0]?.url
                  ? "#000"
                  : "linear-gradient(135deg, rgba(236, 72, 153, 0.2), rgba(168, 85, 247, 0.25))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                borderBottom: "1px solid var(--bd)",
              }}
            >
              {detailRecord.Image?.[0]?.url ? (
                <div
                  style={{ position: "relative", width: "100%", height: "100%", cursor: "zoom-in" }}
                  onClick={() => openLightbox(detailRecord.Image![0].url, detailRecord.Titre || "Visuel du blog")}
                  title="Cliquer pour afficher l'image complète"
                >
                  <img
                    src={detailRecord.Image[0].url}
                    alt={detailRecord.Titre}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      bottom: 12,
                      right: 12,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 12px",
                      borderRadius: 20,
                      background: "rgba(10, 14, 28, 0.85)",
                      backdropFilter: "blur(6px)",
                      border: "1px solid rgba(255, 255, 255, 0.25)",
                      color: "#FFFFFF",
                      fontSize: 11.5,
                      fontWeight: 600,
                      boxShadow: "0 6px 16px rgba(0,0,0,0.4)",
                    }}
                  >
                    <Maximize2 size={13} style={{ color: "#EC4899" }} />
                    Voir en grand
                  </div>
                </div>
              ) : (
                <div
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: "var(--tx-dim)", cursor: "pointer" }}
                  onClick={() => detailFileInputRef.current?.click()}
                  title="Cliquer pour téléverser une image"
                >
                  <ImageIcon size={36} style={{ opacity: 0.4 }} />
                  <span style={{ fontSize: 11, fontFamily: "JetBrains Mono" }}>AUCUNE IMAGE · CLIQUER POUR UPLOADER</span>
                </div>
              )}

              {/* Spinner pendant l'upload */}
              {isUploadingImage && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(10, 14, 28, 0.85)",
                    backdropFilter: "blur(4px)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    color: "#fff",
                    zIndex: 10,
                  }}
                >
                  <Loader2 size={28} className="animate-spin" style={{ color: "#60A5FA" }} />
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "#93C5FD" }}>Téléversement de l'image…</span>
                </div>
              )}

              {/* Bouton fermer */}
              <button
                onClick={() => setDetailRecord(null)}
                style={{
                  position: "absolute",
                  top: 14,
                  right: 14,
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: "rgba(0,0,0,0.65)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  backdropFilter: "blur(4px)",
                  zIndex: 11,
                }}
              >
                ✕
              </button>

              {/* Badges d'état */}
              {detailRecord.Domaine && (
                <span style={{ position: "absolute", bottom: 12, left: 16, background: "rgba(0,0,0,0.75)", color: "#fff", backdropFilter: "blur(4px)", padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, zIndex: 5 }}>
                  {detailRecord.Domaine}
                </span>
              )}
            </div>

            {/* Hidden file input pour l'upload d'image */}
            <input
              ref={detailFileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleDetailImageUpload}
            />

            {/* Actions Webhook & Upload sous l'image */}
            <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--bd)", background: "var(--surf-inset)", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <button
                type="button"
                onClick={() => handleRegenerateBlog(detailRecord)}
                disabled={regeneratingBlogId === detailRecord.Id || generatingImageId === detailRecord.Id || validatingBlogId === detailRecord.Id || isUploadingImage}
                className="ms-btn"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "9px 6px",
                  borderRadius: 8,
                  background: "var(--surf-card)",
                  border: "1px solid var(--bd)",
                  color: "var(--tx)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: (regeneratingBlogId === detailRecord.Id || generatingImageId === detailRecord.Id || isUploadingImage) ? "wait" : "pointer",
                }}
              >
                {regeneratingBlogId === detailRecord.Id ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span style={{ whiteSpace: "nowrap" }}>Régénération…</span>
                  </>
                ) : (
                  <>
                    <Wand2 size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />
                    <span style={{ whiteSpace: "nowrap" }}>Régénérer</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleGenerateImage(detailRecord)}
                disabled={regeneratingBlogId === detailRecord.Id || generatingImageId === detailRecord.Id || validatingBlogId === detailRecord.Id || isUploadingImage}
                className="ms-btn"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "9px 6px",
                  borderRadius: 8,
                  background: "rgba(236, 72, 153, 0.15)",
                  border: "1px solid rgba(236, 72, 153, 0.4)",
                  color: "#F472B6",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: (regeneratingBlogId === detailRecord.Id || generatingImageId === detailRecord.Id || isUploadingImage) ? "wait" : "pointer",
                }}
              >
                {generatingImageId === detailRecord.Id ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span style={{ whiteSpace: "nowrap" }}>Création…</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={13} style={{ flexShrink: 0 }} />
                    <span style={{ whiteSpace: "nowrap" }}>Générer</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => detailFileInputRef.current?.click()}
                disabled={regeneratingBlogId === detailRecord.Id || generatingImageId === detailRecord.Id || validatingBlogId === detailRecord.Id || isUploadingImage}
                className="ms-btn"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "9px 6px",
                  borderRadius: 8,
                  background: "rgba(59, 130, 246, 0.15)",
                  border: "1px solid rgba(59, 130, 246, 0.4)",
                  color: "#60A5FA",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: isUploadingImage ? "wait" : "pointer",
                }}
                title="Téléverser une image personnalisée pour cet article"
              >
                {isUploadingImage ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span style={{ whiteSpace: "nowrap" }}>Upload…</span>
                  </>
                ) : (
                  <>
                    <Upload size={13} style={{ flexShrink: 0 }} />
                    <span style={{ whiteSpace: "nowrap" }}>Uploader</span>
                  </>
                )}
              </button>
            </div>

            {/* Corps du texte défilant */}
            <div style={{ flex: 1, overflowY: "auto", padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <h2 style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: 20, color: "var(--tx)", margin: 0, lineHeight: 1.35 }}>
                  {detailRecord.Titre}
                </h2>
                <div style={{ fontSize: 11.5, color: "var(--tx-dim)", marginTop: 6, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span>ID #{detailRecord.Id}</span>
                  {renderBlogStatusBadge(detailRecord.Validation)}
                  {detailRecord.CreatedAt && <span>Créé le {new Date(detailRecord.CreatedAt).toLocaleDateString("fr-FR")}</span>}
                </div>
              </div>

              {detailRecord.Keywords && detailRecord.Keywords !== detailRecord["body blog"] && detailRecord.Keywords.length < 200 && (
                <div style={{ background: "var(--surf-2)", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--bd)" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#EC4899", textTransform: "uppercase", marginBottom: 3 }}>
                    Mots-clés SEO
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--tx)" }}>
                    {detailRecord.Keywords}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                  Corps de l'Article
                </span>
                {detailRecord["body blog"] && (
                  <button
                    onClick={() => copyToClipboard(detailRecord["body blog"] || "")}
                    style={{ background: "transparent", border: "none", color: "#EC4899", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600 }}
                  >
                    <Copy size={13} /> Copier l'article
                  </button>
                )}
              </div>

              <div
                style={{
                  fontSize: 14,
                  color: "var(--tx-2)",
                  lineHeight: 1.7,
                  whiteSpace: "pre-wrap",
                  background: "var(--surf-inset)",
                  padding: 18,
                  borderRadius: 12,
                  border: "1px solid var(--bd)",
                }}
              >
                {detailRecord["body blog"] || "Aucun contenu n'a encore été généré pour cet article. Cliquez sur 'Régénérer le blog' pour lancer la rédaction IA."}
              </div>
            </div>

            {/* Footer du panneau avec bouton Valider */}
            <div style={{ padding: "14px 20px", borderTop: "1px solid var(--bd)", background: "var(--surf-card)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <MSButton
                variant="outline"
                danger
                onClick={() => setDeleteConfirm(detailRecord)}
                icon={<Trash2 size={14} />}
              >
                Supprimer
              </MSButton>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {(() => {
                  const isDetailValid = isBlogValidated(detailRecord.Validation);
                  const isDetailValidating = validatingBlogId === detailRecord.Id;
                  return (
                    <MSButton
                      variant="secondary"
                      onClick={() => handleValidateBlog(detailRecord)}
                      disabled={isDetailValidating}
                      icon={isDetailValidating ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                      style={{
                        background: isDetailValidating ? undefined : isDetailValid ? "rgba(34, 197, 94, 0.15)" : "linear-gradient(135deg, #22C55E, #16A34A)",
                        color: isDetailValid ? "#22C55E" : "#fff",
                        border: isDetailValid ? "1px solid rgba(34, 197, 94, 0.4)" : "none",
                      }}
                      title={isDetailValid ? "Article validé. Cliquez pour renvoyer au calendrier_blog." : "Valider cet article (Calendrier_blog)"}
                    >
                      {isDetailValidating ? "Validation en cours…" : isDetailValid ? "Article validé ✓" : "Valider l'article"}
                    </MSButton>
                  );
                })()}

                <MSButton
                  variant="outline"
                  onClick={() => openEdit(detailRecord)}
                  icon={<Edit3 size={14} />}
                >
                  Modifier
                </MSButton>
                <MSButton
                  variant="primary"
                  onClick={() => setDetailRecord(null)}
                >
                  Fermer
                </MSButton>
              </div>
            </div>
          </div>
        )}
      </SlidePanel>
    </div>
  );
}
