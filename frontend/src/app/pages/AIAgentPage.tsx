import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, ChevronRight, Image as ImageIcon, Loader2, Megaphone, Paperclip, Plus, Send, Sparkles, X,
} from "lucide-react";
import {
  api, ApiError, type StructuredOutput, type CampaignBriefStructured, type InsightAnswerStructured,
} from "../lib/api";
import { MSButton } from "../components/ms/primitives";
import { useAccount } from "../providers/AccountProvider";
import { useInvalidateMetaData } from "../hooks/useMetaData";

type ChatMsg = { role: "user" | "ai"; text: string; time: string; structured?: StructuredOutput | null; imageHash?: string | null };
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
type ConvSummary = { id: string; title: string | null; created_at: string };

function CampaignBriefCard({ brief }: { brief: CampaignBriefStructured }) {
  return (
    <div style={{ borderRadius: 12, padding: 16, marginTop: 12, display: "flex", flexDirection: "column", gap: 12, background: "linear-gradient(135deg, #1877F218, #1877F205)", border: "1px solid #1877F230" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 26, height: 26, borderRadius: 7, background: "#1877F230", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#1877F2" }}><Megaphone size={13} /></span>
        <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".06em", color: "#7FB1F5", fontWeight: 600 }}>Brief de campagne — à valider</span>
      </div>
      <div>
        <div style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 15, color: "#F9FAFB" }}>{brief.name}</div>
        <div style={{ fontSize: 11.5, color: "#9AA1AC" }}>{brief.objective} · ${brief.daily_budget_usd.toFixed(2)} / jour</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11.5 }}>
        <div style={{ borderRadius: 8, padding: "8px 10px", background: "#0E1015" }}>
          <div style={{ color: "#6B7280", marginBottom: 2 }}>Audience</div>
          <div style={{ color: "#D1D5DB" }}>{brief.audience.age_min}–{brief.audience.age_max} ans · {brief.audience.countries.join(", ")}</div>
          {brief.audience.interests.length > 0 && <div style={{ color: "#9AA1AC", marginTop: 4 }}>{brief.audience.interests.join(" · ")}</div>}
        </div>
        <div style={{ borderRadius: 8, padding: "8px 10px", background: "#0E1015" }}>
          <div style={{ color: "#6B7280", marginBottom: 2 }}>CTA</div>
          <div style={{ color: "#D1D5DB" }}>{brief.ad_copy.cta}</div>
          {brief.estimated_reach && <div style={{ color: "#9AA1AC", marginTop: 4 }}>~ {brief.estimated_reach}</div>}
        </div>
      </div>
      <div style={{ borderRadius: 8, padding: "8px 10px", background: "#0E1015" }}>
        <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>Headline</div>
        <div style={{ fontSize: 14, color: "#F9FAFB", fontWeight: 500 }}>{brief.ad_copy.headline}</div>
        <div style={{ fontSize: 11, color: "#6B7280", marginTop: 8, marginBottom: 3 }}>Texte principal</div>
        <div style={{ fontSize: 12.5, color: "#D1D5DB", lineHeight: 1.5, whiteSpace: "pre-line" }}>{brief.ad_copy.primary_text}</div>
      </div>
      {brief.image_prompt && !brief.image_hash && (
        <div style={{ borderRadius: 8, padding: "8px 10px", display: "flex", gap: 8, background: "#F59E0B12", border: "1px solid #F59E0B30" }}>
          <ImageIcon size={13} style={{ color: "#F59E0B", flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 11.5, color: "#FCD9A0" }}><b>Visuel suggéré : </b>{brief.image_prompt}</span>
        </div>
      )}
      {brief.notes && <div style={{ fontSize: 11.5, color: "#9AA1AC", fontStyle: "italic" }}>{brief.notes}</div>}
    </div>
  );
}

function InsightCard({ answer }: { answer: InsightAnswerStructured }) {
  return (
    <div style={{ borderRadius: 12, padding: 16, marginTop: 12, display: "flex", flexDirection: "column", gap: 12, background: "#0E1015", border: "1px solid #1E2128" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 26, height: 26, borderRadius: 7, background: "#1877F220", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#1877F2" }}><Sparkles size={13} /></span>
        <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".06em", color: "#7FB1F5", fontWeight: 600 }}>Analyse</span>
      </div>
      <div style={{ fontSize: 13.5, color: "#D1D5DB", lineHeight: 1.55 }}>{answer.summary}</div>
      {answer.key_metrics.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {answer.key_metrics.map((m, i) => (
            <div key={i} style={{ borderRadius: 8, padding: "8px 10px", background: "#111318", border: "1px solid #1E2128" }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em", color: "#6B7280" }}>{m.label}</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginTop: 4 }}>
                <span style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 16, color: "#F9FAFB" }}>{m.value}</span>
                {m.trend != null && <span style={{ fontSize: 10.5, fontFamily: "JetBrains Mono", color: m.trend >= 0 ? "#22C55E" : "#EF4444" }}>{m.trend >= 0 ? "▲" : "▼"} {Math.abs(m.trend).toFixed(1)}%</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      {answer.recommendations.length > 0 && (
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: "#6B7280", marginBottom: 6, fontWeight: 600 }}>Recommandations</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {answer.recommendations.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 8, fontSize: 12.5, color: "#D1D5DB" }}><ChevronRight size={13} style={{ color: "#1877F2", flexShrink: 0, marginTop: 2 }} /><span>{r}</span></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AIAgentPage() {
  const { selectedAccountId } = useAccount();
  const invalidateMeta = useInvalidateMetaData();
  const [messages, setMessages] = useState<ChatMsg[]>([WELCOME_MSG]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConvSummary[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [attachedImage, setAttachedImage] = useState<{ hash: string; previewUrl: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const autoResize = useCallback(() => {
    const el = taRef.current; if (!el) return;
    el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);
  useEffect(() => { autoResize(); }, [input, autoResize]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, typing]);

  const mapMessages = (rows: Array<{ role: string; content: string; created_at: string; metadata: Record<string, unknown> }>): ChatMsg[] =>
    rows.filter((r) => r.role === "user" || r.role === "assistant").map((r) => {
      const meta: any = r.metadata || {};
      const structured: StructuredOutput | undefined = meta.structured && (meta.structured.kind === "campaign_brief" || meta.structured.kind === "insight_answer") ? meta.structured : undefined;
      return { role: r.role === "user" ? "user" : "ai", text: r.content, time: new Date(r.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), structured, imageHash: meta.image_hash };
    });

  const loadConversation = async (conv: ConvSummary) => {
    try {
      const rows = await api.getMessages(conv.id);
      const mapped = mapMessages(rows);
      setMessages(mapped.length > 0 ? mapped : [{ ...WELCOME_MSG }]);
      setConversationId(conv.id);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    api.listConversations().then(async (list) => {
      setConversations(list);
      if (list.length === 0) return;
      const rows = await api.getMessages(list[0].id);
      const mapped = mapMessages(rows);
      if (mapped.length > 0) { setMessages(mapped); setConversationId(list[0].id); }
    }).catch(() => { /* ignore */ });
  }, []);

  const onFileChosen = async (file: File | null) => {
    if (!file) return;
    setUploadError(null); setUploading(true);
    const previewUrl = URL.createObjectURL(file);
    try {
      const res = await api.uploadChatImage(file, selectedAccountId);
      if (res.error || !res.image_hash) { setUploadError(res.error || "Upload failed."); URL.revokeObjectURL(previewUrl); return; }
      setAttachedImage({ hash: res.image_hash, previewUrl, name: file.name });
    } catch (e) {
      URL.revokeObjectURL(previewUrl);
      setUploadError(e instanceof ApiError ? e.message : "Upload failed.");
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const removeAttachment = () => { if (attachedImage?.previewUrl) URL.revokeObjectURL(attachedImage.previewUrl); setAttachedImage(null); };

  const send = async (preset?: string) => {
    const text = (preset ?? input).trim();
    if ((!text && !attachedImage) || typing) return;
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const imageHash = attachedImage?.hash || null;
    setMessages((prev) => [...prev, { role: "user", text: text || "(image attached)", time: now, imageHash }]);
    setInput(""); removeAttachment(); setTyping(true);
    try {
      const res = await api.chat(text || "(image attached)", conversationId || undefined, imageHash, selectedAccountId);
      if (res.conversation_id !== conversationId) {
        setConversationId(res.conversation_id);
        setConversations((prev) => prev.some((c) => c.id === res.conversation_id) ? prev : [{ id: res.conversation_id, title: text.slice(0, 40) || null, created_at: new Date().toISOString() }, ...prev]);
      }
      setMessages((prev) => [...prev, { role: "ai", text: res.reply || "(no reply)", time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), structured: res.structured || null }]);
      // Une action mutante de l'agent (création de campagne, publication…) rend
      // les données obsolètes → on invalide les caches TanStack Query.
      const MUTATING = ["create_full_campaign", "post_to_facebook_page", "save_campaign_tree"];
      if ((res.tool_calls || []).some((t) => MUTATING.includes(t.name))) invalidateMeta();
    } catch (err) {
      setMessages((prev) => [...prev, { role: "ai", text: `⚠️ ${err instanceof ApiError ? err.message : "Connection error."}`, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }]);
    } finally { setTyping(false); }
  };

  const newConversation = async () => {
    setMessages([{ ...WELCOME_MSG, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }]);
    try { const conv = await api.createConversation(); setConversationId(conv.id); setConversations((prev) => [conv, ...prev]); } catch { setConversationId(null); }
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div style={{ width: 300, flexShrink: 0, borderRight: "1px solid #1E2128", display: "flex", flexDirection: "column", background: "#0C0E13" }}>
        <div style={{ padding: 16 }}><MSButton variant="primary" icon={<Plus size={16} />} onClick={newConversation} style={{ width: "100%" }}>New Chat</MSButton></div>
        <div style={{ flex: 1, overflow: "auto", padding: "0 10px 10px" }}>
          {conversations.length === 0 && <div style={{ textAlign: "center", color: "#4B5260", fontSize: 12, padding: "30px 0" }}>Aucune conversation</div>}
          {conversations.map((c) => (
            <button key={c.id} onClick={() => loadConversation(c)} className="ms-convo"
              style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 8, border: "none", cursor: "pointer", marginBottom: 2, background: conversationId === c.id ? "#1877F215" : "transparent", transition: "background .12s" }}>
              <div style={{ fontSize: 13, color: conversationId === c.id ? "#F9FAFB" : "#D1D5DB", fontWeight: conversationId === c.id ? 500 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title || "Nouvelle conversation"}</div>
              <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{new Date(c.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</div>
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
                    <div style={{ background: "#1877F2", color: "#fff", borderRadius: "14px 14px 4px 14px", padding: "11px 15px", fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-line" }}>{m.text}</div>
                  </div>
                </div>
              ) : (
                <div key={i} className="ms-msg" style={{ display: "flex", gap: 12, marginBottom: 18 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#1877F2,#0A57C2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#fff" }}><Sparkles size={16} /></div>
                  <div style={{ maxWidth: "78%" }}>
                    <div style={{ background: "#111318", border: "1px solid #1E2128", borderRadius: "14px 14px 14px 4px", padding: "12px 15px", fontSize: 14, lineHeight: 1.55, color: "#D1D5DB", whiteSpace: "pre-line" }}>
                      {m.text}
                      {m.structured?.kind === "campaign_brief" && <CampaignBriefCard brief={m.structured} />}
                      {m.structured?.kind === "insight_answer" && <InsightCard answer={m.structured} />}
                    </div>
                  </div>
                </div>
              )
            ))}
            {typing && (
              <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#1877F2,#0A57C2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#fff" }}><Sparkles size={16} /></div>
                <div style={{ background: "#111318", border: "1px solid #1E2128", borderRadius: "14px 14px 14px 4px", padding: "14px 16px", display: "flex", gap: 5 }}>
                  {[0, 1, 2].map((i) => <span key={i} className="ms-dot" style={{ width: 7, height: 7, borderRadius: 999, background: "#6B7280", animationDelay: i * 0.16 + "s" }} />)}
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ borderTop: "1px solid #1E2128", padding: "16px 0 20px", flexShrink: 0 }}>
          <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 28px" }}>
            {uploadError && (
              <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 8, background: "#EF444412", border: "1px solid #EF444430", color: "#FCA5A5", fontSize: 12.5, display: "flex", alignItems: "center", gap: 8 }}>
                <AlertTriangle size={13} /> {uploadError}<button onClick={() => setUploadError(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#FCA5A5", cursor: "pointer" }}><X size={12} /></button>
              </div>
            )}
            {attachedImage && (
              <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 10, padding: 8, borderRadius: 10, background: "#1877F212", border: "1px solid #1877F230" }}>
                <img src={attachedImage.previewUrl} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover" }} />
                <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontSize: 12.5, color: "#F9FAFB", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{attachedImage.name}</div><div style={{ fontSize: 10.5, color: "#6B7280", fontFamily: "JetBrains Mono" }}>hash : {attachedImage.hash.slice(0, 16)}…</div></div>
                <button onClick={removeAttachment} style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", padding: 4 }}><X size={14} /></button>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              {SUGGESTED_PROMPTS.slice(0, 3).map((c, i) => (
                <button key={i} onClick={() => send(c)} className="ms-chip" style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid #1E2128", background: "#111318", color: "#9AA1AC", fontSize: 12.5, cursor: "pointer", fontFamily: "IBM Plex Sans", transition: "all .15s" }}>"{c}"</button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, background: "#1E2128", borderRadius: 14, padding: 8 }}>
              <button onClick={() => fileRef.current?.click()} disabled={uploading} title="Joindre une image" style={{ width: 38, height: 38, borderRadius: 10, border: "none", background: "transparent", color: uploading ? "#1877F2" : "#9AA1AC", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{uploading ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}</button>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => onFileChosen(e.target.files?.[0] || null)} />
              <textarea ref={taRef} value={input} rows={1} placeholder="Ask about your campaigns, audiences, or spend…" onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                style={{ flex: 1, resize: "none", background: "transparent", border: "none", outline: "none", color: "#F9FAFB", fontSize: 14, fontFamily: "IBM Plex Sans", padding: "8px 10px", maxHeight: 120, lineHeight: 1.4 }} />
              <button onClick={() => send()} disabled={typing || (!input.trim() && !attachedImage)} style={{ width: 38, height: 38, borderRadius: 10, border: "none", background: input.trim() || attachedImage ? "#1877F2" : "#2A2E37", color: "#fff", cursor: input.trim() || attachedImage ? "pointer" : "default", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background .15s" }}><Send size={17} /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
