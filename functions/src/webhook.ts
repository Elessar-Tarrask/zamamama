import type { Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { logger } from "firebase-functions";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFunctions } from "firebase-admin/functions";
import { parseWazzupWebhook } from "./providers/wazzup";
import type { InboundMessage } from "./providers/types";
import * as store from "./store";
import { computeReplyDelaySeconds } from "./debounce";
import { extractChildAge } from "./extract";
import { looksLikeSpam, truncateInbound } from "./spam";
import { PROCESS_QUEUE } from "./config";
import type { BotSettings, ProcessPayload } from "./types";

/**
 * Служебные фразы с номера садика (авто-приветствия WhatsApp Business,
 * автоответы) — не «администратор вошёл в чат»: записываем в транскрипт,
 * но бота НЕ паузим. Список редактируется в панели (settings/bot).
 */
export function isIgnoredEchoText(text: string | undefined, settings: BotSettings): boolean {
  if (!text) return false;
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const t = norm(text);
  return (settings.ignoredEchoTexts || "")
    .split("\n")
    .map(norm)
    .filter((p) => p.length >= 8) // короткие обрывки дают ложные срабатывания
    .some((p) => t.includes(p));
}

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

  const settings = await store.getSettings();

  // В кабинете Wazzup может быть несколько номеров — бот обслуживает ТОЛЬКО
  // канал из настроек. Сообщения других каналов полностью игнорируем, иначе
  // все номера кабинета стекаются в одного бота.
  if (settings.wazzupChannelId && msg.channelId && msg.channelId !== settings.wazzupChannelId) {
    return;
  }

  const phone = msg.chatId;

  if (msg.isEcho) {
    // Эхо нашей же отправки (бот или панель) — уже сохранено при отправке.
    // Wazzup не всегда возвращает crmMessageId в echo, поэтому распознаём
    // тремя способами: наш crmMessageId, messageId провайдера, записанный
    // при отправке, и совпадение текста с недавним исходящим (гонка).
    if (msg.crmMessageId && (await store.wasSentByUs(msg.crmMessageId))) return;
    if (await store.wasSentByUs(msg.providerMessageId)) return;
    if (await store.matchesRecentOwnOutbound(phone, msg.text)) return;

    // Служебная авто-фраза (например, «Мы скоро ответим») — фиксируем в
    // переписке, но бот продолжает работать.
    if (isIgnoredEchoText(msg.text, settings)) {
      await store.ensureConversation(phone);
      await store.appendMessage(phone, {
        direction: "out",
        byBot: false,
        type: msg.type,
        text: msg.text ?? `[${msg.type}]`,
        providerMessageId: msg.providerMessageId,
        dateTimeMs: Date.now(),
      });
      return;
    }

    // Настоящий ручной ответ администратора с телефона / из приложения
    // Wazzup: сохраняем в транскрипт и ставим бота на паузу.
    await store.ensureConversation(phone);
    await appendManualReply(phone, msg, settings.pauseOnManualReplyHours);
    return;
  }

  const markerMs = Date.now();
  const inboundText = truncateInbound(msg.text ?? `[${msg.type}]`);
  await store.ensureConversation(phone, msg.contactName);
  await store.appendMessage(phone, {
    direction: "in",
    byBot: false,
    type: msg.type,
    text: inboundText,
    providerMessageId: msg.providerMessageId,
    dateTimeMs: markerMs,
  });

  // Спам (ссылки пачками, реклама, простыни) сохраняем в транскрипт, но
  // модель не вызываем и не отвечаем — тишина лучший ответ спамеру.
  if (looksLikeSpam(msg.text, settings)) {
    await store.flagConversation(phone, "Похоже на спам — бот не отвечает на это сообщение");
    return;
  }

  await store.setLastInbound(phone, markerMs);

  // Разбираем сообщение сразу: если клиент назвал возраст — в профиль лида,
  // чтобы бот не переспрашивал (даже если модель не вызовет save_lead_info).
  const childAge = extractChildAge(msg.text);
  if (childAge !== undefined) await store.updateLead(phone, { childAge });

  // Пауза перед ответом настраивается в панели и зависит от того, выглядит
  // ли последняя фраза законченной (см. debounce.ts). Каждое новое сообщение
  // ставит свою задачу, устаревшие пропускают себя в processor.
  const payload: ProcessPayload = { phone, markerMs };
  await functionsForEnqueue()
    .taskQueue<ProcessPayload>(PROCESS_QUEUE)
    .enqueue(payload, { scheduleDelaySeconds: computeReplyDelaySeconds(msg.text, settings) });
}

async function appendManualReply(
  phone: string,
  msg: InboundMessage,
  pauseHours: number,
): Promise<void> {
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
    Date.now() + pauseHours * 3_600_000,
    "Администратор ответил вручную — бот на паузе",
  );
}
