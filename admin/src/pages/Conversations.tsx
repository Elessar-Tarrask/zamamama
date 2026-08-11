import { useEffect, useRef, useState } from "react";
import {
  collection, doc, limit, limitToLast, onSnapshot, orderBy, query, setDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { adminSendMessage, adminSetMode } from "../lib/api";
import { fmtAlmaty, fmtAlmatyTime, fmtPhone } from "../lib/format";
import type { ConvDoc, MessageDoc } from "../lib/types";

function statusOf(c: ConvDoc): { label: string; cls: string; botActive: boolean } {
  if (c.mode === "human") return { label: "⏸ бот на паузе", cls: "badge human", botActive: false };
  if ((c.pausedUntilMs ?? 0) > Date.now())
    return { label: `⏸ пауза до ${fmtAlmatyTime(c.pausedUntilMs as number)}`, cls: "badge paused", botActive: false };
  return { label: "🟢 бот отвечает", cls: "badge bot", botActive: true };
}

/** Глобальный выключатель бота (settings/bot.botEnabled). */
function GlobalToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(
    () =>
      onSnapshot(doc(db, "settings", "bot"), (snap) => {
        setEnabled(snap.get("botEnabled") !== false);
      }),
    [],
  );

  async function toggle(on: boolean) {
    setBusy(true);
    try {
      await setDoc(doc(db, "settings", "bot"), { botEnabled: on }, { merge: true });
    } finally {
      setBusy(false);
    }
  }

  if (enabled === null) return null;
  return (
    <label className={enabled ? "global-toggle on" : "global-toggle off"}>
      <input
        type="checkbox"
        checked={enabled}
        disabled={busy}
        onChange={(e) => void toggle(e.target.checked)}
      />
      {enabled ? "Бот включён (все чаты)" : "БОТ ВЫКЛЮЧЕН — никто не получает ответы"}
    </label>
  );
}

function Transcript({ conv }: { conv: ConvDoc }) {
  const [messages, setMessages] = useState<MessageDoc[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const status = statusOf(conv);

  useEffect(() => {
    setMessages([]);
    return onSnapshot(
      query(
        collection(db, "conversations", conv.id, "messages"),
        orderBy("dateTimeMs"),
        limitToLast(300),
      ),
      (snap) => setMessages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MessageDoc, "id">) }))),
    );
  }, [conv.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function send() {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    setError("");
    try {
      await adminSendMessage(conv.id, t);
      setText("");
    } catch (e) {
      setError(`Не отправилось: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function setBot(active: boolean) {
    setError("");
    try {
      await adminSetMode(conv.id, active ? "bot" : "human");
    } catch (e) {
      setError(`Ошибка: ${String(e)}`);
    }
  }

  const lead = conv.lead ?? {};

  return (
    <div className="transcript">
      <header>
        <div>
          <b>{conv.contactName || fmtPhone(conv.id)}</b> <span className="muted">{fmtPhone(conv.id)}</span>{" "}
          <span className={status.cls}>{status.label}</span>
          {conv.flagReason && <div className="warn small">{conv.flagReason}</div>}
          {(lead.parentName || lead.childAge || lead.childName) && (
            <div className="muted small">
              {lead.parentName && <>Родитель: {lead.parentName} · </>}
              {lead.childName && <>Ребёнок: {lead.childName} · </>}
              {lead.childAge !== undefined && <>Возраст: {lead.childAge} · </>}
              {lead.preferredDays && <>Удобно: {lead.preferredDays}</>}
            </div>
          )}
        </div>
        <div className="actions">
          {status.botActive ? (
            <button className="btn-small pause" onClick={() => void setBot(false)}>
              ⏸ Пауза бота
            </button>
          ) : (
            <button className="btn-small resume" onClick={() => void setBot(true)}>
              ▶ Возобновить бота
            </button>
          )}
        </div>
      </header>

      <div className="messages">
        {messages.map((m) => (
          <div key={m.id} className={m.direction === "in" ? "bubble in" : "bubble out"}>
            <div className="bubble-meta">
              {m.direction === "in" ? "клиент" : m.byBot ? "бот 🤖" : "админ 👤"} · {fmtAlmaty(m.dateTimeMs)}
            </div>
            {m.text}
          </div>
        ))}
        {messages.length === 0 && <p className="stub">Сообщений пока нет.</p>}
        <div ref={endRef} />
      </div>

      <div className="composer">
        <textarea
          rows={2}
          placeholder="Ответить как администратор (бот в этом чате встанет на паузу)…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send();
          }}
        />
        <button className="btn" disabled={busy || !text.trim()} onClick={() => void send()}>
          {busy ? "…" : "Отправить"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function Conversations() {
  const [convs, setConvs] = useState<ConvDoc[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "conversations"), orderBy("lastInboundAtMs", "desc"), limit(200)),
        (snap) => setConvs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ConvDoc, "id">) }))),
      ),
    [],
  );

  const needle = q.trim().toLowerCase();
  const phoneNeedle = needle.replace(/\D/g, "");
  const filtered = convs.filter((c) => {
    if (!needle) return true;
    if (phoneNeedle && c.id.includes(phoneNeedle)) return true;
    return (
      (c.contactName ?? "").toLowerCase().includes(needle) ||
      (c.lead?.parentName ?? "").toLowerCase().includes(needle)
    );
  });

  const selected = convs.find((c) => c.id === selectedId) ?? null;

  return (
    <section className="split">
      <div className="conv-list">
        <h1>Диалоги</h1>
        <GlobalToggle />
        <input
          className="search"
          type="search"
          placeholder="Поиск: телефон или имя…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {filtered.map((c) => {
          const s = statusOf(c);
          return (
            <button
              key={c.id}
              className={c.id === selectedId ? "conv-item active" : "conv-item"}
              onClick={() => setSelectedId(c.id)}
            >
              <div className="conv-title">
                <b>{c.contactName || fmtPhone(c.id)}</b>
                <span className={s.cls}>{s.label}</span>
              </div>
              <div className="muted small">
                {fmtPhone(c.id)}
                {c.lastInboundAtMs ? ` · ${fmtAlmaty(c.lastInboundAtMs)}` : " · клиент ещё не писал"}
              </div>
              {c.flagReason && <div className="warn small">{c.flagReason}</div>}
            </button>
          );
        })}
        {filtered.length === 0 && <p className="stub">Ничего не найдено.</p>}
      </div>
      <div className="conv-detail">
        {selected ? <Transcript conv={selected} /> : <p className="stub">Выберите диалог слева.</p>}
      </div>
    </section>
  );
}
