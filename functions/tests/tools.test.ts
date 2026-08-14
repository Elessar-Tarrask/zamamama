import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendText } = vi.hoisted(() => ({
  sendText: vi.fn(async () => ({ providerMessageId: "wz-alert" })),
}));

vi.mock("../src/store", () => ({
  setMode: vi.fn(async () => {}),
  logUnanswered: vi.fn(async () => {}),
  flagConversation: vi.fn(async () => {}),
  recordSentMessage: vi.fn(async () => {}),
  updateLead: vi.fn(async () => {}),
  createBooking: vi.fn(async () => {}),
  hasBooking: vi.fn(async () => false),
}));

vi.mock("firebase-functions", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { executeTool, type ToolContext } from "../src/llm/tools";
import { DEFAULT_SETTINGS } from "../src/seed/seedData";
import * as store from "../src/store";

const ctx: ToolContext = {
  phone: "77011234567",
  settings: { ...DEFAULT_SETTINGS, adminAlertPhone: "77000000000" },
  calendar: null,
  provider: { sendText },
};

beforeEach(() => vi.clearAllMocks());

describe("log_unanswered_question", () => {
  it("логирует вопрос, шлёт алерт админу, но НЕ выключает бота", async () => {
    const res = JSON.parse(
      await executeTool("log_unanswered_question", '{"clientQuestion":"Сколько педагогов в группе?"}', ctx),
    );
    expect(res.ok).toBe(true);
    expect(res.hint).toContain(ctx.settings.fallbackText);
    expect(store.logUnanswered).toHaveBeenCalledWith(
      "77011234567",
      "Сколько педагогов в группе?",
      expect.any(String),
    );
    expect(store.setMode).not.toHaveBeenCalled(); // бот продолжает работать
    expect(sendText).toHaveBeenCalledWith(
      "77000000000",
      expect.stringContaining("Сколько педагогов в группе?"),
      expect.any(String),
    );
  });

  it("без вопроса возвращает ошибку", async () => {
    const res = JSON.parse(await executeTool("log_unanswered_question", "{}", ctx));
    expect(res.error).toBe("missing_question");
  });

  it("работает и без номера админа (алерт пропускается)", async () => {
    const noAlertCtx = { ...ctx, settings: { ...ctx.settings, adminAlertPhone: "" } };
    const res = JSON.parse(
      await executeTool("log_unanswered_question", '{"clientQuestion":"Вопрос"}', noAlertCtx),
    );
    expect(res.ok).toBe(true);
    expect(sendText).not.toHaveBeenCalled();
  });
});

describe("handoff_to_human", () => {
  it("переводит диалог человеку и шлёт алерт", async () => {
    const res = JSON.parse(
      await executeTool("handoff_to_human", '{"reason":"клиент просит человека"}', ctx),
    );
    expect(res.ok).toBe(true);
    expect(store.setMode).toHaveBeenCalledWith("77011234567", "human", expect.stringContaining("клиент просит"));
    expect(sendText).toHaveBeenCalled();
  });
});

describe("save_lead_info / прочее", () => {
  it("сохраняет данные лида", async () => {
    await executeTool("save_lead_info", '{"parentName":"Айгерим","childAge":3}', ctx);
    expect(store.updateLead).toHaveBeenCalledWith(
      "77011234567",
      expect.objectContaining({ parentName: "Айгерим", childAge: 3 }),
    );
  });

  it("слоты без настроенного календаря — понятная ошибка", async () => {
    const res = JSON.parse(await executeTool("get_available_slots", "{}", ctx));
    expect(res.error).toBe("calendar_not_configured");
  });

  it("book_tour отвергает выдуманное время вне сетки экскурсий", async () => {
    // 16:00 местного в среду — за пределами окна 9–16
    const res = JSON.parse(
      await executeTool(
        "book_tour",
        '{"slotStartIso":"2026-08-19T11:00:00.000Z","parentName":"Болатбек"}',
        ctx,
      ),
    );
    expect(res.error).toBe("not_a_valid_slot");
    expect(res.hint).toContain("get_available_slots");
  });

  it("book_tour с валидным временем сетки проходит проверку (дальше — календарь)", async () => {
    // среда 11:00 Алматы = 06:00Z — валидно; календарь не настроен → следующая ошибка
    const res = JSON.parse(
      await executeTool(
        "book_tour",
        '{"slotStartIso":"2026-08-19T06:00:00.000Z","parentName":"Болатбек"}',
        ctx,
      ),
    );
    expect(res.error).toBe("calendar_not_configured");
  });

  it("неизвестный инструмент — ошибка", async () => {
    const res = JSON.parse(await executeTool("nope", "{}", ctx));
    expect(res.error).toContain("unknown_tool");
  });
});
