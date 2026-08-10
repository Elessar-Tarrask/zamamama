/**
 * «Человеческая» подача ответа: длинный текст уходит несколькими короткими
 * сообщениями-«пузырями» с паузой набора, как пишет живой администратор.
 */

const MIN_BUBBLE_CHARS = 25;
const MAX_BUBBLE_CHARS = 1000;

/**
 * Детерминированная страховка правил форматирования: модели иногда
 * проскакивает markdown, которого в WhatsApp быть не должно.
 */
export function sanitizeForWhatsApp(text: string): string {
  return (
    text
      // **жирный** / __жирный__ → *жирный* (формат WhatsApp)
      .replace(/\*\*(.+?)\*\*/g, "*$1*")
      .replace(/__(.+?)__/g, "*$1*")
      // заголовки markdown → обычная строка
      .replace(/^#{1,6}\s+/gm, "")
      // [текст](url) → текст: url
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1: $2")
      // `код` → без бэктиков
      .replace(/`+([^`]*)`+/g, "$1")
      // маркеры списков -, * → •
      .replace(/^\s*[-*]\s+/gm, "• ")
      // 3+ пустых строк → одна пустая
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/** Режет слишком длинный кусок по границе предложения (защита от «простыни»). */
function hardSplit(text: string): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > MAX_BUBBLE_CHARS) {
    const window = rest.slice(0, MAX_BUBBLE_CHARS);
    const cut = Math.max(
      window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "), window.lastIndexOf("\n"),
    );
    const at = cut > MAX_BUBBLE_CHARS / 3 ? cut + 1 : MAX_BUBBLE_CHARS;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** Разбивает ответ по пустым строкам; мелочь приклеивает к предыдущему пузырю. */
export function splitIntoBubbles(text: string, maxBubbles = 3): string[] {
  const parts = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return [];

  const merged: string[] = [];
  for (const p of parts) {
    if (merged.length > 0 && p.length < MIN_BUBBLE_CHARS) {
      merged[merged.length - 1] += "\n\n" + p;
    } else {
      merged.push(p);
    }
  }

  if (merged.length > maxBubbles) {
    const head = merged.slice(0, maxBubbles - 1);
    head.push(merged.slice(maxBubbles - 1).join("\n\n"));
    return head.flatMap(hardSplit);
  }
  return merged.flatMap(hardSplit);
}

/** Пауза «печатает…» перед следующим пузырём: зависит от его длины. */
export function interBubblePauseMs(nextBubble: string): number {
  return Math.min(2500, 800 + nextBubble.length * 15);
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
