import { describe, expect, it } from "vitest";
import { computeReplyDelaySeconds, looksUnfinished } from "../src/debounce";
import { DEFAULT_SETTINGS } from "../src/seed/seedData";

describe("looksUnfinished", () => {
  it("законченные фразы", () => {
    expect(looksUnfinished("Сколько стоит?")).toBe(false);
    expect(looksUnfinished("Здравствуйте")).toBe(false);
    expect(looksUnfinished("Ребёнку 3 года")).toBe(false);
    expect(looksUnfinished("Хочу на экскурсию!")).toBe(false);
    expect(looksUnfinished("")).toBe(false);
    expect(looksUnfinished(undefined)).toBe(false);
  });

  it("оборванные фразы", () => {
    expect(looksUnfinished("Расскажите про,")).toBe(true);
    expect(looksUnfinished("Хочу узнать про")).toBe(true);
    expect(looksUnfinished("цена и")).toBe(true);
    expect(looksUnfinished("а ещё")).toBe(true);
    expect(looksUnfinished("Вопрос такой:")).toBe(true);
    expect(looksUnfinished("what about pricing and")).toBe(true);
  });

  it("не путает слова, содержащие союз внутри", () => {
    expect(looksUnfinished("Мы из Аксая")).toBe(false);
    expect(looksUnfinished("Здание красивое")).toBe(false);
  });
});

describe("computeReplyDelaySeconds", () => {
  const s = { ...DEFAULT_SETTINGS, replyDelaySeconds: 5, replyDelayMaxSeconds: 12 };

  it("короткая пауза для законченной фразы, длинная — для оборванной", () => {
    expect(computeReplyDelaySeconds("Сколько стоит?", s)).toBe(5);
    expect(computeReplyDelaySeconds("Расскажите про,", s)).toBe(12);
  });

  it("зажимает значения в разумные пределы", () => {
    expect(computeReplyDelaySeconds("ок", { ...s, replyDelaySeconds: 0 })).toBe(2);
    expect(computeReplyDelaySeconds("ок", { ...s, replyDelaySeconds: 999 })).toBe(60);
    // max не может быть меньше базовой
    expect(computeReplyDelaySeconds("про,", { ...s, replyDelaySeconds: 10, replyDelayMaxSeconds: 3 })).toBe(10);
    expect(computeReplyDelaySeconds("ок", { ...s, replyDelaySeconds: Number.NaN })).toBe(2);
  });
});
