import { describe, expect, it } from "vitest";
import { looksLikeSpam, truncateInbound } from "../src/spam";
import { DEFAULT_SETTINGS } from "../src/seed/seedData";

const s = DEFAULT_SETTINGS;

describe("looksLikeSpam", () => {
  it("обычные сообщения родителей — не спам", () => {
    expect(looksLikeSpam("Здравствуйте! Сколько стоит садик?", s)).toBe(false);
    expect(looksLikeSpam("Малышу 2 годика, хотим на экскурсию", s)).toBe(false);
    expect(looksLikeSpam("Вот наш сайт https://example.kz посмотрите", s)).toBe(false); // одна ссылка — ок
    expect(looksLikeSpam(undefined, s)).toBe(false);
  });

  it("пачка ссылок — спам", () => {
    expect(looksLikeSpam("http://a.kz http://b.kz http://c.kz", s)).toBe(true);
    expect(looksLikeSpam("www.a.kz www.b.kz заходи www.c.kz", s)).toBe(true);
  });

  it("спам-лексика из настроек — спам", () => {
    expect(looksLikeSpam("Заработок на крипте от 300$ в день", s)).toBe(true);
    expect(looksLikeSpam("Накрутка подписчиков дёшево", s)).toBe(true);
    expect(looksLikeSpam("Продвижение вашего бизнеса, рассылки в WhatsApp", s)).toBe(true);
  });

  it("гигантская простыня — спам", () => {
    expect(looksLikeSpam("а".repeat(2001), s)).toBe(true);
    expect(looksLikeSpam("а".repeat(1999), s)).toBe(false);
  });

  it("фильтр можно выключить из панели", () => {
    const off = { ...s, spamFilterEnabled: false };
    expect(looksLikeSpam("Заработок на крипте http://a.kz http://b.kz http://c.kz", off)).toBe(false);
  });

  it("админ может задать свои слова; короткие обрывки игнорируются", () => {
    const custom = { ...s, spamKeywords: "телемаркетинг, но" };
    expect(looksLikeSpam("Предлагаем телемаркетинг для бизнеса", custom)).toBe(true);
    expect(looksLikeSpam("Но мы ещё думаем", custom)).toBe(false); // «но» < 4 символов — не считается
  });

  it("пороги ссылок и длины настраиваются, 0 отключает", () => {
    const strict = { ...s, spamMaxLinks: 1 };
    expect(looksLikeSpam("глянь www.a.kz", strict)).toBe(true);
    const noLimits = { ...s, spamMaxLinks: 0, spamMaxChars: 0 };
    expect(looksLikeSpam("а".repeat(5000), noLimits)).toBe(false);
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
