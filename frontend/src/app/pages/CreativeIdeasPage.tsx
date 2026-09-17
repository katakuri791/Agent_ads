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
} from "lucide-react";
import { api, type CreativeIdea } from "../lib/api";
import { Card, MSButton, SearchBar, SlidePanel } from "../components/ms/primitives";
import { useToast } from "../providers/ToastProvider";

interface CreativeIdeasPageProps {
  onAskAgent?: (prompt?: string) => void;
  onNavigate?: (pageId: string) => void;
}

export function CreativeIdeasPage({ onAskAgent, onNavigate }: CreativeIdeasPageProps) {
  const toast = useToast();
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

  // Détail sélectionné pour le SlidePanel
  const [selectedIdea, setSelectedIdea] = useState<CreativeIdea | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

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

  const statusesList = useMemo(() => {
    const set = new Set<string>();
    ideas.forEach((item) => {
      if (item.Status) set.add(item.Status.trim());
    });
    return Array.from(set);
  }, [ideas]);

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

      const matchesStatus =
        selectedStatus === "all" || idea.Status === selectedStatus;

      return matchesSearch && matchesChannel && matchesType && matchesStatus;
    });
  }, [ideas, search, selectedChannel, selectedType, selectedStatus]);

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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1400, margin: "0 auto", width: "100%" }}>
      {/* ─── Header de la page ──────────────────────────────────────────────── */}
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
            Idées et concepts publicitaires synchronisés en direct depuis la base SmartDB.
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
            variant="primary"
            icon={<Sparkles size={15} />}
            onClick={() => onNavigate ? onNavigate("ai") : onAskAgent?.()}
          >
            Créer avec l'Agent IA
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
          <p style={{ fontSize: 13, color: "var(--tx-dim)", marginTop: 4 }}>Essayez de modifier les filtres ou le terme de recherche.</p>
        </Card>
      )}

      {!loading && !error && filteredIdeas.length > 0 && viewMode === "grid" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 20 }}>
          {filteredIdeas.map((idea) => {
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
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
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

                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "rgba(34, 197, 94, 0.12)", color: "#22C55E" }}>
                      {idea.Status || "Valide"}
                    </span>
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
                  <div style={{ fontSize: 13.5, color: "var(--tx)", lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {ideaText}
                  </div>
                </div>

                {/* Pied de carte avec actions rapides */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 14, borderTop: "1px solid var(--bd)" }}>
                  <button
                    onClick={(e) => handleCopy(idea, e)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
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
                    title="Envoyer cette idée à l'agent IA pour créer la campagne Meta Ads"
                  >
                    <Sparkles size={13} />
                    Lancer avec l'IA
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
                  <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--tx-dim)", width: 120, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredIdeas.map((idea, index) => (
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
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 999, background: "rgba(34, 197, 94, 0.12)", color: "#22C55E" }}>
                        {idea.Status || "Valide"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <button
                          onClick={(e) => handleCopy(idea, e)}
                          title="Copier"
                          style={{ padding: 6, borderRadius: 6, border: "1px solid var(--bd)", background: "var(--surf-1)", color: "var(--tx-dim)", cursor: "pointer" }}
                        >
                          <Copy size={13} />
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

      {/* ─── SlidePanel : Vue détaillée de l'idée ─────────────────────────────── */}
      <SlidePanel
        open={Boolean(selectedIdea)}
        onClose={() => setSelectedIdea(null)}
        width={560}
      >
        {selectedIdea && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Header du panneau */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }}>
                  ID #{selectedIdea.Id}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "rgba(34, 197, 94, 0.12)", color: "#22C55E" }}>
                  {selectedIdea.Status || "Valide"}
                </span>
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--tx)", margin: 0 }}>
                Détail de l'idée créative
              </h2>
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
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-dim)" }}>Concept & Recommandations détaillées :</span>
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
                  maxHeight: 320,
                  overflowY: "auto",
                }}
              >
                {selectedIdea["Generated idea"]}
              </div>
            </div>

            {/* Bouton CTA pour lancer l'agent IA */}
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <MSButton
                variant="primary"
                icon={<Sparkles size={16} />}
                style={{ flex: 1 }}
                onClick={() => handleCreateWithAI(selectedIdea)}
              >
                Générer la Campagne avec l'Agent IA
              </MSButton>
            </div>
          </div>
        )}
      </SlidePanel>
    </div>
  );
}
