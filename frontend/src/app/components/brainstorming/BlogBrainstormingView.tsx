import { useState, useMemo } from "react";
import {
  BookOpen, Calendar, Plus, Edit3, Trash2, Search,
  RefreshCw, Sparkles, Target, Check, Loader2, Eye,
  Copy, LayoutGrid, List, FileText, Lightbulb, PenTool, ExternalLink, ArrowRight
} from "lucide-react";
import { MSButton } from "../ms/primitives";
import { useToast } from "../../providers/ToastProvider";
import {
  useBlogBrainstorming,
  useCreateBlogBrainstorming,
  useUpdateBlogBrainstorming,
  useDeleteBlogBrainstorming,
  type BlogBrainstormingRecord,
} from "../../hooks/useBlogBrainstorming";

const BLOG_OBJECTIVE_TEMPLATES = [
  { label: "🎯 SEO & Trafic Organique", text: "Acquérir du trafic naturel sur les requêtes ciblées et se positionner sur les mots-clés stratégiques." },
  { label: "💡 Guide Pratique & Tuto", text: "Résoudre un problème concret des utilisateurs avec des étapes pas à pas." },
  { label: "🚀 Cas Client & Démo", text: "Démontrer l'impact concret de nos solutions à travers des résultats chiffrés." },
  { label: "📈 Analyse & Tendance Marché", text: "Partager notre expertise et vision sur l'évolution du secteur et des technologies IA." },
];

const BLOG_IDEA_SUGGESTIONS = [
  "Pourquoi adopter un agent IA pour votre entreprise en 2026 ?",
  "Carte d’identité de Tybot : Fonctionnalités, intégrations et cas d'usage",
  "5 erreurs courantes dans la gestion des réseaux sociaux (et comment les éviter)",
  "Comment automatiser la publication multi-plateformes sans perdre en authenticité",
];

export function BlogBrainstormingView({ onAskAgent }: { onAskAgent?: (prompt?: string) => void }) {
  const toast = useToast();
  const { data: records, isLoading, isError, refetch, isRefetching } = useBlogBrainstorming();
  const createM = useCreateBlogBrainstorming();
  const updateM = useUpdateBlogBrainstorming();
  const deleteM = useDeleteBlogBrainstorming();

  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Modales
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<BlogBrainstormingRecord | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<BlogBrainstormingRecord | null>(null);
  const [previewRecord, setPreviewRecord] = useState<BlogBrainstormingRecord | null>(null);

  // Form State
  const [formCalendrier, setFormCalendrier] = useState<string>("");
  const [formIdees, setFormIdees] = useState<string>("");
  const [formObjectif, setFormObjectif] = useState<string>("");

  const openCreate = () => {
    setSelectedRecord(null);
    const todayStr = new Date().toISOString().split("T")[0];
    setFormCalendrier(todayStr);
    setFormIdees("");
    setFormObjectif("");
    setModalMode("create");
  };

  const openEdit = (record: BlogBrainstormingRecord) => {
    setSelectedRecord(record);
    setFormCalendrier(record.Calendrier || "");
    setFormIdees(record["Idées"] || "");
    setFormObjectif(record.Objectif || "");
    setModalMode("edit");
  };

  const handleSave = async () => {
    if (!formCalendrier.trim()) {
      toast("Veuillez renseigner une date", { kind: "error" });
      return;
    }
    if (!formIdees.trim()) {
      toast("Veuillez renseigner au moins une idée d'article", { kind: "error" });
      return;
    }

    try {
      if (modalMode === "create") {
        await createM.mutateAsync({
          Calendrier: formCalendrier.trim(),
          "Idées": formIdees.trim(),
          Objectif: formObjectif.trim() || null,
        });
        toast("Sujet de blog créé avec succès !", { kind: "success" });
      } else if (modalMode === "edit" && selectedRecord) {
        await updateM.mutateAsync({
          Id: selectedRecord.Id,
          Calendrier: formCalendrier.trim(),
          "Idées": formIdees.trim(),
          Objectif: formObjectif.trim() || null,
        });
        toast("Sujet de blog mis à jour avec succès !", { kind: "success" });
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
      toast("Sujet de blog supprimé !", { kind: "success" });
      setDeleteConfirm(null);
    } catch (err: any) {
      toast("Erreur lors de la suppression", { kind: "error", msg: err?.message });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast("Copié dans le presse-papiers !", { kind: "success" });
  };

  // Helper pour découper les idées en liste
  const parseIdees = (ideesStr?: string | null): string[] => {
    if (!ideesStr) return [];
    return ideesStr
      .split(/\n|,/)
      .map((s) => s.trim().replace(/^[-•*]\s*/, ""))
      .filter((s) => s.length > 0);
  };

  // Filtrage
  const filteredList = useMemo(() => {
    return (records || []).filter((r) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const cal = (r.Calendrier || "").toLowerCase();
      const idees = (r["Idées"] || "").toLowerCase();
      const obj = (r.Objectif || "").toLowerCase();
      return cal.includes(q) || idees.includes(q) || obj.includes(q);
    });
  }, [records, search]);

  // Total ideas count
  const totalIdeasCount = useMemo(() => {
    return (records || []).reduce((acc, r) => acc + parseIdees(r["Idées"]).length, 0);
  }, [records]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%" }}>
      {/* En-tête de la sous-section */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "color-mix(in srgb, #A855F7 15%, transparent)",
                color: "#A855F7",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <BookOpen size={20} />
            </div>
            <h1 style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: 24, color: "var(--tx)", margin: 0 }}>
              Brainstorming Blog & Rédaction
            </h1>
            <span style={{ fontSize: 11, fontWeight: 600, background: "rgba(168, 85, 247, 0.15)", color: "#C084FC", padding: "3px 9px", borderRadius: 12 }}>
              Tybot Smart-DB (Blog)
            </span>
          </div>
          <p style={{ fontSize: 13, color: "var(--tx-dim)", margin: "6px 0 0" }}>
            Planifiez vos sujets d'articles de blog, vos idées de contenu éditorial et les objectifs de trafic pour votre site.
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
            style={{ background: "linear-gradient(135deg, #7C3AED, #A855F7)", borderColor: "#7C3AED" }}
          >
            Nouvelle Brainstorming
          </MSButton>
        </div>
      </div>

      {/* Cartes KPI / Résumé */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        <div style={{ background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 12, padding: "16px 18px", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--tx-dim)" }}>
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>Sessions Blog</span>
            <Calendar size={16} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--tx)", marginTop: 8, fontFamily: "DM Sans, sans-serif" }}>
            {records?.length || 0}
          </div>
          <div style={{ fontSize: 12, color: "var(--tx-dim)", marginTop: 4 }}>
            Dates planifiées dans la table
          </div>
        </div>

        <div style={{ background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 12, padding: "16px 18px", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--tx-dim)" }}>
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>Idées d'Articles</span>
            <Lightbulb size={16} style={{ color: "#F59E0B" }} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#F59E0B", marginTop: 8, fontFamily: "DM Sans, sans-serif" }}>
            {totalIdeasCount}
          </div>
          <div style={{ fontSize: 12, color: "var(--tx-dim)", marginTop: 4 }}>
            Titres et angles de rédaction
          </div>
        </div>

        <div style={{ background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 12, padding: "16px 18px", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--tx-dim)" }}>
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>Avec Objectif Précisé</span>
            <Target size={16} style={{ color: "#A855F7" }} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#A855F7", marginTop: 8, fontFamily: "DM Sans, sans-serif" }}>
            {records?.filter((r) => !!r.Objectif?.trim()).length || 0}
          </div>
          <div style={{ fontSize: 12, color: "var(--tx-dim)", marginTop: 4 }}>
            Cibles SEO & conversion définies
          </div>
        </div>

        <div style={{ background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 12, padding: "16px 18px", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--tx-dim)" }}>
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>Rédacteur IA</span>
            <Sparkles size={16} style={{ color: "#C084FC" }} />
          </div>
          <div style={{ fontSize: 13, color: "var(--tx)", marginTop: 8, lineHeight: 1.4 }}>
            Rédigez un article complet à partir de chaque idée de sujet.
          </div>
          {onAskAgent && (
            <button
              onClick={() => onAskAgent("Propose-moi 5 idées d'articles de blog innovants pour Tybot")}
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#C084FC",
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
              Générer avec l'Agent <Sparkles size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Barre de Recherche et Filtres */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ position: "relative", minWidth: 260, flex: 1, maxWidth: 400 }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--tx-dim)" }} />
          <input
            type="text"
            placeholder="Rechercher une idée, date ou objectif..."
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

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setViewMode("grid")}
            style={{
              padding: "7px 11px",
              borderRadius: 8,
              border: "1px solid " + (viewMode === "grid" ? "var(--accent)" : "var(--bd)"),
              background: viewMode === "grid" ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "var(--surf-card)",
              color: viewMode === "grid" ? "var(--accent)" : "var(--tx-dim)",
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
              border: "1px solid " + (viewMode === "table" ? "var(--accent)" : "var(--bd)"),
              background: viewMode === "table" ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "var(--surf-card)",
              color: viewMode === "table" ? "var(--accent)" : "var(--tx-dim)",
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

      {/* État de chargement / Erreur / Vide */}
      {isLoading ? (
        <div style={{ padding: 60, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <Loader2 size={32} className="animate-spin" style={{ color: "#A855F7" }} />
          <div style={{ fontSize: 13, color: "var(--tx-dim)" }}>Chargement des sessions de brainstorming blog…</div>
        </div>
      ) : isError ? (
        <div style={{ padding: 40, textAlign: "center", background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 12 }}>
          <div style={{ color: "#EF4444", fontWeight: 600, fontSize: 14 }}>Erreur de connexion</div>
          <div style={{ fontSize: 12.5, color: "var(--tx-dim)", marginTop: 4 }}>Impossible de charger les données de la table Blog Tybot.</div>
          <MSButton variant="outline" size="sm" onClick={() => refetch()} style={{ marginTop: 12 }}>
            Réessayer
          </MSButton>
        </div>
      ) : filteredList.length === 0 ? (
        <div style={{ padding: 60, textAlign: "center", background: "var(--surf-card)", border: "1px dashed var(--bd)", borderRadius: 14 }}>
          <BookOpen size={36} style={{ color: "var(--tx-dim)", opacity: 0.5, margin: "0 auto 12px" }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--tx)" }}>Aucun sujet de blog trouvé</div>
          <div style={{ fontSize: 13, color: "var(--tx-dim)", marginTop: 4, maxWidth: 380, margin: "4px auto 16px" }}>
            {search ? "Aucun enregistrement ne correspond à votre recherche." : "Commencez par créer votre première session de brainstorming pour les articles de blog."}
          </div>
          <MSButton variant="primary" icon={<Plus size={15} />} onClick={openCreate} style={{ background: "linear-gradient(135deg, #7C3AED, #A855F7)", borderColor: "#7C3AED" }}>
            Créer un sujet de blog
          </MSButton>
        </div>
      ) : viewMode === "grid" ? (
        /* Vue Cartes Grille */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
          {filteredList.map((record) => {
            const ideesList = parseIdees(record["Idées"]);
            return (
              <div
                key={record.Id}
                style={{
                  background: "var(--surf-card)",
                  border: "1px solid var(--bd)",
                  borderRadius: 14,
                  padding: "18px 20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  transition: "transform .15s ease, box-shadow .15s ease, border-color .15s ease",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
                  position: "relative",
                }}
              >
                {/* Header carte */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(168, 85, 247, 0.15)", color: "#C084FC", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Calendar size={15} />
                    </div>
                    <div>
                      <div style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: 16, color: "var(--tx)" }}>
                        {record.Calendrier || "Date non spécifiée"}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--tx-dim)", fontFamily: "JetBrains Mono" }}>
                        ID #{record.Id}
                      </div>
                    </div>
                  </div>

                  <span style={{ fontSize: 10.5, fontWeight: 600, background: "rgba(168, 85, 247, 0.12)", color: "#D8B4FE", border: "1px solid rgba(168, 85, 247, 0.3)", padding: "2px 8px", borderRadius: 999 }}>
                    Blog
                  </span>
                </div>

                {/* Objectif */}
                {record.Objectif ? (
                  <div style={{ background: "var(--surf-inset)", border: "1px solid var(--bd)", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "#C084FC", textTransform: "uppercase", marginBottom: 3 }}>
                      <Target size={12} /> Objectif de publication
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--tx-2)", lineHeight: 1.4 }}>
                      {record.Objectif}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 11.5, color: "var(--tx-dim)", fontStyle: "italic" }}>
                    Aucun objectif spécifique défini
                  </div>
                )}

                {/* Idées d'articles */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                      Idées d'articles ({ideesList.length})
                    </span>
                    {ideesList.length > 0 && (
                      <button
                        onClick={() => copyToClipboard(record["Idées"] || "")}
                        title="Copier les idées"
                        style={{ background: "transparent", border: "none", color: "var(--tx-dim)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11 }}
                      >
                        <Copy size={11} /> Copier
                      </button>
                    )}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {ideesList.slice(0, 3).map((idee, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 8,
                          padding: "8px 10px",
                          borderRadius: 8,
                          background: "var(--surf-2)",
                          border: "1px solid var(--bd)",
                          fontSize: 12.5,
                          color: "var(--tx)",
                          lineHeight: 1.4,
                        }}
                      >
                        <PenTool size={13} style={{ color: "#A855F7", flexShrink: 0, marginTop: 2 }} />
                        <span style={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                          {idee}
                        </span>
                      </div>
                    ))}
                    {ideesList.length > 3 && (
                      <div style={{ fontSize: 11, color: "var(--tx-dim)", textAlign: "center", paddingTop: 2 }}>
                        +{ideesList.length - 3} autre(s) idée(s)...
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions Footer */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--bd)", paddingTop: 12, marginTop: "auto" }}>
                  <MSButton variant="ghost" size="sm" onClick={() => setPreviewRecord(record)} icon={<Eye size={13} />}>
                    Détails
                  </MSButton>

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
            );
          })}
        </div>
      ) : (
        /* Vue Tableau */
        <div style={{ background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 14, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--surf-inset)", borderBottom: "1px solid var(--bd)", color: "var(--tx-dim)", fontSize: 11.5, textTransform: "uppercase" }}>
                <th style={{ padding: "12px 16px" }}>Date</th>
                <th style={{ padding: "12px 16px" }}>Objectif</th>
                <th style={{ padding: "12px 16px" }}>Idées d'articles</th>
                <th style={{ padding: "12px 16px", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.map((record) => {
                const ideesList = parseIdees(record["Idées"]);
                return (
                  <tr key={record.Id} style={{ borderBottom: "1px solid var(--bd-weak)", transition: "background .15s" }}>
                    <td style={{ padding: "14px 16px", whiteSpace: "nowrap" }}>
                      <div style={{ fontWeight: 600, color: "var(--tx)" }}>{record.Calendrier}</div>
                      <div style={{ fontSize: 11, color: "var(--tx-dim)", fontFamily: "JetBrains Mono" }}>#{record.Id}</div>
                    </td>
                    <td style={{ padding: "14px 16px", maxWidth: 220 }}>
                      {record.Objectif ? (
                        <span style={{ fontSize: 12, color: "var(--tx-2)" }}>{record.Objectif}</span>
                      ) : (
                        <span style={{ color: "var(--tx-dim)", fontStyle: "italic", fontSize: 11.5 }}>Non spécifié</span>
                      )}
                    </td>
                    <td style={{ padding: "14px 16px", maxWidth: 400 }}>
                      <div style={{ fontSize: 12.5, color: "var(--tx)", whiteSpace: "pre-wrap", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                        {record["Idées"] || "Aucune idée"}
                      </div>
                      <div style={{ fontSize: 11, color: "#C084FC", marginTop: 3 }}>
                        {ideesList.length} sujet(s)
                      </div>
                    </td>
                    <td style={{ padding: "14px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <MSButton variant="ghost" size="sm" onClick={() => setPreviewRecord(record)} icon={<Eye size={13} />} />
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
              maxWidth: 580,
              background: "var(--surf-pop)",
              border: "1px solid var(--bd)",
              borderRadius: 16,
              padding: 24,
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--bd)", paddingBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <BookOpen size={20} style={{ color: "#A855F7" }} />
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--tx)", margin: 0, fontFamily: "DM Sans, sans-serif" }}>
                  {modalMode === "create" ? "Nouveau Sujet de Blog" : "Modifier le Sujet de Blog"}
                </h3>
              </div>
              <button
                onClick={() => setModalMode(null)}
                style={{ background: "transparent", border: "none", color: "var(--tx-dim)", cursor: "pointer", fontSize: 18 }}
              >
                ✕
              </button>
            </div>

            {/* Date */}
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase", marginBottom: 6 }}>
                Date / Calendrier
              </label>
              <input
                type="date"
                value={formCalendrier}
                onChange={(e) => setFormCalendrier(e.target.value)}
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

            {/* Objectif */}
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase", marginBottom: 6 }}>
                Objectif de Publication (Optionnel)
              </label>
              <input
                type="text"
                placeholder="Ex: Trafic SEO, Tuto pratique, Présentation produit..."
                value={formObjectif}
                onChange={(e) => setFormObjectif(e.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--bd)",
                  background: "var(--surf-2)",
                  color: "var(--tx)",
                  fontSize: 13,
                  outline: "none",
                  marginBottom: 8,
                }}
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {BLOG_OBJECTIVE_TEMPLATES.map((tmpl, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setFormObjectif(tmpl.label.replace(/^.*? /, ""))}
                    style={{
                      padding: "3px 8px",
                      borderRadius: 6,
                      fontSize: 11,
                      background: "rgba(168, 85, 247, 0.12)",
                      border: "1px solid rgba(168, 85, 247, 0.3)",
                      color: "#D8B4FE",
                      cursor: "pointer",
                    }}
                  >
                    {tmpl.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Idées d'articles */}
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase", marginBottom: 6 }}>
                Idées d'Articles & Angles Rédactionnels
              </label>
              <textarea
                rows={5}
                placeholder="Listez les idées d'articles, séparées par des retours à la ligne ou virgules..."
                value={formIdees}
                onChange={(e) => setFormIdees(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--bd)",
                  background: "var(--surf-2)",
                  color: "var(--tx)",
                  fontSize: 13,
                  lineHeight: 1.5,
                  outline: "none",
                  resize: "vertical",
                  marginBottom: 8,
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 11, color: "var(--tx-dim)" }}>Suggestions d'idées :</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {BLOG_IDEA_SUGGESTIONS.map((sug, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setFormIdees((prev) => (prev.trim() ? `${prev}\n• ${sug}` : `• ${sug}`));
                      }}
                      style={{
                        padding: "3px 8px",
                        borderRadius: 6,
                        fontSize: 11,
                        background: "var(--surf-inset)",
                        border: "1px solid var(--bd)",
                        color: "var(--tx-2)",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      + {sug}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer Modal */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", borderTop: "1px solid var(--bd)", paddingTop: 14, marginTop: 6 }}>
              <MSButton variant="outline" onClick={() => setModalMode(null)}>
                Annuler
              </MSButton>
              <MSButton
                variant="primary"
                onClick={handleSave}
                disabled={createM.isPending || updateM.isPending}
                icon={createM.isPending || updateM.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                style={{ background: "linear-gradient(135deg, #7C3AED, #A855F7)", borderColor: "#7C3AED" }}
              >
                {modalMode === "create" ? "Créer l'idée blog" : "Enregistrer les modifications"}
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
              Supprimer le sujet de blog #{deleteConfirm.Id} ?
            </div>
            <div style={{ fontSize: 13, color: "var(--tx-dim)", lineHeight: 1.5, marginBottom: 20 }}>
              Cette action retirera définitivement cet enregistrement de la base Tybot Smart-DB (table Blog).
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

      {/* Modal Détails Complet (Preview) */}
      {previewRecord && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 220,
            background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setPreviewRecord(null)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 620,
              background: "var(--surf-pop)",
              border: "1px solid var(--bd)",
              borderRadius: 16,
              padding: 24,
              boxShadow: "0 25px 80px rgba(0,0,0,0.6)",
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--bd)", paddingBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <BookOpen size={18} style={{ color: "#A855F7" }} />
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--tx)", margin: 0, fontFamily: "DM Sans, sans-serif" }}>
                  Sujet de Blog · {previewRecord.Calendrier}
                </h3>
              </div>
              <button
                onClick={() => setPreviewRecord(null)}
                style={{ background: "transparent", border: "none", color: "var(--tx-dim)", cursor: "pointer", fontSize: 18 }}
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: 12, color: "var(--tx-dim)" }}>
              ID Enregistrement : #{previewRecord.Id}
              {previewRecord.CreatedAt && ` · Créé le ${new Date(previewRecord.CreatedAt).toLocaleString("fr-FR")}`}
            </div>

            {previewRecord.Objectif && (
              <div style={{ background: "var(--surf-inset)", padding: 12, borderRadius: 10, border: "1px solid var(--bd)" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#C084FC", textTransform: "uppercase", marginBottom: 4 }}>
                  Objectif
                </div>
                <div style={{ fontSize: 13, color: "var(--tx)" }}>
                  {previewRecord.Objectif}
                </div>
              </div>
            )}

            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase", marginBottom: 8 }}>
                Idées d'Articles & Sujets
              </div>
              <div
                style={{
                  fontSize: 13.5,
                  color: "var(--tx)",
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.65,
                  background: "var(--surf-2)",
                  padding: 16,
                  borderRadius: 10,
                  border: "1px solid var(--bd)",
                  maxHeight: 280,
                  overflowY: "auto",
                }}
              >
                {previewRecord["Idées"] || "Aucune idée renseignée."}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--bd)", paddingTop: 14 }}>
              <div style={{ display: "flex", gap: 8 }}>
                {previewRecord["Idées"] && (
                  <MSButton
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(previewRecord["Idées"] || "")}
                    icon={<Copy size={13} />}
                  >
                    Copier les idées
                  </MSButton>
                )}
                {onAskAgent && previewRecord["Idées"] && (
                  <MSButton
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const idees = previewRecord["Idées"];
                      setPreviewRecord(null);
                      onAskAgent(`Rédige-moi un article de blog complet et optimisé SEO à partir de cette idée : "${idees}"`);
                    }}
                    icon={<Sparkles size={13} style={{ color: "#C084FC" }} />}
                    style={{ borderColor: "rgba(168, 85, 247, 0.4)", color: "#D8B4FE" }}
                  >
                    Rédiger avec l'IA
                  </MSButton>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                <MSButton
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const r = previewRecord;
                    setPreviewRecord(null);
                    openEdit(r);
                  }}
                  icon={<Edit3 size={13} />}
                >
                  Modifier
                </MSButton>
                <MSButton variant="primary" size="sm" onClick={() => setPreviewRecord(null)}>
                  Fermer
                </MSButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
