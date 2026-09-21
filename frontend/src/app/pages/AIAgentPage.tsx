import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, Bot, Check, ChevronDown, ChevronRight, Film, Image as ImageIcon, ImagePlus, ListChecks, Loader2, Megaphone, MapPin, Paperclip, Plus, Send, Sparkles, X,
} from "lucide-react";
import {
  api, ApiError, type StructuredOutput, type CampaignBriefStructured, type InsightAnswerStructured,
  type CampaignQuestionnaireStructured, type CampaignCreatedStructured, type QuestionT, type GeoLocation,
} from "../lib/api";
import * as ucc from "../lib/ucc";
import * as chatHistory from "../lib/chatHistory";
import type { ArchivedConversation } from "../lib/chatHistory";
import { getCachedUser } from "../lib/auth";
import { MSButton } from "../components/ms/primitives";
import { useAccount } from "../providers/AccountProvider";
import { useInvalidateMetaData } from "../hooks/useMetaData";

/** Retire le markdown gras/italique (** __ *) des réponses agent — l'UI affiche
 *  du texte brut. Doublon défensif du nettoyage backend (couvre l'historique). */
function cleanMarkdown(text: string): string {
  if (!text) return text;
  return text
    .replace(/\*\*(.+?)\*\*/gs, "$1")
    .replace(/__(.+?)__/gs, "$1")
    .replace(/\*(?!\s)(.+?)(?<!\s)\*/g, "$1")
    .replace(/\*\*/g, "");
}

type ChatMsg = { role: "user" | "ai"; text: string; time: string; structured?: StructuredOutput | null; imageHash?: string | null; uccOptions?: ucc.UccOption[]; uccImageUrl?: string };
const WELCOME_MSG: ChatMsg = {
  role: "ai",
  text: "Bonjour 👋 — je suis votre agent MetaScope. Je peux créer des campagnes Meta, lire vos données de Page Facebook et publier des posts. Que souhaitez-vous faire ?",
  time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
};
const SUGGESTED_PROMPTS = [
  "Crée une campagne trafic 'Promo été' à 10€/jour ciblant le Maroc",
  "Quel est le nom de ma Page Facebook ?",
  "Liste mes 5 dernières publications",
  "Analyse les performances de mes campagnes des 7 derniers jours",
];
type ConvSummary = ArchivedConversation;

function CampaignBriefCard({ brief }: { brief: CampaignBriefStructured }) {
  return (
    <div style={{ borderRadius: 12, padding: 16, marginTop: 12, display: "flex", flexDirection: "column", gap: 12, background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 9%, transparent), color-mix(in srgb, var(--accent) 2%, transparent))", border: "1px solid color-mix(in srgb, var(--accent) 19%, transparent)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 26, height: 26, borderRadius: 7, background: "color-mix(in srgb, var(--accent) 19%, transparent)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}><Megaphone size={13} /></span>
        <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".06em", color: "#7FB1F5", fontWeight: 600 }}>Brief de campagne — à valider</span>
      </div>
      <div>
        <div style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 15, color: "var(--tx)" }}>{brief.name}</div>
        <div style={{ fontSize: 11.5, color: "var(--tx-3)" }}>{brief.objective} · ${brief.daily_budget_usd.toFixed(2)} / jour</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11.5 }}>
        <div style={{ borderRadius: 8, padding: "8px 10px", background: "var(--surf-2)" }}>
          <div style={{ color: "var(--tx-dim)", marginBottom: 2 }}>Audience</div>
          <div style={{ color: "var(--tx-2)" }}>{brief.audience.age_min}–{brief.audience.age_max} ans · {brief.audience.city_key && brief.audience.city_name ? `${brief.audience.city_name}${brief.audience.radius_km ? ` (${brief.audience.radius_km} km)` : ""}` : brief.audience.countries.join(", ")}</div>
          {brief.audience.city_key && brief.audience.region_name && <div style={{ color: "var(--tx-3)", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}><MapPin size={11} /> {brief.audience.region_name}</div>}
          {brief.audience.interests.length > 0 && <div style={{ color: "var(--tx-3)", marginTop: 4 }}>{brief.audience.interests.join(" · ")}</div>}
        </div>
        <div style={{ borderRadius: 8, padding: "8px 10px", background: "var(--surf-2)" }}>
          <div style={{ color: "var(--tx-dim)", marginBottom: 2 }}>CTA</div>
          <div style={{ color: "var(--tx-2)" }}>{brief.ad_copy.cta}</div>
          {brief.estimated_reach && <div style={{ color: "var(--tx-3)", marginTop: 4 }}>~ {brief.estimated_reach}</div>}
        </div>
      </div>
      <div style={{ borderRadius: 8, padding: "8px 10px", background: "var(--surf-2)" }}>
        <div style={{ fontSize: 11, color: "var(--tx-dim)", marginBottom: 3 }}>Headline</div>
        <div style={{ fontSize: 14, color: "var(--tx)", fontWeight: 500 }}>{brief.ad_copy.headline}</div>
        <div style={{ fontSize: 11, color: "var(--tx-dim)", marginTop: 8, marginBottom: 3 }}>Texte principal</div>
        <div style={{ fontSize: 12.5, color: "var(--tx-2)", lineHeight: 1.5, whiteSpace: "pre-line" }}>{brief.ad_copy.primary_text}</div>
      </div>
      {(brief.image_hash || brief.video_id) && (
        <div style={{ borderRadius: 8, padding: "8px 10px", display: "flex", alignItems: "center", gap: 8, background: "color-mix(in srgb, var(--accent) 7%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 19%, transparent)" }}>
          {brief.video_id ? <Film size={13} style={{ color: "#7FB1F5", flexShrink: 0 }} /> : <ImageIcon size={13} style={{ color: "#7FB1F5", flexShrink: 0 }} />}
          <span style={{ fontSize: 11.5, color: "#7FB1F5" }}>{brief.video_id ? "Vidéo jointe" : "Photo jointe"}</span>
        </div>
      )}
      {brief.image_prompt && !brief.image_hash && !brief.video_id && (
        <div style={{ borderRadius: 8, padding: "8px 10px", display: "flex", gap: 8, background: "#F59E0B12", border: "1px solid #F59E0B30" }}>
          <ImageIcon size={13} style={{ color: "#F59E0B", flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 11.5, color: "#FCD9A0" }}><b>Visuel suggéré : </b>{brief.image_prompt}</span>
        </div>
      )}
      {brief.notes && <div style={{ fontSize: 11.5, color: "var(--tx-3)", fontStyle: "italic" }}>{brief.notes}</div>}
    </div>
  );
}

function InsightCard({ answer }: { answer: InsightAnswerStructured }) {
  return (
    <div style={{ borderRadius: 12, padding: 16, marginTop: 12, display: "flex", flexDirection: "column", gap: 12, background: "var(--surf-2)", border: "1px solid var(--bd)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 26, height: 26, borderRadius: 7, background: "color-mix(in srgb, var(--accent) 13%, transparent)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}><Sparkles size={13} /></span>
        <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".06em", color: "#7FB1F5", fontWeight: 600 }}>Analyse</span>
      </div>
      <div style={{ fontSize: 13.5, color: "var(--tx-2)", lineHeight: 1.55 }}>{answer.summary}</div>
      {answer.key_metrics.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {answer.key_metrics.map((m, i) => (
            <div key={i} style={{ borderRadius: 8, padding: "8px 10px", background: "var(--surf-card)", border: "1px solid var(--bd)" }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--tx-dim)" }}>{m.label}</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginTop: 4 }}>
                <span style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 16, color: "var(--tx)" }}>{m.value}</span>
                {m.trend != null && <span style={{ fontSize: 10.5, fontFamily: "JetBrains Mono", color: m.trend >= 0 ? "#22C55E" : "#EF4444" }}>{m.trend >= 0 ? "▲" : "▼"} {Math.abs(m.trend).toFixed(1)}%</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      {answer.recommendations.length > 0 && (
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--tx-dim)", marginBottom: 6, fontWeight: 600 }}>Recommandations</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {answer.recommendations.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 8, fontSize: 12.5, color: "var(--tx-2)" }}><ChevronRight size={13} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 2 }} /><span>{r}</span></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Carte affichée APRÈS création réelle d'une campagne. Met en avant le statut
 *  PAUSED (garde-fou sécurité = argument de vente) : aucune dépense sans activation
 *  manuelle. Les IDs Meta sont en JetBrains Mono (Mono-Owns-Numbers). */
function CampaignCreatedCard({ data, onNavigate }: { data: CampaignCreatedStructured; onNavigate?: (id: string) => void }) {
  const budget = data.daily_budget != null ? (data.daily_budget / 100).toFixed(2) : null;
  const ids: Array<[string, string | null | undefined]> = [
    ["Campaign", data.campaign_id], ["Ad set", data.adset_id], ["Ad", data.ad_id],
  ];
  return (
    <div style={{ borderRadius: 12, padding: 16, marginTop: 12, display: "flex", flexDirection: "column", gap: 12, background: "linear-gradient(135deg, #22C55E14, #22C55E05)", border: "1px solid #22C55E30" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 26, height: 26, borderRadius: 7, background: "#22C55E25", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#22C55E" }}><Check size={14} /></span>
        <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".06em", color: "#6EE7A8", fontWeight: 600 }}>Campagne créée</span>
        <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", color: "#F59E0B", background: "#F59E0B18", border: "1px solid #F59E0B40", borderRadius: 999, padding: "3px 10px" }}>● PAUSED</span>
      </div>
      <div>
        <div style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 15, color: "var(--tx)" }}>{data.name}</div>
        {(data.objective || budget) && <div style={{ fontSize: 11.5, color: "var(--tx-3)" }}>{[data.objective, budget ? `${budget} / jour` : null].filter(Boolean).join(" · ")}</div>}
      </div>
      <div style={{ borderRadius: 8, padding: "9px 11px", display: "flex", gap: 8, background: "#F59E0B10", border: "1px solid #F59E0B25" }}>
        <AlertTriangle size={13} style={{ color: "#F59E0B", flexShrink: 0, marginTop: 1 }} />
        <span style={{ fontSize: 11.5, color: "#FCD9A0", lineHeight: 1.5 }}>Ta campagne est en pause. <b>Aucune dépense tant que tu ne l'actives pas</b> depuis Meta ou la page Campagnes.</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, borderRadius: 8, padding: "8px 10px", background: "var(--surf-2)", fontSize: 11 }}>
        {ids.filter(([, v]) => v).map(([label, v]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ color: "var(--tx-dim)" }}>{label}</span>
            <span style={{ fontFamily: "JetBrains Mono", color: "var(--tx-3)" }}>{v}</span>
          </div>
        ))}
      </div>
      {onNavigate && (
        <MSButton variant="outline" size="sm" onClick={() => onNavigate("campaigns")} icon={<ChevronRight size={14} />} style={{ alignSelf: "flex-start" }}>Voir mes campagnes</MSButton>
      )}
    </div>
  );
}

const CUSTOM = "__custom__";

type Media = { kind: "image" | "video"; ref: string; name: string; previewUrl: string };
type GeoSel = { key: string; name: string; region: string; country: string; radius: number };
type Answer = { choice: string | string[]; custom: string; media?: Media | null; uploading?: boolean; mediaError?: string | null; geo?: GeoSel | null };

// Budget quotidien conseillé selon l'objectif : notoriété/engagement coûtent peu,
// trafic un peu plus, leads/ventes davantage (les conversions coûtent plus cher).
// Sert à recommander une valeur dans le questionnaire — pas de chiffre inventé côté
// campagne, c'est un simple guide affiché à l'utilisateur.
const BUDGET_RECO: Record<string, { amount: number; note: string }> = {
  OUTCOME_AWARENESS: { amount: 8, note: "La notoriété (portée/impressions) est peu coûteuse : un petit budget suffit pour démarrer." },
  OUTCOME_ENGAGEMENT: { amount: 8, note: "L'engagement (likes, commentaires) revient peu cher : commence modestement." },
  OUTCOME_TRAFFIC: { amount: 15, note: "Pour envoyer du trafic qualifié vers ton site, un budget moyen aide à sortir de la phase d'apprentissage." },
  OUTCOME_LEADS: { amount: 25, note: "La génération de leads coûte plus cher par résultat : prévois un budget suffisant pour collecter des contacts." },
  OUTCOME_SALES: { amount: 35, note: "Les conversions/ventes sont les plus coûteuses : un budget plus élevé accélère l'optimisation de Meta." },
};

// Sélecteur de ville Meta réelle → région (auto) → rayon en km. Aucune ville
// inventée : l'autocomplétion interroge l'API Meta (search_geo_locations).
function GeoPicker({ value, accountId, locked, placeholder, onChange }: {
  value: GeoSel | null;
  accountId: string | null;
  locked: boolean;
  placeholder?: string | null;
  onChange: (g: GeoSel | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recherche debounced (300 ms) — évite d'appeler Meta à chaque frappe.
  useEffect(() => {
    const q = query.trim();
    if (value || q.length < 2) { setResults([]); return; }
    setLoading(true); setError(null);
    const t = setTimeout(async () => {
      try {
        const res = await api.geoSearch(q, "city", accountId);
        setResults(res); setOpen(true);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Recherche indisponible.");
        setResults([]);
      } finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [query, accountId, value]);

  const select = (g: GeoLocation) => {
    onChange({ key: g.key, name: g.name, region: g.region || "", country: g.country_name || g.country_code || "", radius: 25 });
    setQuery(""); setResults([]); setOpen(false);
  };

  if (value) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, borderRadius: 10, background: "var(--surf-2)", border: "1px solid color-mix(in srgb, var(--accent) 19%, transparent)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span style={{ color: "var(--accent)", display: "inline-flex", marginTop: 1 }}><MapPin size={16} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, color: "var(--tx)", fontWeight: 500 }}>{value.name}</div>
            <div style={{ fontSize: 11.5, color: "var(--tx-3)", marginTop: 1 }}>{[value.region, value.country].filter(Boolean).join(" · ")}</div>
          </div>
          {!locked && <button onClick={() => onChange(null)} style={{ background: "none", border: "none", color: "var(--tx-dim)", cursor: "pointer", padding: 4 }}><X size={15} /></button>}
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--tx-3)", marginBottom: 4 }}>
            <span>Rayon autour de la ville</span>
            <span style={{ fontFamily: "JetBrains Mono", color: "var(--accent)", fontWeight: 600 }}>{value.radius} km</span>
          </div>
          <input type="range" min={1} max={80} step={1} value={value.radius} disabled={locked}
            onChange={(e) => onChange({ ...value, radius: Number(e.target.value) })}
            style={{ width: "100%", accentColor: "var(--accent)", cursor: locked ? "default" : "pointer" }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <input disabled={locked} value={query} onChange={(e) => setQuery(e.target.value)} onFocus={() => results.length && setOpen(true)}
        placeholder={placeholder || "Cherche une ville…"}
        style={{ width: "100%", background: "var(--surf-2)", border: "1px solid var(--bd)", borderRadius: 9, padding: "9px 11px", color: "var(--tx)", fontSize: 13, outline: "none", fontFamily: "IBM Plex Sans" }} />
      {loading && <span style={{ position: "absolute", right: 10, top: 9, color: "var(--tx-dim)" }}><Loader2 size={15} className="animate-spin" /></span>}
      {error && <div style={{ fontSize: 11.5, color: "#FCA5A5", marginTop: 6 }}>{error}</div>}
      {open && results.length > 0 && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20, maxHeight: 220, overflow: "auto", background: "var(--surf-pop)", border: "1px solid var(--bd)", borderRadius: 10, boxShadow: "0 14px 40px rgba(0,0,0,.4)", padding: 4 }}>
          {results.map((g) => (
            <button key={g.key} onClick={() => select(g)} className="ms-menu-item"
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "8px 10px", background: "transparent", border: "none", borderRadius: 7, cursor: "pointer", color: "var(--tx-2)", fontFamily: "IBM Plex Sans" }}>
              <span style={{ color: "var(--tx-dim)", display: "inline-flex", flexShrink: 0 }}><MapPin size={13} /></span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, color: "var(--tx)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</span>
                <span style={{ display: "block", fontSize: 11, color: "var(--tx-dim)" }}>{[g.region, g.country_name].filter(Boolean).join(" · ")}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function QuestionnaireCard({ q, locked, accountId, onSubmit }: {
  q: CampaignQuestionnaireStructured;
  locked: boolean;
  accountId: string | null;
  onSubmit: (message: string) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, Answer>>(() =>
    Object.fromEntries(q.questions.map((qq) => [qq.id, { choice: qq.type === "multi" ? [] : "", custom: "" }])),
  );

  const setChoice = (qid: string, choice: string | string[]) =>
    setAnswers((a) => ({ ...a, [qid]: { ...a[qid], choice } }));
  const setCustom = (qid: string, custom: string) =>
    setAnswers((a) => ({ ...a, [qid]: { ...a[qid], custom } }));

  // Upload d'une photo ou d'une vidéo pour une question de type "media".
  const onMediaChosen = async (qid: string, file: File | null) => {
    if (!file) return;
    const isVideo = file.type.startsWith("video/");
    const previewUrl = URL.createObjectURL(file);
    setAnswers((a) => ({ ...a, [qid]: { ...a[qid], uploading: true, mediaError: null } }));
    try {
      if (isVideo) {
        const res = await api.uploadChatVideo(file, accountId);
        if (res.error || !res.video_id) throw new Error(res.error || "Upload vidéo échoué.");
        setAnswers((a) => ({ ...a, [qid]: { ...a[qid], uploading: false, media: { kind: "video", ref: res.video_id, name: file.name, previewUrl } } }));
      } else {
        const res = await api.uploadChatImage(file, accountId);
        if (res.error || !res.image_hash) throw new Error(res.error || "Upload image échoué.");
        setAnswers((a) => ({ ...a, [qid]: { ...a[qid], uploading: false, media: { kind: "image", ref: res.image_hash, name: file.name, previewUrl } } }));
      }
    } catch (e) {
      URL.revokeObjectURL(previewUrl);
      setAnswers((a) => ({ ...a, [qid]: { ...a[qid], uploading: false, mediaError: e instanceof Error ? e.message : "Upload échoué." } }));
    }
  };
  const removeMedia = (qid: string) =>
    setAnswers((a) => {
      const m = a[qid].media; if (m) URL.revokeObjectURL(m.previewUrl);
      return { ...a, [qid]: { ...a[qid], media: null, mediaError: null } };
    });

  const toggleMulti = (qid: string, value: string) =>
    setAnswers((a) => {
      const cur = Array.isArray(a[qid].choice) ? (a[qid].choice as string[]) : [];
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      return { ...a, [qid]: { ...a[qid], choice: next } };
    });

  // Cleanup: revoke all preview URLs on unmount to prevent memory leaks.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    return () => {
      Object.values(answers).forEach((answer) => {
        if (answer.media?.previewUrl) {
          URL.revokeObjectURL(answer.media.previewUrl);
        }
      });
    };
  }, []);

  // Réponse finale (label lisible) d'une question — gère « Autre » et champ libre.
  const setGeo = (qid: string, geo: GeoSel | null) =>
    setAnswers((a) => ({ ...a, [qid]: { ...a[qid], geo } }));

  const resolved = (qq: QuestionT): string => {
    const a = answers[qq.id];
    if (qq.type === "geo") return a.geo ? `${a.geo.name}${a.geo.region ? ` (${a.geo.region})` : ""} · ${a.geo.radius} km` : "";
    if (qq.type === "media") return a.media ? (a.media.kind === "video" ? "vidéo jointe" : "photo jointe") : "";
    if (qq.type === "text") return a.custom.trim();
    if (qq.type === "multi") {
      const labels = (a.choice as string[]).map((v) => qq.options.find((o) => o.value === v)?.label || v);
      if (a.custom.trim()) labels.push(a.custom.trim());
      return labels.join(", ");
    }
    if (a.choice === CUSTOM) return a.custom.trim();
    return qq.options.find((o) => o.value === a.choice)?.label || "";
  };

  const missing = q.questions.filter((qq) => qq.required && !resolved(qq));
  const canSubmit = missing.length === 0 && !locked;

  const submit = () => {
    const lines = q.questions.map((qq) => {
      const val = resolved(qq);
      // On joint le code technique (objectif/pays) quand un choix prédéfini est pris.
      const a = answers[qq.id];
      let code = "";
      if (qq.type === "single" && a.choice && a.choice !== CUSTOM) code = ` [${a.choice}]`;
      if (qq.type === "multi" && (a.choice as string[]).length) code = ` [${(a.choice as string[]).join(", ")}]`;
      // Le visuel transporte sa référence technique pour que l'agent la réutilise.
      if (qq.type === "media" && a.media) code = a.media.kind === "video" ? ` [video_id=${a.media.ref}]` : ` [image_hash=${a.media.ref}]`;
      // Le ciblage géo transporte la clé de ville Meta + le rayon pour l'agent.
      if (qq.type === "geo" && a.geo) code = ` [geo_city=${a.geo.key};radius=${a.geo.radius};name=${a.geo.name};region=${a.geo.region}]`;
      return `- ${qq.label} ${val || "(non précisé)"}${code}`;
    });
    onSubmit("[Réponses au questionnaire de campagne]\n" + lines.join("\n"));
  };

  const optBtn = (selected: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left",
    padding: "9px 11px", borderRadius: 9, cursor: locked ? "default" : "pointer",
    border: "1px solid " + (selected ? "var(--accent)" : "var(--bd)"),
    background: selected ? "color-mix(in srgb, var(--accent) 9%, transparent)" : "var(--surf-2)", color: selected ? "var(--tx)" : "var(--tx-2)",
    fontSize: 13, transition: "all .12s",
  });

  return (
    <div style={{ borderRadius: 12, padding: 16, marginTop: 12, display: "flex", flexDirection: "column", gap: 16, background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 8%, transparent), color-mix(in srgb, var(--accent) 2%, transparent))", border: "1px solid color-mix(in srgb, var(--accent) 19%, transparent)", opacity: locked ? 0.7 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 26, height: 26, borderRadius: 7, background: "color-mix(in srgb, var(--accent) 19%, transparent)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}><ListChecks size={14} /></span>
        <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".06em", color: "#7FB1F5", fontWeight: 600 }}>{q.title}</span>
      </div>
      {q.intro && <div style={{ fontSize: 12.5, color: "var(--tx-3)", lineHeight: 1.5, marginTop: -6 }}>{q.intro}</div>}

      {q.questions.map((qq) => {
        const a = answers[qq.id];
        const customSelected = qq.type === "single" && a.choice === CUSTOM;
        // Recommandation de budget : basée sur l'objectif déjà choisi dans ce même
        // questionnaire. On met en avant l'option la plus proche du budget conseillé.
        const objChoice = typeof answers["objective"]?.choice === "string" ? (answers["objective"].choice as string) : "";
        const reco = qq.id === "daily_budget" ? BUDGET_RECO[objChoice] : undefined;
        let recoOptValue = "";
        if (reco) {
          const nums = qq.options.map((o) => Number(o.value)).filter((n) => !isNaN(n));
          if (nums.length) recoOptValue = String(nums.reduce((p, c) => (Math.abs(c - reco.amount) < Math.abs(p - reco.amount) ? c : p)));
        }
        return (
          <div key={qq.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 13.5, color: "var(--tx)", fontWeight: 500 }}>{qq.label}{qq.required && <span style={{ color: "var(--accent)" }}> *</span>}</div>

            {reco && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 11px", borderRadius: 9, background: "color-mix(in srgb, var(--accent) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 19%, transparent)", fontSize: 12, color: "var(--tx-2)", lineHeight: 1.45 }}>
                <Sparkles size={13} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 1 }} />
                <span>Recommandé : <b style={{ color: "var(--accent)" }}>≈ {reco.amount} € / jour</b> pour cet objectif. {reco.note}</span>
              </div>
            )}

            {qq.type === "geo" ? (
              <GeoPicker value={a.geo ?? null} accountId={accountId} locked={locked} placeholder={qq.placeholder} onChange={(g) => setGeo(qq.id, g)} />
            ) : qq.type === "media" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {a.media ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, borderRadius: 10, background: "var(--surf-2)", border: "1px solid color-mix(in srgb, var(--accent) 19%, transparent)" }}>
                    {a.media.kind === "video"
                      ? <video src={a.media.previewUrl} style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover", background: "#000" }} muted />
                      : <img src={a.media.previewUrl} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover" }} />}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12.5, color: "var(--tx)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.media.name}</div>
                      <div style={{ fontSize: 10.5, color: "#7FB1F5", display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>{a.media.kind === "video" ? <><Film size={11} /> Vidéo prête</> : <><ImageIcon size={11} /> Photo prête</>}</div>
                    </div>
                    {!locked && <button onClick={() => removeMedia(qq.id)} style={{ background: "none", border: "none", color: "var(--tx-dim)", cursor: "pointer", padding: 4 }}><X size={15} /></button>}
                  </div>
                ) : (
                  <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 12px", borderRadius: 10, border: "1.5px dashed #2A3A55", background: "var(--surf-2)", color: a.uploading ? "var(--accent)" : "var(--tx-3)", fontSize: 13, cursor: locked || a.uploading ? "default" : "pointer" }}>
                    {a.uploading ? <><Loader2 size={16} className="animate-spin" /> Upload en cours…</> : <><ImagePlus size={16} /> {qq.placeholder || "Ajouter une photo ou une vidéo"}</>}
                    <input type="file" accept="image/*,video/*" disabled={locked || a.uploading} style={{ display: "none" }} onChange={(e) => onMediaChosen(qq.id, e.target.files?.[0] || null)} />
                  </label>
                )}
                {a.mediaError && <div style={{ fontSize: 11.5, color: "#FCA5A5", display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={12} /> {a.mediaError}</div>}
              </div>
            ) : qq.type === "text" ? (
              <input disabled={locked} value={a.custom} onChange={(e) => setCustom(qq.id, e.target.value)} placeholder={qq.placeholder || "Écris ta réponse…"}
                style={{ background: "var(--surf-2)", border: "1px solid var(--bd)", borderRadius: 9, padding: "9px 11px", color: "var(--tx)", fontSize: 13, outline: "none", fontFamily: "IBM Plex Sans" }} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {qq.options.map((o) => {
                  const selected = qq.type === "multi" ? (a.choice as string[]).includes(o.value) : a.choice === o.value;
                  return (
                    <button key={o.value} disabled={locked} onClick={() => qq.type === "multi" ? toggleMulti(qq.id, o.value) : setChoice(qq.id, o.value)} style={optBtn(selected)}>
                      <span style={{ width: 18, height: 18, flexShrink: 0, borderRadius: qq.type === "multi" ? 5 : 999, border: "1.5px solid " + (selected ? "var(--accent)" : "#3A3F4A"), background: selected ? "var(--accent)" : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>{selected && <Check size={12} />}</span>
                      <span style={{ flex: 1 }}>{o.label}{o.hint && <span style={{ display: "block", fontSize: 11, color: "var(--tx-dim)", marginTop: 1 }}>{o.hint}</span>}</span>
                      {recoOptValue && o.value === recoOptValue && <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 600, color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 13%, transparent)", borderRadius: 999, padding: "2px 8px" }}>Recommandé</span>}
                    </button>
                  );
                })}
                {qq.allow_custom && (
                  <button disabled={locked} onClick={() => qq.type === "single" ? setChoice(qq.id, CUSTOM) : undefined} style={optBtn(customSelected)}>
                    <span style={{ width: 18, height: 18, flexShrink: 0, borderRadius: qq.type === "multi" ? 5 : 999, border: "1.5px solid " + (customSelected ? "var(--accent)" : "#3A3F4A"), background: customSelected ? "var(--accent)" : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>{customSelected && <Check size={12} />}</span>
                    <span style={{ flex: 1, color: "var(--tx-3)" }}>Autre (préciser)</span>
                  </button>
                )}
                {qq.allow_custom && (qq.type === "multi" || customSelected) && (
                  <input disabled={locked} value={a.custom} onChange={(e) => setCustom(qq.id, e.target.value)} placeholder={qq.placeholder || "Précise ta réponse…"}
                    style={{ background: "var(--surf-2)", border: "1px solid color-mix(in srgb, var(--accent) 19%, transparent)", borderRadius: 9, padding: "9px 11px", color: "var(--tx)", fontSize: 13, outline: "none", fontFamily: "IBM Plex Sans" }} />
                )}
              </div>
            )}
          </div>
        );
      })}

      {!locked && (
        <button onClick={submit} disabled={!canSubmit} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "11px 16px", borderRadius: 10, border: "none", background: canSubmit ? "var(--accent)" : "var(--bd)", color: canSubmit ? "#fff" : "var(--tx-dim)", fontSize: 13.5, fontWeight: 600, cursor: canSubmit ? "pointer" : "default" }}>
          <Send size={15} /> {q.submit_label}
        </button>
      )}
      {!locked && missing.length > 0 && <div style={{ fontSize: 11.5, color: "var(--tx-dim)", textAlign: "center", marginTop: -6 }}>Réponds aux questions obligatoires (*) pour continuer.</div>}
      {locked && <div style={{ fontSize: 12, color: "#22C55E", display: "flex", alignItems: "center", gap: 6 }}><Check size={13} /> Réponses envoyées.</div>}
    </div>
  );
}

/** Notre agent LangGraph (cf. backend/agent.py, AGENT_ID). Tout autre agent est
 *  externe (UCC) et se parle en direct, sans passer par notre backend. */
const OUR_AGENT_ID = "fizzy";

const nowTime = () =>
  new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** Détache un « @nom » de tête et le résout en agent connu.
 *
 * « @fizzy salut » → { agent: "fizzy", text: "salut" }. Le `@` ne compte que s'il
 * ouvre le message ET nomme un agent de la liste : sinon c'est du texte normal
 * (une adresse e-mail ou un « @toi » au fil de la phrase ne doit rien changer).
 * Un « @fizzy » seul change d'agent sans envoyer de message (text vide).
 */
function splitAgentMention(
  raw: string,
  agents: { id: string; name: string }[],
): { agent: string | null; text: string } {
  const m = /^@([\w.-]+)\s*/.exec(raw);
  if (!m) return { agent: null, text: raw };
  const typed = m[1].toLowerCase();
  const hit = agents.find((a) => a.id.toLowerCase() === typed || a.name.toLowerCase() === typed);
  if (!hit) return { agent: null, text: raw };
  return { agent: hit.id, text: raw.slice(m[0].length) };
}

export function AIAgentPage({ onNavigate }: { onNavigate?: (id: string) => void } = {}) {
  const { selectedAccountId } = useAccount();
  const invalidateMeta = useInvalidateMetaData();
  const [messages, setMessages] = useState<ChatMsg[]>([WELCOME_MSG]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConvSummary[]>([]);
  // true = l'écran affiche un fil archivé (lecture seule, cf. chatHistory.ts) ;
  // false = le fil courant, celui réellement relié à la room UCC en cours.
  const [viewingArchive, setViewingArchive] = useState(false);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [attachedImage, setAttachedImage] = useState<{ hash: string; previewUrl: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Agent conversationnel courant. `null` = notre agent Meta Ads par défaut.
  // On en change en écrivant « @nom » en tête de message (cf. splitAgentMention).
  const [agentId, setAgentId] = useState<string | null>(null);
  // Agents du workspace tybotflow, pour valider le « @nom ». Vide si le login
  // n'était pas délégué (pas de token client) ou si le workspace est injoignable.
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);

  // Index surligné dans le menu « @ ». -1 = menu fermé.
  const [mentionIdx, setMentionIdx] = useState(-1);
  // Menu du bouton sélecteur d'agent (alternative visible au « @ »).
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);

  useEffect(() => {
    // Best-effort : sans cette liste, « @nom » reste du texte normal.
    api.agents().then(setAgents).catch(() => setAgents([]));
  }, []);

  // Tous les agents vivent sur UCC : on ouvre (ou retrouve) la conversation et on
  // écoute sa room. UCC étant un webhook, c'est le SEUL moyen de recevoir les
  // réponses. Par défaut, l'agent est le nôtre (Meta_ads).
  const uccBot = agentId || OUR_AGENT_ID;
  useEffect(() => {
    if (!uccBot) return;
    const userId = getCachedUser()?.id;
    if (!userId) return;

    let close: (() => void) | undefined;
    let cancelled = false;
    ucc
      .startConversation(uccBot, userId)
      .then((room) => {
        // Le composant a pu changer d'agent pendant l'appel réseau.
        if (cancelled) return;
        close = ucc.listen(room, (m) => {
          setTyping(false);
          setMessages((prev) => [...prev, { role: "ai", text: m.text, time: nowTime(), uccOptions: m.options, uccImageUrl: m.imageUrl }]);
        });
      })
      .catch(() => {
        if (cancelled) return;
        setMessages((prev) => [...prev, { role: "ai", text: "⚠️ Cet agent est injoignable pour le moment.", time: nowTime() }]);
      });

    return () => { cancelled = true; close?.(); };
  }, [uccBot]);

  // Clic sur une option (bouton single-choice) : le label choisi s'affiche
  // IMMÉDIATEMENT comme un message "toi" — même geste qu'un envoi texte libre,
  // juste déclenché par un clic plutôt que par la touche Entrée. Sa valeur part
  // au bot comme le ferait un message texte.
  const pickOption = async (opt: ucc.UccOption) => {
    if (typing) return;
    setMessages((prev) => [...prev, { role: "user", text: opt.label, time: nowTime() }]);
    setTyping(true);
    try {
      await ucc.sendMessage(uccBot, opt.value, getCachedUser()?.id || "");
    } catch {
      setTyping(false);
      setMessages((prev) => [...prev, { role: "ai", text: "⚠️ Message non envoyé. Réessaie.", time: nowTime() }]);
    }
  };

  // Un clic ailleurs referme le menu d'agents (sinon il reste ouvert par-dessus
  // le fil). Échap fait de même.
  useEffect(() => {
    if (!agentMenuOpen) return;
    const close = () => setAgentMenuOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", onKey); };
  }, [agentMenuOpen]);

  // Menu d'agents : ouvert dès que le message commence par « @ », filtré au fil
  // de la frappe. Dérivé de `input` — rien à synchroniser.
  const mentionQuery = /^@([\w.-]*)$/.exec(input)?.[1]?.toLowerCase() ?? null;
  const mentionMatches =
    mentionQuery === null
      ? []
      : agents.filter(
          (a) =>
            a.id.toLowerCase().startsWith(mentionQuery) ||
            a.name.toLowerCase().startsWith(mentionQuery),
        );
  const mentionOpen = mentionMatches.length > 0;
  // La frappe change la liste : un index gardé d'avant surlignerait la mauvaise
  // ligne (ou dépasserait). On resurligne le premier.
  useEffect(() => { setMentionIdx(mentionMatches.length > 0 ? 0 : -1); }, [mentionQuery, mentionMatches.length]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Complète « @fiz » en « @fizzy » et rend la main à la saisie du message.
  const pickAgent = (a: { id: string; name: string }) => {
    setInput(`@${a.id} `);
    setMentionIdx(-1);
    taRef.current?.focus();
  };

  const autoResize = useCallback(() => {
    const el = taRef.current; if (!el) return;
    el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);
  useEffect(() => { autoResize(); }, [input, autoResize]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, typing]);

  // Un fil archivé se réaffiche tel qu'il était figé, mais il n'est PAS relié à
  // la room UCC réelle (UCC ne connaît qu'un seul fil actif par agent — cf.
  // chatHistory.ts). Le rouvrir est donc une consultation en lecture seule.
  const loadConversation = (conv: ArchivedConversation) => {
    setMessages(conv.messages.length > 0 ? conv.messages : [{ ...WELCOME_MSG }]);
    setConversationId(conv.id);
    setViewingArchive(true);
  };

  // Liste locale au chargement (rien à attendre du réseau : c'est du localStorage).
  useEffect(() => {
    setConversations(chatHistory.listArchived());
  }, []);

  const onFileChosen = async (file: File | null) => {
    if (!file) return;
    setUploadError(null); setUploading(true);
    const previewUrl = URL.createObjectURL(file);
    try {
      // Photo ou vidéo : deux endpoints distincts côté Meta (hash vs video_id).
      const isVideo = file.type.startsWith("video/");
      const res = isVideo
        ? await api.uploadChatVideo(file, selectedAccountId)
        : await api.uploadChatImage(file, selectedAccountId);
      const hash = isVideo ? (res as { video_id?: string }).video_id : (res as { image_hash?: string }).image_hash;
      if (res.error || !hash) { setUploadError(res.error || "Upload failed."); URL.revokeObjectURL(previewUrl); return; }
      setAttachedImage({ hash, previewUrl, name: file.name });
    } catch (e) {
      URL.revokeObjectURL(previewUrl);
      setUploadError(e instanceof ApiError ? e.message : "Upload failed.");
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const removeAttachment = () => { if (attachedImage?.previewUrl) URL.revokeObjectURL(attachedImage.previewUrl); setAttachedImage(null); };

  const send = async (preset?: string) => {
    // Écrire pendant qu'on consulte une archive : elle n'est pas reliée à la
    // room UCC réelle (cf. chatHistory.ts), donc on repart sur un fil neuf —
    // comme un "New Chat" implicite — plutôt que d'envoyer dans le vide.
    if (viewingArchive) { setMessages([{ ...WELCOME_MSG, time: nowTime() }]); setConversationId(null); setViewingArchive(false); }
    const raw = (preset ?? input).trim();
    // « @nom » en tête = changement d'agent. L'agent choisi reste actif pour les
    // messages suivants, jusqu'au prochain « @ ».
    const { agent: mentioned, text: stripped } = splitAgentMention(raw, agents);
    const activeAgent = mentioned ?? agentId;
    if (mentioned && mentioned !== agentId) setAgentId(mentioned);
    const text = stripped.trim();
    // « @fizzy » seul : on bascule d'agent, sans message vide à envoyer.
    if (mentioned && !text && !attachedImage) {
      const label = agents.find((a) => a.id === mentioned)?.name || mentioned;
      setInput("");
      setMessages((prev) => [...prev, { role: "ai", text: `Tu parles maintenant avec ${label}.`, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }]);
      return;
    }
    if ((!text && !attachedImage) || typing) return;
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const imageHash = attachedImage?.hash || null;
    setMessages((prev) => [...prev, { role: "user", text: text || "(image attached)", time: now, imageHash }]);
    setInput(""); removeAttachment(); setTyping(true);

    // TOUS les agents passent par UCC, y compris Meta_ads : c'est la plateforme
    // cliente qui les héberge. Notre backend n'est plus dans la boucle du chat.
    // La réponse n'arrive PAS ici (UCC est un webhook) mais sur la room Socket.IO
    // écoutée plus haut — d'où l'indicateur de frappe laissé actif.
    try {
      await ucc.sendMessage(activeAgent || OUR_AGENT_ID, text, getCachedUser()?.id || "");
    } catch {
      setTyping(false);
      setMessages((prev) => [...prev, { role: "ai", text: "⚠️ Message non envoyé. Réessaie.", time: nowTime() }]);
    }
  };

  const newConversation = () => {
    // Le fil qu'on quitte est sauvegardé s'il contient un vrai échange — sinon
    // (écran jamais utilisé, ou déjà une consultation d'archive) rien à garder.
    if (!viewingArchive) {
      chatHistory.archive(agentId || OUR_AGENT_ID, messages);
      setConversations(chatHistory.listArchived());
    }
    setMessages([{ ...WELCOME_MSG, time: nowTime() }]);
    setConversationId(null);
    setViewingArchive(false);
  };

  // Affiche le QCM de création immédiatement (client-only, sans appel LLM) — le
  // backend renvoie le questionnaire en JSON. Garantit l'affichage de la carte.
  const openCampaignQuestionnaire = async () => {
    if (typing) return;
    try {
      const q = await api.getCampaignQuestionnaire();
      setMessages((prev) => [...prev, {
        role: "ai",
        text: "Réponds à ce questionnaire pour cadrer ta campagne 👇",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        structured: q,
      }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "ai", text: `⚠️ ${err instanceof ApiError ? err.message : "Impossible de charger le questionnaire."}`, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }]);
    }
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div style={{ width: 300, flexShrink: 0, borderRight: "1px solid var(--bd)", display: "flex", flexDirection: "column", background: "var(--surf-1)" }}>
        <div style={{ padding: 16 }}><MSButton variant="primary" icon={<Plus size={16} />} onClick={newConversation} style={{ width: "100%" }}>New Chat</MSButton></div>
        <div style={{ flex: 1, overflow: "auto", padding: "0 10px 10px" }}>
          {conversations.length === 0 && <div style={{ textAlign: "center", color: "var(--tx-faint)", fontSize: 12, padding: "30px 0" }}>Aucune conversation</div>}
          {conversations.map((c) => (
            <button key={c.id} onClick={() => loadConversation(c)} className="ms-convo"
              style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 8, border: "none", cursor: "pointer", marginBottom: 2, background: conversationId === c.id ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "transparent", transition: "background .12s" }}>
              <div style={{ fontSize: 13, color: conversationId === c.id ? "var(--tx)" : "var(--tx-2)", fontWeight: conversationId === c.id ? 500 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title || "Nouvelle conversation"}</div>
              <div style={{ fontSize: 11, color: "var(--tx-dim)", marginTop: 2 }}>{new Date(c.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
        <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "28px 0" }}>
          <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 28px" }}>
            {messages.map((m, i) => (
              m.role === "user" ? (
                <div key={i} className="ms-msg" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 18 }}>
                  <div style={{ maxWidth: "72%" }}>
                    {m.imageHash && <div style={{ marginBottom: 6, fontSize: 11, color: "#7FB1F5", display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}><ImageIcon size={11} /> Image jointe ({m.imageHash.slice(0, 10)}…)</div>}
                    <div style={{ background: "var(--accent)", color: "#fff", borderRadius: "14px 14px 4px 14px", padding: "11px 15px", fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-line" }}>{m.text}</div>
                  </div>
                </div>
              ) : (
                <div key={i} className="ms-msg" style={{ display: "flex", gap: 12, marginBottom: 18 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,var(--accent),#0A57C2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#fff" }}><Sparkles size={16} /></div>
                  <div style={{ maxWidth: "78%" }}>
                    <div style={{ background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: "14px 14px 14px 4px", padding: "12px 15px", fontSize: 14, lineHeight: 1.55, color: "var(--tx-2)", whiteSpace: "pre-line" }}>
                      {cleanMarkdown(m.text)}
                      {m.uccImageUrl && (
                        <a href={m.uccImageUrl} target="_blank" rel="noreferrer" title="Voir en taille réelle"
                          style={{ display: "block", marginTop: m.text ? 10 : 0 }}>
                          <img src={m.uccImageUrl} alt="Image générée" loading="lazy"
                            style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 10, border: "1px solid var(--bd)", display: "block", cursor: "zoom-in" }} />
                        </a>
                      )}
                      {m.structured?.kind === "campaign_brief" && <CampaignBriefCard brief={m.structured} />}
                      {m.structured?.kind === "campaign_created" && <CampaignCreatedCard data={m.structured} onNavigate={onNavigate} />}
                      {m.structured?.kind === "insight_answer" && <InsightCard answer={m.structured} />}
                      {m.structured?.kind === "campaign_questionnaire" && (
                        <QuestionnaireCard q={m.structured} locked={i !== messages.length - 1 || typing} accountId={selectedAccountId} onSubmit={(msg) => send(msg)} />
                      )}
                      {m.uccOptions && m.uccOptions.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
                          {m.uccOptions.map((opt, oi) => (
                            <button key={oi} onClick={() => pickOption(opt)} disabled={typing || viewingArchive}
                              title={viewingArchive ? "Fil archivé : consultation seule." : undefined}
                              style={{ padding: "7px 13px", borderRadius: 999, border: "1px solid color-mix(in srgb, var(--accent) 31%, transparent)", background: "color-mix(in srgb, var(--accent) 9%, transparent)", color: "#7FB1F5", fontSize: 12.5, fontWeight: 600, cursor: typing || viewingArchive ? "default" : "pointer", opacity: viewingArchive ? 0.5 : 1, fontFamily: "IBM Plex Sans", transition: "all .15s", whiteSpace: "pre-line", textAlign: "left" }}>
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            ))}
            {typing && (
              <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,var(--accent),#0A57C2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#fff" }}><Sparkles size={16} /></div>
                <div style={{ background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: "14px 14px 14px 4px", padding: "14px 16px", display: "flex", gap: 5 }}>
                  {[0, 1, 2].map((i) => <span key={i} className="ms-dot" style={{ width: 7, height: 7, borderRadius: 999, background: "var(--tx-dim)", animationDelay: i * 0.16 + "s" }} />)}
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--bd)", padding: "16px 0 20px", flexShrink: 0 }}>
          <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 28px" }}>
            {uploadError && (
              <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 8, background: "#EF444412", border: "1px solid #EF444430", color: "#FCA5A5", fontSize: 12.5, display: "flex", alignItems: "center", gap: 8 }}>
                <AlertTriangle size={13} /> {uploadError}<button onClick={() => setUploadError(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#FCA5A5", cursor: "pointer" }}><X size={12} /></button>
              </div>
            )}
            {attachedImage && (
              <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 10, padding: 8, borderRadius: 10, background: "color-mix(in srgb, var(--accent) 7%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 19%, transparent)" }}>
                <img src={attachedImage.previewUrl} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover" }} />
                <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontSize: 12.5, color: "var(--tx)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{attachedImage.name}</div><div style={{ fontSize: 10.5, color: "var(--tx-dim)", fontFamily: "JetBrains Mono" }}>hash : {attachedImage.hash.slice(0, 16)}…</div></div>
                <button onClick={removeAttachment} style={{ background: "none", border: "none", color: "var(--tx-dim)", cursor: "pointer", padding: 4 }}><X size={14} /></button>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <button onClick={openCampaignQuestionnaire} disabled={typing} className="ms-chip" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 13px", borderRadius: 999, border: "1px solid color-mix(in srgb, var(--accent) 31%, transparent)", background: "color-mix(in srgb, var(--accent) 9%, transparent)", color: "#7FB1F5", fontSize: 12.5, fontWeight: 600, cursor: typing ? "default" : "pointer", fontFamily: "IBM Plex Sans", transition: "all .15s" }}><Megaphone size={13} /> Créer une campagne</button>
              {SUGGESTED_PROMPTS.slice(1, 3).map((c, i) => (
                <button key={i} onClick={() => send(c)} className="ms-chip" style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid var(--bd)", background: "var(--surf-card)", color: "var(--tx-3)", fontSize: 12.5, cursor: "pointer", fontFamily: "IBM Plex Sans", transition: "all .15s" }}>"{c}"</button>
              ))}
            </div>
            {mentionOpen && (
              <div role="listbox" aria-label="Agents disponibles"
                style={{ position: "relative", marginBottom: 8, background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 12, padding: 5, boxShadow: "0 8px 24px rgba(0,0,0,.28)", maxHeight: 220, overflowY: "auto" }}>
                {mentionMatches.map((a, i) => (
                  <button key={a.id} role="option" aria-selected={i === mentionIdx}
                    onMouseEnter={() => setMentionIdx(i)}
                    onClick={() => pickAgent(a)}
                    style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "IBM Plex Sans", background: i === mentionIdx ? "color-mix(in srgb, var(--accent) 13%, transparent)" : "transparent", color: "var(--tx)" }}>
                    <Bot size={15} style={{ flexShrink: 0, color: "var(--accent)" }} />
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{a.name}</span>
                    {a.name !== a.id && <span style={{ fontSize: 12, color: "var(--tx-dim)" }}>@{a.id}</span>}
                  </button>
                ))}
              </div>
            )}
            {/* Sélecteur d'agent : même rôle que « @nom », mais visible en
                permanence — il indique AUSSI avec qui on parle actuellement. */}
            {agentMenuOpen && (
              <div role="listbox" aria-label="Choisir un agent" onClick={(e) => e.stopPropagation()}
                style={{ marginBottom: 8, background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 14, padding: 6, boxShadow: "0 12px 32px rgba(0,0,0,.34)", maxHeight: 260, overflowY: "auto" }}>
                {agents.map((a) => {
                  const active = (agentId || OUR_AGENT_ID) === a.id;
                  return (
                    <button key={a.id} role="option" aria-selected={active}
                      onClick={() => { setAgentId(a.id); setAgentMenuOpen(false); taRef.current?.focus(); }}
                      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 10, border: "none", cursor: "pointer", fontFamily: "IBM Plex Sans", background: active ? "color-mix(in srgb, var(--accent) 13%, transparent)" : "transparent", color: "var(--tx)" }}>
                      <Bot size={16} style={{ flexShrink: 0, color: active ? "var(--accent)" : "var(--tx-3)" }} />
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{a.name}</span>
                      {a.id === OUR_AGENT_ID && <span style={{ fontSize: 11.5, color: "var(--tx-dim)" }}>Par défaut</span>}
                      {active && <Check size={15} style={{ color: "var(--accent)", flexShrink: 0 }} />}
                    </button>
                  );
                })}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, background: "var(--bd)", borderRadius: 14, padding: 8 }}>
              <button onClick={() => fileRef.current?.click()} disabled={uploading} title="Joindre une photo ou une vidéo" style={{ width: 38, height: 38, borderRadius: 10, border: "none", background: "transparent", color: uploading ? "var(--accent)" : "var(--tx-3)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{uploading ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}</button>
              <input ref={fileRef} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={(e) => onFileChosen(e.target.files?.[0] || null)} />
              <button onClick={(e) => { e.stopPropagation(); setAgentMenuOpen((v) => !v); }} title="Changer d'agent"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 38, padding: "0 11px", borderRadius: 10, border: "1px solid var(--bd)", background: "var(--surf-card)", color: "var(--tx)", fontSize: 13, fontWeight: 600, fontFamily: "IBM Plex Sans", cursor: "pointer", flexShrink: 0 }}>
                <Bot size={15} style={{ color: "var(--accent)" }} />
                {agents.find((a) => a.id === (agentId || OUR_AGENT_ID))?.name || OUR_AGENT_ID}
                <ChevronDown size={14} style={{ color: "var(--tx-dim)" }} />
              </button>
              <textarea ref={taRef} value={input} rows={1} placeholder="Ask about your campaigns, audiences, or spend…" onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  // Menu « @ » ouvert : les flèches et Entrée le pilotent avant
                  // d'atteindre l'envoi du message.
                  if (mentionOpen) {
                    if (e.key === "ArrowDown") { e.preventDefault(); setMentionIdx((i) => (i + 1) % mentionMatches.length); return; }
                    if (e.key === "ArrowUp") { e.preventDefault(); setMentionIdx((i) => (i <= 0 ? mentionMatches.length : i) - 1); return; }
                    if (e.key === "Escape") { e.preventDefault(); setMentionIdx(-1); return; }
                    if ((e.key === "Enter" || e.key === "Tab") && mentionIdx >= 0) { e.preventDefault(); pickAgent(mentionMatches[mentionIdx]); return; }
                    // Tab sans sélection : complète le premier de la liste.
                    if (e.key === "Tab") { e.preventDefault(); pickAgent(mentionMatches[0]); return; }
                  }
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                style={{ flex: 1, resize: "none", background: "transparent", border: "none", outline: "none", color: "var(--tx)", fontSize: 14, fontFamily: "IBM Plex Sans", padding: "8px 10px", maxHeight: 120, lineHeight: 1.4 }} />
              <button onClick={() => send()} disabled={typing || (!input.trim() && !attachedImage)} style={{ width: 38, height: 38, borderRadius: 10, border: "none", background: input.trim() || attachedImage ? "var(--accent)" : "var(--sw)", color: "#fff", cursor: input.trim() || attachedImage ? "pointer" : "default", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background .15s" }}><Send size={17} /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
