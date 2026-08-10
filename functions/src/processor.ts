import { logger } from "firebase-functions";
import { randomUUID } from "node:crypto";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { CalendarService } from "./calendar";
import { HISTORY_LIMIT, MAX_LLM_ITERATIONS } from "./config";
import { createLlmClient } from "./llm/client";
import { buildSystemPrompt } from "./llm/prompt";
import { executeTool, toolDefinitions, type ToolContext } from "./llm/tools";
import { WazzupProvider } from "./providers/wazzup";
import type { MessagingProvider } from "./providers/types";
import * as store from "./store";
import type { ProcessPayload, StoredMessage } from "./types";

export interface ProcessorSecrets {
  wazzupApiKey: string;
  azureApiKey: string;
  gcalSaKey: string;
}

/**
 * Главный цикл бота: срабатывает через DEBOUNCE_SECONDS после входящего.
 * Если после нашего маркера пришло что-то новее — молча выходим (ответит
 * более свежая задача). Так несколько сообщений подряд получают один ответ.
 */
export async function processConversationTask(payload: ProcessPayload, secrets: ProcessorSecrets): Promise<void> {
  const { phone, markerMs } = payload;

  const settings = await store.getSettings();
  if (!settings.botEnabled) return;

  const conv = await store.getConversation(phone);
  if (!conv) return;
  if ((conv.lastInboundAtMs ?? 0) > markerMs) return; // придёт более свежая задача
  if (conv.mode === "human") return;
  if ((conv.pausedUntilMs ?? 0) > Date.now()) return;

  // Защита от зацикливания/спама: лимит ответов бота в час на диалог.
  const recentReplies = (conv.botReplyTimestampsMs ?? []).filter((t) => t > Date.now() - 3_600_000);
  if (recentReplies.length >= settings.maxBotMessagesPerHour) {
    await store.flagConversation(phone, "Превышен лимит ответов бота в час — проверьте диалог");
    logger.warn("Достигнут лимит ответов в час", { phone });
    return;
  }

  const history = await store.getRecentMessages(phone, HISTORY_LIMIT);
  if (history.length === 0) return;
  if (history[history.length - 1].direction === "out") return; // уже отвечено

  const provider: MessagingProvider = new WazzupProvider(secrets.wazzupApiKey, settings.wazzupChannelId);

  // Хвост входящих, на который отвечаем
  const pendingInbound: StoredMessage[] = [];
  for (let i = history.length - 1; i >= 0 && history[i].direction === "in"; i--) {
    pendingInbound.unshift(history[i]);
  }
  const hasText = pendingInbound.some((m) => m.type === "text" && m.text.trim().length > 0);
  if (!hasText) {
    // Голосовое/картинка без текста: на тарифе Inbox транскрибации нет —
    // отвечаем скриптом и помечаем диалог для админа.
    await sendBotReply(provider, phone, settings.voiceFallbackText);
    await store.flagConversation(phone, "Клиент прислал голосовое/вложение — бот попросил написать текстом");
    return;
  }

  const faq = await store.getEnabledFaq();
  const system = buildSystemPrompt(settings, faq, conv, Date.now());

  const chat: ChatCompletionMessageParam[] = [{ role: "system", content: system }];
  for (const m of history) {
    chat.push(
      m.direction === "in"
        ? { role: "user", content: m.text }
        : { role: "assistant", content: m.text },
    );
  }

  const client = createLlmClient(settings, secrets.azureApiKey);
  const calendar =
    secrets.gcalSaKey && secrets.gcalSaKey !== "{}" && settings.calendarId
      ? new CalendarService(secrets.gcalSaKey, settings)
      : null;
  const ctx: ToolContext = { phone, settings, calendar, provider };

  let finalText = "";
  for (let i = 0; i < MAX_LLM_ITERATIONS; i++) {
    const completion = await client.chat.completions.create({
      model: settings.azureDeployment,
      messages: chat,
      tools: toolDefinitions,
      max_completion_tokens: 2000,
      reasoning_effort: "low",
    });
    const message = completion.choices[0]?.message;
    if (!message) break;

    if (message.tool_calls && message.tool_calls.length > 0) {
      chat.push({ role: "assistant", content: message.content ?? "", tool_calls: message.tool_calls });
      for (const tc of message.tool_calls) {
        const result = await executeTool(tc.function.name, tc.function.arguments, ctx);
        chat.push({ role: "tool", tool_call_id: tc.id, content: result });
      }
      continue;
    }

    finalText = (message.content ?? "").trim();
    break;
  }

  // Модель промолчала (редко: исчерпаны итерации/фильтр) — честный fallback.
  if (!finalText) finalText = settings.fallbackText;

  await sendBotReply(provider, phone, finalText);
}

async function sendBotReply(provider: MessagingProvider, phone: string, text: string): Promise<void> {
  const crmMessageId = randomUUID();
  // Сначала регистрируем отправку, чтобы echo-вебхук распознал её как нашу.
  await store.recordSentMessage(crmMessageId, phone, true);
  const { providerMessageId } = await provider.sendText(phone, text, crmMessageId);
  await store.appendMessage(phone, {
    direction: "out",
    byBot: true,
    type: "text",
    text,
    crmMessageId,
    providerMessageId,
    dateTimeMs: Date.now(),
  });
  await store.recordBotReply(phone, Date.now());
}
