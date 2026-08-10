import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

/** Ручная отправка сообщения клиенту (бот встаёт на паузу в этом чате). */
export async function adminSendMessage(phone: string, text: string): Promise<void> {
  await httpsCallable(functions, "adminSendMessage")({ phone, text });
}

/** Переключить диалог: забрать человеку / вернуть боту (снимает паузу). */
export async function adminSetMode(phone: string, mode: "bot" | "human"): Promise<void> {
  await httpsCallable(functions, "adminSetMode")({ phone, mode });
}
