import { describe, expect, it } from "vitest";
import { interBubblePauseMs, splitIntoBubbles } from "../src/humanize";

describe("splitIntoBubbles", () => {
  it("один абзац — один пузырь", () => {
    expect(splitIntoBubbles("Просто короткий ответ.")).toEqual(["Просто короткий ответ."]);
  });

  it("абзацы через пустую строку — отдельные пузыри", () => {
    const text = "В 2–3 года у нас группа Toddler, мягкая адаптация.\n\nПолный день — 400 000 ₸/мес, полдня — 250 000 ₸/мес.";
    expect(splitIntoBubbles(text)).toEqual([
      "В 2–3 года у нас группа Toddler, мягкая адаптация.",
      "Полный день — 400 000 ₸/мес, полдня — 250 000 ₸/мес.",
    ]);
  });

  it("мелкий кусочек приклеивается к предыдущему", () => {
    const out = splitIntoBubbles("Достаточно длинный первый абзац сообщения.\n\nХорошо? 😊");
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("Хорошо? 😊");
  });

  it("не больше трёх пузырей — остаток склеивается в последний", () => {
    const text = ["Первый длинный абзац сообщения тут.", "Второй длинный абзац сообщения тут.", "Третий длинный абзац сообщения тут.", "Четвёртый длинный абзац сообщения тут."].join("\n\n");
    const out = splitIntoBubbles(text);
    expect(out).toHaveLength(3);
    expect(out[2]).toContain("Третий");
    expect(out[2]).toContain("Четвёртый");
  });

  it("пустой текст — без пузырей", () => {
    expect(splitIntoBubbles("  \n\n  ")).toEqual([]);
  });
});

describe("interBubblePauseMs", () => {
  it("растёт с длиной и ограничена потолком", () => {
    const short = interBubblePauseMs("Ок");
    const long = interBubblePauseMs("х".repeat(500));
    expect(short).toBeGreaterThanOrEqual(800);
    expect(long).toBe(2500);
    expect(short).toBeLessThan(long);
  });
});
