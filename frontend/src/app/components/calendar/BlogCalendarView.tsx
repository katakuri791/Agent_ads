import { useRef, useState, useMemo, type ReactNode } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  BookOpen,
  Edit3,
  Trash2,
  Eye,
  Copy,
  ExternalLink,
  Layers,
  LayoutGrid,
  List,
  Sparkles,
  Tag,
  Loader2,
  Image as ImageIcon,
  Check,
  AlertTriangle,
  X,
  Upload,
  Maximize2,
} from "lucide-react";
import { MSButton, SlidePanel, Tabs } from "../ms/primitives";
import { useToast } from "../../providers/ToastProvider";
import { useTybotUploadMedia } from "../../hooks/useTybotPosts";
import { useImageLightbox } from "../shared/ImageLightboxModal";
import {
  useBlogCalendar,
  useCreateBlogCalendarRecord,
  useUpdateBlogCalendarRecord,
  useDeleteBlogCalendarRecord,
  isBlogCalendarRecordValidated,
  type BlogCalendarRecord,
} from "../../hooks/useBlogCalendar";

// ─── Helpers de date ────────────────────────────────────────────────────────
const DOW = ["LU", "MA", "ME", "JE", "VE", "SA", "DI"];
const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const weekIdx = (d: Date) => (d.getDay() + 6) % 7; // lundi = 0
const startOfMondayWeek = (d: Date) => addDays(startOfDay(d), -weekIdx(d));

const parseRecordDate = (r: BlogCalendarRecord): Date => {
  // Prioritize Calendrier field (explicit publication date), fall back to CreatedAt
  const raw = (r as any).Calendrier || r.CreatedAt;
  if (raw) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
};

const DOMAIN_OPTIONS = [
  "Intelligence Artificielle",
  "Automatisation B2B",
  "Marketing Digital",
  "SaaS & Tech",
  "Productivité",
  "Transformation Digitale",
];

export function BlogCalendarView() {
  const toast = useToast();
  const { openLightbox } = useImageLightbox();
  const { data: records, isLoading, isError, refetch, isRefetching } = useBlogCalendar();
  const createM = useCreateBlogCalendarRecord();
  const updateM = useUpdateBlogCalendarRecord();
  const deleteM = useDeleteBlogCalendarRecord();
  const uploadMediaM = useTybotUploadMedia();
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Navigation calendrier
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const today = useMemo(() => new Date(), []);
  const [viewMode, setViewMode] = useState<"Calendrier" | "Tableau">("Calendrier");
  const [calScale, setCalScale] = useState<"Mois" | "Semaine">("Mois");

  // Filtres
  const [search, setSearch] = useState("");
  const [selectedDomain, setSelectedDomain] = useState<string>("all");
  // Image upload preview
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string>("");

  // Modales CRUD
  const [composeModal, setComposeModal] = useState<{ open: boolean; initialDate: Date | null }>({
    open: false,
    initialDate: null,
  });
  const [editingRecord, setEditingRecord] = useState<BlogCalendarRecord | null>(null);
  const [detailRecord, setDetailRecord] = useState<BlogCalendarRecord | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<BlogCalendarRecord | null>(null);

  // Form State
  const [formTitre, setFormTitre] = useState("");
  const [formDomaine, setFormDomaine] = useState("Intelligence Artificielle");
  const [formKeywords, setFormKeywords] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formImageUrl, setFormImageUrl] = useState("");
  const [formValidation, setFormValidation] = useState(false);
  const [formDate, setFormDate] = useState("");

  // Domaines uniques
  const availableDomains = useMemo(() => {
    const s = new Set<string>(DOMAIN_OPTIONS);
    (records || []).forEach((r) => {
      if (r.Domaine?.trim()) s.add(r.Domaine.trim());
    });
    return Array.from(s);
  }, [records]);

  // Filtrage
  const filteredRecords = useMemo(() => {
    return (records || []).filter((r) => {
      if (selectedDomain !== "all" && r.Domaine !== selectedDomain) return false;

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const titre = (r.Titre || "").toLowerCase();
      const body = (r["body blog"] || "").toLowerCase();
      const kw = (r.Keywords || "").toLowerCase();
      const dom = (r.Domaine || "").toLowerCase();
      return titre.includes(q) || body.includes(q) || kw.includes(q) || dom.includes(q);
    });
  }, [records, selectedDomain, search]);

  // Statistiques
  const stats = useMemo(() => {
    const total = (records || []).length;
    const valides = (records || []).filter((r) => isBlogCalendarRecordValidated(r.Validation)).length;
    const pending = total - valides;
    return { total, valides, pending };
  }, [records]);

  // Navigation date
  const stepCursor = (dir: 1 | -1) => {
    setCursor((c) => {
      const d = new Date(c);
      if (calScale === "Mois") d.setMonth(d.getMonth() + dir);
      else d.setDate(d.getDate() + 7 * dir);
      return d;
    });
  };

  const goToday = () => setCursor(new Date());

  // CRUD actions
  const openCreate = (initialDate?: Date) => {
    const d = initialDate || cursor || new Date();
    setFormDate(d.toISOString().slice(0, 10));
    setFormTitre("");
    setFormDomaine("Intelligence Artificielle");
    setFormKeywords("");
    setFormBody("");
    setFormImageUrl("");
    setImagePreviewUrl("");
    setFormValidation(false);
    setEditingRecord(null);
    setComposeModal({ open: true, initialDate: d });
  };

  const openEdit = (record: BlogCalendarRecord) => {
    setEditingRecord(record);
    setFormTitre(record.Titre || "");
    setFormDomaine(record.Domaine || "Intelligence Artificielle");
    setFormKeywords(record.Keywords || "");
    setFormBody(record["body blog"] || "");
    const existingUrl = record.Image?.[0]?.url || "";
    setFormImageUrl(existingUrl);
    setImagePreviewUrl(existingUrl);
    setFormValidation(isBlogCalendarRecordValidated(record.Validation));
    const d = parseRecordDate(record);
    setFormDate(d.toISOString().slice(0, 10));
    setComposeModal({ open: true, initialDate: d });
  };

  // Handle image file upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const localPreview = URL.createObjectURL(file);
    setImagePreviewUrl(localPreview);
    try {
      const uploadRes = await uploadMediaM.mutateAsync(file);
      if (!uploadRes?.url) {
        toast("Upload image échoué : URL introuvable.", { kind: "error" });
        setImagePreviewUrl("");
        return;
      }
      setFormImageUrl(uploadRes.url);
      setImagePreviewUrl(uploadRes.url);
      toast("Image uploadée avec succès !", { kind: "success" });
    } catch (err: any) {
      toast(err?.message || "Erreur lors de l'upload de l'image", { kind: "error" });
      setImagePreviewUrl("");
    } finally {
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitre.trim()) {
      toast("Veuillez renseigner le titre de l'article.", { kind: "error" });
      return;
    }

    const payload: Record<string, any> = {
      Titre: formTitre.trim(),
      Domaine: formDomaine.trim() || null,
      Keywords: formKeywords.trim() || null,
      "body blog": formBody.trim() || null,
      Validation: formValidation,
      Image: formImageUrl.trim() ? [{ url: formImageUrl.trim(), title: formTitre.trim() }] : null,
      Calendrier: formDate ? `${formDate} 12:00:00+00:00` : new Date().toISOString(),
    };

    try {
      if (editingRecord) {
        await updateM.mutateAsync({ Id: editingRecord.Id, ...payload });
        toast("Article de blog mis à jour avec succès !", { kind: "success" });
        if (detailRecord && detailRecord.Id === editingRecord.Id) {
          setDetailRecord((prev) => (prev ? { ...prev, ...payload } : null));
        }
      } else {
        await createM.mutateAsync(payload);
        toast("Nouvel article planifié avec succès !", { kind: "success" });
      }
      setComposeModal({ open: false, initialDate: null });
      setEditingRecord(null);
    } catch (err: any) {
      toast(err?.message || "Erreur lors de l'enregistrement", { kind: "error" });
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteM.mutateAsync(deleteConfirm.Id);
      toast("Article supprimé du calendrier.", { kind: "success" });
      if (detailRecord?.Id === deleteConfirm.Id) setDetailRecord(null);
      setDeleteConfirm(null);
    } catch (err: any) {
      toast(err?.message || "Erreur de suppression", { kind: "error" });
    }
  };

  const toggleValidation = async (record: BlogCalendarRecord) => {
    const current = isBlogCalendarRecordValidated(record.Validation);
    const nextVal = !current;
    try {
      await updateM.mutateAsync({
        Id: record.Id,
        Validation: nextVal,
      });
      if (detailRecord && detailRecord.Id === record.Id) {
        setDetailRecord((prev) => (prev ? { ...prev, Validation: nextVal } : null));
      }
      toast(nextVal ? "Article marqué comme Valide !" : "Article marqué comme À valider.", { kind: "success" });
    } catch (err: any) {
      toast(err?.message || "Erreur lors du changement de statut", { kind: "error" });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast("Texte copié dans le presse-papiers !", { kind: "success" });
  };

  // Header period label
  const headerPeriod = useMemo(() => {
    if (calScale === "Mois") {
      return `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
    }
    const s = startOfMondayWeek(cursor);
    const e = addDays(s, 6);
    return `${s.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} – ${e.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`;
  }, [cursor, calScale]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, width: "100%" }}>
      {/* ─── En-tête de section ────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "linear-gradient(135deg, rgba(236, 72, 153, 0.2), rgba(168, 85, 247, 0.2))",
                border: "1px solid rgba(236, 72, 153, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#EC4899",
              }}
            >
              <CalendarIcon size={18} />
            </div>
            <div>
              <h2 style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 22, color: "var(--tx)", margin: 0 }}>
                Calendrier Éditorial Blog
              </h2>
              <div style={{ fontSize: 13, color: "var(--tx-dim)", marginTop: 2 }}>
                Planification, rédaction et suivi des articles connectés à SmartDB
              </div>
            </div>
          </div>
        </div>

        {/* Statistiques & Actions rapides */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "var(--surf-card)",
              border: "1px solid var(--bd)",
              borderRadius: 10,
              padding: "4px 12px",
              fontSize: 12.5,
            }}
          >
            <span style={{ color: "var(--tx-dim)" }}>Total :</span>
            <strong style={{ color: "var(--tx)" }}>{stats.total}</strong>
            <span style={{ width: 1, height: 14, background: "var(--bd)", margin: "0 2px" }} />
            <span style={{ color: "#22C55E", fontWeight: 600 }}>✓ {stats.valides} valides</span>
            <span style={{ width: 1, height: 14, background: "var(--bd)", margin: "0 2px" }} />
            <span style={{ color: "var(--tx-dim)" }}>⏳ {stats.pending} à valider</span>
          </div>

          <MSButton
            variant="outline"
            icon={<RefreshCw size={14} className={isRefetching ? "animate-spin" : ""} />}
            onClick={() => refetch()}
            disabled={isRefetching}
          >
            Rafraîchir
          </MSButton>

          <MSButton
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => openCreate(cursor)}
            style={{
              background: "linear-gradient(135deg, #EC4899, #8B5CF6)",
              border: "none",
              color: "#fff",
            }}
          >
            Planifier un article
          </MSButton>
        </div>
      </div>

      {/* ─── Barre d'outils, Navigation & Filtres ────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          background: "var(--surf-card)",
          border: "1px solid var(--bd)",
          borderRadius: 14,
          padding: "10px 14px",
        }}
      >
        {/* Navigation période */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => stepCursor(-1)}
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: "var(--surf-inset)",
              border: "1px solid var(--bd)",
              color: "var(--tx)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Période précédente"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => stepCursor(1)}
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: "var(--surf-inset)",
              border: "1px solid var(--bd)",
              color: "var(--tx)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Période suivante"
          >
            <ChevronRight size={16} />
          </button>

          <div style={{ minWidth: 170, fontWeight: 700, fontSize: 16, color: "var(--tx)", fontFamily: "DM Sans" }}>
            {headerPeriod}
          </div>

          <MSButton variant="outline" size="sm" onClick={goToday}>
            Aujourd'hui
          </MSButton>
        </div>

        {/* Filtres & Recherche */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {/* Recherche */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "var(--surf-inset)",
              border: "1px solid var(--bd)",
              borderRadius: 8,
              padding: "5px 10px",
              width: 190,
            }}
          >
            <Search size={14} style={{ color: "var(--tx-dim)" }} />
            <input
              type="text"
              placeholder="Rechercher…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--tx)",
                fontSize: 12.5,
                outline: "none",
                width: "100%",
              }}
            />
          </div>

          {/* Domaine */}
          <select
            value={selectedDomain}
            onChange={(e) => setSelectedDomain(e.target.value)}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid var(--bd)",
              background: "var(--surf-inset)",
              color: "var(--tx)",
              fontSize: 12.5,
              outline: "none",
              cursor: "pointer",
            }}
          >
            <option value="all">Tous les domaines</option>
            {availableDomains.map((dom) => (
              <option key={dom} value={dom}>
                {dom}
              </option>
            ))}
          </select>

          {/* Echelle Calendrier (Mois/Semaine) */}
          {viewMode === "Calendrier" && (
            <Tabs
              tabs={["Mois", "Semaine"]}
              value={calScale}
              onChange={(v) => setCalScale(v as any)}
            />
          )}

          {/* Bascule Calendrier / Tableau */}
          <Tabs
            tabs={["Calendrier", "Tableau"]}
            value={viewMode}
            onChange={(v) => setViewMode(v as any)}
          />
        </div>
      </div>

      {/* ─── Contenu Principal : Grille Calendrier ou Tableau ─────────────── */}
      {isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: 12 }}>
          <Loader2 size={32} className="animate-spin" style={{ color: "#EC4899" }} />
          <span style={{ fontSize: 13, color: "var(--tx-dim)" }}>Chargement du calendrier blog…</span>
        </div>
      ) : isError ? (
        <div style={{ padding: 24, textAlign: "center", color: "#EF4444", background: "rgba(239,68,68,0.08)", borderRadius: 12, border: "1px solid rgba(239,68,68,0.2)" }}>
          Impossible de charger le calendrier blog. Veuillez vérifier la connexion SmartDB.
        </div>
      ) : viewMode === "Calendrier" ? (
        calScale === "Mois" ? (
          <MonthCalendarGrid
            cursor={cursor}
            records={filteredRecords}
            today={today}
            onCellClick={(date) => openCreate(date)}
            onRecordClick={(record) => setDetailRecord(record)}
          />
        ) : (
          <WeekCalendarGrid
            cursor={cursor}
            records={filteredRecords}
            today={today}
            onCellClick={(date) => openCreate(date)}
            onRecordClick={(record) => setDetailRecord(record)}
          />
        )
      ) : (
        <BlogTableGrid
          records={filteredRecords}
          onRecordClick={(r) => setDetailRecord(r)}
          onEdit={(r) => openEdit(r)}
          onDelete={(r) => setDeleteConfirm(r)}
          onToggleValidation={(r) => toggleValidation(r)}
        />
      )}

      {/* ─── SlidePanel : Lecture détaillée de l'article ──────────────────── */}
      <SlidePanel open={Boolean(detailRecord)} onClose={() => setDetailRecord(null)} width={640}>
        {detailRecord && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", padding: "24px 28px", gap: 18, boxSizing: "border-box" }}>
            {/* Header */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "rgba(236, 72, 153, 0.15)", color: "#EC4899" }}>
                  ID #{detailRecord.Id}
                </span>

                {isBlogCalendarRecordValidated(detailRecord.Validation) ? (
                  <span style={{ fontSize: 11.5, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "rgba(34, 197, 94, 0.15)", color: "#22C55E", border: "1px solid rgba(34, 197, 94, 0.35)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <CheckCircle2 size={12} /> Valide
                  </span>
                ) : (
                  <span style={{ fontSize: 11.5, fontWeight: 500, padding: "2px 8px", borderRadius: 999, background: "rgba(148, 163, 184, 0.12)", color: "var(--tx-dim)", border: "1px dashed var(--bd)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Clock size={12} /> À valider
                  </span>
                )}

                {detailRecord.Domaine && (
                  <span style={{ fontSize: 11.5, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "var(--surf-inset)", color: "var(--tx-2)", border: "1px solid var(--bd)" }}>
                    {detailRecord.Domaine}
                  </span>
                )}

                <span style={{ fontSize: 11.5, color: "var(--tx-dim)" }}>
                  Planifié : {parseRecordDate(detailRecord).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long", year: "numeric" })}
                </span>
              </div>

              <h2 style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 22, color: "var(--tx)", margin: "4px 0 0", lineHeight: 1.35 }}>
                {detailRecord.Titre || "Sans titre"}
              </h2>
            </div>

            {/* Visuel si présent */}
            {detailRecord.Image?.[0]?.url && (
              <div
                onClick={() => openLightbox(detailRecord.Image![0].url, detailRecord.Titre || "Visuel de l'article")}
                style={{
                  position: "relative",
                  width: "100%",
                  height: 220,
                  borderRadius: 12,
                  overflow: "hidden",
                  background: "#000",
                  border: "1px solid var(--bd)",
                  cursor: "zoom-in",
                }}
                title="Cliquer pour afficher l'image complète"
              >
                <img
                  src={detailRecord.Image[0].url}
                  alt={detailRecord.Titre || "Visuel"}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
                <div
                  style={{
                    position: "absolute",
                    bottom: 10,
                    right: 10,
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
            )}

            {/* Mots-clés SEO */}
            {detailRecord.Keywords && detailRecord.Keywords !== detailRecord["body blog"] && (
              <div style={{ background: "var(--surf-inset)", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--bd)" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#EC4899", textTransform: "uppercase", marginBottom: 3 }}>
                  Mots-clés SEO
                </div>
                <div style={{ fontSize: 12.5, color: "var(--tx)" }}>{detailRecord.Keywords}</div>
              </div>
            )}

            {/* Corps de l'article */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                  Corps de l'article
                </span>
                {detailRecord["body blog"] && (
                  <button
                    onClick={() => copyToClipboard(detailRecord["body blog"] || "")}
                    style={{ background: "transparent", border: "none", color: "#EC4899", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600 }}
                  >
                    <Copy size={13} /> Copier le texte
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
                  maxHeight: 380,
                  overflowY: "auto",
                }}
              >
                {detailRecord["body blog"] || "Aucun contenu rédigé pour le moment."}
              </div>
            </div>

            {/* Pied d'actions */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--bd)", paddingTop: 16, marginTop: "auto", flexWrap: "wrap", gap: 10 }}>
              <MSButton
                variant="outline"
                danger
                icon={<Trash2 size={14} />}
                onClick={() => setDeleteConfirm(detailRecord)}
              >
                Supprimer
              </MSButton>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {/* Toggle Validation */}
                {/* <MSButton
                  variant="secondary"
                  icon={<CheckCircle2 size={14} />}
                  onClick={() => toggleValidation(detailRecord)}
                  style={{
                    background: isBlogCalendarRecordValidated(detailRecord.Validation)
                      ? "rgba(34, 197, 94, 0.15)"
                      : "linear-gradient(135deg, #22C55E, #16A34A)",
                    color: isBlogCalendarRecordValidated(detailRecord.Validation) ? "#22C55E" : "#fff",
                    border: isBlogCalendarRecordValidated(detailRecord.Validation) ? "1px solid rgba(34,197,94,0.4)" : "none",
                  }}
                >
                  {isBlogCalendarRecordValidated(detailRecord.Validation) ? "Article validé ✓" : "Valider l'article"}
                </MSButton> */}

                <MSButton
                  variant="outline"
                  icon={<Edit3 size={14} />}
                  onClick={() => openEdit(detailRecord)}
                >
                  Modifier
                </MSButton>

                <MSButton variant="primary" onClick={() => setDetailRecord(null)}>
                  Fermer
                </MSButton>
              </div>
            </div>
          </div>
        )}
      </SlidePanel>

      {/* ─── Modale Création / Édition ────────────────────────────────────── */}
      <SlidePanel open={composeModal.open} onClose={() => setComposeModal({ open: false, initialDate: null })} width={580}>
        <form onSubmit={handleSubmitForm} style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", padding: "24px 28px", gap: 18, boxSizing: "border-box" }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: "#EC4899", textTransform: "uppercase", marginBottom: 4 }}>
              {editingRecord ? `Modifier l'article #${editingRecord.Id}` : "Nouvel article au calendrier"}
            </div>
            <h2 style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 20, color: "var(--tx)", margin: 0 }}>
              {editingRecord ? "Éditer l'Article de Blog" : "Planifier un Article de Blog"}
            </h2>
          </div>

          {/* Date de planification */}
          <div>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--tx)", marginBottom: 6 }}>
              Date de publication prévue
            </label>
            <input
              type="date"
              required
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--bd)",
                background: "var(--surf-inset)",
                color: "var(--tx)",
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Titre */}
          <div>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--tx)", marginBottom: 6 }}>
              Titre de l'article *
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Pourquoi l'automatisation IA transforme le B2B en 2026"
              value={formTitre}
              onChange={(e) => setFormTitre(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--bd)",
                background: "var(--surf-inset)",
                color: "var(--tx)",
                fontSize: 13.5,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Domaine & Catégorie */}
          <div>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--tx)", marginBottom: 6 }}>
              Domaine / Thématique
            </label>
            <select
              value={formDomaine}
              onChange={(e) => setFormDomaine(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--bd)",
                background: "var(--surf-inset)",
                color: "var(--tx)",
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
              }}
            >
              {availableDomains.map((dom) => (
                <option key={dom} value={dom}>
                  {dom}
                </option>
              ))}
            </select>
          </div>

          {/* Mots-clés SEO */}
          <div>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--tx)", marginBottom: 6 }}>
              Mots-clés SEO (séparés par des virgules)
            </label>
            <input
              type="text"
              placeholder="Ex: IA générative, Automatisation, B2B Maroc"
              value={formKeywords}
              onChange={(e) => setFormKeywords(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--bd)",
                background: "var(--surf-inset)",
                color: "var(--tx)",
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Image de couverture – Upload */}
          <div>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--tx)", marginBottom: 6 }}>
              Image de couverture
            </label>
            {/* Hidden file input */}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleImageUpload}
            />
            {/* Preview or upload zone */}
            {imagePreviewUrl ? (
              <div
                style={{ position: "relative", width: "100%", height: 160, borderRadius: 10, overflow: "hidden", border: "1px solid var(--bd)", cursor: "zoom-in" }}
                onClick={() => openLightbox(imagePreviewUrl, formTitre || "Aperçu de couverture")}
                title="Cliquer pour afficher l'image complète"
              >
                <img src={imagePreviewUrl} alt="Aperçu" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <div
                  style={{
                    position: "absolute",
                    bottom: 8,
                    right: 8,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "4px 9px",
                    borderRadius: 14,
                    background: "rgba(10, 14, 28, 0.85)",
                    backdropFilter: "blur(6px)",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    color: "#FFFFFF",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  <Maximize2 size={12} style={{ color: "#EC4899" }} />
                  Agrandir
                </div>
                {uploadMediaM.isPending && (
                  <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "#fff", fontSize: 13 }}>
                    <Loader2 size={18} className="animate-spin" /> Upload en cours…
                  </div>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setFormImageUrl(""); setImagePreviewUrl(""); }}
                  style={{ position: "absolute", top: 6, right: 6, width: 26, height: 26, borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", zIndex: 3 }}
                  title="Supprimer l'image"
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={uploadMediaM.isPending}
                style={{
                  width: "100%",
                  height: 100,
                  borderRadius: 10,
                  border: "2px dashed var(--bd)",
                  background: "var(--surf-inset)",
                  color: uploadMediaM.isPending ? "#EC4899" : "var(--tx-dim)",
                  cursor: uploadMediaM.isPending ? "not-allowed" : "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  fontSize: 13,
                  transition: "border-color .2s, color .2s",
                }}
              >
                {uploadMediaM.isPending ? (
                  <><Loader2 size={20} className="animate-spin" /> Upload en cours…</>
                ) : (
                  <><Upload size={20} /> Cliquer pour uploader une image</>  
                )}
              </button>
            )}
          </div>

          {/* Corps de l'article */}
          <div>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--tx)", marginBottom: 6 }}>
              Corps de l'article
            </label>
            <textarea
              rows={8}
              placeholder="Rédigez ou collez le contenu complet de l'article ici…"
              value={formBody}
              onChange={(e) => setFormBody(e.target.value)}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 8,
                border: "1px solid var(--bd)",
                background: "var(--surf-inset)",
                color: "var(--tx)",
                fontSize: 13,
                lineHeight: 1.6,
                outline: "none",
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Validation Checkbox */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
            <input
              type="checkbox"
              id="cb-validation"
              checked={formValidation}
              onChange={(e) => setFormValidation(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: "#22C55E", cursor: "pointer" }}
            />
            <label htmlFor="cb-validation" style={{ fontSize: 13, color: "var(--tx)", cursor: "pointer", fontWeight: 500 }}>
              Marquer comme validé (prêt à publier)
            </label>
          </div>

          {/* Footer CTA */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, marginTop: "auto", paddingTop: 14, borderTop: "1px solid var(--bd)" }}>
            <MSButton
              variant="outline"
              type="button"
              onClick={() => setComposeModal({ open: false, initialDate: null })}
            >
              Annuler
            </MSButton>
            <MSButton
              variant="primary"
              type="submit"
              disabled={createM.isPending || updateM.isPending}
              icon={(createM.isPending || updateM.isPending) ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              style={{ background: "linear-gradient(135deg, #EC4899, #8B5CF6)", color: "#fff", border: "none" }}
            >
              {editingRecord ? "Enregistrer les modifications" : "Créer l'article"}
            </MSButton>
          </div>
        </form>
      </SlidePanel>

      {/* ─── Modale Confirmation de Suppression ─────────────────────────── */}
      {deleteConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--surf-card)",
              border: "1px solid var(--bd)",
              borderRadius: 16,
              padding: 24,
              maxWidth: 440,
              width: "90%",
              boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#EF4444", marginBottom: 12 }}>
              <AlertTriangle size={24} />
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--tx)" }}>
                Supprimer cet article ?
              </h3>
            </div>
            <p style={{ fontSize: 13.5, color: "var(--tx-dim)", lineHeight: 1.5, margin: "0 0 20px" }}>
              Êtes-vous sûr de vouloir supprimer définitivement l'article « <strong>{deleteConfirm.Titre}</strong> » du calendrier ? Cette action est irréversible.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <MSButton variant="outline" onClick={() => setDeleteConfirm(null)}>
                Annuler
              </MSButton>
              <MSButton
                variant="primary"
                danger
                onClick={handleDelete}
                disabled={deleteM.isPending}
                icon={deleteM.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              >
                {deleteM.isPending ? "Suppression…" : "Confirmer la suppression"}
              </MSButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Composant : Grille Mensuelle ──────────────────────────────────────────
function MonthCalendarGrid({
  cursor,
  records,
  today,
  onCellClick,
  onRecordClick,
}: {
  cursor: Date;
  records: BlogCalendarRecord[];
  today: Date;
  onCellClick: (d: Date) => void;
  onRecordClick: (r: BlogCalendarRecord) => void;
}) {
  const first = startOfMonth(cursor);
  const last = endOfMonth(cursor);
  const gridStart = startOfMondayWeek(first);
  const cells: Date[] = [];
  let d = gridStart;
  while (cells.length < 42) {
    cells.push(d);
    d = addDays(d, 1);
    if (cells.length >= 35 && d > last) break;
  }
  const weeks: Date[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div style={{ background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 16, overflow: "hidden" }}>
      {/* En-tête des jours de la semaine */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", background: "var(--surf-inset)", borderBottom: "1px solid var(--bd)" }}>
        {DOW.map((dd, i) => (
          <div key={i} style={{ padding: "12px 0", textAlign: "center", fontSize: 11, fontWeight: 600, letterSpacing: ".08em", color: "var(--tx-dim)" }}>
            {dd}
          </div>
        ))}
      </div>

      {/* Semaines et cellules de jours */}
      {weeks.map((wk, wi) => (
        <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: wi < weeks.length - 1 ? "1px solid var(--bd)" : "none" }}>
          {wk.map((day, di) => {
            const out = day.getMonth() !== cursor.getMonth();
            const isToday = sameDay(day, today);
            const dayRecords = records.filter((r) => sameDay(parseRecordDate(r), day));

            return (
              <div
                key={di}
                onClick={() => onCellClick(day)}
                style={{
                  minHeight: 110,
                  padding: 8,
                  borderRight: di < 6 ? "1px solid var(--bd-weak)" : "none",
                  cursor: "pointer",
                  opacity: out ? 0.45 : 1,
                  background: isToday ? "rgba(236, 72, 153, 0.04)" : "transparent",
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                  transition: "background .15s ease",
                }}
                title={`Cliquer pour planifier un article le ${day.getDate()} ${MONTHS[day.getMonth()]}`}
              >
                {/* Numéro du jour */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 24,
                      height: 24,
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: isToday ? 700 : 500,
                      fontFamily: "JetBrains Mono",
                      background: isToday ? "#EC4899" : "transparent",
                      color: isToday ? "#fff" : "var(--tx-2)",
                    }}
                  >
                    {day.getDate()}
                  </span>
                  {dayRecords.length > 0 && (
                    <span style={{ fontSize: 10, color: "var(--tx-dim)", fontFamily: "JetBrains Mono" }}>
                      {dayRecords.length} art.
                    </span>
                  )}
                </div>

                {/* Badges d'articles – tous affichés */}
                {dayRecords.map((rec) => {
                  const isValid = isBlogCalendarRecordValidated(rec.Validation);
                  return (
                    <div
                      key={rec.Id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRecordClick(rec);
                      }}
                      style={{
                        padding: "4px 7px",
                        borderRadius: 6,
                        background: isValid ? "rgba(34, 197, 94, 0.12)" : "rgba(236, 72, 153, 0.12)",
                        border: "1px solid " + (isValid ? "rgba(34, 197, 94, 0.3)" : "rgba(236, 72, 153, 0.3)"),
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 11,
                        color: "var(--tx)",
                        cursor: "pointer",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={`${rec.Titre || "Article"} · ${isValid ? "Validé" : "À valider"}`}
                    >
                      <span style={{ color: isValid ? "#22C55E" : "#EC4899", display: "inline-flex", flexShrink: 0 }}>
                        {isValid ? <CheckCircle2 size={11} /> : <BookOpen size={11} />}
                      </span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, fontWeight: 500 }}>
                        {rec.Titre || "Sans titre"}
                      </span>
                    </div>
                  );
                })}

                {dayRecords.length === 0 && !out && (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.25 }}>
                    <Plus size={14} style={{ color: "var(--tx-dim)" }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Composant : Grille Hebdomadaire ───────────────────────────────────────
function WeekCalendarGrid({
  cursor,
  records,
  today,
  onCellClick,
  onRecordClick,
}: {
  cursor: Date;
  records: BlogCalendarRecord[];
  today: Date;
  onCellClick: (d: Date) => void;
  onRecordClick: (r: BlogCalendarRecord) => void;
}) {
  const start = startOfMondayWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  return (
    <div style={{ background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 16, overflow: "hidden", display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
      {days.map((day, i) => {
        const isToday = sameDay(day, today);
        const dayRecords = records.filter((r) => sameDay(parseRecordDate(r), day));

        return (
          <div
            key={i}
            onClick={() => onCellClick(day)}
            style={{
              minHeight: 280,
              padding: 12,
              borderRight: i < 6 ? "1px solid var(--bd)" : "none",
              background: isToday ? "rgba(236, 72, 153, 0.04)" : "transparent",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {/* Header du jour */}
            <div style={{ textAlign: "center", paddingBottom: 8, borderBottom: "1px solid var(--bd)" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase" }}>
                {DOW[i]}
              </div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  fontSize: 14,
                  fontWeight: 700,
                  marginTop: 4,
                  background: isToday ? "#EC4899" : "transparent",
                  color: isToday ? "#fff" : "var(--tx)",
                }}
              >
                {day.getDate()}
              </div>
            </div>

            {/* Liste des articles du jour */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
              {dayRecords.map((rec) => {
                const isValid = isBlogCalendarRecordValidated(rec.Validation);
                return (
                  <div
                    key={rec.Id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRecordClick(rec);
                    }}
                    style={{
                      padding: 8,
                      borderRadius: 8,
                      background: isValid ? "rgba(34, 197, 94, 0.1)" : "rgba(236, 72, 153, 0.1)",
                      border: "1px solid " + (isValid ? "rgba(34, 197, 94, 0.3)" : "rgba(236, 72, 153, 0.3)"),
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    <div style={{ fontWeight: 600, color: "var(--tx)", marginBottom: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {rec.Titre || "Sans titre"}
                    </div>
                    {rec.Domaine && (
                      <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "var(--surf-inset)", color: "var(--tx-dim)" }}>
                        {rec.Domaine}
                      </span>
                    )}
                  </div>
                );
              })}

              {dayRecords.length === 0 && (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.2 }}>
                  <Plus size={16} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Composant : Vue Tableau ───────────────────────────────────────────────
function BlogTableGrid({
  records,
  onRecordClick,
  onEdit,
  onDelete,
  onToggleValidation,
}: {
  records: BlogCalendarRecord[];
  onRecordClick: (r: BlogCalendarRecord) => void;
  onEdit: (r: BlogCalendarRecord) => void;
  onDelete: (r: BlogCalendarRecord) => void;
  onToggleValidation: (r: BlogCalendarRecord) => void;
}) {
  const { openLightbox } = useImageLightbox();
  return (
    <div style={{ background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 14, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "var(--surf-inset)", borderBottom: "1px solid var(--bd)", color: "var(--tx-dim)", fontSize: 11.5, textTransform: "uppercase" }}>
            <th style={{ padding: "12px 16px" }}>Visuel</th>
            <th style={{ padding: "12px 16px" }}>Date</th>
            <th style={{ padding: "12px 16px" }}>Titre de l'article</th>
            <th style={{ padding: "12px 16px" }}>Domaine</th>
            <th style={{ padding: "12px 16px" }}>Statut</th>
            <th style={{ padding: "12px 16px", textAlign: "right" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {records.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ padding: 40, textAlign: "center", color: "var(--tx-dim)" }}>
                Aucun article de blog trouvé pour les filtres sélectionnés.
              </td>
            </tr>
          ) : (
            records.map((record) => {
              const hasImg = !!record.Image?.[0]?.url;
              const isValid = isBlogCalendarRecordValidated(record.Validation);
              const dateObj = parseRecordDate(record);

              return (
                <tr
                  key={record.Id}
                  style={{ borderBottom: "1px solid var(--bd-weak)", cursor: "pointer", transition: "background .15s" }}
                  onClick={() => onRecordClick(record)}
                >
                  <td style={{ padding: "12px 16px", width: 50 }}>
                    <div
                      style={{
                        width: 42,
                        height: 42,
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
                  <td style={{ padding: "12px 16px", whiteSpace: "nowrap", color: "var(--tx-dim)", fontSize: 12 }}>
                    {dateObj.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td style={{ padding: "12px 16px", maxWidth: 320 }}>
                    <div style={{ fontWeight: 600, color: "var(--tx)" }}>{record.Titre || "Sans titre"}</div>
                    <div style={{ fontSize: 11, color: "var(--tx-dim)", fontFamily: "JetBrains Mono" }}>ID #{record.Id}</div>
                  </td>
                  <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                    {record.Domaine ? (
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: "#EC4899", padding: "2px 8px", borderRadius: 6, background: "rgba(236,72,153,0.1)" }}>
                        {record.Domaine}
                      </span>
                    ) : (
                      <span style={{ color: "var(--tx-dim)" }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    {isValid ? (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "rgba(34, 197, 94, 0.15)", color: "#22C55E", border: "1px solid rgba(34, 197, 94, 0.35)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <CheckCircle2 size={11} /> Valide
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 999, background: "rgba(148, 163, 184, 0.12)", color: "var(--tx-dim)", border: "1px dashed var(--bd)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Clock size={11} /> À valider
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      <button
                        onClick={() => onToggleValidation(record)}
                        style={{
                          padding: "5px 8px",
                          borderRadius: 6,
                          background: isValid ? "rgba(34, 197, 94, 0.12)" : "linear-gradient(135deg, #22C55E, #16A34A)",
                          border: isValid ? "1px solid rgba(34, 197, 94, 0.3)" : "none",
                          color: isValid ? "#22C55E" : "#fff",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                        title={isValid ? "Marquer comme à valider" : "Valider cet article"}
                      >
                        <CheckCircle2 size={11} />
                        {isValid ? "Validé" : "Valider"}
                      </button>
                      <MSButton variant="ghost" size="sm" onClick={() => onRecordClick(record)} icon={<Eye size={13} />} />
                      <MSButton variant="outline" size="sm" onClick={() => onEdit(record)} icon={<Edit3 size={13} />} />
                      <MSButton variant="outline" size="sm" danger onClick={() => onDelete(record)} icon={<Trash2 size={13} />} />
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
