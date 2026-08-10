import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

// Значения-заглушки для пустого документа. Тексты специально пустые:
// канонические тексты живут в functions/src/seed/seedData.ts (npm run seed).
interface Draft {
  botEnabled: boolean;
  systemPrompt: string;
  greetingScript: string;
  agePitches: Record<string, string>;
  fallbackText: string;
  voiceFallbackText: string;
  adminAlertPhone: string;
  pauseOnManualReplyHours: number;
  maxBotMessagesPerHour: number;
  calendarId: string;
  tourSlotMinutes: number;
  minLeadHours: number;
  maxDaysAhead: number;
  tourHours: { startHour: number; endHour: number; days: number[] };
  wazzupChannelId: string;
  azureEndpoint: string;
  azureDeployment: string;
  azureApiVersion: string;
}

const EMPTY: Draft = {
  botEnabled: true,
  systemPrompt: "",
  greetingScript: "",
  agePitches: { "2": "", "3": "", "4": "", "5": "" },
  fallbackText: "",
  voiceFallbackText: "",
  adminAlertPhone: "",
  pauseOnManualReplyHours: 6,
  maxBotMessagesPerHour: 20,
  calendarId: "",
  tourSlotMinutes: 60,
  minLeadHours: 3,
  maxDaysAhead: 14,
  tourHours: { startHour: 9, endHour: 16, days: [1, 2, 3, 4, 5] },
  wazzupChannelId: "",
  azureEndpoint: "",
  azureDeployment: "gpt-5-mini",
  azureApiVersion: "2024-10-21",
};

const DAY_LABELS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

function Text(props: { label: string; value: string; onChange: (v: string) => void; rows?: number; hint?: string }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      {props.rows ? (
        <textarea rows={props.rows} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
      ) : (
        <input type="text" value={props.value} onChange={(e) => props.onChange(e.target.value)} />
      )}
      {props.hint && <small>{props.hint}</small>}
    </label>
  );
}

function Num(props: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="field field-num">
      <span>{props.label}</span>
      <input
        type="number"
        value={Number.isFinite(props.value) ? props.value : 0}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function Settings() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [existed, setExisted] = useState(true);
  const [status, setStatus] = useState("");

  useEffect(() => {
    void getDoc(doc(db, "settings", "bot")).then((snap) => {
      const data = (snap.data() ?? {}) as Partial<Draft>;
      setExisted(snap.exists());
      setDraft({
        ...EMPTY,
        ...data,
        agePitches: { ...EMPTY.agePitches, ...(data.agePitches ?? {}) },
        tourHours: { ...EMPTY.tourHours, ...(data.tourHours ?? {}) },
      });
    });
  }, []);

  if (!draft) return <p className="stub">Загрузка…</p>;

  const set = (patch: Partial<Draft>) => {
    setDraft({ ...draft, ...patch });
    setStatus("");
  };

  async function save() {
    setStatus("Сохраняю…");
    try {
      await setDoc(doc(db, "settings", "bot"), draft, { merge: true });
      setExisted(true);
      setStatus("Сохранено ✓ Применится со следующего сообщения.");
    } catch (e) {
      setStatus(`Ошибка сохранения: ${String(e)}`);
    }
  }

  return (
    <section className="settings">
      <h1>Настройки бота</h1>
      {!existed && (
        <p className="warn">
          Документ <code>settings/bot</code> ещё не создан. Запустите <code>npm run seed</code> в{" "}
          <code>functions/</code>, чтобы залить стартовые тексты, — или заполните и сохраните форму.
        </p>
      )}

      <label className="toggle">
        <input type="checkbox" checked={draft.botEnabled} onChange={(e) => set({ botEnabled: e.target.checked })} />
        <b>Бот включён</b> (глобальный выключатель: выкл — бот молчит во всех диалогах)
      </label>

      <h2>Тексты</h2>
      <Text label="Персона (системный промпт)" rows={6} value={draft.systemPrompt} onChange={(v) => set({ systemPrompt: v })} />
      <Text label="Приветствие (первый ответ клиенту)" rows={3} value={draft.greetingScript} onChange={(v) => set({ greetingScript: v })} />
      {(["2", "3", "4", "5"] as const).map((age) => (
        <Text
          key={age}
          label={`Питч для возраста ${age} (используется дословно)`}
          rows={4}
          value={draft.agePitches[age] ?? ""}
          onChange={(v) => set({ agePitches: { ...draft.agePitches, [age]: v } })}
        />
      ))}
      <Text label="Ответ, когда бот не знает (fallback)" rows={2} value={draft.fallbackText} onChange={(v) => set({ fallbackText: v })} />
      <Text label="Ответ на голосовые/вложения" rows={2} value={draft.voiceFallbackText} onChange={(v) => set({ voiceFallbackText: v })} />

      <h2>Передача администратору</h2>
      <Text
        label="WhatsApp-номер для алертов (без +)"
        value={draft.adminAlertPhone}
        onChange={(v) => set({ adminAlertPhone: v.replace(/\D/g, "") })}
        hint="Например 77011234567. На тарифе Inbox номер должен один раз написать на номер садика."
      />
      <div className="grid">
        <Num label="Пауза бота после ручного ответа, ч" value={draft.pauseOnManualReplyHours} onChange={(v) => set({ pauseOnManualReplyHours: v })} />
        <Num label="Лимит ответов бота в час на диалог" value={draft.maxBotMessagesPerHour} onChange={(v) => set({ maxBotMessagesPerHour: v })} />
      </div>

      <h2>Экскурсии</h2>
      <Text
        label="ID календаря Google"
        value={draft.calendarId}
        onChange={(v) => set({ calendarId: v.trim() })}
        hint="Вида xxx@group.calendar.google.com — см. docs/SETUP.md"
      />
      <div className="grid">
        <Num label="Длина слота, мин" value={draft.tourSlotMinutes} onChange={(v) => set({ tourSlotMinutes: v })} />
        <Num label="Мин. срок до экскурсии, ч" value={draft.minLeadHours} onChange={(v) => set({ minLeadHours: v })} />
        <Num label="Горизонт записи, дней" value={draft.maxDaysAhead} onChange={(v) => set({ maxDaysAhead: v })} />
        <Num label="Начало окна, час" value={draft.tourHours.startHour} onChange={(v) => set({ tourHours: { ...draft.tourHours, startHour: v } })} />
        <Num label="Конец окна, час" value={draft.tourHours.endHour} onChange={(v) => set({ tourHours: { ...draft.tourHours, endHour: v } })} />
      </div>
      <div className="days">
        <span>Дни экскурсий:</span>
        {DAY_LABELS.map((label, i) => {
          const day = i + 1;
          const on = draft.tourHours.days.includes(day);
          return (
            <label key={day} className={on ? "day on" : "day"}>
              <input
                type="checkbox"
                checked={on}
                onChange={() =>
                  set({
                    tourHours: {
                      ...draft.tourHours,
                      days: on
                        ? draft.tourHours.days.filter((d) => d !== day)
                        : [...draft.tourHours.days, day].sort((a, b) => a - b),
                    },
                  })
                }
              />
              {label}
            </label>
          );
        })}
      </div>

      <h2>Интеграции (несекретное)</h2>
      <div className="grid">
        <Text label="Wazzup channelId" value={draft.wazzupChannelId} onChange={(v) => set({ wazzupChannelId: v.trim() })} />
        <Text label="Azure endpoint" value={draft.azureEndpoint} onChange={(v) => set({ azureEndpoint: v.trim() })} />
        <Text label="Azure deployment" value={draft.azureDeployment} onChange={(v) => set({ azureDeployment: v.trim() })} />
        <Text label="Azure api-version" value={draft.azureApiVersion} onChange={(v) => set({ azureApiVersion: v.trim() })} />
      </div>
      <p className="hint">API-ключи здесь не хранятся — они в Firebase Secret Manager (docs/SETUP.md).</p>

      <div className="actions">
        <button className="btn" onClick={() => void save()}>Сохранить</button>
        <span className="status">{status}</span>
      </div>
    </section>
  );
}
