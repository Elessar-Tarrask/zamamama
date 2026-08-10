import type { BotSettings } from "./types";

// Признаки оборванной фразы: «расскажите про,» или «а ещё» — человек, скорее
// всего, продолжит печатать, и лучше подождать следующее сообщение.
const TRAILING_PUNCTUATION = /[,;:(—-]\s*$/;
// (^|\s) вместо \b: словесная граница \b в JS не работает с кириллицей
const TRAILING_CONNECTORS =
  /(^|\s)(и|а|но|или|что|как|если|чтобы|для|про|также|ещё|еще|плюс|это|and|or|but|also|және|немесе)\s*$/i;

export function looksUnfinished(text: string | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  return TRAILING_PUNCTUATION.test(t) || TRAILING_CONNECTORS.test(t);
}

function clamp(v: number, min: number, max: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/**
 * Пауза перед ответом. Каждое входящее ставит свою отложенную задачу, а
 * устаревшие задачи пропускают себя — поэтому паузу определяет ПОСЛЕДНЕЕ
 * сообщение: законченная фраза → короткая пауза, оборванная → длинная.
 * Обе величины редактируются в админ-панели (settings/bot).
 */
export function computeReplyDelaySeconds(text: string | undefined, settings: BotSettings): number {
  const base = clamp(settings.replyDelaySeconds, 0, 60);
  const max = clamp(settings.replyDelayMaxSeconds, base, 90);
  return looksUnfinished(text) ? max : base;
}
