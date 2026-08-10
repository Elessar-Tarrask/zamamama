import type { InboundMessage, MessagingProvider, SendResult } from "./types";

const API_BASE = "https://api.wazzup24.com/v3";

interface WazzupWebhookMessage {
  messageId?: string;
  channelId?: string;
  chatType?: string;
  chatId?: string;
  dateTime?: string;
  type?: string;
  text?: string;
  isEcho?: boolean;
  crmMessageId?: string;
  contact?: { name?: string };
  authorName?: string;
  status?: string;
}

export interface WazzupWebhookBody {
  test?: boolean;
  messages?: WazzupWebhookMessage[];
  // statuses / contacts / channels тоже приходят — нам не нужны.
}

export class WazzupProvider implements MessagingProvider {
  constructor(
    private readonly apiKey: string,
    private readonly channelId: string,
  ) {}

  async sendText(chatId: string, text: string, crmMessageId: string): Promise<SendResult> {
    const res = await fetch(`${API_BASE}/message`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channelId: this.channelId,
        chatType: "whatsapp",
        chatId,
        text,
        crmMessageId,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Wazzup send failed: HTTP ${res.status} ${detail}`);
    }
    const data = (await res.json().catch(() => ({}))) as { messageId?: string };
    return { providerMessageId: data.messageId };
  }
}

/** Разбирает тело вебхука Wazzup в нормализованные входящие сообщения. */
export function parseWazzupWebhook(body: unknown): InboundMessage[] {
  const parsed = (body ?? {}) as WazzupWebhookBody;
  if (!Array.isArray(parsed.messages)) return [];
  const result: InboundMessage[] = [];
  for (const m of parsed.messages) {
    if (!m?.messageId || !m.chatId) continue;
    result.push({
      providerMessageId: m.messageId,
      channelId: m.channelId ?? "",
      chatId: m.chatId,
      chatType: m.chatType ?? "",
      type: m.type ?? "text",
      text: typeof m.text === "string" ? m.text : undefined,
      contactName: m.contact?.name ?? m.authorName,
      isEcho: m.isEcho === true,
      crmMessageId: m.crmMessageId,
      dateTime: m.dateTime,
    });
  }
  return result;
}
