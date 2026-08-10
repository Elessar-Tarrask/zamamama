import type { Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { logger } from "firebase-functions";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFunctions } from "firebase-admin/functions";
import { parseWazzupWebhook } from "./providers/wazzup";
import type { InboundMessage } from "./providers/types";
import * as store from "./store";
import { DEBOUNCE_SECONDS, PROCESS_QUEUE } from "./config";
import type { ProcessPayload } from "./types";

/**
 * В эмуляторе firebase-admin требует настоящий OAuth-токен для постановки
 * Cloud Tasks (ограничение SDK). Даём ему отдельное приложение с фиктивным
 * токеном — только в эмуляторе; в проде используется приложение по умолчанию.
 */
function functionsForEnqueue() {
  if (process.env.FUNCTIONS_EMULATOR !== "true") return getFunctions();
  const name = "tasks-emulator";
  const app =
    getApps().find((a) => a.name === name) ??
    initializeApp(
      { credential: { getAccessToken: async () => ({ access_token: "owner", expires_in: 3600 }) } },
      name,
    );
  return getFunctions(app);
}

export async function handleWazzupWebhook(req: Request, res: Response, expectedToken: string): Promise<void> {
  if (!expectedToken || req.query.token !== expectedToken) {
    res.status(403).send("Forbidden");
    return;
  }

  const body = req.body as { test?: boolean } | undefined;
  if (body?.test === true) {
    // Handshake при подписке вебхука в Wazzup
    res.status(200).send("ok");
    return;
  }

  const messages = parseWazzupWebhook(body);
  for (const msg of messages) {
    try {
      await handleInbound(msg);
    } catch (e) {
      logger.error("Ошибка обработки сообщения вебхука", { messageId: msg.providerMessageId, error: String(e) });
    }
  }

  // Всегда 200: Wazzup ретраит не-2xx, а свои ошибки мы уже залогировали.
  res.status(200).json({ ok: true });
}

async function handleInbound(msg: InboundMessage): Promise<void> {
  // Только личные WhatsApp-чаты: группы и другие типы не обслуживаем.
  if (msg.chatType !== "whatsapp") return;

  const isNew = await store.tryMarkWebhookProcessed(msg.providerMessageId);
  if (!isNew) return;

  const phone = msg.chatId;

  if (msg.isEcho) {
    // Эхо нашей же отправки (бот или панель) — уже сохранено при отправке.
    if (msg.crmMessageId && (await store.wasSentByUs(msg.crmMessageId))) return;

    // Ручной ответ администратора с телефона / из приложения Wazzup:
    // сохраняем в транскрипт и ставим бота на паузу, чтобы не перебивал.
    const settings = await store.getSettings();
    await store.ensureConversation(phone);
    await store.appendMessage(phone, {
      direction: "out",
      byBot: false,
      type: msg.type,
      text: msg.text ?? `[${msg.type}]`,
      providerMessageId: msg.providerMessageId,
      dateTimeMs: Date.now(),
    });
    await store.pauseConversation(
      phone,
      Date.now() + settings.pauseOnManualReplyHours * 3_600_000,
      "Администратор ответил вручную — бот на паузе",
    );
    return;
  }

  const markerMs = Date.now();
  await store.ensureConversation(phone, msg.contactName);
  await store.appendMessage(phone, {
    direction: "in",
    byBot: false,
    type: msg.type,
    text: msg.text ?? `[${msg.type}]`,
    providerMessageId: msg.providerMessageId,
    dateTimeMs: markerMs,
  });
  await store.setLastInbound(phone, markerMs);

  // Ответ уходит не сразу: ждём DEBOUNCE_SECONDS тишины, чтобы человек
  // успел дописать мысль несколькими сообщениями (склейка в processor).
  const payload: ProcessPayload = { phone, markerMs };
  await functionsForEnqueue()
    .taskQueue<ProcessPayload>(PROCESS_QUEUE)
    .enqueue(payload, { scheduleDelaySeconds: DEBOUNCE_SECONDS });
}
