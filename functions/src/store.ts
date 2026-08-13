import { FieldValue, getFirestore } from "firebase-admin/firestore";
import type { BotSettings, Conversation, ConversationMode, FaqItem, LeadProfile, StoredMessage } from "./types";
import { DEFAULT_SETTINGS } from "./seed/seedData";

const db = () => getFirestore();

const convRef = (phone: string) => db().collection("conversations").doc(phone);

export async function getSettings(): Promise<BotSettings> {
  const snap = await db().doc("settings/bot").get();
  // Merge с дефолтами: новые поля кода не роняют старый документ.
  return { ...DEFAULT_SETTINGS, ...(snap.data() ?? {}) } as BotSettings;
}

export async function getEnabledFaq(): Promise<FaqItem[]> {
  const snap = await db().collection("faq").get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<FaqItem, "id">) }))
    .filter((f) => f.enabled)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function getConversation(phone: string): Promise<Conversation | null> {
  const snap = await convRef(phone).get();
  return snap.exists ? (snap.data() as Conversation) : null;
}

export async function ensureConversation(phone: string, contactName?: string): Promise<void> {
  const ref = convRef(phone);
  const snap = await ref.get();
  if (!snap.exists) {
    const fresh: Conversation = {
      mode: "bot",
      contactName: contactName ?? "",
      lead: {},
      lastInboundAtMs: 0,
      createdAtMs: Date.now(),
    };
    await ref.set(fresh);
  } else if (contactName && !snap.get("contactName")) {
    await ref.update({ contactName });
  }
}

export async function appendMessage(phone: string, msg: StoredMessage): Promise<void> {
  await convRef(phone).collection("messages").add(msg);
}

/** Последние N сообщений в хронологическом порядке. */
export async function getRecentMessages(phone: string, limit: number): Promise<StoredMessage[]> {
  const snap = await convRef(phone)
    .collection("messages")
    .orderBy("dateTimeMs", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.data() as StoredMessage).reverse();
}

export async function setLastInbound(phone: string, markerMs: number): Promise<void> {
  await convRef(phone).update({ lastInboundAtMs: markerMs });
}

export async function pauseConversation(phone: string, untilMs: number, reason: string): Promise<void> {
  await convRef(phone).set({ pausedUntilMs: untilMs, flagReason: reason }, { merge: true });
}

export async function setMode(phone: string, mode: ConversationMode, reason?: string): Promise<void> {
  const patch: Record<string, unknown> = { mode, flagReason: reason ?? "" };
  if (mode === "bot") patch.pausedUntilMs = 0; // возврат боту снимает и паузу
  await convRef(phone).set(patch, { merge: true });
}

export async function flagConversation(phone: string, reason: string): Promise<void> {
  await convRef(phone).set({ flagReason: reason }, { merge: true });
}

export async function updateLead(phone: string, patch: Partial<LeadProfile>): Promise<void> {
  const clean = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  );
  if (Object.keys(clean).length === 0) return;
  const lead = Object.fromEntries(Object.entries(clean).map(([k, v]) => [`lead.${k}`, v]));
  await convRef(phone).update(lead);
}

/** Дедуп вебхуков: true — сообщение новое, false — уже обработано. */
export async function tryMarkWebhookProcessed(providerMessageId: string): Promise<boolean> {
  try {
    await db().collection("processedWebhooks").doc(providerMessageId).create({
      createdAtMs: Date.now(),
      // Поле для TTL-политики Firestore (см. docs/SETUP.md): чистим через 7 дней.
      expireAt: new Date(Date.now() + 7 * 86_400_000),
    });
    return true;
  } catch (e) {
    if ((e as { code?: number }).code === 6 /* ALREADY_EXISTS */) return false;
    throw e;
  }
}

/** Регистрируем свою отправку ДО вызова провайдера, чтобы echo-вебхук её узнал. */
export async function recordSentMessage(crmMessageId: string, phone: string, byBot: boolean): Promise<void> {
  await db().collection("sentMessages").doc(crmMessageId).set({
    phone,
    byBot,
    createdAtMs: Date.now(),
    expireAt: new Date(Date.now() + 7 * 86_400_000),
  });
}

export async function wasSentByUs(messageId: string): Promise<boolean> {
  if (!messageId) return false;
  const snap = await db().collection("sentMessages").doc(messageId).get();
  return snap.exists;
}

/**
 * Похоже ли echo-сообщение на наше недавнее исходящее? Страховка на случай,
 * когда echo-вебхук прилетает без crmMessageId и раньше, чем мы успели
 * записать providerMessageId (гонка). Совпадение текста с исходящим за
 * последние 10 минут — практически гарантированно наша отправка.
 */
export async function matchesRecentOwnOutbound(phone: string, text: string | undefined): Promise<boolean> {
  if (!text) return false;
  // Лимит 20: при очереди быстрых сообщений клиента наш недавний исходящий
  // вылетал из окна в 5 сообщений, и повтор (второй фолбэк) не подавлялся.
  const snap = await convRef(phone)
    .collection("messages")
    .orderBy("dateTimeMs", "desc")
    .limit(20)
    .get();
  const cutoffMs = Date.now() - 10 * 60_000;
  return snap.docs.some((d) => {
    const m = d.data() as StoredMessage;
    return m.direction === "out" && m.dateTimeMs > cutoffMs && m.text === text;
  });
}

/** Отметка ответа бота; храним 25 часов — для часового и суточного лимитов. */
export async function recordBotReply(phone: string, atMs: number): Promise<void> {
  await db().runTransaction(async (tx) => {
    const ref = convRef(phone);
    const snap = await tx.get(ref);
    const prev = (snap.get("botReplyTimestampsMs") as number[] | undefined) ?? [];
    const kept = prev.filter((t) => t > atMs - 25 * 3_600_000);
    kept.push(atMs);
    tx.set(ref, { botReplyTimestampsMs: kept }, { merge: true });
  });
}

/** Блокировка чата администратором: сообщения сохраняются, бот молчит. */
export async function setBlocked(phone: string, blocked: boolean): Promise<void> {
  await convRef(phone).set(
    { blocked, flagReason: blocked ? "Заблокирован администратором" : "" },
    { merge: true },
  );
}

export async function logUnanswered(phone: string, question: string, context: string): Promise<void> {
  await db().collection("unanswered").add({
    phone,
    question,
    context,
    resolved: false,
    createdAtMs: Date.now(),
  });
}

export interface BookingRecord {
  phone: string;
  parentName: string;
  childAge?: number;
  slotStartIso: string;
  slotEndIso: string;
  calendarEventId: string;
  status: "confirmed";
}

export async function createBooking(booking: BookingRecord): Promise<void> {
  await db().collection("bookings").add({ ...booking, createdAtMs: Date.now() });
}

export { FieldValue };
