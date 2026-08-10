import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { randomUUID } from "node:crypto";
import { logger } from "firebase-functions";
import type { CalendarService } from "../calendar";
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
        "Получить ближайшие свободные слоты для экскурсии по садику. " +
        "Вызывай, когда клиент хочет прийти на экскурсию, ПЕРЕД тем как предлагать время.",
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
            description: "startIso выбранного слота (ISO 8601, как вернул get_available_slots)",
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
      name: "handoff_to_human",
      description:
        "Передать диалог администратору: вопроса нет в базе знаний, клиент просит человека, " +
        "жалоба или нестандартная ситуация. После вызова бот замолкает в этом диалоге.",
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
        const slots = await ctx.calendar.getFreeSlots(5);
        if (slots.length === 0) {
          return JSON.stringify({
            slots: [],
            hint: "Свободных слотов в ближайшие дни нет — предложи передать вопрос администратору.",
          });
        }
        return JSON.stringify({ slots });
      }

      case "book_tour": {
        if (!ctx.calendar) return JSON.stringify({ error: "calendar_not_configured" });
        const slotStartIso = String(args.slotStartIso ?? "");
        const parentName = String(args.parentName ?? "").trim();
        const childAge = typeof args.childAge === "number" ? args.childAge : undefined;
        const comment = typeof args.comment === "string" ? args.comment : undefined;
        if (!slotStartIso || !parentName) return JSON.stringify({ error: "missing_fields" });

        const result = await ctx.calendar.bookSlot({
          slotStartIso, phone: ctx.phone, parentName, childAge, comment,
        });
        if (!result.ok) {
          return JSON.stringify({
            error: result.reason,
            hint: "Слот уже занят — вызови get_available_slots и предложи другие варианты.",
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
        return JSON.stringify({ ok: true, bookedStartIso: slotStartIso });
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

      case "handoff_to_human": {
        const reason = String(args.reason ?? "не указана");
        const clientQuestion = String(args.clientQuestion ?? "");
        await store.setMode(ctx.phone, "human", `Handoff: ${reason}`);
        await store.logUnanswered(ctx.phone, clientQuestion || reason, reason);

        // Алерт Дане в WhatsApp — best-effort: на тарифе Inbox дойдёт, только
        // если диалог с её номером уже открыт (см. docs/SETUP.md). Флаг в
        // панели ставится в любом случае.
        if (ctx.settings.adminAlertPhone) {
          try {
            const crmMessageId = randomUUID();
            await store.recordSentMessage(crmMessageId, ctx.settings.adminAlertPhone, true);
            const { providerMessageId } = await ctx.provider.sendText(
              ctx.settings.adminAlertPhone,
              `⚠️ Клиенту нужен администратор!\nЧат: +${ctx.phone} (wa.me/${ctx.phone})\n` +
                `Причина: ${reason}${clientQuestion ? `\nВопрос: ${clientQuestion}` : ""}\n` +
                "Бот в этом диалоге поставлен на паузу.",
              crmMessageId,
            );
            if (providerMessageId) {
              await store.recordSentMessage(providerMessageId, ctx.settings.adminAlertPhone, true);
            }
          } catch (e) {
            logger.warn("Не удалось отправить WhatsApp-алерт администратору", e);
          }
        }
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
