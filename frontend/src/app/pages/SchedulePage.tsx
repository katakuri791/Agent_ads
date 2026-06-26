import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, Plus, X, RefreshCw, Trash2, Send, Clock,
  Calendar as CalendarIcon, Image as ImageIcon, Film, Link2, FileText, Loader2, Lock,
} from "lucide-react";
import { api, ApiError, type ScheduledPost, type ScheduledPostType } from "../lib/api";
import { qk } from "../lib/queryKeys";
import { Card, Tabs, MSButton, SlidePanel, LoadingOverlay } from "../components/ms/primitives";
import { ConnectPrompt, ErrorState } from "../components/shared/states";
import { useScheduledPosts, errStatus, errMessage } from "../hooks/useMetaData";
import { useAccount } from "../providers/AccountProvider";
import { useToast } from "../providers/ToastProvider";

// ─── Helpers de type de post ────────────────────────────────────
const TYPE_COLOR: Record<ScheduledPostType, string> = {
  text: "#22C55E", image: "#1877F2", video: "#A855F7", link: "#06B6D4", carousel: "#F59E0B",
};
const TYPE_LABEL: Record<ScheduledPostType, string> = {
  text: "Texte", image: "Photo", video: "Vidéo", link: "Lien", carousel: "Carrousel",
};
function TypeIcon({ type, size = 14 }: { type: ScheduledPostType; size?: number }) {
  if (type === "video") return <Film size={size} />;
  if (type === "link") return <Link2 size={size} />;
  if (type === "image" || type === "carousel") return <ImageIcon size={size} />;
  return <FileText size={size} />;
}

// Types proposés à la création (le carrousel n'est pas géré simplement → exclu).
const COMPOSE_TYPES: ScheduledPostType[] = ["text", "image", "video", "link"];

// ─── Helpers de date ────────────────────────────────────────────
const DOW = ["LU", "MA", "ME", "JE", "VE", "SA", "DI"];
const DOW_LONG = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const weekIdx = (d: Date) => (d.getDay() + 6) % 7;            // lundi = 0
const startOfMondayWeek = (d: Date) => addDays(startOfDay(d), -weekIdx(d));
const fmtTime = (d: Date) => { const h = d.getHours(), m = d.getMinutes(); const ap = h < 12 ? "am" : "pm"; const h12 = ((h + 11) % 12) + 1; return `${h12}:${String(m).padStart(2, "0")} ${ap}`; };
const fmtHourLabel = (h: number) => { const ap = h < 12 ? "am" : "pm"; const h12 = ((h + 11) % 12) + 1; return `${h12} ${ap}`; };

interface SchedPost extends ScheduledPost { when: Date }

const isPast = (p: SchedPost) => p.when < new Date();

// ─── Pastille de post (vue Month) ───────────────────────────────
function PostChip({ post, onClick, compact }: { post: SchedPost; onClick: (p: SchedPost) => void; compact?: boolean }) {
  const col = TYPE_COLOR[post.type] || "#1877F2";
  const past = isPast(post);
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(post); }}
      className="ms-sched-chip"
      style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left", padding: compact ? "3px 7px" : "5px 8px", borderRadius: 8, background: col + "18", border: "1px solid " + col + "40", borderLeft: "3px solid " + col, color: "var(--tx)", cursor: "pointer", fontFamily: "IBM Plex Sans", fontSize: compact ? 10.5 : 11.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", filter: past ? "saturate(0.22) brightness(0.65)" : undefined, opacity: past ? 0.72 : 1 }}>
      <span style={{ color: col, display: "inline-flex", flexShrink: 0 }}><TypeIcon type={post.type} size={compact ? 10 : 12} /></span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{post.message || TYPE_LABEL[post.type]}</span>
    </button>
  );
}

// ─── Vue Mois ───────────────────────────────────────────────────
function MonthView({ cursor, posts, today, onCellClick, onPostClick }: {
  cursor: Date; posts: SchedPost[]; today: Date; onCellClick: (d: Date) => void; onPostClick: (p: SchedPost) => void;
}) {
  const first = startOfMonth(cursor), last = endOfMonth(cursor);
  const gridStart = startOfMondayWeek(first);
  const cells: Date[] = []; let d = gridStart;
  while (cells.length < 42) { cells.push(d); d = addDays(d, 1); if (cells.length >= 35 && d > last) break; }
  const weeks: Date[][] = []; for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return (
    <div style={{ background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 16, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", background: "var(--surf-inset)", borderBottom: "1px solid var(--bd)" }}>
        {DOW.map((dd, i) => <div key={i} style={{ padding: "12px 0", textAlign: "center", fontSize: 11, fontWeight: 600, letterSpacing: ".08em", color: "var(--tx-dim)" }}>{dd}</div>)}
      </div>
      {weeks.map((wk, wi) => (
        <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: wi < weeks.length - 1 ? "1px solid var(--bd)" : "none" }}>
          {wk.map((day, di) => {
            const out = day.getMonth() !== cursor.getMonth();
            const isToday = sameDay(day, today);
            const dayPosts = posts.filter((p) => sameDay(p.when, day));
            return (
              <div key={di} onClick={() => onCellClick(day)} className="ms-month-cell"
                style={{ minHeight: 116, padding: 8, borderRight: di < 6 ? "1px solid var(--bd-weak)" : "none", cursor: "pointer", opacity: out ? 0.45 : 1, transition: "background .15s", display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: 999, fontSize: 12, fontWeight: isToday ? 700 : 500, fontFamily: "JetBrains Mono", background: isToday ? "var(--accent)" : "transparent", color: isToday ? "#fff" : "var(--tx-2)" }}>{day.getDate()}</span>
                  {dayPosts.length > 2 && <span style={{ fontSize: 10, color: "var(--tx-dim)", fontFamily: "JetBrains Mono" }}>+{dayPosts.length - 2}</span>}
                </div>
                {dayPosts.slice(0, 2).map((p) => <PostChip key={p.id} post={p} onClick={onPostClick} compact />)}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Vue Semaine ────────────────────────────────────────────────
function WeekView({ cursor, posts, today, onCellClick, onPostClick }: {
  cursor: Date; posts: SchedPost[]; today: Date; onCellClick: (d: Date) => void; onPostClick: (p: SchedPost) => void;
}) {
  const start = startOfMondayWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10 }}>
      {days.map((day, i) => {
        const isToday = sameDay(day, today);
        const dayPosts = posts.filter((p) => sameDay(p.when, day)).sort((a, b) => +a.when - +b.when);
        return (
          <div key={i} onClick={() => onCellClick(day)} className="ms-card"
            style={{ background: isToday ? "var(--surf-2)" : "var(--surf-card)", border: "1px solid " + (isToday ? "var(--accent)" : "var(--bd)"), borderRadius: 14, padding: 14, minHeight: 380, display: "flex", flexDirection: "column", gap: 10, cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 10, borderBottom: "1px solid var(--bd-weak)" }}>
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".1em", color: isToday ? "var(--accent)" : "var(--tx-dim)", textTransform: "uppercase" }}>{DOW_LONG[i].slice(0, 3)}</div>
                <div style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 22, color: "var(--tx)", marginTop: 2 }}>{String(day.getDate()).padStart(2, "0")}/{String(day.getMonth() + 1).padStart(2, "0")}</div>
              </div>
              {isToday && <span style={{ fontSize: 10, background: "var(--accent)", color: "#fff", padding: "2px 8px", borderRadius: 999, fontWeight: 600 }}>AUJ.</span>}
            </div>
            {dayPosts.length === 0
              ? <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--tx-dim)", fontSize: 11.5, textAlign: "center", padding: 14 }}>+ Cliquer pour planifier</div>
              : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {dayPosts.map((p) => {
                    const past = isPast(p);
                    return (
                      <div key={p.id} onClick={(e) => { e.stopPropagation(); onPostClick(p); }}
                        className="ms-sched-week-card"
                        style={{ background: TYPE_COLOR[p.type] + "15", border: "1px solid " + TYPE_COLOR[p.type] + "40", borderRadius: 12, padding: 12, cursor: "pointer", filter: past ? "saturate(0.22) brightness(0.65)" : undefined, opacity: past ? 0.72 : 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <span style={{ width: 24, height: 24, borderRadius: 7, background: TYPE_COLOR[p.type] + "22", color: TYPE_COLOR[p.type], display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><TypeIcon type={p.type} size={13} /></span>
                          <span style={{ fontFamily: "JetBrains Mono", fontSize: 11, color: "var(--tx-2)" }}>{fmtTime(p.when)}</span>
                          {past && <span style={{ fontSize: 9.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--tx-dim)", marginLeft: "auto" }}>Publié</span>}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tx)", lineHeight: 1.35, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{p.message || TYPE_LABEL[p.type]}</div>
                      </div>
                    );
                  })}
                </div>}
          </div>
        );
      })}
    </div>
  );
}

// ─── Vue Jour ───────────────────────────────────────────────────
function DayView({ cursor, posts, today, onCellClick, onPostClick }: {
  cursor: Date; posts: SchedPost[]; today: Date; onCellClick: (d: Date) => void; onPostClick: (p: SchedPost) => void;
}) {
  const isToday = sameDay(cursor, today);
  const dayPosts = posts.filter((p) => sameDay(p.when, cursor)).sort((a, b) => +a.when - +b.when);
  const hours = Array.from({ length: 16 }, (_, i) => 6 + i); // 6h..21h
  const rowH = 64;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 18 }}>
      <Card pad={18}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 22, color: "var(--tx)" }}>{MONTHS[cursor.getMonth()]} {cursor.getDate()}</div>
            <div style={{ fontSize: 12.5, color: "var(--tx-dim)", marginTop: 2 }}>{DOW_LONG[weekIdx(cursor)]} · {dayPosts.length} planifié(s)</div>
          </div>
          {isToday && <span style={{ fontSize: 10.5, background: "var(--accent)", color: "#fff", padding: "3px 9px", borderRadius: 999, fontWeight: 600 }}>AUJ.</span>}
        </div>
        <div style={{ position: "relative", display: "grid", gridTemplateColumns: "52px 1fr", gap: 0 }}>
          <div>{hours.map((hh) => <div key={hh} style={{ height: rowH, fontFamily: "JetBrains Mono", fontSize: 10.5, color: "var(--tx-dim)", display: "flex", alignItems: "flex-start", paddingTop: 4 }}>{fmtHourLabel(hh)}</div>)}</div>
          <div style={{ position: "relative", borderLeft: "1px solid var(--bd)" }}>
            {hours.map((hh) => <div key={hh} onClick={() => { const dd = new Date(cursor); dd.setHours(hh, 0, 0, 0); onCellClick(dd); }} className="ms-hour-slot" style={{ height: rowH, borderBottom: "1px solid var(--bd-weak)", cursor: "pointer" }} />)}
            {dayPosts.map((p) => {
              const h0 = p.when.getHours() + p.when.getMinutes() / 60;
              const top = (h0 - 6) * rowH;
              if (top < 0 || top > hours.length * rowH) return null;
              return (
                <div key={p.id} onClick={(e) => { e.stopPropagation(); onPostClick(p); }}
                  className="ms-sched-day-event"
                  style={{ position: "absolute", top, left: 12, right: 12, padding: "10px 12px", background: TYPE_COLOR[p.type] + "20", border: "1px solid " + TYPE_COLOR[p.type] + "50", borderLeft: "3px solid " + TYPE_COLOR[p.type], borderRadius: 12, cursor: "pointer", filter: isPast(p) ? "saturate(0.22) brightness(0.65)" : undefined, opacity: isPast(p) ? 0.72 : 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: TYPE_COLOR[p.type], display: "inline-flex" }}><TypeIcon type={p.type} size={13} /></span>
                    <span style={{ fontFamily: "JetBrains Mono", fontSize: 11, color: "var(--tx-2)" }}>{fmtTime(p.when)}</span>
                    <span style={{ fontSize: 10.5, color: "var(--tx-dim)", marginLeft: "auto" }}>{isPast(p) ? "Publié" : TYPE_LABEL[p.type]}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tx)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.message || TYPE_LABEL[p.type]}</div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
      <Card pad={18}>
        <div style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 15, color: "var(--tx)", marginBottom: 14 }}>Pipeline du jour</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          {([["Planifiés", dayPosts.filter((p) => p.status === "scheduled").length, "#1877F2"], ["Publiés", dayPosts.filter((p) => p.status === "published").length, "#22C55E"], ["Total", dayPosts.length, "#A855F7"]] as Array<[string, number, string]>).map((row, i) => (
            <div key={i} style={{ background: "var(--surf-inset)", border: "1px solid var(--bd)", borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--tx-dim)" }}>{row[0]}</div>
              <div style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 22, color: row[2], marginTop: 4 }}>{row[1]}</div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1px solid var(--bd-weak)", paddingTop: 14 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--tx-dim)", marginBottom: 10 }}>Types de post</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {COMPOSE_TYPES.map((t) => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, color: "var(--tx-2)" }}>
                <span style={{ width: 18, height: 18, borderRadius: 6, background: TYPE_COLOR[t] + "22", color: TYPE_COLOR[t], display: "inline-flex", alignItems: "center", justifyContent: "center" }}><TypeIcon type={t} size={10.5} /></span>
                {TYPE_LABEL[t]}
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── Modale de composition ──────────────────────────────────────
function ComposeModal({ open, initialDate, accountId, onClose, onDone }: {
  open: boolean; initialDate: Date | null; accountId: string | null; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [type, setType] = useState<ScheduledPostType>("image");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");

  useEffect(() => {
    if (!open) return;
    const now = Date.now();
    const nowDate = new Date(now);

    let d: Date;
    if (initialDate) {
      d = new Date(initialDate);
      const clickedDay = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const todayDay = `${nowDate.getFullYear()}-${nowDate.getMonth()}-${nowDate.getDate()}`;
      if (clickedDay <= todayDay) {
        // Jour = aujourd'hui ou passé → heure valide = now + 15 min arrondi à la tranche de 5 min
        const minTs = now + 15 * 60_000;
        const minD = new Date(minTs);
        const rounded = Math.ceil(minD.getMinutes() / 5) * 5;
        minD.setMinutes(rounded === 60 ? 0 : rounded, 0, 0);
        if (rounded === 60) minD.setHours(minD.getHours() + 1);
        d = new Date(d);
        d.setHours(minD.getHours(), minD.getMinutes(), 0, 0);
        if (d.getTime() < minTs) d.setDate(d.getDate() + 1);
      } else {
        // Jour futur → 09:00 par défaut
        d.setHours(9, 0, 0, 0);
      }
    } else {
      // Bouton "Planifier" → now + 20 min arrondi à la tranche de 5 min
      const minD = new Date(now + 20 * 60_000);
      const rounded = Math.ceil(minD.getMinutes() / 5) * 5;
      minD.setMinutes(rounded === 60 ? 0 : rounded, 0, 0);
      if (rounded === 60) minD.setHours(minD.getHours() + 1);
      d = minD;
    }

    setType("image"); setMessage(""); setLink(""); setFile(null);
    setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    setTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
  }, [open, initialDate]);

  const todayStr = (() => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`; })();
  const minTimeStr = date === todayStr
    ? (() => { const m = new Date(Date.now() + 10*60*1000); return `${String(m.getHours()).padStart(2,"0")}:${String(m.getMinutes()).padStart(2,"0")}`; })()
    : undefined;

  const mutation = useMutation({
    mutationFn: () => {
      const when = new Date(`${date}T${time}:00`);
      return api.createScheduledPost({
        scheduledTime: when.toISOString(),
        message,
        link: type === "link" ? link : undefined,
        image: type === "image" ? file : null,
        video: type === "video" ? file : null,
      }, accountId);
    },
    onSuccess: () => { toast("Post planifié", { kind: "success", msg: "Il sera publié automatiquement par Meta." }); onDone(); },
    onError: (e) => toast("Échec de la planification", { kind: "error", msg: e instanceof ApiError ? e.message : undefined }),
  });

  // Valide le créneau côté client (message clair) avant d'appeler Meta.
  const handleSubmit = () => {
    const when = new Date(`${date}T${time}:00`);
    if (isNaN(when.getTime())) { toast("Date invalide", { kind: "error", msg: "Vérifie la date et l'heure." }); return; }
    mutation.mutate();
  };

  if (!open) return null;
  const needsMedia = type === "image" || type === "video";
  const canSubmit = !mutation.isPending && !!date && !!time
    && Boolean(message.trim() || file || (type === "link" && link.trim()));

  return (
    <div onClick={() => !mutation.isPending && onClose()} className="ms-fade-up" style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(6,13,31,.6)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(640px, 96vw)", maxHeight: "92vh", background: "var(--surf-card)", border: "1px solid var(--bd)", borderRadius: 18, boxShadow: "0 30px 90px rgba(0,0,0,.5)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--bd)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: 11, background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><CalendarIcon size={18} /></div>
            <div>
              <div style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 17, color: "var(--tx)" }}>Planifier un post</div>
              <div style={{ fontSize: 12, color: "var(--tx-dim)", marginTop: 2 }}>Publié automatiquement sur ta page à la date choisie</div>
            </div>
          </div>
          <button onClick={onClose} className="ms-icon-btn" style={{ width: 34, height: 34, borderRadius: 10, background: "transparent", border: "1px solid var(--bd)", color: "var(--tx-3)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><X size={16} /></button>
        </div>
        <div style={{ padding: 24, overflow: "auto", display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--tx-2)", marginBottom: 8 }}>Type de post</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
              {COMPOSE_TYPES.map((t) => {
                const active = type === t; const col = TYPE_COLOR[t];
                return (
                  <button key={t} onClick={() => { setType(t); setFile(null); }} className="ms-btn"
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "11px 6px", borderRadius: 12, cursor: "pointer", background: active ? col + "18" : "var(--surf-inset)", border: "1.5px solid " + (active ? col : "var(--bd)"), color: active ? col : "var(--tx-3)" }}>
                    <span style={{ display: "inline-flex" }}><TypeIcon type={t} size={18} /></span>
                    <span style={{ fontSize: 11, fontWeight: 500 }}>{TYPE_LABEL[t]}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 500, color: "var(--tx-2)", marginBottom: 8 }}><span>Légende</span><span style={{ color: "var(--tx-dim)", fontFamily: "JetBrains Mono", fontSize: 11 }}>{message.length} / 2200</span></label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={2200} placeholder="Que veux-tu partager ?"
              style={{ width: "100%", background: "var(--surf-inset)", border: "1px solid var(--bd)", borderRadius: 12, padding: 14, color: "var(--tx-2)", fontFamily: "IBM Plex Sans", fontSize: 14, outline: "none", resize: "vertical", lineHeight: 1.5 }} />
          </div>
          {type === "link" && (
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--tx-2)", marginBottom: 8 }}>Lien</label>
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…"
                style={{ width: "100%", height: 40, background: "var(--surf-inset)", border: "1px solid var(--bd)", borderRadius: 10, padding: "0 14px", color: "var(--tx-2)", fontFamily: "IBM Plex Sans", fontSize: 14, outline: "none" }} />
            </div>
          )}
          {needsMedia && (
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--tx-2)", marginBottom: 8 }}>Média</label>
              <label style={{ border: "1.5px dashed var(--bd-strong)", borderRadius: 14, padding: 22, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "var(--tx-3)", cursor: "pointer", background: "var(--surf-inset)" }}>
                <span style={{ display: "inline-flex", color: "var(--accent)" }}><TypeIcon type={type} size={22} /></span>
                <span style={{ fontSize: 13 }}>{file ? file.name : `Choisir ${type === "image" ? "une photo" : "une vidéo"}`}</span>
                <input type="file" accept={type === "image" ? "image/*" : "video/*"} onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ display: "none" }} />
              </label>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--tx-2)", marginBottom: 8 }}>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "100%", height: 40, background: "var(--surf-inset)", border: "1px solid var(--bd)", borderRadius: 10, padding: "0 14px", color: "var(--tx-2)", fontFamily: "IBM Plex Sans", fontSize: 14, outline: "none", colorScheme: "inherit" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--tx-2)", marginBottom: 8 }}>Heure</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} min={minTimeStr} style={{ width: "100%", height: 40, background: "var(--surf-inset)", border: "1px solid var(--bd)", borderRadius: 10, padding: "0 14px", color: "var(--tx-2)", fontFamily: "IBM Plex Sans", fontSize: 14, outline: "none", colorScheme: "inherit" }} />
            </div>
          </div>
        </div>
        <div style={{ padding: "14px 24px", borderTop: "1px solid var(--bd)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 11.5, color: "var(--tx-dim)", display: "inline-flex", alignItems: "center", gap: 5 }}><Clock size={13} style={{ flexShrink: 0 }} />Meta : minimum 10 min dans le futur</div>
          <div style={{ display: "flex", gap: 8 }}>
            <MSButton variant="ghost" onClick={onClose}>Annuler</MSButton>
            <MSButton variant="primary" onClick={handleSubmit} disabled={!canSubmit} icon={mutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <CalendarIcon size={15} />}>Planifier</MSButton>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Panneau de détail ──────────────────────────────────────────
function PostDetail({ post, accountId, onClose, onChanged }: {
  post: SchedPost | null; accountId: string | null; onClose: () => void; onChanged: () => void;
}) {
  const toast = useToast();
  const publishM = useMutation({
    mutationFn: () => api.publishScheduledPost(post!.id, accountId),
    onSuccess: () => { toast("Publié", { kind: "success" }); onChanged(); },
    onError: (e) => toast("Échec de la publication", { kind: "error", msg: e instanceof ApiError ? e.message : undefined }),
  });
  const deleteM = useMutation({
    mutationFn: () => api.deleteScheduledPost(post!.id, accountId),
    onSuccess: () => { toast("Post supprimé", { kind: "success" }); onChanged(); },
    onError: (e) => toast("Échec de la suppression", { kind: "error", msg: e instanceof ApiError ? e.message : undefined }),
  });
  if (!post) return null;
  const col = TYPE_COLOR[post.type];
  const statusCol = post.status === "published" ? "#22C55E" : "#F59E0B";
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--bd)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ display: "inline-flex", width: 28, height: 28, borderRadius: 9, background: col + "22", color: col, alignItems: "center", justifyContent: "center" }}><TypeIcon type={post.type} size={15} /></span>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", color: col }}>{TYPE_LABEL[post.type]}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 500, color: statusCol, background: statusCol + "15", border: "1px solid " + statusCol + "30", borderRadius: 999, padding: "2px 9px" }}><span style={{ width: 5, height: 5, borderRadius: 999, background: statusCol }} />{post.status === "published" ? "Publié" : "Planifié"}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--tx-dim)" }}>
            <span style={{ fontFamily: "JetBrains Mono" }}>{post.when.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} · {fmtTime(post.when)}</span>
          </div>
        </div>
        <button onClick={onClose} className="ms-icon-btn" style={{ width: 32, height: 32, borderRadius: 8, background: "transparent", border: "1px solid var(--bd)", color: "var(--tx-3)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={16} /></button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
        {post.full_picture
          ? <img src={post.full_picture} alt="" style={{ width: "100%", maxHeight: 260, objectFit: "cover", borderRadius: 14, border: "1px solid var(--bd)" }} />
          : <div style={{ aspectRatio: "4/3", maxHeight: 240, borderRadius: 14, background: "repeating-linear-gradient(45deg, var(--surf-inset), var(--surf-inset) 8px, var(--surf-2) 8px, var(--surf-2) 16px)", border: "1px solid var(--bd)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--tx-dim)", fontFamily: "JetBrains Mono", fontSize: 11, letterSpacing: ".08em" }}>{TYPE_LABEL[post.type].toUpperCase()}</div>}
        <div style={{ fontSize: 14, color: "var(--tx-2)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{post.message || <span style={{ color: "var(--tx-dim)" }}>(sans texte)</span>}</div>
      </div>
      <div style={{ padding: 18, borderTop: "1px solid var(--bd)", display: "flex", gap: 8 }}>
        <MSButton variant="outline" danger onClick={() => deleteM.mutate()} disabled={deleteM.isPending} icon={<Trash2 size={14} />} style={{ marginRight: "auto" }}>Supprimer</MSButton>
        {post.status === "scheduled" && <MSButton variant="primary" onClick={() => publishM.mutate()} disabled={publishM.isPending} icon={publishM.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}>Publier maintenant</MSButton>}
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────
export function SchedulePage({ onGoToSettings }: { onGoToSettings: () => void }) {
  const { selectedAccountId } = useAccount();
  const qc = useQueryClient();
  const q = useScheduledPosts();
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [view, setView] = useState<"Jour" | "Semaine" | "Mois">("Mois");
  const [compose, setCompose] = useState<{ open: boolean; date: Date | null }>({ open: false, date: null });
  const [selected, setSelected] = useState<SchedPost | null>(null);

  const posts: SchedPost[] = useMemo(
    () => (q.data?.posts || []).map((p) => ({ ...p, when: p.scheduled_time ? new Date(p.scheduled_time) : new Date() })),
    [q.data],
  );
  const refresh = () => qc.invalidateQueries({ queryKey: qk.scheduledPosts(selectedAccountId) });

  if (!q.data) {
    if (q.isError && errStatus(q.error) === 400) return <ConnectPrompt onGoToSettings={onGoToSettings} message={errMessage(q.error) || undefined} />;
    if (q.isError) return <ErrorState message={errMessage(q.error) || "Erreur"} onRetry={() => q.refetch()} />;
    return <LoadingOverlay fullPage delay={0} messages={["Chargement des posts planifiés…", "Récupération depuis Meta…"]} />;
  }

  const navPrev = () => { const d = new Date(cursor); if (view === "Mois") d.setMonth(d.getMonth() - 1); else if (view === "Semaine") d.setDate(d.getDate() - 7); else d.setDate(d.getDate() - 1); setCursor(d); };
  const navNext = () => { const d = new Date(cursor); if (view === "Mois") d.setMonth(d.getMonth() + 1); else if (view === "Semaine") d.setDate(d.getDate() + 7); else d.setDate(d.getDate() + 1); setCursor(d); };
  const headerLabel = view === "Mois"
    ? `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`
    : view === "Semaine"
      ? (() => { const s = startOfMondayWeek(cursor), e = addDays(s, 6); return `${s.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} – ${e.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`; })()
      : cursor.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const onCellClick = (d: Date) => setCompose({ open: true, date: d });
  const scheduledCount = posts.filter((p) => p.status === "scheduled").length;
  const todayCount = posts.filter((p) => sameDay(p.when, today)).length;

  const viewNode: ReactNode = view === "Mois"
    ? <MonthView cursor={cursor} posts={posts} today={today} onCellClick={onCellClick} onPostClick={setSelected} />
    : view === "Semaine"
      ? <WeekView cursor={cursor} posts={posts} today={today} onCellClick={onCellClick} onPostClick={setSelected} />
      : <DayView cursor={cursor} posts={posts} today={today} onCellClick={onCellClick} onPostClick={setSelected} />;

  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 20 }}>
      {q.isFetching && <LoadingOverlay messages={["Mise à jour des posts planifiés…"]} />}

      {q.data.blocked_reason && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 14px", borderRadius: 10, background: "#F59E0B12", border: "1px solid #F59E0B30", color: "#FCD9A0", fontSize: 12.5 }}>
          <Lock size={15} style={{ flexShrink: 0, marginTop: 1, color: "#F59E0B" }} />
          <span>La planification nécessite l'autorisation <b>pages_manage_posts</b> sur ton token Meta. Les posts existants peuvent rester invisibles tant qu'elle n'est pas accordée.</span>
        </div>
      )}

      <div className="ms-stagger" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h2 style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 24, color: "var(--tx)", margin: 0, letterSpacing: "-.01em" }}>Planning de publication</h2>
          <p style={{ fontSize: 13.5, color: "var(--tx-dim)", margin: "6px 0 0", maxWidth: 540, lineHeight: 1.5 }}>{scheduledCount} post(s) en file, {todayCount} aujourd'hui. Clique une date pour en planifier un — Meta publie automatiquement.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <MSButton variant="outline" icon={<RefreshCw size={14} />} onClick={refresh}>Rafraîchir</MSButton>
          <MSButton variant="primary" icon={<Plus size={16} />} onClick={() => setCompose({ open: true, date: cursor })}>Planifier</MSButton>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={navPrev} className="ms-icon-btn" style={{ width: 36, height: 36, borderRadius: 10, background: "var(--surf-card)", border: "1px solid var(--bd)", color: "var(--tx-3)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><ChevronLeft size={16} /></button>
          <button onClick={navNext} className="ms-icon-btn" style={{ width: 36, height: 36, borderRadius: 10, background: "var(--surf-card)", border: "1px solid var(--bd)", color: "var(--tx-3)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><ChevronRight size={16} /></button>
          <div style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 18, color: "var(--tx)", padding: "0 6px", minWidth: 220, textTransform: "capitalize" }}>{headerLabel}</div>
          <MSButton variant="outline" size="sm" onClick={() => setCursor(new Date())}>Aujourd'hui</MSButton>
        </div>
        <Tabs tabs={["Jour", "Semaine", "Mois"]} value={view} onChange={(t) => setView(t as "Jour" | "Semaine" | "Mois")} />
      </div>

      <div>{viewNode}</div>
      </div>

      <ComposeModal open={compose.open} initialDate={compose.date} accountId={selectedAccountId}
        onClose={() => setCompose({ open: false, date: null })}
        onDone={() => { setCompose({ open: false, date: null }); refresh(); }} />
      <SlidePanel open={!!selected} onClose={() => setSelected(null)}>
        <PostDetail post={selected} accountId={selectedAccountId} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); refresh(); }} />
      </SlidePanel>
    </div>
  );
}
