import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Conversation, StoredMessage } from "../src/types";

const { sendText, createMock } = vi.hoisted(() => ({
  sendText: vi.fn(async () => ({ providerMessageId: "wz-1" })),
  createMock: vi.fn(),
}));

vi.mock("../src/store", () => ({
  getSettings: vi.fn(),
  getConversation: vi.fn(),
  getRecentMessages: vi.fn(async (): Promise<StoredMessage[]> => []),
  getEnabledFaq: vi.fn(async () => []),
  matchesRecentOwnOutbound: vi.fn(async () => false),
  flagConversation: vi.fn(async () => {}),
  recordSentMessage: vi.fn(async () => {}),
  appendMessage: vi.fn(async () => {}),
  recordBotReply: vi.fn(async () => {}),
  updateLead: vi.fn(async () => {}),
  setMode: vi.fn(async () => {}),
  logUnanswered: vi.fn(async () => {}),
  createBooking: vi.fn(async () => {}),
}));

vi.mock("../src/providers/wazzup", () => ({
  WazzupProvider: class {
    sendText = sendText;
  },
  parseWazzupWebhook: () => [],
}));

vi.mock("../src/llm/client", () => ({
  createLlmClient: () => ({ chat: { completions: { create: createMock } } }),
}));

vi.mock("firebase-functions", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { processConversationTask } from "../src/processor";
import { DEFAULT_SETTINGS } from "../src/seed/seedData";
import * as store from "../src/store";

const secrets = { wazzupApiKey: "k", azureApiKey: "k", gcalSaKey: "" };

const baseConv: Conversation = {
  mode: "bot",
  lead: {},
  lastInboundAtMs: 1000,
  createdAtMs: 0,
};

const inbound = (text: string, ms = 1000): StoredMessage => ({
  direction: "in",
  byBot: false,
  type: "text",
  text,
  dateTimeMs: ms,
});

function textCompletion(content: string) {
  return { choices: [{ message: { content, tool_calls: undefined } }] };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(store.getSettings).mockResolvedValue({ ...DEFAULT_SETTINGS, azureEndpoint: "https://x" });
  vi.mocked(store.getConversation).mockResolvedValue({ ...baseConv });
  vi.mocked(store.getRecentMessages).mockResolvedValue([inbound("Сколько стоит?")]);
  vi.mocked(store.matchesRecentOwnOutbound).mockResolvedValue(false);
  createMock.mockResolvedValue(textCompletion("Отвечаю про цены"));
});

describe("processConversationTask", () => {
  it("отвечает на входящее и сохраняет ответ", async () => {
    await processConversationTask({ phone: "77011234567", markerMs: 1000 }, secrets);
    expect(sendText).toHaveBeenCalledWith("77011234567", "Отвечаю про цены", expect.any(String));
    expect(store.appendMessage).toHaveBeenCalledWith(
      "77011234567",
      expect.objectContaining({ direction: "out", byBot: true, text: "Отвечаю про цены" }),
    );
    expect(store.recordBotReply).toHaveBeenCalled();
    // Отправка регистрируется ДО вызова провайдера (для распознавания echo)
    const recordOrder = vi.mocked(store.recordSentMessage).mock.invocationCallOrder[0];
    const sendOrder = sendText.mock.invocationCallOrder[0];
    expect(recordOrder).toBeLessThan(sendOrder);
  });

  it("молчит, если после маркера пришло более новое сообщение", async () => {
    vi.mocked(store.getConversation).mockResolvedValue({ ...baseConv, lastInboundAtMs: 2000 });
    await processConversationTask({ phone: "77011234567", markerMs: 1000 }, secrets);
    expect(createMock).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
  });

  it("молчит в режиме human и на паузе", async () => {
    vi.mocked(store.getConversation).mockResolvedValue({ ...baseConv, mode: "human" });
    await processConversationTask({ phone: "1", markerMs: 1000 }, secrets);

    vi.mocked(store.getConversation).mockResolvedValue({
      ...baseConv,
      pausedUntilMs: Date.now() + 60_000,
    });
    await processConversationTask({ phone: "1", markerMs: 1000 }, secrets);

    expect(sendText).not.toHaveBeenCalled();
  });

  it("молчит в заблокированном чате", async () => {
    vi.mocked(store.getConversation).mockResolvedValue({ ...baseConv, blocked: true });
    await processConversationTask({ phone: "1", markerMs: 1000 }, secrets);
    expect(createMock).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
  });

  it("уважает суточный лимит ответов", async () => {
    const day = Array.from({ length: 60 }, (_, i) => Date.now() - (i + 2) * 3_600_000 / 3);
    vi.mocked(store.getConversation).mockResolvedValue({ ...baseConv, botReplyTimestampsMs: day });
    await processConversationTask({ phone: "1", markerMs: 1000 }, secrets);
    expect(sendText).not.toHaveBeenCalled();
    expect(store.flagConversation).toHaveBeenCalledWith("1", expect.stringContaining("суточный"));
  });

  it("флуд: слишком много входящих подряд — бот не отвечает", async () => {
    const flood = Array.from({ length: 26 }, (_, i) => inbound(`сообщение ${i}`, Date.now() - i * 1000));
    vi.mocked(store.getRecentMessages).mockResolvedValue(flood.reverse());
    await processConversationTask({ phone: "1", markerMs: 1000 }, secrets);
    expect(createMock).not.toHaveBeenCalled();
    expect(store.flagConversation).toHaveBeenCalledWith("1", expect.stringContaining("Флуд"));
  });

  it("молчит при выключенном боте", async () => {
    vi.mocked(store.getSettings).mockResolvedValue({ ...DEFAULT_SETTINGS, botEnabled: false });
    await processConversationTask({ phone: "1", markerMs: 1000 }, secrets);
    expect(sendText).not.toHaveBeenCalled();
  });

  it("не отвечает повторно, если последнее сообщение — наше", async () => {
    vi.mocked(store.getRecentMessages).mockResolvedValue([
      inbound("Привет", 900),
      { direction: "out", byBot: true, type: "text", text: "Здравствуйте!", dateTimeMs: 950 },
    ]);
    await processConversationTask({ phone: "1", markerMs: 1000 }, secrets);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("на голосовое без текста отвечает скриптом без LLM", async () => {
    vi.mocked(store.getRecentMessages).mockResolvedValue([
      { direction: "in", byBot: false, type: "audio", text: "[audio]", dateTimeMs: 1000 },
    ]);
    await processConversationTask({ phone: "1", markerMs: 1000 }, secrets);
    expect(createMock).not.toHaveBeenCalled();
    expect(sendText).toHaveBeenCalledWith("1", DEFAULT_SETTINGS.voiceFallbackText, expect.any(String));
    expect(store.flagConversation).toHaveBeenCalled();
  });

  it("исполняет инструменты и продолжает цикл до текста", async () => {
    createMock
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: "",
              tool_calls: [
                {
                  id: "call-1",
                  type: "function",
                  function: { name: "save_lead_info", arguments: '{"childAge":3}' },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce(textCompletion("Записала: 3 года!"));

    await processConversationTask({ phone: "77011234567", markerMs: 1000 }, secrets);

    expect(store.updateLead).toHaveBeenCalledWith("77011234567", expect.objectContaining({ childAge: 3 }));
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(sendText).toHaveBeenCalledWith("77011234567", "Записала: 3 года!", expect.any(String));
  });

  it("уважает лимит ответов в час", async () => {
    const fresh = Array.from({ length: 20 }, () => Date.now() - 60_000);
    vi.mocked(store.getConversation).mockResolvedValue({ ...baseConv, botReplyTimestampsMs: fresh });
    await processConversationTask({ phone: "1", markerMs: 1000 }, secrets);
    expect(sendText).not.toHaveBeenCalled();
    expect(store.flagConversation).toHaveBeenCalled();
  });

  it("при пустом ответе модели шлёт fallback", async () => {
    createMock.mockResolvedValue(textCompletion(""));
    await processConversationTask({ phone: "1", markerMs: 1000 }, secrets);
    expect(sendText).toHaveBeenCalledWith("1", DEFAULT_SETTINGS.fallbackText, expect.any(String));
  });

  it("подавляет пузыри, дословно повторяющие недавние исходящие", async () => {
    createMock.mockResolvedValue(
      textCompletion(
        "Полный день — 400 000 ₸/мес, полдня — 250 000 ₸/мес, как я уже писала.\n\nА вот новое: в стоимость входит четырёхразовое питание.",
      ),
    );
    vi.mocked(store.matchesRecentOwnOutbound).mockImplementation(
      async (_phone: string, text?: string) => (text ?? "").includes("400 000"),
    );
    await processConversationTask({ phone: "1", markerMs: 1000 }, secrets);
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText.mock.calls[0][1]).toContain("питание");
  });

  it("полный повтор (ретрай задачи) не отправляет ничего", async () => {
    vi.mocked(store.matchesRecentOwnOutbound).mockResolvedValue(true);
    await processConversationTask({ phone: "1", markerMs: 1000 }, secrets);
    expect(sendText).not.toHaveBeenCalled();
    expect(store.recordBotReply).not.toHaveBeenCalled();
  });

  it("передаёт настроенную глубину обдумывания в запрос к модели", async () => {
    await processConversationTask({ phone: "1", markerMs: 1000 }, secrets);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ reasoning_effort: DEFAULT_SETTINGS.azureReasoningEffort }),
    );
  });

  it("если во время обдумывания пришло новое сообщение — устаревший ответ не отправляется", async () => {
    vi.mocked(store.getConversation)
      .mockResolvedValueOnce({ ...baseConv, lastInboundAtMs: 1000 }) // проверка маркера
      .mockResolvedValueOnce({ ...baseConv, lastInboundAtMs: 2000 }); // после LLM: есть новее
    await processConversationTask({ phone: "1", markerMs: 1000 }, secrets);
    expect(createMock).toHaveBeenCalled(); // модель отработала
    expect(sendText).not.toHaveBeenCalled(); // но ответ отброшен
  });

  it("длинный ответ уходит несколькими пузырями, лимит считает один ответ", async () => {
    createMock.mockResolvedValue(
      textCompletion(
        "Первый содержательный абзац про группу и адаптацию.\n\nВторой абзац про цены и расписание занятий.",
      ),
    );
    await processConversationTask({ phone: "77011234567", markerMs: 1000 }, secrets);
    expect(sendText).toHaveBeenCalledTimes(2);
    expect(sendText.mock.calls[0][1]).toContain("Первый");
    expect(sendText.mock.calls[1][1]).toContain("Второй");
    const outMessages = vi
      .mocked(store.appendMessage)
      .mock.calls.filter(([, m]) => (m as { direction: string }).direction === "out");
    expect(outMessages).toHaveLength(2);
    expect(store.recordBotReply).toHaveBeenCalledTimes(1);
  });
});
