/**
 * Абстракция WhatsApp-шлюза. Вся бизнес-логика говорит только с этим
 * интерфейсом — миграция с Wazzup на Meta Cloud API / Green API /
 * self-hosted Evolution API сводится к новой реализации в этой папке.
 */

export interface InboundMessage {
  providerMessageId: string;
  channelId: string;
  /** Телефон клиента без «+», например "77011234567". */
  chatId: string;
  /** "whatsapp" для личных чатов; группы и другие типы игнорируем. */
  chatType: string;
  type: string;
  text?: string;
  contactName?: string;
  /** true — сообщение отправлено с нашей стороны (ботом или человеком). */
  isEcho: boolean;
  /** Наш идентификатор, если сообщение отправляли мы через API. */
  crmMessageId?: string;
  dateTime?: string;
}

export interface SendResult {
  providerMessageId?: string;
}

export interface MessagingProvider {
  sendText(chatId: string, text: string, crmMessageId: string): Promise<SendResult>;
}
