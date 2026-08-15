export type ConversationMode = "bot" | "human";

export interface LeadProfile {
  parentName?: string;
  childName?: string;
  childAge?: number;
  preferredDays?: string;
  notes?: string;
}

export interface TourHours {
  /** Часы начала/конца окна экскурсий по местному времени, например 9 и 16. */
  startHour: number;
  endHour: number;
  /** Дни недели ISO: 1 = понедельник … 7 = воскресенье. */
  days: number[];
}

/**
 * Документ Firestore `settings/bot`. Всё несекретное и редактируемое из
 * админ-панели. Секреты (API-ключи) — только в Firebase Secret Manager.
 */
export interface BotSettings {
  botEnabled: boolean;

  // Тексты (редактирует админ; используются дословно)
  systemPrompt: string;
  greetingScript: string;
  /** Возраст ребёнка ("2".."5") → готовый питч группы с ценами. */
  agePitches: Record<string, string>;
  fallbackText: string;
  voiceFallbackText: string;
  /** Свободная база знаний: бот отвечает из неё своими словами. */
  businessInfo: string;

  // Скорость ответа: пауза после последнего сообщения (склейка «пузырей»);
  // увеличенная — когда фраза выглядит незаконченной (см. debounce.ts)
  replyDelaySeconds: number;
  replyDelayMaxSeconds: number;

  // Handoff
  adminAlertPhone: string;
  pauseOnManualReplyHours: number;
  /** Служебные фразы (по одной на строку): такие исходящие с номера садика
   *  (авто-приветствия WhatsApp Business и т.п.) НЕ ставят бота на паузу. */
  ignoredEchoTexts: string;

  // Экскурсии
  calendarId: string;
  tourHours: TourHours;
  tourSlotMinutes: number;
  minLeadHours: number;
  maxDaysAhead: number;

  // Время
  timezone: string;
  utcOffsetMinutes: number;

  // Защита (всё редактируется из панели)
  maxBotMessagesPerHour: number;
  maxBotMessagesPerDay: number;
  spamFilterEnabled: boolean;
  /** Столько ссылок в одном сообщении и больше — спам. */
  spamMaxLinks: number;
  /** Длиннее этого (символов) — спам. */
  spamMaxChars: number;
  /** Спам-слова через запятую; ищутся как части слов. */
  spamKeywords: string;
  /** Флуд: входящих за окно (0 — защита выключена). */
  floodMaxInbound: number;
  floodWindowMinutes: number;

  // Интеграции (несекретная часть)
  wazzupChannelId: string;
  azureEndpoint: string;
  azureDeployment: string;
  azureApiVersion: string;
  /** Глубина обдумывания gpt-5-mini: minimal — быстрее, medium — умнее. */
  azureReasoningEffort: "minimal" | "low" | "medium";
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  enabled: boolean;
  order: number;
}

export interface Conversation {
  mode: ConversationMode;
  contactName?: string;
  lead: LeadProfile;
  lastInboundAtMs: number;
  pausedUntilMs?: number;
  /** Заблокирован администратором: сообщения сохраняются, бот молчит. */
  blocked?: boolean;
  flagReason?: string;
  botReplyTimestampsMs?: number[];
  createdAtMs: number;
}

export interface StoredMessage {
  direction: "in" | "out";
  /** true — написал бот; false — человек (клиент или админ вручную). */
  byBot: boolean;
  type: string;
  text: string;
  providerMessageId?: string;
  crmMessageId?: string;
  dateTimeMs: number;
}

export interface ProcessPayload {
  phone: string;
  /** lastInboundAtMs на момент постановки задачи — для склейки сообщений. */
  markerMs: number;
}
