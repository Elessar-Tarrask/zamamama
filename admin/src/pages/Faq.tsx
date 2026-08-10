import { useEffect, useState } from "react";
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { FaqDoc } from "../lib/types";

function FaqRow({ item }: { item: FaqDoc }) {
  const [draft, setDraft] = useState({
    question: item.question,
    answer: item.answer,
    enabled: item.enabled,
    order: item.order,
  });
  const [status, setStatus] = useState("");
  const dirty =
    draft.question !== item.question ||
    draft.answer !== item.answer ||
    draft.enabled !== item.enabled ||
    draft.order !== item.order;

  async function save() {
    setStatus("…");
    try {
      await updateDoc(doc(db, "faq", item.id), draft);
      setStatus("✓");
    } catch (e) {
      setStatus(`Ошибка: ${String(e)}`);
    }
  }

  async function remove() {
    if (!window.confirm(`Удалить вопрос «${item.question || "без названия"}»?`)) return;
    await deleteDoc(doc(db, "faq", item.id));
  }

  const needsFill = draft.answer.startsWith("ЗАПОЛНИТЬ");

  return (
    <div className={draft.enabled ? "faq-row" : "faq-row disabled"}>
      <div className="faq-head">
        <input
          className="faq-q"
          placeholder="Вопрос"
          value={draft.question}
          onChange={(e) => setDraft({ ...draft, question: e.target.value })}
        />
        <label title="Выключенные вопросы бот не видит">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
          />
          вкл
        </label>
        <input
          className="faq-order"
          type="number"
          title="Порядок"
          value={draft.order}
          onChange={(e) => setDraft({ ...draft, order: Number(e.target.value) })}
        />
        <button className="btn-small" disabled={!dirty} onClick={() => void save()}>Сохранить</button>
        <button className="btn-small danger" onClick={() => void remove()}>Удалить</button>
        <span className="status">{status}</span>
      </div>
      <textarea
        rows={3}
        placeholder="Ответ (бот использует его дословно, с эмодзи)"
        value={draft.answer}
        onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
      />
      {needsFill && <small className="warn">Заготовка: впишите настоящий ответ и включите вопрос.</small>}
    </div>
  );
}

export function Faq() {
  const [items, setItems] = useState<FaqDoc[]>([]);

  useEffect(
    () =>
      onSnapshot(collection(db, "faq"), (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FaqDoc, "id">) }));
        list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setItems(list);
      }),
    [],
  );

  async function add() {
    const maxOrder = items.reduce((m, i) => Math.max(m, i.order ?? 0), 0);
    await addDoc(collection(db, "faq"), {
      question: "",
      answer: "",
      enabled: false,
      order: maxOrder + 10,
    });
  }

  return (
    <section>
      <h1>FAQ</h1>
      <p className="hint">
        Бот отвечает этими текстами дословно. Изменения действуют со следующего сообщения.
        Количество вопросов не ограничено.
      </p>
      <button className="btn" onClick={() => void add()}>+ Добавить вопрос</button>
      <div className="faq-list">
        {items.map((item) => (
          <FaqRow key={item.id} item={item} />
        ))}
        {items.length === 0 && <p className="stub">Пусто. Запустите seed или добавьте вопросы вручную.</p>}
      </div>
    </section>
  );
}
