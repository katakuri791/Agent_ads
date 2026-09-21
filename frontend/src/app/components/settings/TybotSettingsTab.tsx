import { useState } from "react";
import {
  Plus, Edit3, Trash2, Globe, Share2, Target, Lightbulb,
  Check, Loader2, Sparkles, Image as ImageIcon,
  ExternalLink, Upload, AlertCircle, Eye, RefreshCw,
  Calendar, Layers, MessageSquare, Video, FileText, ChevronRight
} from "lucide-react";
import { MSButton } from "../ms/primitives";
import { useToast } from "../../providers/ToastProvider";
import {
  useTybotSettings,
  useCreateTybotSetting,
  useUpdateTybotSetting,
  useDeleteTybotSetting,
  useTybotSettingUpload,
  type TybotSettingRecord,
  type TybotAttachmentItem
} from "../../hooks/useTybotSettings";

// Options exactes requises par les métadonnées de la table Tybot Smart-DB
export const VALID_CHANNELS = ["Facebook", "Instagram", "TikTok", "Linkedin", "Youtube", "X", "All"];

export const VALID_CONTENT_THEMES = [
  { value: "Conseils & Astuces", label: "Conseils & Astuces" },
  { value: "Coulisses / Vie d’équipe", label: "Coulisses / Vie d’équipe" },
  { value: "Témoignages / Avis Clients", label: "Témoignages / Avis Clients" },
  { value: "Célébrations / Dates clés", label: "Célébrations / Dates clés" },
  { value: "Focus produit / service", label: "Focus produit / service" },
  // Important : l'espace au début est requis par la configuration du MultiSelect Tybot
  { value: " Données / Chiffres marquants", label: "Données / Chiffres marquants" },
  { value: "Engagement / Question au public", label: "Engagement / Question au public" },
  { value: "Éducation / Pédagogie", label: "Éducation / Pédagogie" },
  { value: "UGC / Contenu généré par les clients", label: "UGC / Contenu généré par les clients" },
  { value: "Actualité de la marque", label: "Actualité de la marque" },
  // Important : l'espace à la fin est requis par la configuration du MultiSelect Tybot
  { value: "Actualité de secteur ", label: "Actualité de secteur" },
  { value: "Promotion", label: "Promotion" },
  { value: "Recrutement", label: "Recrutement" },
];

export const VALID_OBJECTIVES = [
  "Attraction / Notoriété",
  "Engagement",
  "Conversion",
  "Fidélisation",
  "Éducation",
  "Crédibilité / Autorité",
  "Humanisation",
  "Recrutement",
  "Promotion",
  "Interaction communautaire"
];

export const VALID_LANGUAGES = ["Français", "Anglais", "Arabe", "Darija marocaine"];
export const VALID_CREATIVE_TYPES = ["Photo", "Design", "Montage video", "Carrousel", "Avatar video"];

function normalizeContentThemesForTybot(themes: string[]): string[] {
  return themes.map((th) => {
    const trimmed = th.trim();
    const found = VALID_CONTENT_THEMES.find(
      (v) => v.label.trim().toLowerCase() === trimmed.toLowerCase() || v.value.trim().toLowerCase() === trimmed.toLowerCase()
    );
    return found ? found.value : th;
  });
}

function parseArrayField(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof val === "string") return val.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

function parseContentThemes(val?: unknown): string[] {
  if (!val) return [];
  const list = Array.isArray(val)
    ? val.map(String)
    : typeof val === "string"
    ? val.split(",")
    : [];

  return list
    .map((s) => {
      const trimmed = s.trim();
      const found = VALID_CONTENT_THEMES.find(
        (v) => v.value.trim().toLowerCase() === trimmed.toLowerCase() || v.label.trim().toLowerCase() === trimmed.toLowerCase()
      );
      return found ? found.value : trimmed;
    })
    .filter(Boolean);
}

function getThemeDisplayLabel(themeValue: string): string {
  const found = VALID_CONTENT_THEMES.find((v) => v.value === themeValue || v.label === themeValue.trim());
  return found ? found.label : themeValue.trim();
}

function parseAttachments(val: unknown): TybotAttachmentItem[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
  }
  return [];
}

export function TybotSettingsTab() {
  const toast = useToast();
  const { data: records, isLoading, isError, refetch, isRefetching } = useTybotSettings();
  const createM = useCreateTybotSetting();
  const updateM = useUpdateTybotSetting();
  const deleteM = useDeleteTybotSetting();
  const uploadM = useTybotSettingUpload();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "Active" | "Inactive">("all");
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<TybotSettingRecord | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<TybotSettingRecord | null>(null);
  const [previewRecord, setPreviewRecord] = useState<TybotSettingRecord | null>(null);

  // Form State
  const [formAbout, setFormAbout] = useState("");
  const [formStrategyDetails, setFormStrategyDetails] = useState("");
  const [formChannels, setFormChannels] = useState<string[]>([]);
  const [formThemes, setFormThemes] = useState<string[]>([]);
  const [formObjectives, setFormObjectives] = useState<string[]>([]);
  const [formCreatives, setFormCreatives] = useState<string[]>([]);
  const [formLanguages, setFormLanguages] = useState<string[]>([]);
  const [formPubFreq, setFormPubFreq] = useState<number>(10);
  const [formStoriesFreq, setFormStoriesFreq] = useState<number>(5);
  const [formStatus, setFormStatus] = useState<string>("Active");
  const [formSmLinks, setFormSmLinks] = useState("");
  const [formLogos, setFormLogos] = useState<TybotAttachmentItem[]>([]);
  const [formDesignInspirations, setFormDesignInspirations] = useState<TybotAttachmentItem[]>([]);

  const openCreate = () => {
    setSelectedRecord(null);
    setFormAbout("");
    setFormStrategyDetails("");
    setFormChannels(["Facebook", "Instagram", "Linkedin", "X"]);
    setFormThemes(["Conseils & Astuces", "Actualité de la marque", "Éducation / Pédagogie"]);
    setFormObjectives(["Attraction / Notoriété", "Engagement", "Conversion"]);
    setFormCreatives(["Photo", "Carrousel", "Montage video"]);
    setFormLanguages(["Français", "Anglais"]);
    setFormPubFreq(10);
    setFormStoriesFreq(5);
    setFormStatus("Active");
    setFormSmLinks("* Instagram : \n* Facebook : \n* Linkedin : \n* X : ");
    setFormLogos([]);
    setFormDesignInspirations([]);
    setModalMode("create");
  };

  const openEdit = (record: TybotSettingRecord) => {
    setSelectedRecord(record);
    setFormAbout(record["About Brand"] || "");
    setFormStrategyDetails(record["Social Media Strategy (Details)"] || "");
    setFormChannels(parseArrayField(record.Channels));
    setFormThemes(parseContentThemes(record["Content Themes"]));
    setFormObjectives(parseArrayField(record["Strategic objectives"]));
    setFormCreatives(parseArrayField(record["Creative type"]));
    setFormLanguages(parseArrayField(record.Language));
    setFormPubFreq(record["Publishing frequency"] || 10);
    setFormStoriesFreq(record["Stories Frequency"] || 5);
    setFormStatus(record.Status || "Active");
    setFormSmLinks(record["SM Links"] || "");
    setFormLogos(parseAttachments(record.Logo));
    setFormDesignInspirations(parseAttachments(record["Design Inspiration"]));
    setModalMode("edit");
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await uploadM.mutateAsync(file);
      if (res.url) {
        setFormLogos((prev) => [...prev, { url: res.url, title: file.name, id: `logo_${Date.now()}` }]);
        toast("Logo téléversé avec succès !", { kind: "success" });
      }
    } catch (err: any) {
      toast("Erreur lors de l'upload du logo", { kind: "error", msg: err?.message });
    }
  };

  const handleInspirationUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await uploadM.mutateAsync(file);
      if (res.url) {
        setFormDesignInspirations((prev) => [...prev, { url: res.url, title: file.name, id: `insp_${Date.now()}` }]);
        toast("Image d'inspiration téléversée !", { kind: "success" });
      }
    } catch (err: any) {
      toast("Erreur lors de l'upload de l'inspiration", { kind: "error", msg: err?.message });
    }
  };

  const toggleArrayItem = (list: string[], setList: (l: string[]) => void, item: string) => {
    if (list.includes(item)) {
      setList(list.filter((x) => x !== item));
    } else {
      setList([...list, item]);
    }
  };

  const handleSave = async () => {
    if (!formAbout.trim()) {
      toast("Veuillez renseigner la description de la marque (About Brand)", { kind: "error" });
      return;
    }

    const payload: Partial<TybotSettingRecord> = {
      "About Brand": formAbout.trim(),
      Channels: formChannels,
      // Envoi direct sous forme de tableau pour préserver les espaces attendus par Tybot
      "Content Themes": normalizeContentThemesForTybot(formThemes),
      "Strategic objectives": formObjectives,
      "Creative type": formCreatives,
      Language: formLanguages,
      "Publishing frequency": Number(formPubFreq) || 0,
      "Stories Frequency": Number(formStoriesFreq) || 0,
      Status: formStatus,
      "SM Links": formSmLinks.trim(),
      Logo: formLogos,
      "Social Media Strategy (Details)": formStrategyDetails.trim() || null,
      "Design Inspiration": formDesignInspirations.length > 0 ? formDesignInspirations : undefined,
    };

    try {
      if (modalMode === "create") {
        await createM.mutateAsync(payload);
        toast("Configuration de marque créée avec succès !", { kind: "success" });
      } else if (modalMode === "edit" && selectedRecord) {
        await updateM.mutateAsync({
          Id: selectedRecord.Id,
          ...payload,
        });
        toast("Configuration mise à jour avec succès !", { kind: "success" });
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
      toast("Configuration supprimée avec succès !", { kind: "success" });
      setDeleteConfirm(null);
    } catch (err: any) {
      toast("Erreur lors de la suppression", { kind: "error", msg: err?.message });
    }
  };

  // Filtrage
  const filteredList = (records || []).filter((r) => {
    if (statusFilter !== "all" && r.Status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const about = (r["About Brand"] || "").toLowerCase();
    const channels = (r.Channels || "").toLowerCase();
    const themes = (r["Content Themes"] || "").toLowerCase();
    return about.includes(q) || channels.includes(q) || themes.includes(q);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%" }}>
      {/* Header & Actions */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2 style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: 20, color: "var(--tx)", margin: 0 }}>
              Paramètres de Marque & Stratégie Social Media
            </h2>
            <span style={{ fontSize: 11, fontWeight: 600, background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)", padding: "3px 8px", borderRadius: 12 }}>
              Smart-DB Tybot
            </span>
          </div>
          <p style={{ fontSize: 13, color: "var(--tx-dim)", margin: "6px 0 0" }}>
            Configuration globale de la marque, fréquences de publication, canaux, objectifs et thématiques de contenu.
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
            Nouvelle Configuration
          </MSButton>
        </div>
      </div>

      {/* Barre de recherche et filtres */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", background: "var(--surf-2)", border: "1px solid var(--bd)", borderRadius: 12, padding: "10px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 240 }}>
          <input
            type="text"
            placeholder="Rechercher par marque, canaux, thématiques..."
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
          <span style={{ fontSize: 12, color: "var(--tx-dim)", fontWeight: 500 }}>Statut :</span>
          {(["all", "Active", "Inactive"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid",
                borderColor: statusFilter === st ? "var(--accent)" : "var(--bd)",
                background: statusFilter === st ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "transparent",
                color: statusFilter === st ? "var(--accent)" : "var(--tx-3)",
                cursor: "pointer",
              }}
            >
              {st === "all" ? "Tous" : st}
            </button>
          ))}
        </div>
      </div>

      {/* État de chargement */}
      {isLoading && (
        <div style={{ padding: 60, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <Loader2 size={32} className="animate-spin" style={{ color: "var(--accent)" }} />
          <span style={{ fontSize: 13, color: "var(--tx-dim)" }}>Chargement des paramètres depuis Tybot...</span>
        </div>
      )}

      {/* État d'erreur */}
      {isError && (
        <div style={{ padding: 24, borderRadius: 12, background: "#EF444415", border: "1px solid #EF444430", display: "flex", alignItems: "center", gap: 14 }}>
          <AlertCircle size={22} color="#EF4444" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: "#EF4444", fontSize: 14 }}>Erreur de chargement</div>
            <div style={{ fontSize: 12.5, color: "var(--tx-dim)", marginTop: 2 }}>Impossible de joindre la table des paramètres Tybot.</div>
          </div>
          <MSButton variant="outline" size="sm" onClick={() => refetch()}>Réessayer</MSButton>
        </div>
      )}

      {/* Liste des enregistrements */}
      {!isLoading && !isError && (
        <>
          {filteredList.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 24px", border: "1px dashed var(--bd)", borderRadius: 14, background: "var(--surf-2)" }}>
              <Sparkles size={36} style={{ color: "var(--accent)", opacity: 0.7, margin: "0 auto 12px" }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--tx)" }}>Aucune configuration trouvée</div>
              <p style={{ fontSize: 13, color: "var(--tx-dim)", maxWidth: 400, margin: "6px auto 18px" }}>
                Créez votre première stratégie de marque pour alimenter automatiquement la génération de contenu et le calendrier social media.
              </p>
              <MSButton variant="primary" icon={<Plus size={15} />} onClick={openCreate}>
                Ajouter une configuration
              </MSButton>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {filteredList.map((rec) => {
                const logos = parseAttachments(rec.Logo);
                const channels = parseArrayField(rec.Channels);
                const objectives = parseArrayField(rec["Strategic objectives"]);
                const themes = parseContentThemes(rec["Content Themes"]);

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
                      gap: 16,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                    }}
                  >
                    {/* Header de la carte */}
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        {logos.length > 0 && logos[0]?.url ? (
                          <img
                            src={logos[0].url}
                            alt="Logo"
                            style={{
                              width: 52,
                              height: 52,
                              borderRadius: 10,
                              objectFit: "cover",
                              background: "#ffffff",
                              padding: 4,
                              border: "1px solid var(--bd)",
                              boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: 52,
                              height: 52,
                              borderRadius: 10,
                              background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                              border: "1px solid var(--bd)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "var(--accent)",
                            }}
                          >
                            <Sparkles size={24} />
                          </div>
                        )}

                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 16, fontWeight: 700, color: "var(--tx)", fontFamily: "DM Sans, sans-serif" }}>
                              {rec["About Brand"]?.split("\n")[0]?.slice(0, 45) || `Configuration #${rec.Id}`}
                            </span>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: "2px 8px",
                                borderRadius: 999,
                                background: rec.Status === "Active" ? "#22C55E18" : "#EF444418",
                                color: rec.Status === "Active" ? "#22C55E" : "#EF4444",
                                border: `1px solid ${rec.Status === "Active" ? "#22C55E40" : "#EF444440"}`,
                              }}
                            >
                              {rec.Status || "Active"}
                            </span>
                          </div>
                          <div style={{ fontSize: 11.5, color: "var(--tx-dim)", marginTop: 4 }}>
                            Enregistrement Tybot ID #{rec.Id} · {rec.Language || "Français"}
                          </div>
                        </div>
                      </div>

                      {/* Boutons d'action */}
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
                          Supprimer
                        </MSButton>
                      </div>
                    </div>

                    {/* About preview */}
                    {rec["About Brand"] && (
                      <div style={{ fontSize: 13, color: "var(--tx-2)", lineHeight: 1.55, background: "var(--surf-2)", padding: 12, borderRadius: 8, border: "1px solid var(--bd)" }}>
                        {rec["About Brand"].length > 260 ? `${rec["About Brand"].slice(0, 260)}...` : rec["About Brand"]}
                      </div>
                    )}

                    {/* Meta stats & tags */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
                      {/* Canaux */}
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase", marginBottom: 6 }}>
                          Canaux de diffusion
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          {channels.map((c) => (
                            <span key={c} style={{ fontSize: 11.5, fontWeight: 500, padding: "2px 7px", borderRadius: 6, background: "var(--surf-inset)", border: "1px solid var(--bd)", color: "var(--tx)" }}>
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Fréquences */}
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase", marginBottom: 6 }}>
                          Fréquence de publication
                        </div>
                        <div style={{ fontSize: 13, color: "var(--tx)", fontWeight: 600 }}>
                          {rec["Publishing frequency"] || 0} posts / mois · {rec["Stories Frequency"] || 0} stories
                        </div>
                      </div>

                      {/* Thématiques */}
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase", marginBottom: 6 }}>
                          Thématiques ({themes.length})
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {themes.slice(0, 3).map((th) => (
                            <span key={th} style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "color-mix(in srgb, var(--accent) 10%, transparent)", color: "var(--accent)" }}>
                              {getThemeDisplayLabel(th)}
                            </span>
                          ))}
                          {themes.length > 3 && (
                            <span style={{ fontSize: 11, color: "var(--tx-dim)" }}>+{themes.length - 3}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modal Création / Édition */}
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
            {/* Modal Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--bd)", paddingBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--tx)", margin: 0, fontFamily: "DM Sans, sans-serif" }}>
                  {modalMode === "create" ? "Nouvelle configuration de marque" : `Modifier la configuration #${selectedRecord?.Id}`}
                </h3>
                <p style={{ fontSize: 12.5, color: "var(--tx-dim)", margin: "4px 0 0" }}>
                  Options validées pour la synchronisation Tybot Smart-DB.
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
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Statut & Logo Upload */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-2)", display: "block", marginBottom: 6 }}>
                    Statut
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
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
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-2)", display: "block", marginBottom: 6 }}>
                    Logos de la marque ({formLogos.length})
                  </label>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      height: 40,
                      background: "var(--surf-2)",
                      border: "1px dashed var(--bd)",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontSize: 13,
                      color: "var(--tx)",
                    }}
                  >
                    {uploadM.isPending ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Upload size={15} />
                    )}
                    <span>{uploadM.isPending ? "Upload en cours..." : "Téléverser un logo"}</span>
                    <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: "none" }} />
                  </label>
                </div>
              </div>

              {/* Aperçu des logos */}
              {formLogos.length > 0 && (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: 10, background: "var(--surf-inset)", borderRadius: 8 }}>
                  {formLogos.map((logo, idx) => (
                    <div key={idx} style={{ position: "relative", width: 64, height: 64, borderRadius: 8, overflow: "hidden", border: "1px solid var(--bd)", background: "#fff" }}>
                      <img src={logo.url} alt={logo.title || "Logo"} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                      <button
                        onClick={() => setFormLogos((prev) => prev.filter((_, i) => i !== idx))}
                        style={{
                          position: "absolute",
                          top: 2,
                          right: 2,
                          width: 18,
                          height: 18,
                          borderRadius: 999,
                          background: "rgba(239,68,68,0.85)",
                          color: "#fff",
                          border: "none",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          fontSize: 10,
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Description de la marque (About Brand) */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-2)", display: "block", marginBottom: 6 }}>
                  À propos de la marque (About Brand) *
                </label>
                <textarea
                  rows={4}
                  value={formAbout}
                  onChange={(e) => setFormAbout(e.target.value)}
                  placeholder="Présentation de l'entreprise, mission, vision, ADN, expertises..."
                  style={{
                    width: "100%",
                    background: "var(--surf-card)",
                    border: "1px solid var(--bd)",
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 13,
                    color: "var(--tx)",
                    lineHeight: 1.5,
                    outline: "none",
                    resize: "vertical",
                  }}
                />
              </div>

              {/* Stratégie Social Media (Détails) */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-2)", display: "block", marginBottom: 6 }}>
                  Détails de la Stratégie Social Media (Optionnel)
                </label>
                <textarea
                  rows={2}
                  value={formStrategyDetails}
                  onChange={(e) => setFormStrategyDetails(e.target.value)}
                  placeholder="Orientations éditoriales spécifiques, règles d'engagement, tonalité..."
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

              {/* Canaux de diffusion */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-2)", display: "block", marginBottom: 8 }}>
                  Canaux de diffusion (Channels)
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {VALID_CHANNELS.map((ch) => {
                    const active = formChannels.includes(ch);
                    return (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => toggleArrayItem(formChannels, setFormChannels, ch)}
                        style={{
                          fontSize: 12.5,
                          fontWeight: 500,
                          padding: "6px 12px",
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

              {/* Fréquences de publication */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-2)", display: "block", marginBottom: 6 }}>
                    Fréquence de posts (par mois)
                  </label>
                  <input
                    type="number"
                    value={formPubFreq}
                    onChange={(e) => setFormPubFreq(Number(e.target.value))}
                    min={0}
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
                    Fréquence de stories (par mois)
                  </label>
                  <input
                    type="number"
                    value={formStoriesFreq}
                    onChange={(e) => setFormStoriesFreq(Number(e.target.value))}
                    min={0}
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

              {/* Langues & Types créatifs */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-2)", display: "block", marginBottom: 8 }}>
                    Langues
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {VALID_LANGUAGES.map((lang) => {
                      const active = formLanguages.includes(lang);
                      return (
                        <button
                          key={lang}
                          type="button"
                          onClick={() => toggleArrayItem(formLanguages, setFormLanguages, lang)}
                          style={{
                            fontSize: 12,
                            padding: "4px 10px",
                            borderRadius: 6,
                            border: `1px solid ${active ? "var(--accent)" : "var(--bd)"}`,
                            background: active ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "var(--surf-card)",
                            color: active ? "var(--accent)" : "var(--tx-3)",
                            cursor: "pointer",
                          }}
                        >
                          {lang}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-2)", display: "block", marginBottom: 8 }}>
                    Types de créatifs
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {VALID_CREATIVE_TYPES.map((ct) => {
                      const active = formCreatives.includes(ct);
                      return (
                        <button
                          key={ct}
                          type="button"
                          onClick={() => toggleArrayItem(formCreatives, setFormCreatives, ct)}
                          style={{
                            fontSize: 12,
                            padding: "4px 10px",
                            borderRadius: 6,
                            border: `1px solid ${active ? "var(--accent)" : "var(--bd)"}`,
                            background: active ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "var(--surf-card)",
                            color: active ? "var(--accent)" : "var(--tx-3)",
                            cursor: "pointer",
                          }}
                        >
                          {ct}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Objectifs stratégiques */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-2)", display: "block", marginBottom: 8 }}>
                  Objectifs stratégiques (MultiSelect)
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {VALID_OBJECTIVES.map((obj) => {
                    const active = formObjectives.includes(obj);
                    return (
                      <button
                        key={obj}
                        type="button"
                        onClick={() => toggleArrayItem(formObjectives, setFormObjectives, obj)}
                        style={{
                          fontSize: 11.5,
                          padding: "5px 10px",
                          borderRadius: 6,
                          border: `1px solid ${active ? "var(--accent)" : "var(--bd)"}`,
                          background: active ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "var(--surf-card)",
                          color: active ? "var(--accent)" : "var(--tx-3)",
                          cursor: "pointer",
                        }}
                      >
                        {active ? "✓ " : ""}{obj}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Thèmes de contenu */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-2)", display: "block", marginBottom: 8 }}>
                  Thématiques de contenu (Options officielles Tybot)
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {VALID_CONTENT_THEMES.map((item) => {
                    const active = formThemes.some(
                      (t) => t.trim().toLowerCase() === item.value.trim().toLowerCase() || t.trim().toLowerCase() === item.label.trim().toLowerCase()
                    );
                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => {
                          if (active) {
                            setFormThemes(formThemes.filter(
                              (t) => t.trim().toLowerCase() !== item.value.trim().toLowerCase() && t.trim().toLowerCase() !== item.label.trim().toLowerCase()
                            ));
                          } else {
                            setFormThemes([...formThemes, item.value]);
                          }
                        }}
                        style={{
                          fontSize: 11.5,
                          padding: "5px 10px",
                          borderRadius: 6,
                          border: `1px solid ${active ? "var(--accent)" : "var(--bd)"}`,
                          background: active ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "var(--surf-card)",
                          color: active ? "var(--accent)" : "var(--tx-3)",
                          cursor: "pointer",
                        }}
                      >
                        {active ? "✓ " : ""}{item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Inspirations Design Upload */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-2)" }}>
                    Inspirations de design & visuels ({formDesignInspirations.length})
                  </label>
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: "var(--accent)",
                      cursor: "pointer",
                    }}
                  >
                    <Upload size={13} /> Ajouter une inspiration
                    <input type="file" accept="image/*" onChange={handleInspirationUpload} style={{ display: "none" }} />
                  </label>
                </div>
                {formDesignInspirations.length > 0 && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: 10, background: "var(--surf-inset)", borderRadius: 8 }}>
                    {formDesignInspirations.map((insp, idx) => (
                      <div key={idx} style={{ position: "relative", width: 60, height: 60, borderRadius: 6, overflow: "hidden", border: "1px solid var(--bd)" }}>
                        <img src={insp.url} alt="Inspiration" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <button
                          onClick={() => setFormDesignInspirations((prev) => prev.filter((_, i) => i !== idx))}
                          style={{
                            position: "absolute",
                            top: 2,
                            right: 2,
                            width: 16,
                            height: 16,
                            borderRadius: 999,
                            background: "rgba(239,68,68,0.85)",
                            color: "#fff",
                            border: "none",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            fontSize: 9,
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Liens réseaux sociaux (SM Links) */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-2)", display: "block", marginBottom: 6 }}>
                  Liens des Réseaux Sociaux (SM Links)
                </label>
                <textarea
                  rows={3}
                  value={formSmLinks}
                  onChange={(e) => setFormSmLinks(e.target.value)}
                  placeholder="* Instagram : https://...&#10;* Facebook : https://...&#10;* LinkedIn : https://..."
                  style={{
                    width: "100%",
                    background: "var(--surf-card)",
                    border: "1px solid var(--bd)",
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 12.5,
                    fontFamily: "JetBrains Mono, monospace",
                    color: "var(--tx)",
                    lineHeight: 1.4,
                    outline: "none",
                    resize: "vertical",
                  }}
                />
              </div>
            </div>

            {/* Modal Footer */}
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
                {modalMode === "create" ? "Créer la configuration" : "Enregistrer les modifications"}
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
              Supprimer la configuration #{deleteConfirm.Id} ?
            </div>
            <div style={{ fontSize: 13.5, color: "var(--tx-3)", lineHeight: 1.5, marginBottom: 20 }}>
              Cette action est irréversible. L'enregistrement sera définitivement retiré de la table Tybot Smart-DB.
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
        const logos = parseAttachments(previewRecord.Logo);
        const inspirations = parseAttachments(previewRecord["Design Inspiration"]);
        const channels = parseArrayField(previewRecord.Channels);
        const themes = parseContentThemes(previewRecord["Content Themes"]);
        const objectives = parseArrayField(previewRecord["Strategic objectives"]);
        const creatives = parseArrayField(previewRecord["Creative type"]);
        const languages = parseArrayField(previewRecord.Language);

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
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  {logos.length > 0 && logos[0]?.url ? (
                    <img
                      src={logos[0].url}
                      alt="Logo"
                      style={{
                        width: 58,
                        height: 58,
                        borderRadius: 12,
                        objectFit: "contain",
                        background: "#fff",
                        padding: 4,
                        border: "1px solid var(--bd)",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 58,
                        height: 58,
                        borderRadius: 12,
                        background: "color-mix(in srgb, var(--accent) 15%, transparent)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--accent)",
                      }}
                    >
                      <Sparkles size={28} />
                    </div>
                  )}

                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--tx)", margin: 0, fontFamily: "DM Sans, sans-serif" }}>
                        Configuration de Marque #{previewRecord.Id}
                      </h3>
                      <span
                        style={{
                          fontSize: 11.5,
                          fontWeight: 700,
                          padding: "2px 9px",
                          borderRadius: 999,
                          background: previewRecord.Status === "Active" ? "#22C55E18" : "#EF444418",
                          color: previewRecord.Status === "Active" ? "#22C55E" : "#EF4444",
                          border: `1px solid ${previewRecord.Status === "Active" ? "#22C55E40" : "#EF444440"}`,
                        }}
                      >
                        {previewRecord.Status || "Active"}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--tx-dim)", marginTop: 4 }}>
                      Créé le {previewRecord.CreatedAt ? new Date(previewRecord.CreatedAt).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" }) : "—"}
                      {previewRecord.UpdatedAt && ` · Mis à jour le ${new Date(previewRecord.UpdatedAt).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" })}`}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <MSButton
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const rec = previewRecord;
                      setPreviewRecord(null);
                      openEdit(rec);
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

              {/* Grille des statistiques et métriques clés */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
                <div style={{ background: "var(--surf-2)", padding: "14px 16px", borderRadius: 10, border: "1px solid var(--bd)" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase" }}>
                    Publications / mois
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "var(--accent)", marginTop: 4 }}>
                    {previewRecord["Publishing frequency"] ?? 0}
                  </div>
                </div>

                <div style={{ background: "var(--surf-2)", padding: "14px 16px", borderRadius: 10, border: "1px solid var(--bd)" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase" }}>
                    Stories / mois
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "var(--tx)", marginTop: 4 }}>
                    {previewRecord["Stories Frequency"] ?? 0}
                  </div>
                </div>

                <div style={{ background: "var(--surf-2)", padding: "14px 16px", borderRadius: 10, border: "1px solid var(--bd)" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase" }}>
                    Langues
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tx)", marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {languages.length > 0 ? languages.join(", ") : "Non spécifié"}
                  </div>
                </div>

                <div style={{ background: "var(--surf-2)", padding: "14px 16px", borderRadius: 10, border: "1px solid var(--bd)" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase" }}>
                    Formats créatifs
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--tx)", marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {creatives.length > 0 ? creatives.join(", ") : "Tous"}
                  </div>
                </div>
              </div>

              {/* Canaux de diffusion */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase", marginBottom: 8 }}>
                  Canaux de diffusion actifs
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {channels.map((ch) => (
                    <span
                      key={ch}
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        padding: "5px 12px",
                        borderRadius: 8,
                        background: "var(--surf-inset)",
                        border: "1px solid var(--bd)",
                        color: "var(--tx)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Globe size={13} style={{ color: "var(--accent)" }} />
                      {ch}
                    </span>
                  ))}
                </div>
              </div>

              {/* Objectifs stratégiques */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase", marginBottom: 8 }}>
                  Objectifs Stratégiques ({objectives.length})
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {objectives.map((obj) => (
                    <span
                      key={obj}
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        padding: "4px 10px",
                        borderRadius: 6,
                        background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                        color: "var(--accent)",
                        border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)",
                      }}
                    >
                      {obj}
                    </span>
                  ))}
                </div>
              </div>

              {/* Thématiques de contenu */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase", marginBottom: 8 }}>
                  Thématiques de Contenu ({themes.length})
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {themes.map((th) => (
                    <span
                      key={th}
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        padding: "4px 10px",
                        borderRadius: 6,
                        background: "var(--surf-2)",
                        color: "var(--tx-2)",
                        border: "1px solid var(--bd)",
                      }}
                    >
                      {getThemeDisplayLabel(th)}
                    </span>
                  ))}
                </div>
              </div>

              {/* Description de la marque */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase", marginBottom: 8 }}>
                  Description & Identité de Marque (About Brand)
                </div>
                <div
                  style={{
                    fontSize: 13,
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
                  {previewRecord["About Brand"] || "Aucune description fournie"}
                </div>
              </div>

              {/* Stratégie Social Media Détails (si présente) */}
              {previewRecord["Social Media Strategy (Details)"] && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase", marginBottom: 8 }}>
                    Détails de la Stratégie Social Media
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--tx-2)",
                      whiteSpace: "pre-wrap",
                      lineHeight: 1.6,
                      background: "var(--surf-2)",
                      padding: 14,
                      borderRadius: 10,
                      border: "1px solid var(--bd)",
                    }}
                  >
                    {previewRecord["Social Media Strategy (Details)"]}
                  </div>
                </div>
              )}

              {/* Logos & Inspirations visuelles */}
              {(logos.length > 0 || inspirations.length > 0) && (
                <div style={{ display: "grid", gridTemplateColumns: logos.length > 0 && inspirations.length > 0 ? "1fr 1fr" : "1fr", gap: 16 }}>
                  {logos.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase", marginBottom: 8 }}>
                        Logos officiels ({logos.length})
                      </div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {logos.map((l, idx) => (
                          <a
                            key={idx}
                            href={l.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: "block",
                              border: "1px solid var(--bd)",
                              borderRadius: 8,
                              padding: 6,
                              background: "#fff",
                              transition: "transform 0.15s ease",
                            }}
                          >
                            <img src={l.url} alt={l.title || "Logo"} style={{ height: 48, objectFit: "contain" }} />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {inspirations.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase", marginBottom: 8 }}>
                        Inspirations de design ({inspirations.length})
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {inspirations.map((insp, idx) => (
                          <a
                            key={idx}
                            href={insp.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: "block",
                              width: 54,
                              height: 54,
                              borderRadius: 8,
                              overflow: "hidden",
                              border: "1px solid var(--bd)",
                            }}
                          >
                            <img src={insp.url} alt="Inspiration" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Liens réseaux sociaux */}
              {previewRecord["SM Links"] && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-dim)", textTransform: "uppercase", marginBottom: 8 }}>
                    Réseaux Sociaux (SM Links)
                  </div>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: "var(--tx-2)",
                      whiteSpace: "pre-wrap",
                      background: "var(--surf-2)",
                      padding: 14,
                      borderRadius: 10,
                      border: "1px solid var(--bd)",
                      fontFamily: "JetBrains Mono, monospace",
                      lineHeight: 1.5,
                    }}
                  >
                    {previewRecord["SM Links"]}
                  </div>
                </div>
              )}

              {/* Footer */}
              <div style={{ display: "flex", justifyContent: "flex-end", borderTop: "1px solid var(--bd)", paddingTop: 16 }}>
                <MSButton variant="primary" onClick={() => setPreviewRecord(null)}>
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
