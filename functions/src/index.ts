import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { setGlobalOptions } from "firebase-functions/v2";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { defineSecret } from "firebase-functions/params";
import { randomUUID } from "node:crypto";
import { REGION } from "./config";
import { handleWazzupWebhook } from "./webhook";
import { processConversationTask } from "./processor";
import { WazzupProvider } from "./providers/wazzup";
import * as store from "./store";
import type { ProcessPayload } from "./types";

initializeApp();
getFirestore().settings({ ignoreUndefinedProperties: true });
setGlobalOptions({ region: REGION, maxInstances: 10 });

const WAZZUP_API_KEY = defineSecret("WAZZUP_API_KEY");
const AZURE_OPENAI_API_KEY = defineSecret("AZURE_OPENAI_API_KEY");
const GCAL_SA_KEY = defineSecret("GCAL_SA_KEY");
const WEBHOOK_TOKEN = defineSecret("WEBHOOK_TOKEN");

/**
 * Приём вебхуков Wazzup. URL: .../wazzupWebhook?token=<WEBHOOK_TOKEN>
 * minInstances: 1 держит функцию тёплой (~$4–6/мес) — без этого первое
 * сообщение после простоя ждёт холодный старт (+10–20 секунд к ответу).
 */
export const wazzupWebhook = onRequest(
  { secrets: [WEBHOOK_TOKEN], minInstances: 1 },
  async (req, res) => {
    await handleWazzupWebhook(req, res, WEBHOOK_TOKEN.value());
  },
);

/** Отложенная обработка диалога (очередь Cloud Tasks, ставится вебхуком). */
export const processConversation = onTaskDispatched<ProcessPayload>(
  {
    secrets: [WAZZUP_API_KEY, AZURE_OPENAI_API_KEY, GCAL_SA_KEY],
    retryConfig: { maxAttempts: 2, minBackoffSeconds: 30 },
    rateLimits: { maxConcurrentDispatches: 5 },
    timeoutSeconds: 120,
    minInstances: 1, // тёплый инстанс против холодных стартов (~$4–6/мес)
  },
  async (req) => {
    await processConversationTask(req.data, {
      wazzupApiKey: WAZZUP_API_KEY.value(),
      azureApiKey: AZURE_OPENAI_API_KEY.value(),
      gcalSaKey: GCAL_SA_KEY.value(),
    });
  },
);

function assertAdmin(auth: { token?: Record<string, unknown> } | undefined): void {
  if (auth?.token?.admin !== true) {
    throw new HttpsError("permission-denied", "Только для администраторов панели");
  }
}

/**
 * Ручная отправка из админ-панели. По умолчанию ставит бота на паузу в чате
 * (перехват из «Диалогов»); pauseBot=false — ответ на вопрос из «Неотвеченных»,
 * бот продолжает работать.
 */
export const adminSendMessage = onCall<{ phone: string; text: string; pauseBot?: boolean }>(
  { secrets: [WAZZUP_API_KEY] },
  async (req) => {
    assertAdmin(req.auth);
    const phone = String(req.data?.phone ?? "").replace(/\D/g, "");
    const text = String(req.data?.text ?? "").trim();
    const pauseBot = req.data?.pauseBot !== false;
    if (!phone || !text) throw new HttpsError("invalid-argument", "Нужны phone и text");

    const settings = await store.getSettings();
    const provider = new WazzupProvider(WAZZUP_API_KEY.value(), settings.wazzupChannelId);
    const crmMessageId = randomUUID();
    await store.recordSentMessage(crmMessageId, phone, false);
    const { providerMessageId } = await provider.sendText(phone, text, crmMessageId);
    if (providerMessageId) await store.recordSentMessage(providerMessageId, phone, false);
    await store.ensureConversation(phone);
    await store.appendMessage(phone, {
      direction: "out",
      byBot: false,
      type: "text",
      text,
      crmMessageId,
      providerMessageId,
      dateTimeMs: Date.now(),
    });
    if (pauseBot) {
      await store.pauseConversation(
        phone,
        Date.now() + settings.pauseOnManualReplyHours * 3_600_000,
        "Администратор ответил из панели — бот на паузе",
      );
    } else {
      await store.flagConversation(phone, "");
    }
    return { ok: true };
  },
);

/** Блокировка чата: сообщения сохраняются, бот молчит навсегда до разблокировки. */
export const adminSetBlocked = onCall<{ phone: string; blocked: boolean }>(async (req) => {
  assertAdmin(req.auth);
  const phone = String(req.data?.phone ?? "").replace(/\D/g, "");
  if (!phone) throw new HttpsError("invalid-argument", "Нужен phone");
  await store.setBlocked(phone, req.data?.blocked === true);
  return { ok: true };
});

/** Переключение диалога: вернуть боту / забрать человеку. */
export const adminSetMode = onCall<{ phone: string; mode: "bot" | "human" }>(async (req) => {
  assertAdmin(req.auth);
  const phone = String(req.data?.phone ?? "").replace(/\D/g, "");
  const mode = req.data?.mode;
  if (!phone || (mode !== "bot" && mode !== "human")) {
    throw new HttpsError("invalid-argument", "Нужны phone и mode: bot|human");
  }
  await store.setMode(phone, mode, mode === "human" ? "Диалог забрал администратор" : "");
  return { ok: true };
});
