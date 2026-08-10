/**
 * «Человеческая» подача ответа: длинный текст уходит несколькими короткими
 * сообщениями-«пузырями» с паузой набора, как пишет живой администратор.
 */

const MIN_BUBBLE_CHARS = 25;

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
    return head;
  }
  return merged;
}

/** Пауза «печатает…» перед следующим пузырём: зависит от его длины. */
export function interBubblePauseMs(nextBubble: string): number {
  return Math.min(2500, 800 + nextBubble.length * 15);
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
