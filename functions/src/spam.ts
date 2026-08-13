/**
 * Детерминированная защита от спама — работает ДО вызова модели,
 * чтобы мусор не тратил токены и не получал ответов.
 */

const URL_RE = /https?:\/\/|www\./gi;

// Консервативный список: слова, которых в диалоге родителя с садиком не бывает.
const SPAM_KEYWORDS =
  /крипто|казино|ставк[аи]|букмекер|заработо?к|инвестици|подписчик|накрутк|рассылк|продвижени|раскрутк|бинарн|форекс|доход в день|кредит наличн/i;

/** Похоже на спам/рекламу: много ссылок, спам-лексика или огромная простыня. */
export function looksLikeSpam(text: string | undefined): boolean {
  if (!text) return false;
  const urls = (text.match(URL_RE) ?? []).length;
  if (urls >= 3) return true;
  if (SPAM_KEYWORDS.test(text)) return true;
  if (text.length > 2000) return true;
  return false;
}

/** Обрезает огромные входящие, чтобы не раздувать контекст модели. */
export function truncateInbound(text: string, max = 1500): string {
  return text.length <= max ? text : text.slice(0, max) + " …[сообщение обрезано]";
}
