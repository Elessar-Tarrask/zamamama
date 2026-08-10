import { useEffect, useState } from "react";
import {
  addDoc, collection, doc, limit, onSnapshot, orderBy, query, updateDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { adminSendMessage } from "../lib/api";
import { fmtAlmaty, fmtPhone } from "../lib/format";
import type { UnansweredDoc } from "../lib/types";

function UnansweredRow({ item }: { item: UnansweredDoc }) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function sendReply() {
    const text = reply.trim();
    if (!text) return;
    setBusy(true);
    setStatus("");
    try {
      // pauseBot=false: ответ уходит клиенту в WhatsApp, бот продолжает работать
      await adminSendMessage(item.phone, text, false);
      await updateDoc(doc(db, "unanswered", item.id), { resolved: true });
      setStatus("Отправлено клиенту ✓");
    } catch (e) {
      setStatus(`Не отправилось: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function makeFaq() {
    await addDoc(collection(db, "faq"), {
      question: item.question,
      answer: reply.trim() || "ЗАПОЛНИТЬ: впишите ответ и включите вопрос",
      enabled: false,
      order: 900,
    });
    await updateDoc(doc(db, "unanswered", item.id), { resolved: true });
    window.location.hash = "#/faq";
  }

  async function resolve() {
    await updateDoc(doc(db, "unanswered", item.id), { resolved: true });
  }

  return (
    <div className={item.resolved ? "faq-row disabled" : "faq-row"}>
      <div className="faq-head">
        <b className="grow">{item.question || "(без текста)"}</b>
        <span className="muted small">{fmtPhone(item.phone)} · {fmtAlmaty(item.createdAtMs)}</span>
        {!item.resolved && <button className="btn-small" onClick={() => void resolve()}>Скрыть</button>}
      </div>
      {item.context && <p className="muted small">{item.context}</p>}
      {!item.resolved && (
        <>
          <textarea
            rows={2}
            placeholder="Напишите ответ — он уйдёт клиенту в WhatsApp, бот продолжит работать в чате…"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
          <div className="faq-head" style={{ marginTop: 8 }}>
            <button className="btn-small" disabled={busy || !reply.trim()} onClick={() => void sendReply()}>
              {busy ? "…" : "Отправить клиенту"}
            </button>
            <button className="btn-small" onClick={() => void makeFaq()} title="Сохранить как вопрос базы знаний (с этим ответом, если он написан)">
              Сделать FAQ
            </button>
            <span className="status">{status}</span>
          </div>
        </>
      )}
    </div>
  );
}

export function Unanswered() {
  const [items, setItems] = useState<UnansweredDoc[]>([]);
  const [showResolved, setShowResolved] = useState(false);

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "unanswered"), orderBy("createdAtMs", "desc"), limit(200)),
        (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<UnansweredDoc, "id">) }))),
      ),
    [],
  );

  const visible = showResolved ? items : items.filter((i) => !i.resolved);

  return (
    <section>
      <h1>Неотвеченные вопросы</h1>
      <p className="hint">
        Всё, что бот не нашёл в базе знаний. Клиенту он уже написал, что уточнит у администратора
        и вернётся с ответом. Напишите ответ здесь — он уйдёт клиенту в WhatsApp; «Сделать FAQ»
        сохранит его в базу, чтобы в следующий раз бот ответил сам.
      </p>
      <label className="toggle">
        <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
        показывать решённые
      </label>

      <div className="faq-list">
        {visible.map((item) => (
          <UnansweredRow key={item.id} item={item} />
        ))}
        {visible.length === 0 && <p className="stub">Пока пусто — бот справляется сам. 🎉</p>}
      </div>
    </section>
  );
}
