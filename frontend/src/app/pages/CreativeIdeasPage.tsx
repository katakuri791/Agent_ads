import { useEffect, useMemo, useState } from "react";
import {
  Lightbulb,
  Search,
  Sparkles,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  Calendar,
  Share2,
  Video,
  FileText,
  Layers,
  LayoutGrid,
  List,
  Filter,
  ArrowRight,
  Info,
  CheckCircle2,
  Plus,
  Edit2,
  Trash2,
  X,
  Target,
  Bookmark,
  Globe2,
  Loader2,
  Zap,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { api, type CreativeIdea } from "../lib/api";
import { Card, MSButton, SearchBar, SlidePanel, Tabs } from "../components/ms/primitives";
import { useToast } from "../providers/ToastProvider";
import { BlogIdeasView } from "../components/creative_ideas/BlogIdeasView";

interface CreativeIdeasPageProps {
  onAskAgent?: (prompt?: string) => void;
  onNavigate?: (pageId: string) => void;
  initialTab?: "Réseaux Sociaux" | "Blog";
}

// ─── Options fournies pour les champs du formulaire ──────────────────────────
const AVAILABLE_CHANNELS = ["Facebook", "Instagram", "Linkedin", "Youtube", "X", "All"] as const;

const AVAILABLE_LANGUAGES = ["Français", "Anglais", "Darija marocaine", "Arabe"] as const;

const POST_TYPES = ["Publication", "Story"] as const;

const STRATEGIC_OBJECTIVES = [
  "Interaction communautaire",
  "Promotion",
  "Recrutement",
  "Humanisation",
  "Crédibilité / Autorité",
  "Éducation",
  "Fidélisation",
  "Conversion",
  "Engagement",
  "Attraction / Notoriété",
] as const;

const CONTENT_THEMES = [
  "Actualité de secteur",
  "Actualité de la marque",
  "UGC / Contenu généré par les clients",
  "Éducation / Pédagogie",
  "Engagement / Question au public",
  "Données / Chiffres marquants",
  "Focus produit / service",
  "Célébrations / Dates clés",
  "Témoignages / Avis Clients",
  "Coulisses / Vie d’équipe",
  "Conseils & Astuces",
] as const;

const CREATIVE_TYPES = [
  "Montage video",
  "Image fixe",
  "Carrousel",
  "Reel / Short",
  "Story",
  "Motion design",
  "Infographie",
  "Autre",
] as const;

interface IdeaFormState {
  Calendar: string;
  Channels: string[];
  "Creative type": string;
  "Generated idea": string;
  "Post Language": string[];
  "Post type": string;
  "Strategic objectives": string;
  "Content themes": string;
  Status: string;
}

const DEFAULT_FORM: IdeaFormState = {
  Calendar: "",
  Channels: ["Facebook", "Instagram"],
  "Creative type": "Montage video",
  "Generated idea": "",
  "Post Language": ["Français"],
  "Post type": "Publication",
  "Strategic objectives": "Interaction communautaire",
  "Content themes": "Conseils & Astuces",
  Status: "",
};

function renderStatusBadge(status?: string | null) {
  const norm = (status || "").trim().toLowerCase();
  if (norm === "valide") {
    return (
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          padding: "2px 8px",
          borderRadius: 999,
          background: "rgba(34, 197, 94, 0.12)",
          color: "#22C55E",
          border: "1px solid rgba(34, 197, 94, 0.3)",
        }}
      >
        Valide
      </span>
    );
  }
  if (norm === "invalide") {
    return (
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          padding: "2px 8px",
          borderRadius: 999,
          background: "rgba(239, 68, 68, 0.12)",
          color: "#EF4444",
          border: "1px solid rgba(239, 68, 68, 0.3)",
        }}
      >
        Invalide
      </span>
    );
  }
  if (status && status.trim()) {
    return (
      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          padding: "2px 8px",
          borderRadius: 999,
          background: "var(--surf-1)",
          color: "var(--tx-dim)",
          border: "1px solid var(--bd)",
        }}
      >
        {status}
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
        background: "rgba(148, 163, 184, 0.1)",
        color: "var(--tx-dim)",
        border: "1px dashed var(--bd)",
      }}
    >
      À valider
    </span>
  );
}

export function CreativeIdeasPage({ onAskAgent, onNavigate, initialTab = "Réseaux Sociaux" }: CreativeIdeasPageProps) {
  const toast = useToast();
  const [mainTab, setMainTab] = useState<"Réseaux Sociaux" | "Blog">(() => {
    const urlTab = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;
    if (urlTab?.toLowerCase() === "blog") return "Blog";
    return initialTab;
  });
  const [ideas, setIdeas] = useState<CreativeIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtres et recherche
  const [search, setSearch] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  // Détail sélectionné pour le SlidePanel
  const [selectedIdea, setSelectedIdea] = useState<CreativeIdea | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Modal / Tiroir de Création / Édition
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingIdea, setEditingIdea] = useState<CreativeIdea | null>(null);
  const [formState, setFormState] = useState<IdeaFormState>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Confirmation de suppression
  const [deletingIdea, setDeletingIdea] = useState<CreativeIdea | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Régénération d'idée via webhook
  const [regenerating, setRegenerating] = useState(false);
  const [regeneratingStep, setRegeneratingStep] = useState<string>("");

  // Validation de l'idée vers le webhook Calendrier
  const [validatingId, setValidatingId] = useState<number | null>(null);
  const validating = validatingId !== null;

  // Génération d'idées via webhook
  const [generatingIdeas, setGeneratingIdeas] = useState(false);

  // ─── Webhook: Générer des idées créatives (https://webhook.tybotflow.com/webhook/creative_idea) ────
  const handleGenerateIdeas = async () => {
    if (generatingIdeas) return;
    setGeneratingIdeas(true);
    try {
      const res = await fetch("https://webhook.tybotflow.com/webhook/creative_idea", {
        method: "GET",
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `Erreur serveur HTTP ${res.status}`);
      }
      toast("Génération d'idées lancée", {
        kind: "success",
        msg: "L'IA génère de nouvelles idées créatives. La liste va se rafraîchir dès qu'elles seront prêtes.",
      });

      // Polling : vérifier l'arrivée de nouvelles idées (jusqu'à 90s)
      const prevCount = ideas.length;
      const pollInterval = 3000;
      const maxAttempts = 30;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((r) => setTimeout(r, pollInterval));
        try {
          const checkRes = await api.getCreativeIdeas(100, 0);
          const newCount = (checkRes.list || []).length;
          if (newCount > prevCount) {
            setIdeas(checkRes.list || []);
            toast("Nouvelles idées créatives disponibles !", {
              kind: "success",
              msg: `${newCount - prevCount} nouvelle(s) idée(s) ajoutée(s) par l'IA.`,
            });
            return;
          }
        } catch {
          // Ignorer les erreurs temporaires lors du polling
        }
      }
      await fetchIdeas(true);
    } catch (err: any) {
      toast("Échec de la génération", {
        kind: "error",
        msg: err?.message || "Erreur lors de la génération d'idées",
      });
    } finally {
      setGeneratingIdeas(false);
    }
  };

  const fetchIdeas = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await api.getCreativeIdeas(100, 0);
      setIdeas(res.list || []);
      if (isRefresh) {
        toast("Données synchronisées avec succès", { kind: "success" });
      }
    } catch (err: any) {
      setError(err?.message || "Impossible de charger les idées créatives.");
      toast(err?.message || "Erreur de chargement", { kind: "error" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchIdeas();
  }, []);

  // Extraction dynamique des filtres disponibles
  const channelsList = useMemo(() => {
    const set = new Set<string>();
    ideas.forEach((item) => {
      if (item.Channels) {
        item.Channels.split(",").forEach((c) => set.add(c.trim()));
      }
    });
    return Array.from(set);
  }, [ideas]);

  const creativeTypesList = useMemo(() => {
    const set = new Set<string>();
    ideas.forEach((item) => {
      if (item["Creative type"]) set.add(item["Creative type"].trim());
    });
    return Array.from(set);
  }, [ideas]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedChannel, selectedType, selectedStatus]);

  // Filtrage des données
  const filteredIdeas = useMemo(() => {
    return ideas.filter((idea) => {
      const text = (idea["Generated idea"] || "").toLowerCase();
      const calendar = (idea.Calendar || "").toLowerCase();
      const channels = (idea.Channels || "").toLowerCase();
      const type = (idea["Creative type"] || "").toLowerCase();
      const query = search.toLowerCase();

      const matchesSearch =
        !query ||
        text.includes(query) ||
        calendar.includes(query) ||
        channels.includes(query) ||
        type.includes(query);

      const matchesChannel =
        selectedChannel === "all" ||
        (idea.Channels && idea.Channels.split(",").map((c) => c.trim()).includes(selectedChannel));

      const matchesType =
        selectedType === "all" || idea["Creative type"] === selectedType;

      const normStatus = (idea.Status || "").toLowerCase().trim();
      const matchesStatus =
        selectedStatus === "all" ||
        (selectedStatus === "valide" && normStatus === "valide") ||
        (selectedStatus === "invalide" && normStatus === "invalide") ||
        (selectedStatus === "pending" && normStatus !== "valide" && normStatus !== "invalide");

      return matchesSearch && matchesChannel && matchesType && matchesStatus;
    });
  }, [ideas, search, selectedChannel, selectedType, selectedStatus]);

  // Pagination calculs
  const totalPages = Math.max(1, Math.ceil(filteredIdeas.length / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  const paginatedIdeas = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredIdeas.slice(startIndex, startIndex + pageSize);
  }, [filteredIdeas, currentPage, pageSize]);

  const handleCopy = (idea: CreativeIdea, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const content = idea["Generated idea"] || "";
    navigator.clipboard.writeText(content);
    setCopiedId(idea.Id);
    toast("Idée copiée dans le presse-papiers !", { kind: "success" });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreateWithAI = (idea: CreativeIdea, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const prompt = `Crée une campagne publicitaire Meta Ads basée sur cette idée créative :\n\n${idea["Generated idea"]}`;
    if (onAskAgent) {
      onAskAgent(prompt);
    } else if (onNavigate) {
      onNavigate("ai");
    }
  };

  // ─── Régénération de l'idée via webhook + PATCH SmartDB ───────────────────
  const handleRegenerateIdea = async (idea: CreativeIdea) => {
    if (regenerating) return;
    setRegenerating(true);
    setRegeneratingStep("L'IA analyse votre idée...");

    // AbortController avec timeout 5 minutes (300 000 ms)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300_000);

    try {
      // 1. Appel du webhook — on attend la réponse complète (peut prendre 1-2 min)
      setRegeneratingStep("Génération en cours, veuillez patienter...");
      const webhookRes = await fetch("https://webhook.tybotflow.com/webhook/improvement-idea", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          id: idea.Id,
          "Generated idea": idea["Generated idea"],
          Calendar: idea.Calendar,
          Channels: idea.Channels,
          "Creative type": idea["Creative type"],
          "Post Language": idea["Post Language"],
          "Post type": idea["Post type"],
          "Strategic objectives": idea["Strategic objectives"],
          "Content themes": idea["Content themes"],
        }),
      });

      clearTimeout(timeoutId);

      if (!webhookRes.ok) {
        throw new Error(`Webhook error: ${webhookRes.status}`);
      }

      const webhookData = await webhookRes.json();

      // 2. Extraire la nouvelle idée générée par le webhook
      // Le webhook peut retourner { "Generated idea": "..." } ou { idea: "..." } ou { output: "..." }
      const newIdea: string =
        webhookData["Generated idea"] ||
        webhookData.idea ||
        webhookData.output ||
        webhookData.improvement ||
        webhookData.result ||
        (typeof webhookData === "string" ? webhookData : null);

      if (!newIdea) {
        throw new Error("Le webhook n'a pas retourné de nouvelle idée.");
      }

      // 3. PATCH SmartDB — uniquement la colonne "Generated idea"
      setRegeneratingStep("Sauvegarde dans SmartDB...");
      await api.updateCreativeIdea(idea.Id, { "Generated idea": newIdea });

      // 4. Mettre à jour le state local
      const updatedIdea: CreativeIdea = { ...idea, "Generated idea": newIdea };
      setIdeas((prev) => prev.map((i) => (i.Id === idea.Id ? updatedIdea : i)));
      if (selectedIdea?.Id === idea.Id) setSelectedIdea(updatedIdea);

      toast("Idée régénérée et sauvegardée avec succès !", { kind: "success" });
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err?.name === "AbortError") {
        toast("Le webhook a dépassé le temps d'attente (5 min). Réessayez.", { kind: "error" });
      } else {
        toast(err?.message || "Erreur lors de la régénération de l'idée", { kind: "error" });
      }
    } finally {
      setRegenerating(false);
      setRegeneratingStep("");
    }
  };

  // ─── Validation de l'idée vers le webhook Calendrier ─────────────────────
  const handleValidateIdea = async (idea: CreativeIdea) => {
    if (validatingId !== null) return;
    setValidatingId(idea.Id);
    const prevStatus = idea.Status;
    const validatedStatus = "Valide";

    // 1. Mise à jour temps réel instantanée (optimiste) dans l'UI
    setIdeas((prev) =>
      prev.map((item) => (item.Id === idea.Id ? { ...item, Status: validatedStatus } : item))
    );
    if (selectedIdea && selectedIdea.Id === idea.Id) {
      setSelectedIdea((prev) => (prev ? { ...prev, Status: validatedStatus } : null));
    }

    try {
      // 2. Envoi vers le webhook Calendrier avec le statut "Valide"
      const webhookPromise = fetch("https://webhook.tybotflow.com/webhook/Calendrier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: idea.Id,
          Calendar: idea.Calendar,
          Channels: idea.Channels,
          "Creative type": idea["Creative type"],
          "Generated idea": idea["Generated idea"],
          "Post Language": idea["Post Language"],
          "Post type": idea["Post type"],
          "Strategic objectives": idea["Strategic objectives"],
          "Content themes": idea["Content themes"],
          Status: validatedStatus,
        }),
      });

      // 3. Persistance du statut dans la base de données (SmartDB)
      const dbPromise = api.updateCreativeIdea(idea.Id, { Status: validatedStatus }).catch((dbErr) => {
        console.warn("Avertissement mise à jour statut en DB locale :", dbErr);
      });

      const [res] = await Promise.all([webhookPromise, dbPromise]);
      if (!res.ok) throw new Error(`Webhook error: ${res.status}`);

      toast("Idée validée avec succès !", {
        kind: "success",
        msg: "L'idée a été marquée comme validée et envoyée au calendrier.",
      });
    } catch (err: any) {
      // Annulation du statut (rollback) en cas d'erreur
      setIdeas((prev) =>
        prev.map((item) => (item.Id === idea.Id ? { ...item, Status: prevStatus } : item))
      );
      if (selectedIdea && selectedIdea.Id === idea.Id) {
        setSelectedIdea((prev) => (prev ? { ...prev, Status: prevStatus } : null));
      }
      toast(err?.message || "Erreur lors de la validation", { kind: "error" });
    } finally {
      setValidatingId(null);
    }
  };

  // ─── Gestion de l'ouverture du formulaire (Create / Edit) ─────────────────
  const openCreateModal = () => {
    setEditingIdea(null);
    setFormState({
      ...DEFAULT_FORM,
      Calendar: new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date()),
    });
    setIsFormOpen(true);
  };

  const openEditModal = (idea: CreativeIdea, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingIdea(idea);
    setFormState({
      Calendar: idea.Calendar || "",
      Channels: idea.Channels ? idea.Channels.split(",").map((c) => c.trim()) : ["Facebook"],
      "Creative type": idea["Creative type"] || "Montage video",
      "Generated idea": idea["Generated idea"] || "",
      "Post Language": idea["Post Language"] ? idea["Post Language"].split(",").map((l) => l.trim()) : ["Français"],
      "Post type": idea["Post type"] || "Publication",
      "Strategic objectives": idea["Strategic objectives"] || STRATEGIC_OBJECTIVES[0],
      "Content themes": idea["Content themes"] || CONTENT_THEMES[0],
      Status: idea.Status || "",
    });
    setIsFormOpen(true);
  };

  const toggleChannel = (channel: string) => {
    setFormState((prev) => {
      if (channel === "All") {
        return prev.Channels.includes("All")
          ? { ...prev, Channels: [] }
          : { ...prev, Channels: ["All", ...AVAILABLE_CHANNELS.filter((c) => c !== "All")] };
      }
      const withoutAll = prev.Channels.filter((c) => c !== "All");
      const exists = withoutAll.includes(channel);
      const next = exists ? withoutAll.filter((c) => c !== channel) : [...withoutAll, channel];
      return { ...prev, Channels: next };
    });
  };

  const toggleLanguage = (lang: string) => {
    setFormState((prev) => {
      const exists = prev["Post Language"].includes(lang);
      const next = exists
        ? prev["Post Language"].filter((l) => l !== lang)
        : [...prev["Post Language"], lang];
      return { ...prev, "Post Language": next.length ? next : [lang] };
    });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState["Generated idea"].trim()) {
      toast("Veuillez renseigner le contenu de l'idée créative.", { kind: "error" });
      return;
    }

    setSubmitting(true);
    const payload = {
      Calendar: formState.Calendar.trim() || undefined,
      Channels: formState.Channels.join(","),
      "Creative type": formState["Creative type"],
      "Generated idea": formState["Generated idea"].trim(),
      "Post Language": formState["Post Language"].join(","),
      "Post type": formState["Post type"],
      "Strategic objectives": formState["Strategic objectives"],
      "Content themes": formState["Content themes"],
      Status: formState.Status,
    };

    try {
      if (editingIdea) {
        await api.updateCreativeIdea(editingIdea.Id, payload);
        toast("Idée créative mise à jour avec succès !", { kind: "success" });
        setIdeas((prev) =>
          prev.map((item) => (item.Id === editingIdea.Id ? { ...item, ...payload } : item))
        );
      } else {
        await api.createCreativeIdea(payload);
        toast("Nouvelle idée créative créée avec succès !", { kind: "success" });
      }
      setIsFormOpen(false);
      fetchIdeas(false);
      if (selectedIdea && editingIdea && selectedIdea.Id === editingIdea.Id) {
        setSelectedIdea((prev) => (prev ? { ...prev, ...payload } : null));
      }
    } catch (err: any) {
      toast(err?.message || "Erreur lors de l'enregistrement", { kind: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingIdea) return;
    setDeleting(true);
    try {
      await api.deleteCreativeIdea(deletingIdea.Id);
      toast("Idée créative supprimée avec succès !", { kind: "success" });
      setIdeas((prev) => prev.filter((i) => i.Id !== deletingIdea.Id));
      if (selectedIdea?.Id === deletingIdea.Id) setSelectedIdea(null);
      setDeletingIdea(null);
    } catch (err: any) {
      toast(err?.message || "Erreur lors de la suppression", { kind: "error" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1400, margin: "0 auto", width: "100%" }}>
      {/* ─── Sélecteur d'onglets principal : Réseaux Sociaux vs Blog ──────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, borderBottom: "1px solid var(--bd)", paddingBottom: 14 }}>
        <Tabs
          tabs={["Réseaux Sociaux", "Blog"]}
          value={mainTab}
          onChange={(t) => setMainTab(t as "Réseaux Sociaux" | "Blog")}
        />
        <div style={{ fontSize: 12, color: "var(--tx-dim)", display: "flex", alignItems: "center", gap: 6 }}>
          <span>Table active :</span>
          <span style={{ fontFamily: "JetBrains Mono", fontWeight: 600, color: mainTab === "Blog" ? "#38BDF8" : "#F59E0B" }}>
            {mainTab === "Réseaux Sociaux" ? "SmartDB (Social Ideas)" : "ms55cxivzya2wkg (Blog Ideas)"}
          </span>
        </div>
      </div>

      {mainTab === "Blog" ? (
        <BlogIdeasView onAskAgent={onAskAgent} />
      ) : (
        <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #F59E0B, #D97706)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", boxShadow: "0 4px 12px rgba(245, 158, 11, 0.25)" }}>
              <Lightbulb size={20} />
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--tx)", margin: 0, letterSpacing: "-.02em" }}>
              Creative Ideas
            </h1>
          </div>
          <p style={{ margin: "4px 0 0 46px", fontSize: 13.5, color: "var(--tx-dim)" }}>
            Générez, gérez et déployez vos idées publicitaires synchronisées avec SmartDB.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <MSButton
            variant="ghost"
            icon={<RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />}
            onClick={() => fetchIdeas(true)}
            disabled={loading || refreshing}
          >
            Actualiser
          </MSButton>
          <MSButton
            variant="secondary"
            icon={generatingIdeas ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
            onClick={handleGenerateIdeas}
            disabled={generatingIdeas}
            style={{
              background: "linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(217, 119, 6, 0.2))",
              borderColor: "#F59E0B",
              color: "#F59E0B",
            }}
          >
            {generatingIdeas ? "Génération..." : "Générer des Idées"}
          </MSButton>
          <MSButton
            variant="primary"
            icon={<Plus size={15} />}
            onClick={openCreateModal}
          >
            Nouvelle Idée
          </MSButton>
          <MSButton
            variant="secondary"
            icon={<Sparkles size={15} />}
            onClick={() => onNavigate ? onNavigate("ai") : onAskAgent?.()}
          >
            Lancer avec l'IA
          </MSButton>
        </div>
      </div>

      {/* ─── Statistiques rapides (KPIs) ────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <Card pad={16} style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--surf-card)" }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Lightbulb size={22} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--tx-dim)" }}>Total des idées</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--tx)", fontFamily: "JetBrains Mono" }}>
              {ideas.length}
            </div>
          </div>
        </Card>

        <Card pad={16} style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--surf-card)" }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: "color-mix(in srgb, #22C55E 15%, transparent)", color: "#22C55E", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--tx-dim)" }}>Idées Validées</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--tx)", fontFamily: "JetBrains Mono" }}>
              {ideas.filter((i) => (i.Status || "").toLowerCase() === "valide").length}
            </div>
          </div>
        </Card>

        <Card pad={16} style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--surf-card)" }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: "color-mix(in srgb, #3B82F6 15%, transparent)", color: "#3B82F6", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Video size={22} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--tx-dim)" }}>Formats Vidéo</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--tx)", fontFamily: "JetBrains Mono" }}>
              {ideas.filter((i) => (i["Creative type"] || "").toLowerCase().includes("video")).length}
            </div>
          </div>
        </Card>

        <Card pad={16} style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--surf-card)" }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: "color-mix(in srgb, #8B5CF6 15%, transparent)", color: "#8B5CF6", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Share2 size={22} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--tx-dim)" }}>Canaux Ciblés</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--tx)", fontFamily: "JetBrains Mono" }}>
              {channelsList.length}
            </div>
          </div>
        </Card>
      </div>

      {/* ─── Barre de contrôle (Recherche, Filtres, Vue) ────────────────────── */}
      <Card pad={14} style={{ display: "flex", flexDirection: "column", gap: 12, background: "var(--surf-card)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Rechercher une idée, canal, mot-clé..."
            width={340}
          />

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", background: "var(--surf-1)", borderRadius: 8, padding: 2, border: "1px solid var(--bd)" }}>
              <button
                onClick={() => setViewMode("grid")}
                title="Vue en cartes"
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                  background: viewMode === "grid" ? "var(--surf-card)" : "transparent",
                  color: viewMode === "grid" ? "var(--accent)" : "var(--tx-dim)",
                  boxShadow: viewMode === "grid" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <LayoutGrid size={16} />
              </button>
              <button
                onClick={() => setViewMode("table")}
                title="Vue en tableau"
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                  background: viewMode === "table" ? "var(--surf-card)" : "transparent",
                  color: viewMode === "table" ? "var(--accent)" : "var(--tx-dim)",
                  boxShadow: viewMode === "table" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <List size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Pilules de filtres */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", paddingTop: 4, borderTop: "1px solid var(--bd)" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", display: "flex", alignItems: "center", gap: 4 }}>
            <Filter size={13} /> Canaux :
          </span>
          <button
            onClick={() => setSelectedChannel("all")}
            style={{
              fontSize: 12,
              padding: "3px 10px",
              borderRadius: 999,
              border: "1px solid " + (selectedChannel === "all" ? "var(--accent)" : "var(--bd)"),
              background: selectedChannel === "all" ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "transparent",
              color: selectedChannel === "all" ? "var(--accent)" : "var(--tx-dim)",
              fontWeight: selectedChannel === "all" ? 600 : 500,
              cursor: "pointer",
            }}
          >
            Tous ({ideas.length})
          </button>
          {channelsList.map((ch) => {
            const count = ideas.filter((i) => i.Channels?.includes(ch)).length;
            const active = selectedChannel === ch;
            return (
              <button
                key={ch}
                onClick={() => setSelectedChannel(active ? "all" : ch)}
                style={{
                  fontSize: 12,
                  padding: "3px 10px",
                  borderRadius: 999,
                  border: "1px solid " + (active ? "var(--accent)" : "var(--bd)"),
                  background: active ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "transparent",
                  color: active ? "var(--accent)" : "var(--tx-dim)",
                  fontWeight: active ? 600 : 500,
                  cursor: "pointer",
                }}
              >
                {ch} ({count})
              </button>
            );
          })}

          {creativeTypesList.length > 0 && (
            <>
              <div style={{ width: 1, height: 16, background: "var(--bd)", margin: "0 4px" }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-dim)" }}>Format :</span>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                style={{
                  fontSize: 12,
                  padding: "3px 8px",
                  borderRadius: 6,
                  border: "1px solid var(--bd)",
                  background: "var(--surf-1)",
                  color: "var(--tx)",
                  cursor: "pointer",
                }}
              >
                <option value="all">Tous les formats</option>
                {creativeTypesList.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </>
          )}

          <div style={{ width: 1, height: 16, background: "var(--bd)", margin: "0 4px" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-dim)" }}>Statut :</span>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            style={{
              fontSize: 12,
              padding: "3px 8px",
              borderRadius: 6,
              border: "1px solid var(--bd)",
              background: "var(--surf-1)",
              color: "var(--tx)",
              cursor: "pointer",
            }}
          >
            <option value="all">Tous les statuts ({ideas.length})</option>
            <option value="valide">Valides ({ideas.filter((i) => (i.Status || "").toLowerCase() === "valide").length})</option>
            <option value="invalide">Invalides ({ideas.filter((i) => (i.Status || "").toLowerCase() === "invalide").length})</option>
            <option value="pending">À valider ({ideas.filter((i) => (i.Status || "").toLowerCase() !== "valide" && (i.Status || "").toLowerCase() !== "invalide").length})</option>
          </select>
        </div>
      </Card>

      {/* ─── État d'erreur / chargement ─────────────────────────────────────── */}
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: 12 }}>
          <RefreshCw size={28} className="animate-spin text-[var(--accent)]" />
          <span style={{ fontSize: 14, color: "var(--tx-dim)" }}>Chargement des idées créatives depuis SmartDB...</span>
        </div>
      )}

      {error && !loading && (
        <Card pad={24} style={{ border: "1px solid #EF4444", background: "rgba(239, 68, 68, 0.05)", textAlign: "center" }}>
          <div style={{ color: "#EF4444", fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Erreur de chargement</div>
          <p style={{ color: "var(--tx-dim)", fontSize: 13, marginBottom: 16 }}>{error}</p>
          <MSButton variant="primary" onClick={() => fetchIdeas(true)}>Réessayer</MSButton>
        </Card>
      )}

      {/* ─── Liste / Grille de contenu ───────────────────────────────────────── */}
      {!loading && !error && filteredIdeas.length === 0 && (
        <Card pad={40} style={{ textAlign: "center" }}>
          <Info size={32} style={{ color: "var(--tx-dim)", margin: "0 auto 12px" }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--tx)" }}>Aucune idée ne correspond à votre recherche</div>
          <p style={{ fontSize: 13, color: "var(--tx-dim)", marginTop: 4 }}>Créez votre première idée ou modifiez vos filtres.</p>
          <div style={{ marginTop: 16 }}>
            <MSButton variant="primary" icon={<Plus size={15} />} onClick={openCreateModal}>
              Créer une Idée
            </MSButton>
          </div>
        </Card>
      )}

      {!loading && !error && filteredIdeas.length > 0 && viewMode === "grid" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 20 }}>
          {paginatedIdeas.map((idea) => {
            const ideaText = idea["Generated idea"] || "";
            const isCopied = copiedId === idea.Id;
            const channels = idea.Channels ? idea.Channels.split(",").map((c) => c.trim()) : [];

            return (
              <Card
                key={idea.Id}
                pad={20}
                className="ms-card"
                onClick={() => setSelectedIdea(idea)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: 16,
                  cursor: "pointer",
                  transition: "transform 0.15s ease, box-shadow 0.15s ease",
                  position: "relative",
                  border: "1px solid var(--bd)",
                  background: "var(--surf-card)",
                }}
              >
                {/* En-tête de la carte */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {idea.Calendar && (
                        <span style={{ fontSize: 11.5, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "var(--surf-1)", color: "var(--tx-dim)", border: "1px solid var(--bd)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <Calendar size={11} /> {idea.Calendar}
                        </span>
                      )}
                      {idea["Creative type"] && (
                        <span style={{ fontSize: 11.5, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "color-mix(in srgb, var(--accent) 12%, transparent)", color: "var(--accent)" }}>
                          {idea["Creative type"]}
                        </span>
                      )}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {renderStatusBadge(idea.Status)}
                    </div>
                  </div>

                  {/* Canaux */}
                  {channels.length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                      {channels.map((ch) => (
                        <span
                          key={ch}
                          style={{
                            fontSize: 11,
                            fontWeight: 500,
                            padding: "1px 6px",
                            borderRadius: 4,
                            background: "var(--surf-1)",
                            color: "var(--tx)",
                            border: "1px solid var(--bd)",
                          }}
                        >
                          {ch}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Texte de l'idée avec aperçu */}
                  <div style={{ fontSize: 13.5, color: "var(--tx)", lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {ideaText}
                  </div>

                  {/* Objectif stratégique ou thème si présent */}
                  {(idea["Strategic objectives"] || idea["Content themes"]) && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                      {idea["Strategic objectives"] && (
                        <span style={{ fontSize: 10.5, padding: "1px 7px", borderRadius: 4, background: "rgba(59, 130, 246, 0.08)", color: "#3B82F6", border: "1px solid rgba(59, 130, 246, 0.2)" }}>
                          🎯 {idea["Strategic objectives"]}
                        </span>
                      )}
                      {idea["Content themes"] && (
                        <span style={{ fontSize: 10.5, padding: "1px 7px", borderRadius: 4, background: "rgba(139, 92, 246, 0.08)", color: "#8B5CF6", border: "1px solid rgba(139, 92, 246, 0.2)" }}>
                          🏷️ {idea["Content themes"]}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Pied de carte avec actions rapides */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 14, borderTop: "1px solid var(--bd)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button
                      onClick={(e) => handleCopy(idea, e)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 12,
                        fontWeight: 500,
                        color: isCopied ? "#22C55E" : "var(--tx-dim)",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        padding: "4px 8px",
                        borderRadius: 6,
                      }}
                      title="Copier le texte"
                    >
                      {isCopied ? <Check size={14} /> : <Copy size={14} />}
                      {isCopied ? "Copié" : "Copier"}
                    </button>

                    <button
                      onClick={(e) => openEditModal(idea, e)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 12,
                        fontWeight: 500,
                        color: "var(--tx-dim)",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        padding: "4px 8px",
                        borderRadius: 6,
                      }}
                      title="Modifier cette idée"
                    >
                      <Edit2 size={13} />
                      Modifier
                    </button>

                    {((idea.Status || "").trim().toLowerCase() !== "valide") && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleValidateIdea(idea);
                        }}
                        disabled={validatingId === idea.Id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 12,
                          fontWeight: 500,
                          color: "#22C55E",
                          background: "rgba(34, 197, 94, 0.08)",
                          border: "1px solid rgba(34, 197, 94, 0.25)",
                          cursor: validatingId === idea.Id ? "not-allowed" : "pointer",
                          padding: "4px 8px",
                          borderRadius: 6,
                          transition: "all 0.15s ease",
                        }}
                        title="Valider cette idée"
                      >
                        {validatingId === idea.Id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={13} />
                        )}
                        Valider
                      </button>
                    )}
                  </div>

                  <button
                    onClick={(e) => handleCreateWithAI(idea, e)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--accent)",
                      background: "color-mix(in srgb, var(--accent) 10%, transparent)",
                      border: "none",
                      cursor: "pointer",
                      padding: "5px 10px",
                      borderRadius: 6,
                      transition: "background 0.15s ease",
                    }}
                    title="Envoyer cette idée à l'agent IA"
                  >
                    <Sparkles size={13} />
                    Lancer IA
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ─── Mode Tableau ────────────────────────────────────────────────────── */}
      {!loading && !error && filteredIdeas.length > 0 && viewMode === "table" && (
        <Card pad={0} style={{ overflow: "hidden", background: "var(--surf-card)" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--bd)", background: "var(--surf-1)" }}>
                  <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--tx-dim)", width: 60 }}>#</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--tx-dim)", width: 120 }}>Période</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--tx-dim)", width: 140 }}>Format</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--tx-dim)", width: 180 }}>Canaux</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--tx-dim)" }}>Idée Générée</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--tx-dim)", width: 100 }}>Statut</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--tx-dim)", width: 150, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedIdeas.map((idea) => (
                  <tr
                    key={idea.Id}
                    onClick={() => setSelectedIdea(idea)}
                    style={{
                      borderBottom: "1px solid var(--bd)",
                      cursor: "pointer",
                      transition: "background 0.12s ease",
                    }}
                    className="hover:bg-[var(--surf-1)]"
                  >
                    <td style={{ padding: "12px 16px", color: "var(--tx-dim)", fontFamily: "JetBrains Mono" }}>{idea.Id}</td>
                    <td style={{ padding: "12px 16px", color: "var(--tx)", fontWeight: 500 }}>{idea.Calendar || "—"}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ fontSize: 11.5, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "color-mix(in srgb, var(--accent) 12%, transparent)", color: "var(--accent)" }}>
                        {idea["Creative type"] || "Standard"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", color: "var(--tx-dim)" }}>{idea.Channels || "—"}</td>
                    <td style={{ padding: "12px 16px", color: "var(--tx)", maxWidth: 350, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {idea["Generated idea"]}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {renderStatusBadge(idea.Status)}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => handleCopy(idea, e)}
                          title="Copier"
                          style={{ padding: 6, borderRadius: 6, border: "1px solid var(--bd)", background: "var(--surf-1)", color: "var(--tx-dim)", cursor: "pointer" }}
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          onClick={(e) => openEditModal(idea, e)}
                          title="Modifier"
                          style={{ padding: 6, borderRadius: 6, border: "1px solid var(--bd)", background: "var(--surf-1)", color: "var(--tx-dim)", cursor: "pointer" }}
                        >
                          <Edit2 size={13} />
                        </button>
                        {((idea.Status || "").trim().toLowerCase() !== "valide") && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleValidateIdea(idea);
                            }}
                            disabled={validatingId === idea.Id}
                            title="Valider cette idée"
                            style={{
                              padding: 6,
                              borderRadius: 6,
                              border: "1px solid rgba(34, 197, 94, 0.3)",
                              background: "rgba(34, 197, 94, 0.08)",
                              color: "#22C55E",
                              cursor: validatingId === idea.Id ? "not-allowed" : "pointer",
                            }}
                          >
                            {validatingId === idea.Id ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <CheckCircle2 size={13} />
                            )}
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingIdea(idea);
                          }}
                          title="Supprimer"
                          style={{ padding: 6, borderRadius: 6, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "#EF4444", cursor: "pointer" }}
                        >
                          <Trash2 size={13} />
                        </button>
                        <button
                          onClick={(e) => handleCreateWithAI(idea, e)}
                          title="Lancer avec IA"
                          style={{ padding: 6, borderRadius: 6, border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer" }}
                        >
                          <Sparkles size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ─── Barre de Pagination ────────────────────────────────────────────── */}
      {!loading && !error && filteredIdeas.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 14,
            padding: "12px 18px",
            background: "var(--surf-card)",
            border: "1px solid var(--bd)",
            borderRadius: 12,
          }}
        >
          <div style={{ fontSize: 13, color: "var(--tx-dim)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span>
              Affichage de <strong style={{ color: "var(--tx)" }}>{(currentPage - 1) * pageSize + 1}</strong> à{" "}
              <strong style={{ color: "var(--tx)" }}>{Math.min(currentPage * pageSize, filteredIdeas.length)}</strong> sur{" "}
              <strong style={{ color: "var(--tx)" }}>{filteredIdeas.length}</strong> idées
            </span>
            <div style={{ width: 1, height: 16, background: "var(--bd)", margin: "0 4px" }} />
            <span>Par page :</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              style={{
                fontSize: 12,
                padding: "3px 8px",
                borderRadius: 6,
                border: "1px solid var(--bd)",
                background: "var(--surf-1)",
                color: "var(--tx)",
                cursor: "pointer",
              }}
            >
              <option value={9}>9</option>
              <option value={12}>12</option>
              <option value={24}>24</option>
              <option value={48}>48</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              title="Première page"
              style={{
                padding: "6px 8px",
                borderRadius: 6,
                border: "1px solid var(--bd)",
                background: "var(--surf-1)",
                color: currentPage === 1 ? "var(--tx-dim)" : "var(--tx)",
                cursor: currentPage === 1 ? "not-allowed" : "pointer",
                opacity: currentPage === 1 ? 0.35 : 1,
                display: "flex",
                alignItems: "center",
              }}
            >
              <ChevronsLeft size={14} />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              title="Page précédente"
              style={{
                padding: "6px 8px",
                borderRadius: 6,
                border: "1px solid var(--bd)",
                background: "var(--surf-1)",
                color: currentPage === 1 ? "var(--tx-dim)" : "var(--tx)",
                cursor: currentPage === 1 ? "not-allowed" : "pointer",
                opacity: currentPage === 1 ? 0.35 : 1,
                display: "flex",
                alignItems: "center",
              }}
            >
              <ChevronLeft size={14} />
            </button>

            {/* Numéros de page */}
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .reduce<(number | string)[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) {
                  acc.push("...");
                }
                acc.push(p);
                return acc;
              }, [])
              .map((item, idx) => {
                if (item === "...") {
                  return (
                    <span key={`dots-${idx}`} style={{ padding: "0 4px", color: "var(--tx-dim)", fontSize: 12 }}>
                      ...
                    </span>
                  );
                }
                const pageNum = item as number;
                const isActive = pageNum === currentPage;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    style={{
                      minWidth: 30,
                      height: 30,
                      padding: "0 6px",
                      borderRadius: 6,
                      border: "1px solid " + (isActive ? "var(--accent)" : "var(--bd)"),
                      background: isActive ? "var(--accent)" : "var(--surf-1)",
                      color: isActive ? "#fff" : "var(--tx)",
                      fontWeight: isActive ? 700 : 500,
                      fontSize: 12,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {pageNum}
                  </button>
                );
              })}

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              title="Page suivante"
              style={{
                padding: "6px 8px",
                borderRadius: 6,
                border: "1px solid var(--bd)",
                background: "var(--surf-1)",
                color: currentPage === totalPages ? "var(--tx-dim)" : "var(--tx)",
                cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                opacity: currentPage === totalPages ? 0.35 : 1,
                display: "flex",
                alignItems: "center",
              }}
            >
              <ChevronRight size={14} />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              title="Dernière page"
              style={{
                padding: "6px 8px",
                borderRadius: 6,
                border: "1px solid var(--bd)",
                background: "var(--surf-1)",
                color: currentPage === totalPages ? "var(--tx-dim)" : "var(--tx)",
                cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                opacity: currentPage === totalPages ? 0.35 : 1,
                display: "flex",
                alignItems: "center",
              }}
            >
              <ChevronsRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ─── SlidePanel : Vue détaillée de l'idée ─────────────────────────────── */}
      <SlidePanel
        open={Boolean(selectedIdea)}
        onClose={() => setSelectedIdea(null)}
        width={580}
      >
        {selectedIdea && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", padding: "24px 28px", gap: 20, boxSizing: "border-box" }}>
            {/* Header du panneau */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }}>
                    ID #{selectedIdea.Id}
                  </span>
                  {renderStatusBadge(selectedIdea.Status)}
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--tx)", margin: 0 }}>
                  Détail de l'idée créative
                </h2>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  onClick={() => openEditModal(selectedIdea)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid var(--bd)",
                    background: "var(--surf-1)",
                    color: "var(--tx)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                  title="Modifier"
                >
                  <Edit2 size={13} /> Modifier
                </button>
                <button
                  onClick={() => setDeletingIdea(selectedIdea)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    background: "rgba(239, 68, 68, 0.08)",
                    color: "#EF4444",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                  title="Supprimer"
                >
                  <Trash2 size={13} />
                </button>
                <button
                  onClick={() => setSelectedIdea(null)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: "1px solid var(--bd)",
                    background: "transparent",
                    color: "var(--tx-dim)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  title="Fermer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Méta-données */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: 14, background: "var(--surf-1)", borderRadius: 10, border: "1px solid var(--bd)" }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase" }}>Période / Calendrier</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tx)", marginTop: 2 }}>{selectedIdea.Calendar || "—"}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase" }}>Format créatif</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tx)", marginTop: 2 }}>{selectedIdea["Creative type"] || "—"}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase" }}>Type de post</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tx)", marginTop: 2 }}>{selectedIdea["Post type"] || "Publication"}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase" }}>Langue</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tx)", marginTop: 2 }}>{selectedIdea["Post Language"] || "Français"}</div>
              </div>
              {selectedIdea["Strategic objectives"] && (
                <div style={{ gridColumn: "span 2" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase" }}>Objectif stratégique</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#3B82F6", marginTop: 2 }}>🎯 {selectedIdea["Strategic objectives"]}</div>
                </div>
              )}
              {selectedIdea["Content themes"] && (
                <div style={{ gridColumn: "span 2" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase" }}>Thème de contenu</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#8B5CF6", marginTop: 2 }}>🏷️ {selectedIdea["Content themes"]}</div>
                </div>
              )}
            </div>

            {/* Canaux de diffusion */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", marginBottom: 6 }}>Canaux cibles :</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(selectedIdea.Channels || "").split(",").map((c) => (
                  <span
                    key={c}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      padding: "3px 10px",
                      borderRadius: 6,
                      background: "var(--surf-1)",
                      border: "1px solid var(--bd)",
                      color: "var(--tx)",
                    }}
                  >
                    {c.trim()}
                  </span>
                ))}
              </div>
            </div>

            {/* Contenu complet de l'idée */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-dim)" }}>Concept & Recommandations :</span>
                <button
                  onClick={() => handleCopy(selectedIdea)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    fontWeight: 500,
                    color: copiedId === selectedIdea.Id ? "#22C55E" : "var(--accent)",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  {copiedId === selectedIdea.Id ? <Check size={14} /> : <Copy size={14} />}
                  {copiedId === selectedIdea.Id ? "Copié !" : "Copier le texte"}
                </button>
              </div>
              <div
                style={{
                  padding: 16,
                  borderRadius: 10,
                  background: "var(--surf-1)",
                  border: "1px solid var(--bd)",
                  fontSize: 13.5,
                  lineHeight: 1.65,
                  color: "var(--tx)",
                  whiteSpace: "pre-wrap",
                  maxHeight: 300,
                  overflowY: "auto",
                }}
              >
                {selectedIdea["Generated idea"]}
              </div>
            </div>

            {/* Boutons CTA */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
              {regenerating && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 16px",
                    borderRadius: 10,
                    background: "color-mix(in srgb, var(--accent) 8%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
                  }}
                >
                  <RefreshCw size={16} className="animate-spin" style={{ color: "var(--accent)", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)" }}>
                      IA en cours de génération
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--tx-dim)", marginTop: 2 }}>
                      {regeneratingStep || "Traitement en cours..."}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: "var(--accent)",
                          display: "inline-block",
                          animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                          opacity: 0.8,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <MSButton
                variant="primary"
                icon={
                  regenerating
                    ? <RefreshCw size={16} className="animate-spin" />
                    : <Sparkles size={16} />
                }
                style={{ flex: 1 }}
                disabled={regenerating || validating}
                onClick={() => handleRegenerateIdea(selectedIdea)}
              >
                {regenerating ? "L'IA travaille, patientez..." : "Régénérer l'Idée"}
              </MSButton>
              {(() => {
                const isCurrentIdeaValid = (selectedIdea.Status || "").trim().toLowerCase() === "valide";
                const isCurrentValidating = validatingId === selectedIdea.Id;
                return (
                  <MSButton
                    variant="secondary"
                    icon={
                      isCurrentValidating
                        ? <Loader2 size={16} className="animate-spin" />
                        : <CheckCircle2 size={16} />
                    }
                    style={{
                      flex: 1,
                      background: isCurrentValidating
                        ? undefined
                        : isCurrentIdeaValid
                        ? "rgba(34, 197, 94, 0.15)"
                        : "linear-gradient(135deg, #22C55E, #16A34A)",
                      color: isCurrentIdeaValid ? "#22C55E" : "#fff",
                      border: isCurrentIdeaValid ? "1px solid rgba(34, 197, 94, 0.4)" : "none",
                    }}
                    disabled={regenerating || isCurrentValidating}
                    onClick={() => handleValidateIdea(selectedIdea)}
                    title={isCurrentIdeaValid ? "Idée déjà validée. Cliquez pour revalider/renvoyer au calendrier." : "Valider cette idée"}
                  >
                    {isCurrentValidating
                      ? "Envoi en cours..."
                      : isCurrentIdeaValid
                      ? "Idée validée ✓"
                      : "Valider l'idée"}
                  </MSButton>
                );
              })()}
            </div>
          </div>
        )}
      </SlidePanel>

      {/* ─── Modal / Formulaire Création & Édition d'Idée ────────────────────── */}
      <SlidePanel
        open={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        width={620}
      >
        <form
          onSubmit={handleFormSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            overflowY: "auto",
            padding: "24px 28px",
            gap: 20,
            boxSizing: "border-box",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", textTransform: "uppercase" }}>
                  {editingIdea ? "Modifier l'idée #" + editingIdea.Id : "Nouvelle idée créative"}
                </span>
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--tx)", margin: 0 }}>
                {editingIdea ? "Éditer l'Idée Publicitaire" : "Créer une Idée de Contenu"}
              </h2>
              <p style={{ fontSize: 13, color: "var(--tx-dim)", marginTop: 4 }}>
                Renseignez les détails ci-dessous pour enregistrer directement dans SmartDB.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: "1px solid var(--bd)",
                background: "transparent",
                color: "var(--tx-dim)",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
              title="Fermer"
            >
              <X size={16} />
            </button>
          </div>

          {/* 1. Calendrier & Statut */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", marginBottom: 6 }}>
                Calendrier / Période
              </label>
              <input
                type="text"
                value={formState.Calendar}
                onChange={(e) => setFormState({ ...formState, Calendar: e.target.value })}
                placeholder="Ex : Avril 2026, Q3 2026..."
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--bd)",
                  background: "var(--surf-1)",
                  color: "var(--tx)",
                  fontSize: 13,
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", marginBottom: 6 }}>
                Statut
              </label>
              <select
                value={formState.Status}
                onChange={(e) => setFormState({ ...formState, Status: e.target.value })}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--bd)",
                  background: "var(--surf-1)",
                  color: "var(--tx)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                <option value="Valide">Valide</option>
                <option value="Brouillon">Brouillon</option>
                <option value="En attente">En attente</option>
              </select>
            </div>
          </div>

          {/* 2. Canaux cibles (Multiple Select) */}
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", marginBottom: 6 }}>
              Canaux de diffusion <span style={{ color: "var(--accent)" }}>*</span> (Sélection multiple)
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {AVAILABLE_CHANNELS.map((ch) => {
                const selected = formState.Channels.includes(ch);
                return (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => toggleChannel(ch)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 8,
                      border: "1px solid " + (selected ? "var(--accent)" : "var(--bd)"),
                      background: selected ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "var(--surf-1)",
                      color: selected ? "var(--accent)" : "var(--tx)",
                      fontSize: 12,
                      fontWeight: selected ? 600 : 500,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      transition: "all 0.15s ease",
                    }}
                  >
                    {selected && <Check size={13} />}
                    {ch}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Format créatif & Type de post */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", marginBottom: 6 }}>
                Format créatif (Creative type)
              </label>
              <select
                value={formState["Creative type"]}
                onChange={(e) => setFormState({ ...formState, "Creative type": e.target.value })}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--bd)",
                  background: "var(--surf-1)",
                  color: "var(--tx)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {CREATIVE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", marginBottom: 6 }}>
                Type de post
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                {POST_TYPES.map((pt) => {
                  const selected = formState["Post type"] === pt;
                  return (
                    <button
                      key={pt}
                      type="button"
                      onClick={() => setFormState({ ...formState, "Post type": pt })}
                      style={{
                        flex: 1,
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid " + (selected ? "var(--accent)" : "var(--bd)"),
                        background: selected ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "var(--surf-1)",
                        color: selected ? "var(--accent)" : "var(--tx)",
                        fontSize: 12.5,
                        fontWeight: selected ? 600 : 500,
                        cursor: "pointer",
                      }}
                    >
                      {pt}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 4. Langues (Sélection multiple) */}
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", marginBottom: 6 }}>
              Langue(s) du contenu (Post Language)
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {AVAILABLE_LANGUAGES.map((lang) => {
                const selected = formState["Post Language"].includes(lang);
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => toggleLanguage(lang)}
                    style={{
                      padding: "5px 12px",
                      borderRadius: 8,
                      border: "1px solid " + (selected ? "var(--accent)" : "var(--bd)"),
                      background: selected ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "var(--surf-1)",
                      color: selected ? "var(--accent)" : "var(--tx)",
                      fontSize: 12,
                      fontWeight: selected ? 600 : 500,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    {selected && <Check size={12} />}
                    {lang}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. Objectif stratégique (Dropdown) */}
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", marginBottom: 6 }}>
              Objectif stratégique (Strategic objectives)
            </label>
            <select
              value={formState["Strategic objectives"]}
              onChange={(e) => setFormState({ ...formState, "Strategic objectives": e.target.value })}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid var(--bd)",
                background: "var(--surf-1)",
                color: "var(--tx)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {STRATEGIC_OBJECTIVES.map((obj) => (
                <option key={obj} value={obj}>{obj}</option>
              ))}
            </select>
          </div>

          {/* 6. Thème de contenu (Dropdown) */}
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", marginBottom: 6 }}>
              Thème de contenu (Content themes)
            </label>
            <select
              value={formState["Content themes"]}
              onChange={(e) => setFormState({ ...formState, "Content themes": e.target.value })}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid var(--bd)",
                background: "var(--surf-1)",
                color: "var(--tx)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {CONTENT_THEMES.map((th) => (
                <option key={th} value={th}>{th}</option>
              ))}
            </select>
          </div>

          {/* Statut de l'idée */}
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", marginBottom: 6 }}>
              Statut de l'idée
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { label: "À valider", value: "" },
                { label: "Valide", value: "Valide" },
                { label: "Invalide", value: "Invalide" },
              ].map((st) => {
                const isSelected = formState.Status === st.value || (!formState.Status && st.value === "");
                return (
                  <button
                    key={st.label}
                    type="button"
                    onClick={() => setFormState({ ...formState, Status: st.value })}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid " + (isSelected ? (st.value === "Valide" ? "#22C55E" : st.value === "Invalide" ? "#EF4444" : "var(--accent)") : "var(--bd)"),
                      background: isSelected ? (st.value === "Valide" ? "rgba(34, 197, 94, 0.15)" : st.value === "Invalide" ? "rgba(239, 68, 68, 0.15)" : "color-mix(in srgb, var(--accent) 15%, transparent)") : "var(--surf-1)",
                      color: isSelected ? (st.value === "Valide" ? "#22C55E" : st.value === "Invalide" ? "#EF4444" : "var(--accent)") : "var(--tx)",
                      fontSize: 12.5,
                      fontWeight: isSelected ? 600 : 500,
                      cursor: "pointer",
                    }}
                  >
                    {st.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 7. Idée générée (Textarea principal) */}
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", marginBottom: 6 }}>
              Description de l'idée créative (Generated idea) <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <textarea
              rows={6}
              required
              value={formState["Generated idea"]}
              onChange={(e) => setFormState({ ...formState, "Generated idea": e.target.value })}
              placeholder="Décrivez en détail le concept de la vidéo ou publication, le hook d'accroche, le scénario, le call-to-action..."
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid var(--bd)",
                background: "var(--surf-1)",
                color: "var(--tx)",
                fontSize: 13,
                lineHeight: 1.55,
                resize: "vertical",
              }}
            />
          </div>

          {/* Boutons d'action du formulaire */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, paddingTop: 12, borderTop: "1px solid var(--bd)" }}>
            <MSButton
              variant="ghost"
              type="button"
              onClick={() => setIsFormOpen(false)}
              disabled={submitting}
            >
              Annuler
            </MSButton>
            <MSButton
              variant="primary"
              type="submit"
              disabled={submitting}
              icon={submitting ? <RefreshCw size={14} className="animate-spin" /> : undefined}
            >
              {submitting
                ? "Enregistrement..."
                : editingIdea
                ? "Sauvegarder les modifications"
                : "Créer l'idée créative"}
            </MSButton>
          </div>
        </form>
      </SlidePanel>

      {/* ─── Modal de Confirmation de Suppression ────────────────────────────── */}
      {deletingIdea && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 20,
          }}
          onClick={() => setDeletingIdea(null)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 440,
              background: "var(--surf-pop)",
              border: "1px solid var(--bd)",
              borderRadius: 14,
              padding: 24,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(239, 68, 68, 0.12)", color: "#EF4444", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Trash2 size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--tx)" }}>
                  Supprimer cette idée créative ?
                </h3>
                <span style={{ fontSize: 12, color: "var(--tx-dim)" }}>
                  Cette action retirera définitivement l'idée #{deletingIdea.Id} de SmartDB.
                </span>
              </div>
            </div>

            <div style={{ padding: 12, borderRadius: 8, background: "var(--surf-1)", border: "1px solid var(--bd)", fontSize: 12.5, color: "var(--tx-3)", maxHeight: 80, overflow: "hidden", textOverflow: "ellipsis" }}>
              "{deletingIdea["Generated idea"]}"
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <MSButton variant="ghost" onClick={() => setDeletingIdea(null)} disabled={deleting}>
                Annuler
              </MSButton>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: "#EF4444",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {deleting ? "Suppression..." : "Confirmer la suppression"}
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
