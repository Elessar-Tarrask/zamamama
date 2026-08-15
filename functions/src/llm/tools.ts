import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { randomUUID } from "node:crypto";
import { logger } from "firebase-functions";
import { formatSlotLabel, isValidSlotStart, type CalendarService } from "../calendar";
import type { MessagingProvider } from "../providers/types";
import type { BotSettings } from "../types";
import * as store from "../store";

export interface ToolContext {
  phone: string;
  settings: BotSettings;
  /** null, если календарь ещё не настроен. */
  calendar: CalendarService | null;
  provider: MessagingProvider;
}

export const toolDefinitions: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_available_slots",
      description:
        "Возвращает ПОЛНЫЙ список свободного времени экскурсий на ближайшие дни. " +
        "Вызывай перед тем, как предлагать время. Предлагай клиенту 2–3 ближайших варианта, " +
        "остальные держи про запас. Времени, которого нет в списке, НЕ существует.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "book_tour",
      description:
        "Забронировать экскурсию на конкретный слот из get_available_slots. " +
        "Вызывай ТОЛЬКО после явного согласия клиента на конкретное время.",
      parameters: {
        type: "object",
        properties: {
          slotStartIso: {
            type: "string",
            description:
              "startIso выбранного слота — СКОПИРУЙ точно из результата get_available_slots, не вычисляй сам",
          },
          parentName: { type: "string", description: "Имя родителя" },
          childAge: { type: "number", description: "Возраст ребёнка в годах, если известен" },
          comment: { type: "string", description: "Пожелания клиента, если были" },
        },
        required: ["slotStartIso", "parentName"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_lead_info",
      description: "Сохранить новые факты о клиенте, как только они прозвучали.",
      parameters: {
        type: "object",
        properties: {
          parentName: { type: "string" },
          childName: { type: "string" },
          childAge: { type: "number" },
          preferredDays: { type: "string", description: "Удобные дни/время для экскурсии" },
          notes: { type: "string", description: "Прочее важное (особенности ребёнка, вопросы)" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_unanswered_question",
      description:
        "Вопрос клиента, ответа на который НЕТ в базе знаний: записать его для администратора " +
        "и уведомить его. Бот продолжает работать в диалоге. После вызова скажи клиенту, что " +
        "уточнишь у администратора и вернёшься с ответом, и предложи помочь с остальным.",
      parameters: {
        type: "object",
        properties: {
          clientQuestion: { type: "string", description: "Вопрос клиента, максимально дословно" },
        },
        required: ["clientQuestion"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "handoff_to_human",
      description:
        "Полностью передать диалог живому администратору — после вызова бот замолкает в этом чате. " +
        "Вызывай ТОЛЬКО если клиент прямо просит человека, жалуется или ситуация конфликтная. " +
        "Для обычного вопроса без ответа в базе используй log_unanswered_question.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Короткая причина передачи" },
          clientQuestion: { type: "string", description: "Вопрос клиента своими словами" },
        },
        required: ["reason"],
        additionalProperties: false,
      },
    },
  },
];

/** Best-effort WhatsApp-алерт администратору (флаг в панели ставится всегда). */
async function sendAdminAlert(ctx: ToolContext, text: string): Promise<void> {
  if (!ctx.settings.adminAlertPhone) return;
  try {
    const crmMessageId = randomUUID();
    await store.recordSentMessage(crmMessageId, ctx.settings.adminAlertPhone, true);
    const { providerMessageId } = await ctx.provider.sendText(ctx.settings.adminAlertPhone, text, crmMessageId);
    if (providerMessageId) {
      await store.recordSentMessage(providerMessageId, ctx.settings.adminAlertPhone, true);
    }
  } catch (e) {
    logger.warn("Не удалось отправить WhatsApp-алерт администратору", e);
  }
}

/** Выполняет инструмент; всегда возвращает JSON-строку для роли tool. */
export async function executeTool(name: string, argsJson: string, ctx: ToolContext): Promise<string> {
  let args: Record<string, unknown> = {};
  try {
    args = argsJson ? (JSON.parse(argsJson) as Record<string, unknown>) : {};
  } catch {
    return JSON.stringify({ error: "bad_arguments_json" });
  }

  try {
    switch (name) {
      case "get_available_slots": {
        if (!ctx.calendar) {
          return JSON.stringify({
            error: "calendar_not_configured",
            hint: "Скажи клиенту, что администратор свяжется для выбора времени, и вызови handoff_to_human.",
          });
        }
        const slots = await ctx.calendar.getFreeSlots();
        const existing = await store.findActiveBooking(ctx.phone);
        const currentBooking = existing
          ? {
              bookedLabel: formatSlotLabel(Date.parse(existing.slotStartIso), ctx.settings.utcOffsetMinutes),
              note: "У клиента уже есть запись. Новый book_tour автоматически перенесёт её на новое время.",
            }
          : undefined;
        if (slots.length === 0) {
          return JSON.stringify({
            slots: [],
            currentBooking,
            hint: "Свободных слотов в ближайшие дни нет — предложи передать вопрос администратору.",
          });
        }
        return JSON.stringify({
          slots,
          currentBooking,
          note:
            "Это ПОЛНЫЙ и АКТУАЛЬНЫЙ список свободного времени. Предложи 2–3 ближайших; " +
            "времени, которого здесь нет, не существует — оно занято или вне графика.",
        });
      }

      case "book_tour": {
        const slotStartIso = String(args.slotStartIso ?? "");
        const parentName = String(args.parentName ?? "").trim();
        const childAge = typeof args.childAge === "number" ? args.childAge : undefined;
        const comment = typeof args.comment === "string" ? args.comment : undefined;
        if (!slotStartIso || !parentName) return JSON.stringify({ error: "missing_fields" });

        // Защита от выдуманного времени: бронировать можно только слоты сетки.
        if (!isValidSlotStart(ctx.settings, slotStartIso)) {
          return JSON.stringify({
            error: "not_a_valid_slot",
            hint: "Такого времени нет в графике экскурсий. Вызови get_available_slots и используй startIso ТОЧНО из списка.",
          });
        }
        if (!ctx.calendar) return JSON.stringify({ error: "calendar_not_configured" });

        const bookedLabel = formatSlotLabel(Date.parse(slotStartIso), ctx.settings.utcOffsetMinutes);

        // У одного чата — одна активная запись: то же время = уже записан,
        // новое время = перенос (старое событие удаляется из календаря).
        const existing = await store.findActiveBooking(ctx.phone);
        if (existing && existing.slotStartIso === slotStartIso) {
          return JSON.stringify({ ok: true, alreadyBooked: true, bookedLabel });
        }
        if (existing) {
          await ctx.calendar.cancelEvent(existing.calendarEventId);
          await store.updateBookingStatus(existing.id, "rescheduled");
        }

        const result = await ctx.calendar.bookSlot({
          slotStartIso, phone: ctx.phone, parentName, childAge, comment,
        });
        if (!result.ok) {
          return JSON.stringify({
            error: result.reason,
            hint:
              "Запись НЕ создана — это время реально занято. Вызови get_available_slots " +
              "и предложи клиенту 2–3 других варианта. Не говори «записала».",
          });
        }
        await store.createBooking({
          phone: ctx.phone,
          parentName,
          childAge,
          slotStartIso,
          slotEndIso: result.endIso,
          calendarEventId: result.eventId,
          status: "confirmed",
        });
        await store.updateLead(ctx.phone, { parentName, childAge });
        return JSON.stringify({
          ok: true,
          bookedLabel,
          rescheduledFrom: existing
            ? formatSlotLabel(Date.parse(existing.slotStartIso), ctx.settings.utcOffsetMinutes)
            : undefined,
          note: `Запись создана: ${bookedLabel}. Сообщи это клиенту уверенно, без оговорок про занятость.`,
        });
      }

      case "save_lead_info": {
        await store.updateLead(ctx.phone, {
          parentName: typeof args.parentName === "string" ? args.parentName : undefined,
          childName: typeof args.childName === "string" ? args.childName : undefined,
          childAge: typeof args.childAge === "number" ? args.childAge : undefined,
          preferredDays: typeof args.preferredDays === "string" ? args.preferredDays : undefined,
          notes: typeof args.notes === "string" ? args.notes : undefined,
        });
        return JSON.stringify({ ok: true });
      }

      case "log_unanswered_question": {
        const clientQuestion = String(args.clientQuestion ?? "").trim();
        if (!clientQuestion) return JSON.stringify({ error: "missing_question" });
        await store.logUnanswered(ctx.phone, clientQuestion, "Нет ответа в базе знаний");
        await store.flagConversation(ctx.phone, `Ждёт ответа админа: ${clientQuestion.slice(0, 80)}`);
        await sendAdminAlert(
          ctx,
          `❓ Вопрос без ответа\nОт: +${ctx.phone} (wa.me/${ctx.phone})\nВопрос: ${clientQuestion}\n` +
            "Ответьте из панели → «Неотвеченные»: сообщение уйдёт клиенту, бот продолжит работать.",
        );
        return JSON.stringify({
          ok: true,
          hint:
            `Скажи клиенту дословно: «${ctx.settings.fallbackText}» — и предложи помочь с другими вопросами. ` +
            "Ответ на сам вопрос НЕ выдумывай.",
        });
      }

      case "handoff_to_human": {
        const reason = String(args.reason ?? "не указана");
        const clientQuestion = String(args.clientQuestion ?? "");
        await store.setMode(ctx.phone, "human", `Handoff: ${reason}`);
        await store.logUnanswered(ctx.phone, clientQuestion || reason, reason);
        // На тарифе Inbox алерт дойдёт, только если диалог с номером Даны
        // уже открыт (см. docs/SETUP.md). Флаг в панели ставится всегда.
        await sendAdminAlert(
          ctx,
          `⚠️ Клиенту нужен администратор!\nЧат: +${ctx.phone} (wa.me/${ctx.phone})\n` +
            `Причина: ${reason}${clientQuestion ? `\nВопрос: ${clientQuestion}` : ""}\n` +
            "Бот в этом диалоге поставлен на паузу.",
        );
        return JSON.stringify({
          ok: true,
          hint: "Скажи клиенту, что администратор ответит прямо в этом чате в ближайшее время.",
        });
      }

      default:
        return JSON.stringify({ error: `unknown_tool:${name}` });
    }
  } catch (e) {
    logger.error(`Ошибка инструмента ${name}`, e);
    return JSON.stringify({ error: "tool_failed", detail: String(e) });
  }
}
