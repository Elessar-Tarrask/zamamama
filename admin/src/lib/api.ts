import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

/**
 * Ручная отправка сообщения клиенту. pauseBot=true (перехват из «Диалогов») —
 * бот встаёт на паузу; pauseBot=false (ответ из «Неотвеченных») — бот
 * продолжает работать в этом чате.
 */
export async function adminSendMessage(phone: string, text: string, pauseBot = true): Promise<void> {
  await httpsCallable(functions, "adminSendMessage")({ phone, text, pauseBot });
}

/** Переключить диалог: забрать человеку / вернуть боту (снимает паузу). */
export async function adminSetMode(phone: string, mode: "bot" | "human"): Promise<void> {
  await httpsCallable(functions, "adminSetMode")({ phone, mode });
}

/** Заблокировать/разблокировать чат: сообщения сохраняются, бот молчит. */
export async function adminSetBlocked(phone: string, blocked: boolean): Promise<void> {
  await httpsCallable(functions, "adminSetBlocked")({ phone, blocked });
}
