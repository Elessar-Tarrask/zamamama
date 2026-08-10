import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../src/llm/prompt";
import { DEFAULT_SETTINGS } from "../src/seed/seedData";
import type { Conversation, FaqItem } from "../src/types";

const conv: Conversation = {
  mode: "bot",
  contactName: "Айгерим",
  lead: { childAge: 3 },
  lastInboundAtMs: 0,
  createdAtMs: 0,
};

const faq: FaqItem[] = [
  { id: "1", question: "Есть ли бассейн?", answer: "Про бассейн отвечаем вот так.", enabled: true, order: 1 },
];

// Понедельник 10 августа 2026, 09:00 по Алматы
const NOW = Date.UTC(2026, 7, 10, 4, 0, 0);

describe("buildSystemPrompt", () => {
  const prompt = buildSystemPrompt(DEFAULT_SETTINGS, faq, conv, NOW);

  it("содержит персону, жёсткие правила и скрипты", () => {
    expect(prompt).toContain(DEFAULT_SETTINGS.systemPrompt);
    expect(prompt).toContain("ПРАВИЛА ОБЩЕНИЯ");
    expect(prompt).toContain("log_unanswered_question"); // мягкий сценарий «уточню и вернусь»
    expect(prompt).toContain(DEFAULT_SETTINGS.greetingScript);
    expect(prompt).toContain(DEFAULT_SETTINGS.agePitches["2"]);
    expect(prompt).toContain(DEFAULT_SETTINGS.agePitches["5"]);
  });

  it("содержит FAQ дословно", () => {
    expect(prompt).toContain("В: Есть ли бассейн?");
    expect(prompt).toContain("О: Про бассейн отвечаем вот так.");
  });

  it("содержит профиль лида и имя из WhatsApp", () => {
    expect(prompt).toContain('"childAge":3');
    expect(prompt).toContain("Айгерим");
  });

  it("подставляет местное время Алматы", () => {
    expect(prompt).toContain("Сейчас в Алматы: понедельник, 10 августа, 09:00");
  });

  it("при пустом FAQ ставит заглушку", () => {
    const p = buildSystemPrompt(DEFAULT_SETTINGS, [], conv, NOW);
    expect(p).toContain("(база FAQ пока пуста)");
  });
});
