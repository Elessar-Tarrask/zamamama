import { google, type calendar_v3 } from "googleapis";
import type { BotSettings } from "./types";

export interface TourSlot {
  startIso: string;
  endIso: string;
  /** Человекочитаемо по-русски: «вторник, 12 августа, 11:00». */
  label: string;
}

interface BusyInterval {
  startMs: number;
  endMs: number;
}

const WEEKDAYS_RU = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const MONTHS_RU = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

/** Форматирует UTC-момент в местную (Алматы) подпись слота. */
export function formatSlotLabel(utcMs: number, utcOffsetMinutes: number): string {
  const local = new Date(utcMs + utcOffsetMinutes * 60_000);
  const hh = String(local.getUTCHours()).padStart(2, "0");
  const mm = String(local.getUTCMinutes()).padStart(2, "0");
  return `${WEEKDAYS_RU[local.getUTCDay()]}, ${local.getUTCDate()} ${MONTHS_RU[local.getUTCMonth()]}, ${hh}:${mm}`;
}

/**
 * Чистая функция генерации слотов: сетка рабочих часов минус занятые
 * интервалы. Вынесена из класса, чтобы покрыть юнит-тестами без API.
 */
export function computeFreeSlots(
  settings: BotSettings,
  busy: BusyInterval[],
  nowMs: number,
  maxSlots: number,
  maxPerDay = 2,
): TourSlot[] {
  const offsetMs = settings.utcOffsetMinutes * 60_000;
  const earliestMs = nowMs + settings.minLeadHours * 3_600_000;
  const slots: TourSlot[] = [];

  const nowLocal = new Date(nowMs + offsetMs);
  for (let d = 0; d <= settings.maxDaysAhead && slots.length < maxSlots; d++) {
    const dayLocalMidnightMs = Date.UTC(
      nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), nowLocal.getUTCDate() + d,
    );
    const isoWeekday = ((new Date(dayLocalMidnightMs).getUTCDay() + 6) % 7) + 1; // 1=пн..7=вс
    if (!settings.tourHours.days.includes(isoWeekday)) continue;

    let addedThisDay = 0;
    const startMin = settings.tourHours.startHour * 60;
    const endMin = settings.tourHours.endHour * 60;
    for (let m = startMin; m + settings.tourSlotMinutes <= endMin; m += settings.tourSlotMinutes) {
      if (slots.length >= maxSlots || addedThisDay >= maxPerDay) break;
      const startUtcMs = dayLocalMidnightMs + m * 60_000 - offsetMs;
      const endUtcMs = startUtcMs + settings.tourSlotMinutes * 60_000;
      if (startUtcMs < earliestMs) continue;
      if (busy.some((b) => b.startMs < endUtcMs && startUtcMs < b.endMs)) continue;
      slots.push({
        startIso: new Date(startUtcMs).toISOString(),
        endIso: new Date(endUtcMs).toISOString(),
        label: formatSlotLabel(startUtcMs, settings.utcOffsetMinutes),
      });
      addedThisDay++;
    }
  }
  return slots;
}

export class CalendarService {
  private cal: calendar_v3.Calendar;

  constructor(saKeyJson: string, private readonly settings: BotSettings) {
    const credentials = JSON.parse(saKeyJson);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });
    this.cal = google.calendar({ version: "v3", auth });
  }

  private async queryBusy(fromMs: number, toMs: number): Promise<BusyInterval[]> {
    const res = await this.cal.freebusy.query({
      requestBody: {
        timeMin: new Date(fromMs).toISOString(),
        timeMax: new Date(toMs).toISOString(),
        timeZone: "UTC",
        items: [{ id: this.settings.calendarId }],
      },
    });
    const busy = res.data.calendars?.[this.settings.calendarId]?.busy ?? [];
    return busy
      .filter((b) => b.start && b.end)
      .map((b) => ({ startMs: Date.parse(b.start as string), endMs: Date.parse(b.end as string) }));
  }

  async getFreeSlots(maxSlots = 5, nowMs = Date.now()): Promise<TourSlot[]> {
    const rangeEndMs = nowMs + this.settings.maxDaysAhead * 86_400_000;
    const busy = await this.queryBusy(nowMs, rangeEndMs);
    return computeFreeSlots(this.settings, busy, nowMs, maxSlots);
  }

  /**
   * Бронирует слот с повторной проверкой занятости (защита от двойной записи
   * между «предложил» и «клиент подтвердил»).
   */
  async bookSlot(args: {
    slotStartIso: string;
    phone: string;
    parentName: string;
    childAge?: number;
    comment?: string;
  }): Promise<{ ok: true; eventId: string; endIso: string } | { ok: false; reason: string }> {
    const startMs = Date.parse(args.slotStartIso);
    if (Number.isNaN(startMs)) return { ok: false, reason: "bad_start_time" };
    const endMs = startMs + this.settings.tourSlotMinutes * 60_000;

    const busy = await this.queryBusy(startMs - 1, endMs + 1);
    if (busy.some((b) => b.startMs < endMs && startMs < b.endMs)) {
      return { ok: false, reason: "slot_already_taken" };
    }

    const description = [
      `Телефон: +${args.phone}`,
      args.childAge ? `Возраст ребёнка: ${args.childAge}` : "",
      args.comment ? `Комментарий: ${args.comment}` : "",
      "Запись через WhatsApp-бота.",
    ].filter(Boolean).join("\n");

    const event = await this.cal.events.insert({
      calendarId: this.settings.calendarId,
      requestBody: {
        summary: `Экскурсия: ${args.parentName || `+${args.phone}`}`,
        description,
        start: { dateTime: new Date(startMs).toISOString() },
        end: { dateTime: new Date(endMs).toISOString() },
      },
    });
    return { ok: true, eventId: event.data.id ?? "", endIso: new Date(endMs).toISOString() };
  }
}
