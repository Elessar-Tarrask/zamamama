import type { BotSettings } from "./types";

/**
 * Детерминированная защита от спама — работает ДО вызова модели,
 * чтобы мусор не тратил токены и не получал ответов.
 * Все пороги и слова редактируются администратором в панели (settings/bot).
 */

const URL_RE = /https?:\/\/|www\./gi;

/** Похоже на спам/рекламу: много ссылок, спам-лексика или огромная простыня. */
export function looksLikeSpam(text: string | undefined, settings: BotSettings): boolean {
  if (!settings.spamFilterEnabled) return false;
  if (!text) return false;

  const urls = (text.match(URL_RE) ?? []).length;
  if (settings.spamMaxLinks > 0 && urls >= settings.spamMaxLinks) return true;

  if (settings.spamMaxChars > 0 && text.length > settings.spamMaxChars) return true;

  const lowered = text.toLowerCase().replace(/ё/g, "е");
  const keywords = (settings.spamKeywords || "")
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length >= 4); // короткие обрывки дают ложные срабатывания
  return keywords.some((k) => lowered.includes(k));
}

/** Обрезает огромные входящие, чтобы не раздувать контекст модели. */
export function truncateInbound(text: string, max = 1500): string {
  return text.length <= max ? text : text.slice(0, max) + " …[сообщение обрезано]";
}
