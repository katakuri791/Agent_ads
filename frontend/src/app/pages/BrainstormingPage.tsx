import { useState, useMemo } from "react";
import {
  BrainCircuit, Calendar, Plus, Edit3, Trash2, Search,
  RefreshCw, Sparkles, Target, Check, Loader2, Eye,
  AlertCircle, ChevronRight, Copy, Filter, LayoutGrid, List, FileText
} from "lucide-react";
import { Card, Tabs, MSButton } from "../components/ms/primitives";
import { useToast } from "../providers/ToastProvider";
import { BlogBrainstormingView } from "../components/brainstorming/BlogBrainstormingView";
import {
  useBrainstorming,
  useCreateBrainstorming,
  useUpdateBrainstorming,
  useDeleteBrainstorming,
  type BrainstormingRecord
} from "../hooks/useBrainstorming";

const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre"
];

const GOALS_TEMPLATES = [
  {
    label: "🚀 Lancement de Produit / Service",
    text: "• Objectif : Faire découvrir la nouvelle offre et générer 500+ leads\n• Piliers de contenu : Teasers vidéo, démos fonctionnalités, avis bêta-testeurs\n• Offre de lancement : -20% sur les 100 premières inscriptions\n• Événement live prévu en milieu de mois"
  },
  {
    label: "🎯 Notoriété & Croissance Communauté",
    text: "• Objectif : Augmenter la portée organique de 35% et gagner 1 000 followers ciblés\n• Formats prioritaires : Carrousels éducatifs et Reels / Vidéos courtes\n• Thèmes : Conseils d'experts, coulisses de l'équipe, anecdotes secteur\n• Questions ouvertes hebdomadaires pour stimuler l'interaction"
  },
  {
    label: "🔥 Campagne Promotionnelle & Conversion",
    text: "• Objectif : Booster les ventes directes de fin de trimestre\n• Focus : Témoignages clients, cas d'usage concrets, démonstration du ROI\n• Storytelling : Problème > Solution > Résultat chiffré\n• Relance sur WhatsApp et redirection vers la page d'atterrissage"
  }
];

export function BrainstormingPage({ onNavigate, onAskAgent, initialTab = "Réseaux Sociaux" }: {
  onNavigate?: (pageId: string) => void;
  onAskAgent?: (prompt?: string) => void;
  initialTab?: "Réseaux Sociaux" | "Blog";
}) {
  const toast = useToast();
  const [mainTab, setMainTab] = useState<"Réseaux Sociaux" | "Blog">(() => {
    const urlTab = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;
    if (urlTab?.toLowerCase() === "blog") return "Blog";
    return initialTab;
  });
  const { data: records, isLoading, isError, refetch, isRefetching } = useBrainstorming();
  const createM = useCreateBrainstorming();
  const updateM = useUpdateBrainstorming();
  const deleteM = useDeleteBrainstorming();

  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Modales
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<BrainstormingRecord | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<BrainstormingRecord | null>(null);
  const [previewRecord, setPreviewRecord] = useState<BrainstormingRecord | null>(null);

  // Form State
  const [selectedMonth, setSelectedMonth] = useState<string>("mai");
  const [selectedYear, setSelectedYear] = useState<string>("2026");
  const [formGoals, setFormGoals] = useState<string>("");

  const openCreate = () => {
    setSelectedRecord(null);
    const now = new Date();
    const currentMonthIdx = now.getMonth();
    const nextMonthIdx = (currentMonthIdx + 1) % 12;
    setSelectedMonth(MONTHS[nextMonthIdx]);
    setSelectedYear(String(now.getFullYear()));
    setFormGoals("");
    setModalMode("create");
  };

  const openEdit = (record: BrainstormingRecord) => {
    setSelectedRecord(record);
    if (record.Calendar && record.Calendar.includes("/")) {
      const [m, y] = record.Calendar.split("/");
      setSelectedMonth(m.toLowerCase().trim());
      setSelectedYear(y.trim());
    } else {
      setSelectedMonth("mai");
      setSelectedYear("2026");
    }
    setFormGoals(record.Goals || "");
    setModalMode("edit");
  };

  const handleSave = async () => {
    const calendarValue = `${selectedMonth.toLowerCase().trim()}/${selectedYear.trim()}`;
    if (!calendarValue) {
      toast("Veuillez sélectionner un mois et une année", { kind: "error" });
      return;
    }

    try {
      if (modalMode === "create") {
        await createM.mutateAsync({
          Calendar: calendarValue,
          Goals: formGoals.trim() || null,
        });
        toast("Session de brainstorming créée avec succès !", { kind: "success" });
      } else if (modalMode === "edit" && selectedRecord) {
        await updateM.mutateAsync({
          Id: selectedRecord.Id,
          Calendar: calendarValue,
          Goals: formGoals.trim() || null,
        });
        toast("Session de brainstorming mise à jour avec succès !", { kind: "success" });
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
      toast("Session de brainstorming supprimée !", { kind: "success" });
      setDeleteConfirm(null);
    } catch (err: any) {
      toast("Erreur lors de la suppression", { kind: "error", msg: err?.message });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast("Objectifs copiés dans le presse-papiers", { kind: "success" });
  };

  // Années disponibles
  const availableYears = useMemo(() => {
    const set = new Set<string>();
    (records || []).forEach((r) => {
      if (r.Calendar && r.Calendar.includes("/")) {
        const parts = r.Calendar.split("/");
        if (parts[1]) set.add(parts[1].trim());
      }
    });
    return Array.from(set);
  }, [records]);

  // Filtrage
  const filteredList = useMemo(() => {
    return (records || []).filter((r) => {
      if (yearFilter !== "all" && (!r.Calendar || !r.Calendar.endsWith(yearFilter))) {
        return false;
      }
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const cal = (r.Calendar || "").toLowerCase();
      const goals = (r.Goals || "").toLowerCase();
      return cal.includes(q) || goals.includes(q);
    });
  }, [records, yearFilter, search]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%", maxWidth: 1200, margin: "0 auto" }}>
      {/* Sélecteur d'onglets principal : Réseaux Sociaux vs Blog */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, borderBottom: "1px solid var(--bd)", paddingBottom: 14 }}>
        <Tabs
          tabs={["Réseaux Sociaux", "Blog"]}
          value={mainTab}
          onChange={(t) => setMainTab(t as "Réseaux Sociaux" | "Blog")}
        />
        <div style={{ fontSize: 12, color: "var(--tx-dim)", display: "flex", alignItems: "center", gap: 6 }}>
          <span>Table active :</span>
          <span style={{ fontFamily: "JetBrains Mono", fontWeight: 600, color: mainTab === "Blog" ? "#C084FC" : "var(--accent)" }}>
            {mainTab === "Réseaux Sociaux" ? "m8r4voakup6hkd5 (Social Media)" : "mazdd74gdq30p9j (Blog)"}
          </span>
        </div>
      </div>

      {mainTab === "Blog" ? (
        <BlogBrainstormingView onAskAgent={onAskAgent} />
      ) : (
        <>
          {/* En-tête de la page */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "color-mix(in srgb, var(--accent) 15%, transparent)",
                color: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <BrainCircuit size={20} />
            </div>
            <h1 style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: 24, color: "var(--tx)", margin: 0 }}>
              Brainstorming & Planning Stratégique
            </h1>
            <span style={{ fontSize: 11, fontWeight: 600, background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)", padding: "3px 9px", borderRadius: 12 }}>
              Tybot Smart-DB
            </span>
          </div>
          <p style={{ fontSize: 13, color: "var(--tx-dim)", margin: "6px 0 0" }}>
            Planifiez vos sessions de brainstorming mensuelles, définissez les objectifs de contenu et alimentez vos campagnes.
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
          <MSButton variant="primary" icon={<Plus size={16} />} onClick={openCreate}>
            Nouvelle Session
          </MSButton>
        </div>
      </div>

      {/* Cartes KPI / Résumé */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        <div style={{ background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 12, padding: "16px 18px", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--tx-dim)" }}>
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>Sessions Planifiées</span>
            <Calendar size={16} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--tx)", marginTop: 8, fontFamily: "DM Sans, sans-serif" }}>
            {records?.length || 0}
          </div>
          <div style={{ fontSize: 12, color: "var(--tx-dim)", marginTop: 4 }}>
            Mois configurés dans la base
          </div>
        </div>

        <div style={{ background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 12, padding: "16px 18px", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--tx-dim)" }}>
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>Avec Objectifs Détaillés</span>
            <Target size={16} style={{ color: "var(--accent)" }} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--accent)", marginTop: 8, fontFamily: "DM Sans, sans-serif" }}>
            {records?.filter((r) => !!r.Goals?.trim()).length || 0}
          </div>
          <div style={{ fontSize: 12, color: "var(--tx-dim)", marginTop: 4 }}>
            Prêts pour la création de contenu
          </div>
        </div>

        <div style={{ background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 12, padding: "16px 18px", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--tx-dim)" }}>
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>Assistance IA</span>
            <Sparkles size={16} style={{ color: "#F59E0B" }} />
          </div>
          <div style={{ fontSize: 13, color: "var(--tx)", marginTop: 8, lineHeight: 1.4 }}>
            Générez des idées de contenu à partir de chaque brainstorming.
          </div>
          {onAskAgent && (
            <button
              onClick={() => onAskAgent("Aide-moi à faire le brainstorming pour mon prochain mois de contenu")}
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--accent)",
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                marginTop: 6,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              Lancer l'agent IA <ChevronRight size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Barre de recherche et contrôles */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", background: "var(--surf-2)", border: "1px solid var(--bd)", borderRadius: 12, padding: "10px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 240 }}>
          <input
            type="text"
            placeholder="Rechercher par mois ou objectifs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              height: 36,
              background: "var(--surf-card)",
              border: "1px solid var(--bd)",
              borderRadius: 8,
              padding: "0 12px",
              fontSize: 13,
              color: "var(--tx)",
              outline: "none",
            }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {availableYears.length > 0 && (
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              style={{
                height: 36,
                background: "var(--surf-card)",
                border: "1px solid var(--bd)",
                borderRadius: 8,
                padding: "0 10px",
                fontSize: 12.5,
                color: "var(--tx)",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="all">Toutes les années</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          )}

          <div style={{ display: "flex", background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 8, padding: 2 }}>
            <button
              onClick={() => setViewMode("grid")}
              title="Vue Grille"
              style={{
                padding: "6px 9px",
                borderRadius: 6,
                border: "none",
                background: viewMode === "grid" ? "var(--surf-2)" : "transparent",
                color: viewMode === "grid" ? "var(--accent)" : "var(--tx-dim)",
                cursor: "pointer",
              }}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setViewMode("table")}
              title="Vue Tableau"
              style={{
                padding: "6px 9px",
                borderRadius: 6,
                border: "none",
                background: viewMode === "table" ? "var(--surf-2)" : "transparent",
                color: viewMode === "table" ? "var(--accent)" : "var(--tx-dim)",
                cursor: "pointer",
              }}
            >
              <List size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Chargement */}
      {isLoading && (
        <div style={{ padding: 60, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <Loader2 size={32} className="animate-spin" style={{ color: "var(--accent)" }} />
          <span style={{ fontSize: 13, color: "var(--tx-dim)" }}>Chargement des sessions de brainstorming...</span>
        </div>
      )}

      {/* Erreur */}
      {isError && (
        <div style={{ padding: 20, borderRadius: 12, background: "#EF444415", border: "1px solid #EF444430", display: "flex", alignItems: "center", gap: 14 }}>
          <AlertCircle size={22} color="#EF4444" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: "#EF4444", fontSize: 14 }}>Erreur de chargement</div>
            <div style={{ fontSize: 12.5, color: "var(--tx-dim)", marginTop: 2 }}>Impossible de joindre la table Brainstorming Tybot.</div>
          </div>
          <MSButton variant="outline" size="sm" onClick={() => refetch()}>Réessayer</MSButton>
        </div>
      )}

      {/* Liste des résultats */}
      {!isLoading && !isError && (
        <>
          {filteredList.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 24px", border: "1px dashed var(--bd)", borderRadius: 14, background: "var(--surf-2)" }}>
              <BrainCircuit size={40} style={{ color: "var(--accent)", opacity: 0.7, margin: "0 auto 12px" }} />
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--tx)" }}>Aucune session trouvée</div>
              <p style={{ fontSize: 13, color: "var(--tx-dim)", maxWidth: 400, margin: "6px auto 18px" }}>
                Créez une session mensuelle pour poser les objectifs et orientations stratégiques de vos publications.
              </p>
              <MSButton variant="primary" icon={<Plus size={15} />} onClick={openCreate}>
                Planifier une session
              </MSButton>
            </div>
          ) : viewMode === "grid" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 18 }}>
              {filteredList.map((rec) => {
                const parts = (rec.Calendar || "").split("/");
                const monthName = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : "Non défini";
                const year = parts[1] || "";
                const hasGoals = !!rec.Goals?.trim();

                return (
                  <div
                    key={rec.Id}
                    style={{
                      border: "1px solid var(--bd)",
                      borderRadius: 14,
                      background: "var(--surf-card)",
                      padding: 20,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: 16,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
                      transition: "transform 0.15s ease, box-shadow 0.15s ease",
                    }}
                  >
                    <div>
                      {/* Carte Header */}
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div
                            style={{
                              width: 44,
                              height: 44,
                              borderRadius: 10,
                              background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                              border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)",
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "var(--accent)",
                            }}
                          >
                            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>
                              {monthName.slice(0, 3)}
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--tx-dim)" }}>
                              {year.slice(-2)}
                            </span>
                          </div>

                          <div>
                            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--tx)", fontFamily: "DM Sans, sans-serif" }}>
                              {monthName} {year}
                            </div>
                            <div style={{ fontSize: 11.5, color: "var(--tx-dim)" }}>
                              ID #{rec.Id} {rec.CreatedAt ? `· ${new Date(rec.CreatedAt).toLocaleDateString("fr-FR")}` : ""}
                            </div>
                          </div>
                        </div>

                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: "3px 8px",
                            borderRadius: 999,
                            background: hasGoals ? "#22C55E15" : "var(--surf-2)",
                            color: hasGoals ? "#22C55E" : "var(--tx-dim)",
                            border: `1px solid ${hasGoals ? "#22C55E30" : "var(--bd)"}`,
                          }}
                        >
                          {hasGoals ? "Objectifs définis" : "À compléter"}
                        </span>
                      </div>

                      {/* Contenu Goals */}
                      <div
                        style={{
                          background: "var(--surf-2)",
                          border: "1px solid var(--bd)",
                          borderRadius: 10,
                          padding: 12,
                          fontSize: 13,
                          color: hasGoals ? "var(--tx-2)" : "var(--tx-dim)",
                          lineHeight: 1.55,
                          minHeight: 85,
                          maxHeight: 140,
                          overflowY: "auto",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {hasGoals ? rec.Goals : "Aucun objectif ou note saisi pour ce mois."}
                      </div>
                    </div>

                    {/* Actions de la carte */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--bd)", paddingTop: 14 }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <MSButton
                          variant="outline"
                          size="sm"
                          onClick={() => setPreviewRecord(rec)}
                          icon={<Eye size={13} />}
                        >
                          Détails
                        </MSButton>
                        {hasGoals && (
                          <button
                            onClick={() => copyToClipboard(rec.Goals || "")}
                            title="Copier les objectifs"
                            style={{
                              height: 32,
                              padding: "0 8px",
                              borderRadius: 6,
                              background: "transparent",
                              border: "1px solid var(--bd)",
                              color: "var(--tx-dim)",
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                            }}
                          >
                            <Copy size={13} />
                          </button>
                        )}
                      </div>

                      <div style={{ display: "flex", gap: 6 }}>
                        <MSButton
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(rec)}
                          icon={<Edit3 size={13} />}
                        >
                          Modifier
                        </MSButton>
                        <MSButton
                          variant="outline"
                          size="sm"
                          danger
                          onClick={() => setDeleteConfirm(rec)}
                          icon={<Trash2 size={13} />}
                        >
                          Suppr.
                        </MSButton>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Vue Tableau */
            <div style={{ border: "1px solid var(--bd)", borderRadius: 12, overflow: "hidden", background: "var(--surf-card)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--surf-2)", borderBottom: "1px solid var(--bd)", textAlign: "left" }}>
                    <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--tx-dim)", fontSize: 12 }}>ID</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--tx-dim)", fontSize: 12 }}>Mois (Calendar)</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--tx-dim)", fontSize: 12 }}>Objectifs Stratégiques (Goals)</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--tx-dim)", fontSize: 12 }}>Créé le</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--tx-dim)", fontSize: 12, textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredList.map((rec) => (
                    <tr key={rec.Id} style={{ borderBottom: "1px solid var(--bd)", transition: "background 0.1s" }}>
                      <td style={{ padding: "12px 16px", color: "var(--tx-dim)", fontWeight: 600 }}>#{rec.Id}</td>
                      <td style={{ padding: "12px 16px", fontWeight: 700, color: "var(--tx)" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <Calendar size={14} style={{ color: "var(--accent)" }} />
                          {rec.Calendar}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", color: "var(--tx-2)", maxWidth: 380 }}>
                        <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {rec.Goals || "—"}
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px", color: "var(--tx-dim)", fontSize: 12 }}>
                        {rec.CreatedAt ? new Date(rec.CreatedAt).toLocaleDateString("fr-FR") : "—"}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 6 }}>
                          <MSButton variant="outline" size="sm" onClick={() => setPreviewRecord(rec)}>
                            Détails
                          </MSButton>
                          <MSButton variant="outline" size="sm" onClick={() => openEdit(rec)} icon={<Edit3 size={13} />}>
                            Éditer
                          </MSButton>
                          <MSButton variant="outline" size="sm" danger onClick={() => setDeleteConfirm(rec)} icon={<Trash2 size={13} />}>
                            Suppr.
                          </MSButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Modal Création & Édition */}
      {modalMode && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(4px)",
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
              boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--bd)", paddingBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--tx)", margin: 0, fontFamily: "DM Sans, sans-serif" }}>
                  {modalMode === "create" ? "Nouvelle session de brainstorming" : `Modifier la session #${selectedRecord?.Id}`}
                </h3>
                <p style={{ fontSize: 12.5, color: "var(--tx-dim)", margin: "4px 0 0" }}>
                  Sélectionnez le mois cible et formulez vos objectifs éditoriaux.
                </p>
              </div>
              <button
                onClick={() => setModalMode(null)}
                style={{ background: "transparent", border: "none", color: "var(--tx-dim)", cursor: "pointer", fontSize: 18 }}
              >
                ✕
              </button>
            </div>

            {/* Formulaire */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Sélecteurs Mois & Année */}
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-2)", display: "block", marginBottom: 6 }}>
                    Mois de la session *
                  </label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    style={{
                      width: "100%",
                      height: 40,
                      background: "var(--surf-card)",
                      border: "1px solid var(--bd)",
                      borderRadius: 8,
                      padding: "0 12px",
                      color: "var(--tx)",
                      fontSize: 13,
                      outline: "none",
                      textTransform: "capitalize",
                    }}
                  >
                    {MONTHS.map((m) => (
                      <option key={m} value={m} style={{ textTransform: "capitalize" }}>
                        {m.charAt(0).toUpperCase() + m.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-2)", display: "block", marginBottom: 6 }}>
                    Année *
                  </label>
                  <input
                    type="number"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    min={2020}
                    max={2035}
                    style={{
                      width: "100%",
                      height: 40,
                      background: "var(--surf-card)",
                      border: "1px solid var(--bd)",
                      borderRadius: 8,
                      padding: "0 12px",
                      color: "var(--tx)",
                      fontSize: 13,
                      outline: "none",
                    }}
                  />
                </div>
              </div>

              {/* Suggestions rapides de templates */}
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--tx-dim)", marginBottom: 6 }}>
                  Exemples d'objectifs (cliquez pour insérer) :
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {GOALS_TEMPLATES.map((tmpl) => (
                    <button
                      key={tmpl.label}
                      type="button"
                      onClick={() => setFormGoals(tmpl.text)}
                      style={{
                        fontSize: 11.5,
                        padding: "4px 8px",
                        borderRadius: 6,
                        border: "1px solid var(--bd)",
                        background: "var(--surf-card)",
                        color: "var(--tx-3)",
                        cursor: "pointer",
                      }}
                    >
                      {tmpl.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Goals Textarea */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-2)", display: "block", marginBottom: 6 }}>
                  Objectifs, Piliers & Idées du mois (Goals)
                </label>
                <textarea
                  rows={6}
                  value={formGoals}
                  onChange={(e) => setFormGoals(e.target.value)}
                  placeholder="• Objectifs principaux du mois&#10;• Thématiques et piliers prioritaires&#10;• Événements clés ou promotions à relayer..."
                  style={{
                    width: "100%",
                    background: "var(--surf-card)",
                    border: "1px solid var(--bd)",
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 13,
                    color: "var(--tx)",
                    lineHeight: 1.6,
                    outline: "none",
                    resize: "vertical",
                  }}
                />
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, borderTop: "1px solid var(--bd)", paddingTop: 16 }}>
              <MSButton variant="ghost" onClick={() => setModalMode(null)}>
                Annuler
              </MSButton>
              <MSButton
                variant="primary"
                onClick={handleSave}
                disabled={createM.isPending || updateM.isPending}
                icon={createM.isPending || updateM.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              >
                {modalMode === "create" ? "Créer la session" : "Enregistrer les modifications"}
              </MSButton>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmation de suppression */}
      {deleteConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 250,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(3px)",
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
              maxWidth: 420,
              background: "var(--surf-pop)",
              border: "1px solid var(--bd)",
              borderRadius: 14,
              padding: 24,
              boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "#EF444415",
                border: "1px solid #EF444430",
                color: "#EF4444",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 14,
              }}
            >
              <Trash2 size={20} />
            </div>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: 17, color: "var(--tx)", marginBottom: 6 }}>
              Supprimer la session de {deleteConfirm.Calendar} ?
            </div>
            <div style={{ fontSize: 13.5, color: "var(--tx-3)", lineHeight: 1.5, marginBottom: 20 }}>
              Cette action retirera définitivement cet enregistrement de la base Tybot Smart-DB.
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
                <Calendar size={18} style={{ color: "var(--accent)" }} />
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--tx)", margin: 0, fontFamily: "DM Sans, sans-serif" }}>
                  Brainstorming · {previewRecord.Calendar}
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
              ID Enregistrement Tybot : #{previewRecord.Id}
              {previewRecord.CreatedAt && ` · Créé le ${new Date(previewRecord.CreatedAt).toLocaleString("fr-FR")}`}
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase", marginBottom: 8 }}>
                Objectifs & Orientations Stratégiques
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
                  maxHeight: 320,
                  overflowY: "auto",
                }}
              >
                {previewRecord.Goals || "Aucun objectif détaillé n'a été rédigé pour cette session."}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--bd)", paddingTop: 14 }}>
              {previewRecord.Goals && (
                <MSButton
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(previewRecord.Goals || "")}
                  icon={<Copy size={13} />}
                >
                  Copier les objectifs
                </MSButton>
              )}
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
        </>
      )}
    </div>
  );
}
