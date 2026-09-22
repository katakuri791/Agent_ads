import { useState, useMemo } from "react";
import {
  Compass, Plus, Edit3, Trash2, Search, RefreshCw, Sparkles,
  Target, Check, Loader2, Eye, AlertCircle, ChevronRight, Copy,
  Layers, Volume2, ShieldCheck, ShieldAlert, Users, Radio, Globe
} from "lucide-react";
import { MSButton } from "../components/ms/primitives";
import { useToast } from "../providers/ToastProvider";
import {
  useStrategies,
  useCreateStrategy,
  useUpdateStrategy,
  useDeleteStrategy,
  type StrategyRecord
} from "../hooks/useStrategy";

const COMMON_CHANNELS = ["Facebook", "Instagram", "Linkedin", "TikTok", "X", "Youtube", "All"];
const COMMON_FORMATS = ["Montage video", "Photo", "Design", "Carrousel", "Reel / Short", "Story", "Infographie"];
const STRATEGY_MODES = ["unified", "differentiated", "hybrid"];
const TONE_SUGGESTIONS = [
  "Professionnel, Innovant et Inspirant",
  "Chaleureux, Accessible et Proche de la Communauté",
  "Expert, Analytique et Pédagogique",
  "Dynamique, Audacieux et Engageant"
];

function safeJsonParse(val: unknown): any {
  if (!val) return null;
  if (typeof val === "object") return val;
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }
  return null;
}

export function StrategyPage({ onNavigate, onAskAgent }: {
  onNavigate?: (pageId: string) => void;
  onAskAgent?: (prompt?: string) => void;
}) {
  const toast = useToast();
  const { data: records, isLoading, isError, refetch, isRefetching } = useStrategies();
  const createM = useCreateStrategy();
  const updateM = useUpdateStrategy();
  const deleteM = useDeleteStrategy();

  const [search, setSearch] = useState("");
  const [modeFilter, setModeFilter] = useState<string>("all");

  // Modales
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<StrategyRecord | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<StrategyRecord | null>(null);
  const [previewRecord, setPreviewRecord] = useState<StrategyRecord | null>(null);

  // Form State
  const [formObjective, setFormObjective] = useState("");
  const [formTone, setFormTone] = useState("");
  const [formStrategyMode, setFormStrategyMode] = useState("unified");
  const [formChannels, setFormChannels] = useState<string[]>(["Facebook", "Instagram", "Linkedin", "X"]);
  const [formContentPillars, setFormContentPillars] = useState("");
  const [formFormats, setFormFormats] = useState<string[]>(["Montage video", "Photo", "Design", "Carrousel"]);
  const [formFrequency, setFormFrequency] = useState("");
  const [formToneUse, setFormToneUse] = useState("");
  const [formToneAvoid, setFormToneAvoid] = useState("");
  const [formAudiencesText, setFormAudiencesText] = useState("");

  const openCreate = () => {
    setSelectedRecord(null);
    setFormObjective("Attraction / Notoriété, Engagement, Fidélisation, Conversion");
    setFormTone("Professionnel, Innovant et Inspirant");
    setFormStrategyMode("unified");
    setFormChannels(["Facebook", "Instagram", "Linkedin", "X"]);
    setFormContentPillars("Innovation & IA, Conseils Pratiques, Coulisses & Vie d'équipe, Succès Clients");
    setFormFormats(["Montage video", "Photo", "Design", "Carrousel"]);
    setFormFrequency("Instagram: 10 posts/mois, 5 stories; Facebook: 10 posts/mois; LinkedIn: 10 posts/mois");
    setFormToneUse("Langage clair et professionnel, Tonalité motivante et avant-gardiste, Exemples concrets et études de cas");
    setFormToneAvoid("Jargon excessif, Langage trop promotionnel, Ton trop informel");
    setFormAudiencesText("Décideurs marketing, responsables IT, startups et PME en transformation digitale");
    setModalMode("create");
  };

  const openEdit = (record: StrategyRecord) => {
    setSelectedRecord(record);
    setFormObjective(record.objective || "");
    setFormTone(record.tone || "");
    setFormStrategyMode(record.strategy_mode || "unified");

    const chs = record.Chnnel
      ? record.Chnnel.split(",").map((s) => s.trim()).filter(Boolean)
      : ["Facebook", "Instagram"];
    setFormChannels(chs);

    setFormContentPillars(record["Content pillars"] || "");

    const fmts = record.Formats
      ? record.Formats.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    setFormFormats(fmts);

    setFormFrequency(record.frequency || "");

    // Extraction des règles de tonalité
    const parsedTone = safeJsonParse(record.tone_rules);
    if (parsedTone && (parsedTone.a_utiliser || parsedTone.a_eviter)) {
      setFormToneUse(Array.isArray(parsedTone.a_utiliser) ? parsedTone.a_utiliser.join(", ") : String(parsedTone.a_utiliser || ""));
      setFormToneAvoid(Array.isArray(parsedTone.a_eviter) ? parsedTone.a_eviter.join(", ") : String(parsedTone.a_eviter || ""));
    } else {
      setFormToneUse(record.tone_rules || "");
      setFormToneAvoid("");
    }

    // Extraction des audiences
    const parsedAud = safeJsonParse(record.audiences);
    if (Array.isArray(parsedAud) && parsedAud.length > 0) {
      const p = parsedAud[0];
      setFormAudiencesText(p.persona || JSON.stringify(p, null, 2));
    } else {
      setFormAudiencesText(record.audiences || "");
    }

    setModalMode("edit");
  };

  const toggleItem = (list: string[], setList: (l: string[]) => void, item: string) => {
    if (list.includes(item)) {
      setList(list.filter((x) => x !== item));
    } else {
      setList([...list, item]);
    }
  };

  const handleSave = async () => {
    if (!formObjective.trim()) {
      toast("Veuillez renseigner les objectifs de la stratégie", { kind: "error" });
      return;
    }

    // Préparation des tone_rules en format JSON propre
    const toneRulesObj = {
      a_utiliser: formToneUse.split(",").map((s) => s.trim()).filter(Boolean),
      a_eviter: formToneAvoid.split(",").map((s) => s.trim()).filter(Boolean),
    };

    const payload: Partial<StrategyRecord> = {
      objective: formObjective.trim(),
      tone: formTone.trim() || null,
      strategy_mode: formStrategyMode,
      Chnnel: formChannels.join(","),
      "Content pillars": formContentPillars.trim() || null,
      Formats: formFormats.join(","),
      frequency: formFrequency.trim() || null,
      tone_rules: JSON.stringify(toneRulesObj),
      audiences: formAudiencesText.trim() ? JSON.stringify([{ persona: formAudiencesText.trim() }]) : null,
    };

    try {
      if (modalMode === "create") {
        await createM.mutateAsync(payload);
        toast("Stratégie créée avec succès !", { kind: "success" });
      } else if (modalMode === "edit" && selectedRecord) {
        await updateM.mutateAsync({
          Id: selectedRecord.Id,
          ...payload,
        });
        toast("Stratégie mise à jour avec succès !", { kind: "success" });
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
      toast("Stratégie supprimée avec succès !", { kind: "success" });
      setDeleteConfirm(null);
    } catch (err: any) {
      toast("Erreur lors de la suppression", { kind: "error", msg: err?.message });
    }
  };

  // Filtrage
  const filteredList = useMemo(() => {
    return (records || []).filter((r) => {
      if (modeFilter !== "all" && r.strategy_mode !== modeFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const obj = (r.objective || "").toLowerCase();
      const tone = (r.tone || "").toLowerCase();
      const aud = (r.audiences || "").toLowerCase();
      const ch = (r.Chnnel || "").toLowerCase();
      return obj.includes(q) || tone.includes(q) || aud.includes(q) || ch.includes(q);
    });
  }, [records, modeFilter, search]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%", maxWidth: 1200, margin: "0 auto" }}>
      {/* En-tête */}
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
              <Compass size={20} />
            </div>
            <h1 style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: 24, color: "var(--tx)", margin: 0 }}>
              Stratégie de Contenu & Ligne Éditoriale
            </h1>
            <span style={{ fontSize: 11, fontWeight: 600, background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)", padding: "3px 9px", borderRadius: 12 }}>
              Tybot Smart-DB
            </span>
          </div>
          <p style={{ fontSize: 13, color: "var(--tx-dim)", margin: "6px 0 0" }}>
            Définissez les personas cibles, la tonalité de marque, les règles de rédaction, piliers et fréquences par réseau.
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
            Nouvelle Stratégie
          </MSButton>
        </div>
      </div>

      {/* Cartes KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
        <div style={{ background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 12, padding: "16px 18px", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--tx-dim)" }}>
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>Stratégies Définies</span>
            <Compass size={16} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--tx)", marginTop: 8, fontFamily: "DM Sans, sans-serif" }}>
            {records?.length || 0}
          </div>
          <div style={{ fontSize: 12, color: "var(--tx-dim)", marginTop: 4 }}>
            Configurations enregistrées
          </div>
        </div>

        <div style={{ background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 12, padding: "16px 18px", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--tx-dim)" }}>
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>Tonalité Active</span>
            <Volume2 size={16} style={{ color: "var(--accent)" }} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--accent)", marginTop: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {records?.[0]?.tone || "Non configuré"}
          </div>
          <div style={{ fontSize: 12, color: "var(--tx-dim)", marginTop: 4 }}>
            Guide de ton de marque
          </div>
        </div>

        <div style={{ background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 12, padding: "16px 18px", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--tx-dim)" }}>
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>Mode de Stratégie</span>
            <Radio size={16} style={{ color: "#22C55E" }} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--tx)", marginTop: 8, textTransform: "capitalize", fontFamily: "DM Sans, sans-serif" }}>
            {records?.[0]?.strategy_mode || "Unified"}
          </div>
          <div style={{ fontSize: 12, color: "var(--tx-dim)", marginTop: 4 }}>
            Harmonisation des canaux
          </div>
        </div>
      </div>

      {/* Barre de recherche et filtres */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", background: "var(--surf-2)", border: "1px solid var(--bd)", borderRadius: 12, padding: "10px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 240 }}>
          <input
            type="text"
            placeholder="Rechercher par objectif, tonalité, audience..."
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

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "var(--tx-dim)", fontWeight: 500 }}>Mode :</span>
          {(["all", "unified", "differentiated"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setModeFilter(m)}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid",
                borderColor: modeFilter === m ? "var(--accent)" : "var(--bd)",
                background: modeFilter === m ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "transparent",
                color: modeFilter === m ? "var(--accent)" : "var(--tx-3)",
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {m === "all" ? "Tous" : m}
            </button>
          ))}
        </div>
      </div>

      {/* Chargement */}
      {isLoading && (
        <div style={{ padding: 60, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <Loader2 size={32} className="animate-spin" style={{ color: "var(--accent)" }} />
          <span style={{ fontSize: 13, color: "var(--tx-dim)" }}>Chargement des stratégies depuis Tybot...</span>
        </div>
      )}

      {/* Erreur */}
      {isError && (
        <div style={{ padding: 20, borderRadius: 12, background: "#EF444415", border: "1px solid #EF444430", display: "flex", alignItems: "center", gap: 14 }}>
          <AlertCircle size={22} color="#EF4444" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: "#EF4444", fontSize: 14 }}>Erreur de chargement</div>
            <div style={{ fontSize: 12.5, color: "var(--tx-dim)", marginTop: 2 }}>Impossible de joindre la table Stratégie Tybot.</div>
          </div>
          <MSButton variant="outline" size="sm" onClick={() => refetch()}>Réessayer</MSButton>
        </div>
      )}

      {/* Liste des stratégies */}
      {!isLoading && !isError && (
        <>
          {filteredList.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 24px", border: "1px dashed var(--bd)", borderRadius: 14, background: "var(--surf-2)" }}>
              <Compass size={40} style={{ color: "var(--accent)", opacity: 0.7, margin: "0 auto 12px" }} />
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--tx)" }}>Aucune stratégie trouvée</div>
              <p style={{ fontSize: 13, color: "var(--tx-dim)", maxWidth: 400, margin: "6px auto 18px" }}>
                Créez votre première stratégie de contenu pour définir les lignes directrices de votre communication.
              </p>
              <MSButton variant="primary" icon={<Plus size={15} />} onClick={openCreate}>
                Ajouter une stratégie
              </MSButton>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {filteredList.map((rec) => {
                const channels = rec.Chnnel ? rec.Chnnel.split(",").map((s) => s.trim()).filter(Boolean) : [];
                const formats = rec.Formats ? rec.Formats.split(",").map((s) => s.trim()).filter(Boolean) : [];
                const parsedTone = safeJsonParse(rec.tone_rules);
                const parsedAud = safeJsonParse(rec.audiences);
                const personaText = Array.isArray(parsedAud) && parsedAud[0]?.persona
                  ? parsedAud[0].persona
                  : typeof rec.audiences === "string" ? rec.audiences : null;

                return (
                  <div
                    key={rec.Id}
                    style={{
                      border: "1px solid var(--bd)",
                      borderRadius: 16,
                      background: "var(--surf-card)",
                      padding: 22,
                      display: "flex",
                      flexDirection: "column",
                      gap: 18,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
                    }}
                  >
                    {/* Header Carte */}
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div
                          style={{
                            width: 46,
                            height: 46,
                            borderRadius: 12,
                            background: "color-mix(in srgb, var(--accent) 15%, transparent)",
                            color: "var(--accent)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)",
                          }}
                        >
                          <Compass size={24} />
                        </div>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 17, fontWeight: 700, color: "var(--tx)", fontFamily: "DM Sans, sans-serif" }}>
                              Stratégie #{rec.Id}
                            </span>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: "2px 8px",
                                borderRadius: 999,
                                background: "var(--surf-inset)",
                                color: "var(--accent)",
                                border: "1px solid var(--bd)",
                                textTransform: "capitalize",
                              }}
                            >
                              Mode: {rec.strategy_mode || "unified"}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: "var(--tx-dim)", marginTop: 3 }}>
                            {rec.tone ? `Tonalité : ${rec.tone}` : "Tonalité non définie"}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <MSButton
                          variant="outline"
                          size="sm"
                          onClick={() => setPreviewRecord(rec)}
                          icon={<Eye size={13} />}
                        >
                          Détails
                        </MSButton>
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

                    {/* Objectifs & Personas */}
                    <div style={{ display: "grid", gridTemplateColumns: personaText ? "1fr 1fr" : "1fr", gap: 14 }}>
                      {rec.objective && (
                        <div style={{ background: "var(--surf-2)", padding: 14, borderRadius: 10, border: "1px solid var(--bd)" }}>
                          <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase", marginBottom: 6 }}>
                            Objectifs Stratégiques
                          </div>
                          <div style={{ fontSize: 13, color: "var(--tx)", lineHeight: 1.5 }}>
                            {rec.objective}
                          </div>
                        </div>
                      )}

                      {personaText && (
                        <div style={{ background: "var(--surf-2)", padding: 14, borderRadius: 10, border: "1px solid var(--bd)" }}>
                          <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase", marginBottom: 6 }}>
                            Audiences & Personas Cibles
                          </div>
                          <div style={{ fontSize: 13, color: "var(--tx-2)", lineHeight: 1.5 }}>
                            {personaText.length > 180 ? `${personaText.slice(0, 180)}...` : personaText}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Règles de tonalité (aperçu) */}
                    {parsedTone && (parsedTone.a_utiliser?.length > 0 || parsedTone.a_eviter?.length > 0) && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        {parsedTone.a_utiliser?.length > 0 && (
                          <div style={{ background: "#22C55E0C", border: "1px solid #22C55E25", borderRadius: 8, padding: 12 }}>
                            <div style={{ fontSize: 11.5, fontWeight: 700, color: "#22C55E", display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
                              <ShieldCheck size={14} /> À privilégier
                            </div>
                            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--tx-2)", lineHeight: 1.5 }}>
                              {parsedTone.a_utiliser.slice(0, 2).map((item: string, idx: number) => (
                                <li key={idx}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {parsedTone.a_eviter?.length > 0 && (
                          <div style={{ background: "#EF44440C", border: "1px solid #EF444425", borderRadius: 8, padding: 12 }}>
                            <div style={{ fontSize: 11.5, fontWeight: 700, color: "#EF4444", display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
                              <ShieldAlert size={14} /> À éviter
                            </div>
                            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--tx-2)", lineHeight: 1.5 }}>
                              {parsedTone.a_eviter.slice(0, 2).map((item: string, idx: number) => (
                                <li key={idx}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tags & Formats */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, borderTop: "1px solid var(--bd)", paddingTop: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, color: "var(--tx-dim)", fontWeight: 600 }}>FORMATS :</span>
                        {formats.map((fmt) => (
                          <span key={fmt} style={{ fontSize: 11.5, padding: "2px 8px", borderRadius: 6, background: "var(--surf-inset)", border: "1px solid var(--bd)", color: "var(--tx)" }}>
                            {fmt}
                          </span>
                        ))}
                      </div>

                      {channels.length > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, color: "var(--tx-dim)", fontWeight: 600 }}>CANAUX :</span>
                          {channels.map((ch) => (
                            <span key={ch} style={{ fontSize: 11.5, fontWeight: 600, color: "var(--accent)" }}>
                              {ch}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
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
              maxWidth: 780,
              maxHeight: "90vh",
              overflowY: "auto",
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
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--bd)", paddingBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--tx)", margin: 0, fontFamily: "DM Sans, sans-serif" }}>
                  {modalMode === "create" ? "Nouvelle Stratégie Éditoriale" : `Modifier la Stratégie #${selectedRecord?.Id}`}
                </h3>
                <p style={{ fontSize: 12.5, color: "var(--tx-dim)", margin: "4px 0 0" }}>
                  Renseignez les lignes directrices de contenu pour la synchronisation Tybot Smart-DB.
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
              {/* Mode & Tonalité */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-2)", display: "block", marginBottom: 6 }}>
                    Mode de Stratégie
                  </label>
                  <select
                    value={formStrategyMode}
                    onChange={(e) => setFormStrategyMode(e.target.value)}
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
                    {STRATEGY_MODES.map((m) => (
                      <option key={m} value={m} style={{ textTransform: "capitalize" }}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-2)", display: "block", marginBottom: 6 }}>
                    Tonalité de Marque (Tone)
                  </label>
                  <input
                    type="text"
                    value={formTone}
                    onChange={(e) => setFormTone(e.target.value)}
                    placeholder="Ex: Professionnel, Innovant et Inspirant"
                    style={{
                      width: "100%",
                      height: 40,
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
              </div>

              {/* Suggestions de tons */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {TONE_SUGGESTIONS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFormTone(t)}
                    style={{
                      fontSize: 11,
                      padding: "3px 8px",
                      borderRadius: 6,
                      border: "1px solid var(--bd)",
                      background: "var(--surf-card)",
                      color: "var(--tx-3)",
                      cursor: "pointer",
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Objectifs */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-2)", display: "block", marginBottom: 6 }}>
                  Objectifs Stratégiques (objective) *
                </label>
                <textarea
                  rows={2}
                  value={formObjective}
                  onChange={(e) => setFormObjective(e.target.value)}
                  placeholder="Ex: Attraction / Notoriété, Engagement, Fidélisation, Éducation, Conversion..."
                  style={{
                    width: "100%",
                    background: "var(--surf-card)",
                    border: "1px solid var(--bd)",
                    borderRadius: 8,
                    padding: 10,
                    fontSize: 13,
                    color: "var(--tx)",
                    outline: "none",
                    resize: "vertical",
                  }}
                />
              </div>

              {/* Canaux Cibles */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-2)", display: "block", marginBottom: 8 }}>
                  Canaux Cibles (Chnnel)
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {COMMON_CHANNELS.map((ch) => {
                    const active = formChannels.includes(ch);
                    return (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => toggleItem(formChannels, setFormChannels, ch)}
                        style={{
                          fontSize: 12,
                          fontWeight: 500,
                          padding: "5px 12px",
                          borderRadius: 8,
                          border: `1px solid ${active ? "var(--accent)" : "var(--bd)"}`,
                          background: active ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "var(--surf-card)",
                          color: active ? "var(--accent)" : "var(--tx-3)",
                          cursor: "pointer",
                        }}
                      >
                        {active ? "✓ " : ""}{ch}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Formats autorisés */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-2)", display: "block", marginBottom: 8 }}>
                  Formats Créatifs Autorisés (Formats)
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {COMMON_FORMATS.map((fmt) => {
                    const active = formFormats.includes(fmt);
                    return (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => toggleItem(formFormats, setFormFormats, fmt)}
                        style={{
                          fontSize: 12,
                          padding: "5px 12px",
                          borderRadius: 8,
                          border: `1px solid ${active ? "var(--accent)" : "var(--bd)"}`,
                          background: active ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "var(--surf-card)",
                          color: active ? "var(--accent)" : "var(--tx-3)",
                          cursor: "pointer",
                        }}
                      >
                        {active ? "✓ " : ""}{fmt}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Règles de Tonalité (À utiliser / À éviter) */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#22C55E", display: "block", marginBottom: 6 }}>
                    ✓ Règles de Ton : À Utiliser (séparées par des virgules)
                  </label>
                  <textarea
                    rows={3}
                    value={formToneUse}
                    onChange={(e) => setFormToneUse(e.target.value)}
                    placeholder="Langage clair, Tonalité motivante, Exemples concrets..."
                    style={{
                      width: "100%",
                      background: "var(--surf-card)",
                      border: "1px solid var(--bd)",
                      borderRadius: 8,
                      padding: 10,
                      fontSize: 12.5,
                      color: "var(--tx)",
                      outline: "none",
                      resize: "vertical",
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#EF4444", display: "block", marginBottom: 6 }}>
                    ✕ Règles de Ton : À Éviter (séparées par des virgules)
                  </label>
                  <textarea
                    rows={3}
                    value={formToneAvoid}
                    onChange={(e) => setFormToneAvoid(e.target.value)}
                    placeholder="Jargon excessif, Ton trop familier, Surpromesse..."
                    style={{
                      width: "100%",
                      background: "var(--surf-card)",
                      border: "1px solid var(--bd)",
                      borderRadius: 8,
                      padding: 10,
                      fontSize: 12.5,
                      color: "var(--tx)",
                      outline: "none",
                      resize: "vertical",
                    }}
                  />
                </div>
              </div>

              {/* Piliers de Contenu & Fréquences */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-2)", display: "block", marginBottom: 6 }}>
                    Piliers de Contenu (Content pillars)
                  </label>
                  <input
                    type="text"
                    value={formContentPillars}
                    onChange={(e) => setFormContentPillars(e.target.value)}
                    placeholder="Ex: Innovation, Éducation, Succès clients"
                    style={{
                      width: "100%",
                      height: 40,
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

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-2)", display: "block", marginBottom: 6 }}>
                    Fréquences (frequency)
                  </label>
                  <input
                    type="text"
                    value={formFrequency}
                    onChange={(e) => setFormFrequency(e.target.value)}
                    placeholder="Ex: Instagram: 10 posts/mois, 5 stories..."
                    style={{
                      width: "100%",
                      height: 40,
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
              </div>

              {/* Audiences & Personas */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-2)", display: "block", marginBottom: 6 }}>
                  Audiences Cibles & Personas (audiences)
                </label>
                <textarea
                  rows={3}
                  value={formAudiencesText}
                  onChange={(e) => setFormAudiencesText(e.target.value)}
                  placeholder="Profil des personnes ciblées, secteur d'activité, localisation, centres d'intérêt..."
                  style={{
                    width: "100%",
                    background: "var(--surf-card)",
                    border: "1px solid var(--bd)",
                    borderRadius: 8,
                    padding: 10,
                    fontSize: 13,
                    color: "var(--tx)",
                    outline: "none",
                    resize: "vertical",
                  }}
                />
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-end", gap: 10, borderTop: "1px solid var(--bd)", paddingTop: 16 }}>
              <MSButton variant="ghost" onClick={() => setModalMode(null)}>
                Annuler
              </MSButton>
              <MSButton
                variant="primary"
                onClick={handleSave}
                disabled={createM.isPending || updateM.isPending}
                icon={createM.isPending || updateM.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                style={{ marginLeft: "auto" }}
              >
                {modalMode === "create" ? "Créer la stratégie" : "Enregistrer les modifications"}
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
              Supprimer la Stratégie #{deleteConfirm.Id} ?
            </div>
            <div style={{ fontSize: 13.5, color: "var(--tx-3)", lineHeight: 1.5, marginBottom: 20 }}>
              Cette action est irréversible. L'enregistrement sera retiré de la table Tybot Smart-DB.
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
      {previewRecord && (() => {
        const channels = previewRecord.Chnnel ? previewRecord.Chnnel.split(",").map((s) => s.trim()).filter(Boolean) : [];
        const formats = previewRecord.Formats ? previewRecord.Formats.split(",").map((s) => s.trim()).filter(Boolean) : [];
        const parsedTone = safeJsonParse(previewRecord.tone_rules);
        const parsedAud = safeJsonParse(previewRecord.audiences);

        return (
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
              padding: 24,
            }}
            onClick={() => setPreviewRecord(null)}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 820,
                maxHeight: "88vh",
                overflowY: "auto",
                background: "var(--surf-pop)",
                border: "1px solid var(--bd)",
                borderRadius: 18,
                padding: 28,
                boxShadow: "0 25px 80px rgba(0,0,0,0.6)",
                display: "flex",
                flexDirection: "column",
                gap: 22,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", borderBottom: "1px solid var(--bd)", paddingBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 14,
                      background: "color-mix(in srgb, var(--accent) 15%, transparent)",
                      color: "var(--accent)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Compass size={26} />
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <h3 style={{ fontSize: 19, fontWeight: 700, color: "var(--tx)", margin: 0, fontFamily: "DM Sans, sans-serif" }}>
                        Stratégie de Contenu #{previewRecord.Id}
                      </h3>
                      <span
                        style={{
                          fontSize: 11.5,
                          fontWeight: 700,
                          padding: "2px 9px",
                          borderRadius: 999,
                          background: "var(--surf-inset)",
                          color: "var(--accent)",
                          border: "1px solid var(--bd)",
                          textTransform: "capitalize",
                        }}
                      >
                        {previewRecord.strategy_mode || "unified"}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--tx-dim)", marginTop: 4 }}>
                      Tonalité : {previewRecord.tone || "Non spécifié"}
                      {previewRecord.CreatedAt && ` · Créé le ${new Date(previewRecord.CreatedAt).toLocaleDateString("fr-FR")}`}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
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
                  <button
                    onClick={() => setPreviewRecord(null)}
                    style={{ background: "transparent", border: "none", color: "var(--tx-dim)", cursor: "pointer", fontSize: 20, padding: 4 }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Objectifs */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase", marginBottom: 6 }}>
                  Objectifs Stratégiques
                </div>
                <div style={{ fontSize: 13.5, color: "var(--tx)", lineHeight: 1.6, background: "var(--surf-2)", padding: 14, borderRadius: 10, border: "1px solid var(--bd)" }}>
                  {previewRecord.objective || "Aucun objectif spécifié"}
                </div>
              </div>

              {/* Règles de tonalité complètes */}
              {parsedTone && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div style={{ background: "#22C55E0C", border: "1px solid #22C55E30", borderRadius: 10, padding: 16 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "#22C55E", display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                      <ShieldCheck size={16} /> Éléments à privilégier
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12.5, color: "var(--tx-2)", lineHeight: 1.65 }}>
                      {Array.isArray(parsedTone.a_utiliser) ? (
                        parsedTone.a_utiliser.map((item: string, idx: number) => <li key={idx}>{item}</li>)
                      ) : (
                        <li>{String(parsedTone.a_utiliser || "—")}</li>
                      )}
                    </ul>
                  </div>

                  <div style={{ background: "#EF44440C", border: "1px solid #EF444430", borderRadius: 10, padding: 16 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "#EF4444", display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                      <ShieldAlert size={16} /> Éléments à proscrire
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12.5, color: "var(--tx-2)", lineHeight: 1.65 }}>
                      {Array.isArray(parsedTone.a_eviter) ? (
                        parsedTone.a_eviter.map((item: string, idx: number) => <li key={idx}>{item}</li>)
                      ) : (
                        <li>{String(parsedTone.a_eviter || "—")}</li>
                      )}
                    </ul>
                  </div>
                </div>
              )}

              {/* Audiences et Personas */}
              {previewRecord.audiences && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase", marginBottom: 6 }}>
                    Personas & Audiences
                  </div>
                  <div style={{ fontSize: 13, color: "var(--tx)", background: "var(--surf-2)", padding: 14, borderRadius: 10, border: "1px solid var(--bd)", lineHeight: 1.6 }}>
                    {Array.isArray(parsedAud) ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {parsedAud.map((aud: any, idx: number) => (
                          <div key={idx}>
                            <div style={{ fontWeight: 600, color: "var(--accent)" }}>{aud.persona || `Persona ${idx + 1}`}</div>
                            {aud.secteur && <div style={{ fontSize: 12, color: "var(--tx-dim)" }}>Secteur : {aud.secteur}</div>}
                            {aud.localisation && <div style={{ fontSize: 12, color: "var(--tx-dim)" }}>Localisation : {aud.localisation}</div>}
                            {aud.centres_interet && (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                                {(Array.isArray(aud.centres_interet) ? aud.centres_interet : [aud.centres_interet]).map((ci: string, i: number) => (
                                  <span key={i} style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "var(--surf-card)", border: "1px solid var(--bd)" }}>
                                    {ci}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      previewRecord.audiences
                    )}
                  </div>
                </div>
              )}

              {/* Fréquences & Piliers */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {previewRecord.frequency && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase", marginBottom: 6 }}>
                      Fréquences de publication
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--tx-2)", background: "var(--surf-2)", padding: 12, borderRadius: 8, border: "1px solid var(--bd)" }}>
                      {previewRecord.frequency}
                    </div>
                  </div>
                )}

                {previewRecord["Content pillars"] && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase", marginBottom: 6 }}>
                      Piliers de contenu
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--tx-2)", background: "var(--surf-2)", padding: 12, borderRadius: 8, border: "1px solid var(--bd)" }}>
                      {previewRecord["Content pillars"]}
                    </div>
                  </div>
                )}
              </div>

              {/* Formats et Canaux */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, borderTop: "1px solid var(--bd)", paddingTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11.5, color: "var(--tx-dim)", fontWeight: 600 }}>FORMATS :</span>
                  {formats.map((fmt) => (
                    <span key={fmt} style={{ fontSize: 12, padding: "3px 9px", borderRadius: 6, background: "var(--surf-inset)", border: "1px solid var(--bd)", color: "var(--tx)" }}>
                      {fmt}
                    </span>
                  ))}
                </div>

                <MSButton variant="primary" size="sm" onClick={() => setPreviewRecord(null)}>
                  Fermer
                </MSButton>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
