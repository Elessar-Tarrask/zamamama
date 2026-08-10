import { useEffect, useState } from "react";
import {
  collection, limit, limitToLast, onSnapshot, orderBy, query,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { adminSendMessage, adminSetMode } from "../lib/api";
import { fmtAlmaty, fmtPhone } from "../lib/format";
import type { ConvDoc, MessageDoc } from "../lib/types";

function statusOf(c: ConvDoc): { label: string; cls: string } {
  if (c.mode === "human") return { label: "у администратора", cls: "badge human" };
  if ((c.pausedUntilMs ?? 0) > Date.now()) return { label: "пауза", cls: "badge paused" };
  return { label: "бот", cls: "badge bot" };
}

function Transcript({ conv }: { conv: ConvDoc }) {
  const [messages, setMessages] = useState<MessageDoc[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const status = statusOf(conv);

  useEffect(() => {
    setMessages([]);
    return onSnapshot(
      query(
        collection(db, "conversations", conv.id, "messages"),
        orderBy("dateTimeMs"),
        limitToLast(200),
      ),
      (snap) => setMessages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MessageDoc, "id">) }))),
    );
  }, [conv.id]);

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

  async function setMode(mode: "bot" | "human") {
    setError("");
    try {
      await adminSetMode(conv.id, mode);
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
          {conv.mode === "human" || (conv.pausedUntilMs ?? 0) > Date.now() ? (
            <button className="btn-small" onClick={() => void setMode("bot")}>Вернуть боту</button>
          ) : (
            <button className="btn-small" onClick={() => void setMode("human")}>Забрать диалог</button>
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
      </div>

      <div className="composer">
        <textarea
          rows={2}
          placeholder="Ответить как администратор (бот встанет на паузу в этом чате)…"
          value={text}
          onChange={(e) => setText(e.target.value)}
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

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "conversations"), orderBy("lastInboundAtMs", "desc"), limit(100)),
        (snap) => setConvs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ConvDoc, "id">) }))),
      ),
    [],
  );

  const selected = convs.find((c) => c.id === selectedId) ?? null;

  return (
    <section className="split">
      <div className="conv-list">
        <h1>Диалоги</h1>
        {convs.map((c) => {
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
                {fmtPhone(c.id)} · {fmtAlmaty(c.lastInboundAtMs)}
              </div>
              {c.flagReason && <div className="warn small">{c.flagReason}</div>}
            </button>
          );
        })}
        {convs.length === 0 && <p className="stub">Диалогов пока нет.</p>}
      </div>
      <div className="conv-detail">
        {selected ? <Transcript conv={selected} /> : <p className="stub">Выберите диалог слева.</p>}
      </div>
    </section>
  );
}
