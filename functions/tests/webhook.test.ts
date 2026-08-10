import { beforeEach, describe, expect, it, vi } from "vitest";

const { enqueue } = vi.hoisted(() => ({ enqueue: vi.fn(async () => {}) }));

vi.mock("../src/store", () => ({
  tryMarkWebhookProcessed: vi.fn(async () => true),
  ensureConversation: vi.fn(async () => {}),
  appendMessage: vi.fn(async () => {}),
  setLastInbound: vi.fn(async () => {}),
  pauseConversation: vi.fn(async () => {}),
  wasSentByUs: vi.fn(async () => false),
  matchesRecentOwnOutbound: vi.fn(async () => false),
  getSettings: vi.fn(async () => ({
    pauseOnManualReplyHours: 6,
    replyDelaySeconds: 5,
    replyDelayMaxSeconds: 12,
  })),
}));

vi.mock("firebase-admin/functions", () => ({
  getFunctions: () => ({ taskQueue: () => ({ enqueue }) }),
}));

vi.mock("firebase-functions", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { handleWazzupWebhook } from "../src/webhook";
import * as store from "../src/store";

/* eslint-disable @typescript-eslint/no-explicit-any */
function fakeRes() {
  const r: any = { statusCode: 0, body: undefined };
  r.status = (c: number) => ((r.statusCode = c), r);
  r.send = (b: unknown) => ((r.body = b), r);
  r.json = (b: unknown) => ((r.body = b), r);
  return r;
}

const inboundBody = (over: Record<string, unknown> = {}) => ({
  messages: [
    {
      messageId: "m1",
      chatType: "whatsapp",
      chatId: "77011234567",
      type: "text",
      text: "Привет",
      isEcho: false,
      ...over,
    },
  ],
});

const req = (body: unknown, token = "t") => ({ query: { token }, body }) as any;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(store.tryMarkWebhookProcessed).mockResolvedValue(true);
  vi.mocked(store.wasSentByUs).mockResolvedValue(false);
  vi.mocked(store.matchesRecentOwnOutbound).mockResolvedValue(false);
});

describe("handleWazzupWebhook", () => {
  it("отклоняет запрос без верного токена", async () => {
    const res = fakeRes();
    await handleWazzupWebhook(req(inboundBody(), "wrong"), res, "t");
    expect(res.statusCode).toBe(403);
    expect(store.appendMessage).not.toHaveBeenCalled();
  });

  it("отвечает 200 на handshake {test: true}", async () => {
    const res = fakeRes();
    await handleWazzupWebhook(req({ test: true }), res, "t");
    expect(res.statusCode).toBe(200);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("сохраняет входящее и ставит отложенную задачу с базовой паузой", async () => {
    const res = fakeRes();
    await handleWazzupWebhook(req(inboundBody()), res, "t");
    expect(store.ensureConversation).toHaveBeenCalledWith("77011234567", undefined);
    expect(store.appendMessage).toHaveBeenCalledWith(
      "77011234567",
      expect.objectContaining({ direction: "in", text: "Привет" }),
    );
    expect(store.setLastInbound).toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ phone: "77011234567" }),
      { scheduleDelaySeconds: 5 },
    );
    expect(res.statusCode).toBe(200);
  });

  it("ждёт дольше, если фраза выглядит незаконченной", async () => {
    const res = fakeRes();
    await handleWazzupWebhook(req(inboundBody({ text: "Хочу спросить про," })), res, "t");
    expect(enqueue).toHaveBeenCalledWith(expect.anything(), { scheduleDelaySeconds: 12 });
  });

  it("игнорирует группы и другие типы чатов", async () => {
    const res = fakeRes();
    await handleWazzupWebhook(req(inboundBody({ chatType: "whatsgroup" })), res, "t");
    expect(store.tryMarkWebhookProcessed).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("игнорирует дубликат вебхука", async () => {
    vi.mocked(store.tryMarkWebhookProcessed).mockResolvedValue(false);
    const res = fakeRes();
    await handleWazzupWebhook(req(inboundBody()), res, "t");
    expect(store.appendMessage).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("эхо нашей же отправки пропускает молча", async () => {
    vi.mocked(store.wasSentByUs).mockResolvedValue(true);
    const res = fakeRes();
    await handleWazzupWebhook(req(inboundBody({ isEcho: true, crmMessageId: "our-id" })), res, "t");
    expect(store.appendMessage).not.toHaveBeenCalled();
    expect(store.pauseConversation).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("эхо без crmMessageId, но с известным providerMessageId — наше, пауза не ставится", async () => {
    // wasSentByUs: false для crm (нет crm), true для providerMessageId
    vi.mocked(store.wasSentByUs).mockImplementation(async (id: string) => id === "m1");
    const res = fakeRes();
    await handleWazzupWebhook(req(inboundBody({ isEcho: true })), res, "t");
    expect(store.appendMessage).not.toHaveBeenCalled();
    expect(store.pauseConversation).not.toHaveBeenCalled();
  });

  it("эхо, совпадающее с недавним исходящим текстом, — наше (гонка)", async () => {
    vi.mocked(store.matchesRecentOwnOutbound).mockResolvedValue(true);
    const res = fakeRes();
    await handleWazzupWebhook(
      req(inboundBody({ isEcho: true, text: "Здравствуйте! 😊 Спасибо…" })),
      res,
      "t",
    );
    expect(store.pauseConversation).not.toHaveBeenCalled();
  });

  it("ручной ответ администратора сохраняет и ставит бота на паузу", async () => {
    const res = fakeRes();
    await handleWazzupWebhook(req(inboundBody({ isEcho: true, text: "Отвечу сама" })), res, "t");
    expect(store.appendMessage).toHaveBeenCalledWith(
      "77011234567",
      expect.objectContaining({ direction: "out", byBot: false, text: "Отвечу сама" }),
    );
    expect(store.pauseConversation).toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
});
