import { describe, expect, it } from "vitest";
import { computeFreeSlots, formatSlotLabel, isValidSlotStart } from "../src/calendar";
import { DEFAULT_SETTINGS } from "../src/seed/seedData";
import type { BotSettings } from "../src/types";

const settings: BotSettings = {
  ...DEFAULT_SETTINGS,
  tourHours: { startHour: 9, endHour: 16, days: [1, 2, 3, 4, 5] },
  tourSlotMinutes: 60,
  minLeadHours: 3,
  maxDaysAhead: 7,
  utcOffsetMinutes: 300, // Алматы UTC+5
};

// Понедельник 10 августа 2026, 09:00 по Алматы = 04:00 UTC
const MONDAY_9_LOCAL = Date.UTC(2026, 7, 10, 4, 0, 0);

describe("computeFreeSlots", () => {
  it("отдаёт ПОЛНЫЙ список дня, не раньше minLeadHours", () => {
    const slots = computeFreeSlots(settings, [], MONDAY_9_LOCAL, 5);
    // Сейчас 09:00 + 3 часа → первый возможный слот 12:00; дальше весь день подряд
    expect(slots.map((s) => s.startIso)).toEqual([
      new Date(Date.UTC(2026, 7, 10, 7, 0)).toISOString(), // пн 12:00
      new Date(Date.UTC(2026, 7, 10, 8, 0)).toISOString(), // пн 13:00
      new Date(Date.UTC(2026, 7, 10, 9, 0)).toISOString(), // пн 14:00
      new Date(Date.UTC(2026, 7, 10, 10, 0)).toISOString(), // пн 15:00
      new Date(Date.UTC(2026, 7, 11, 4, 0)).toISOString(), // вт 09:00
    ]);
    expect(slots[0].label).toBe("понедельник, 10 августа, 12:00");
  });

  it("необязательный лимит «в день» продолжает работать, если задан", () => {
    const slots = computeFreeSlots(settings, [], MONDAY_9_LOCAL, 5, 2);
    expect(slots.map((s) => s.label.slice(0, 3) + " " + s.label.slice(-5))).toEqual([
      "пон 12:00", "пон 13:00", "вто 09:00", "вто 10:00", "сре 09:00",
    ]);
  });

  it("пропускает занятые интервалы", () => {
    const busy = [
      // пн 12:00–13:00 местного (07:00–08:00 UTC)
      { startMs: Date.UTC(2026, 7, 10, 7, 0), endMs: Date.UTC(2026, 7, 10, 8, 0) },
    ];
    const slots = computeFreeSlots(settings, busy, MONDAY_9_LOCAL, 2);
    expect(slots.map((s) => s.startIso)).toEqual([
      new Date(Date.UTC(2026, 7, 10, 8, 0)).toISOString(), // пн 13:00
      new Date(Date.UTC(2026, 7, 10, 9, 0)).toISOString(), // пн 14:00
    ]);
  });

  it("перепрыгивает выходные", () => {
    // Пятница 14 августа 2026, 14:00 местного (09:00 UTC): +3ч = 17:00,
    // окно до 16:00 закрыто → следующий слот в понедельник 09:00
    const fridayAfternoon = Date.UTC(2026, 7, 14, 9, 0);
    const slots = computeFreeSlots(settings, [], fridayAfternoon, 1);
    expect(slots[0].startIso).toBe(new Date(Date.UTC(2026, 7, 17, 4, 0)).toISOString());
    expect(slots[0].label).toBe("понедельник, 17 августа, 09:00");
  });

  it("возвращает пусто, если всё занято", () => {
    const busy = [{ startMs: MONDAY_9_LOCAL - 86_400_000, endMs: MONDAY_9_LOCAL + 30 * 86_400_000 }];
    expect(computeFreeSlots(settings, busy, MONDAY_9_LOCAL, 5)).toEqual([]);
  });

  it("не отдаёт больше maxSlots", () => {
    expect(computeFreeSlots(settings, [], MONDAY_9_LOCAL, 3)).toHaveLength(3);
  });
});

describe("isValidSlotStart", () => {
  it("принимает время строго по сетке экскурсий", () => {
    // среда 19.08.2026, 11:00 Алматы = 06:00Z — валидный слот сетки 9–16
    expect(isValidSlotStart(settings, "2026-08-19T06:00:00.000Z")).toBe(true);
    // 16:00 местного — за пределами окна (последний старт 15:00)
    expect(isValidSlotStart(settings, "2026-08-19T11:00:00.000Z")).toBe(false);
    // суббота — выходной
    expect(isValidSlotStart(settings, "2026-08-15T05:00:00.000Z")).toBe(false);
    // не на границе часа
    expect(isValidSlotStart(settings, "2026-08-19T06:30:00.000Z")).toBe(false);
    expect(isValidSlotStart(settings, "мусор")).toBe(false);
  });
});

describe("formatSlotLabel", () => {
  it("форматирует местное время по-русски", () => {
    // Вторник 11 августа 2026, 06:00 UTC = 11:00 в Алматы
    expect(formatSlotLabel(Date.UTC(2026, 7, 11, 6, 0), 300)).toBe("вторник, 11 августа, 11:00");
  });
});
