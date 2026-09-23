// MetaScope number formatters (ported from the design prototype's data.js).

export function fmtMoney(n: number): string {
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(0);
}

export function fmtCents(n: number): string {
  return "$" + n.toFixed(2);
}

export function fmtNum(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return Math.round(n).toLocaleString();
}

/** Full French date+time, e.g. "03/06/2024 à 14:35". Returns "—" when absent. */
export function fmtDateTimeFull(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${date} à ${time}`;
}

/** Au-delà de ce nombre de jours sans dépense, le compte est signalé à l'arrêt.
 *  Meta publie les chiffres de la veille avec quelques heures de retard : 2 jours
 *  évite d'alerter pour un simple décalage de publication. */
const STALE_ACTIVITY_DAYS = 2;

/** Décrit la dernière activité Meta (`YYYY-MM-DD`) pour l'en-tête de l'Overview.
 *  `stale` = aucune dépense depuis plus de STALE_ACTIVITY_DAYS jours. Renvoie
 *  null si la date est absente ou illisible (rien à afficher). */
export function describeActivity(
  iso?: string | null,
  today: Date = new Date(),
): { label: string; stale: boolean } | null {
  if (!iso) return null;
  // Date seule : on la lit en heure LOCALE. `new Date("2026-09-17")` serait lu
  // en UTC et glisserait au 16 dans les fuseaux à l'ouest de Greenwich.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(d.getTime())) return null;
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((startOfToday.getTime() - d.getTime()) / 86_400_000);
  return {
    label: d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" }),
    stale: days > STALE_ACTIVITY_DAYS,
  };
}
