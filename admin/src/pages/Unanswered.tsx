import { useEffect, useState } from "react";
import {
  addDoc, collection, doc, limit, onSnapshot, orderBy, query, updateDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { fmtAlmaty, fmtPhone } from "../lib/format";
import type { UnansweredDoc } from "../lib/types";

export function Unanswered() {
  const [items, setItems] = useState<UnansweredDoc[]>([]);
  const [showResolved, setShowResolved] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "unanswered"), orderBy("createdAtMs", "desc"), limit(200)),
        (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<UnansweredDoc, "id">) }))),
      ),
    [],
  );

  async function makeFaq(item: UnansweredDoc) {
    await addDoc(collection(db, "faq"), {
      question: item.question,
      answer: "ЗАПОЛНИТЬ: впишите ответ и включите вопрос",
      enabled: false,
      order: 900,
    });
    await updateDoc(doc(db, "unanswered", item.id), { resolved: true });
    setStatus("Черновик FAQ создан — впишите ответ на вкладке FAQ.");
    window.location.hash = "#/faq";
  }

  async function resolve(item: UnansweredDoc) {
    await updateDoc(doc(db, "unanswered", item.id), { resolved: true });
  }

  const visible = showResolved ? items : items.filter((i) => !i.resolved);

  return (
    <section>
      <h1>Неотвеченные вопросы</h1>
      <p className="hint">
        Всё, на что бот не смог ответить и передал администратору. Кнопка «Сделать FAQ»
        превращает вопрос в черновик базы знаний — так бот умнеет от реального трафика.
      </p>
      <label className="toggle">
        <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
        показывать решённые
      </label>
      {status && <p className="status">{status}</p>}

      <div className="faq-list">
        {visible.map((item) => (
          <div key={item.id} className={item.resolved ? "faq-row disabled" : "faq-row"}>
            <div className="faq-head">
              <b className="grow">{item.question || "(без текста)"}</b>
              <span className="muted small">{fmtPhone(item.phone)} · {fmtAlmaty(item.createdAtMs)}</span>
              {!item.resolved && (
                <>
                  <button className="btn-small" onClick={() => void makeFaq(item)}>Сделать FAQ</button>
                  <button className="btn-small" onClick={() => void resolve(item)}>Решено</button>
                </>
              )}
            </div>
            {item.context && <p className="muted small">{item.context}</p>}
          </div>
        ))}
        {visible.length === 0 && <p className="stub">Пока пусто — бот справляется сам. 🎉</p>}
      </div>
    </section>
  );
}
