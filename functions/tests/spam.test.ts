import { describe, expect, it } from "vitest";
import { looksLikeSpam, truncateInbound } from "../src/spam";

describe("looksLikeSpam", () => {
  it("обычные сообщения родителей — не спам", () => {
    expect(looksLikeSpam("Здравствуйте! Сколько стоит садик?")).toBe(false);
    expect(looksLikeSpam("Малышу 2 годика, хотим на экскурсию")).toBe(false);
    expect(looksLikeSpam("Вот наш сайт https://example.kz посмотрите")).toBe(false); // одна ссылка — ок
    expect(looksLikeSpam(undefined)).toBe(false);
  });

  it("пачка ссылок — спам", () => {
    expect(looksLikeSpam("http://a.kz http://b.kz http://c.kz")).toBe(true);
    expect(looksLikeSpam("www.a.kz www.b.kz заходи www.c.kz")).toBe(true);
  });

  it("спам-лексика — спам", () => {
    expect(looksLikeSpam("Заработок на крипте от 300$ в день")).toBe(true);
    expect(looksLikeSpam("Накрутка подписчиков дёшево")).toBe(true);
    expect(looksLikeSpam("Продвижение вашего бизнеса, рассылки в WhatsApp")).toBe(true);
  });

  it("гигантская простыня — спам", () => {
    expect(looksLikeSpam("а".repeat(2001))).toBe(true);
    expect(looksLikeSpam("а".repeat(1999))).toBe(false);
  });
});

describe("truncateInbound", () => {
  it("короткое не трогает, длинное обрезает с пометкой", () => {
    expect(truncateInbound("привет")).toBe("привет");
    const cut = truncateInbound("х".repeat(3000));
    expect(cut.length).toBeLessThan(1600);
    expect(cut.endsWith("…[сообщение обрезано]")).toBe(true);
  });
});
