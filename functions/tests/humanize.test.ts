import { describe, expect, it } from "vitest";
import { interBubblePauseMs, sanitizeForWhatsApp, splitIntoBubbles } from "../src/humanize";

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

describe("sanitizeForWhatsApp", () => {
  it("переводит markdown-жирный в формат WhatsApp", () => {
    expect(sanitizeForWhatsApp("Цена: **400 000 ₸** в месяц")).toBe("Цена: *400 000 ₸* в месяц");
    expect(sanitizeForWhatsApp("__важно__")).toBe("*важно*");
  });

  it("убирает заголовки, бэктики и markdown-ссылки", () => {
    expect(sanitizeForWhatsApp("## Группы\nToddler")).toBe("Группы\nToddler");
    expect(sanitizeForWhatsApp("код `тут` был")).toBe("код тут был");
    expect(sanitizeForWhatsApp("[сайт](https://a.kz)")).toBe("сайт: https://a.kz");
  });

  it("маркеры списков становятся «•», лишние пустые строки схлопываются", () => {
    expect(sanitizeForWhatsApp("- один\n- два")).toBe("• один\n• два");
    expect(sanitizeForWhatsApp("а\n\n\n\nб")).toBe("а\n\nб");
  });

  it("обычный текст не трогает", () => {
    const t = "Здравствуйте! 😊 Полный день — 400 000 ₸/мес.";
    expect(sanitizeForWhatsApp(t)).toBe(t);
  });
});

describe("защита от «простыни»", () => {
  it("кусок длиннее 1000 символов режется по границе предложения", () => {
    const sentence = "Это осмысленное предложение о садике и занятиях детей. ";
    const long = sentence.repeat(30); // ~1650 символов
    const bubbles = splitIntoBubbles(long);
    expect(bubbles.length).toBeGreaterThan(1);
    for (const b of bubbles) {
      expect(b.length).toBeLessThanOrEqual(1000);
      expect(b.endsWith("детей.") || b.endsWith("занятиях") || b.length > 0).toBe(true);
    }
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
