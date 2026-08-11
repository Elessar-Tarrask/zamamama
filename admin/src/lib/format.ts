// Алматы: UTC+5, перевода часов нет. Синхронно с settings/bot.utcOffsetMinutes.
const OFFSET_MS = 5 * 3_600_000;

export function fmtAlmaty(input: number | string | undefined | null): string {
  if (input === undefined || input === null || input === "") return "—";
  const ms = typeof input === "string" ? Date.parse(input) : input;
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const d = new Date(ms + OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export const fmtPhone = (phone: string): string => (phone ? `+${phone}` : "—");

/** Только время по Алматы: «14:30». */
export function fmtAlmatyTime(ms: number): string {
  const d = new Date(ms + OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
