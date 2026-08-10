import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../lib/firebase";
import { fmtAlmaty, fmtPhone } from "../lib/format";
import type { BookingDoc, ConvDoc } from "../lib/types";

export function Leads() {
  const [convs, setConvs] = useState<ConvDoc[]>([]);
  const [bookings, setBookings] = useState<BookingDoc[]>([]);

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "conversations"), orderBy("lastInboundAtMs", "desc"), limit(200)),
        (snap) => setConvs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ConvDoc, "id">) }))),
      ),
    [],
  );

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "bookings"), orderBy("createdAtMs", "desc"), limit(100)),
        (snap) => setBookings(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BookingDoc, "id">) }))),
      ),
    [],
  );

  const leads = convs.filter(
    (c) => c.lead && (c.lead.parentName || c.lead.childName || c.lead.childAge !== undefined),
  );

  return (
    <section>
      <h1>Лиды и записи</h1>

      <h2>Записи на экскурсии</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Когда экскурсия</th><th>Родитель</th><th>Возраст</th><th>Телефон</th><th>Статус</th><th>Создана</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((b) => (
            <tr key={b.id}>
              <td>{fmtAlmaty(b.slotStartIso)}</td>
              <td>{b.parentName || "—"}</td>
              <td>{b.childAge ?? "—"}</td>
              <td>{fmtPhone(b.phone)}</td>
              <td>{b.status}</td>
              <td>{fmtAlmaty(b.createdAtMs)}</td>
            </tr>
          ))}
          {bookings.length === 0 && (
            <tr><td colSpan={6} className="stub">Записей пока нет.</td></tr>
          )}
        </tbody>
      </table>

      <h2>Лиды</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Родитель</th><th>Ребёнок</th><th>Возраст</th><th>Телефон</th><th>Удобные дни</th><th>Заметки</th><th>Последнее сообщение</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((c) => (
            <tr key={c.id}>
              <td>{c.lead?.parentName || c.contactName || "—"}</td>
              <td>{c.lead?.childName || "—"}</td>
              <td>{c.lead?.childAge ?? "—"}</td>
              <td>{fmtPhone(c.id)}</td>
              <td>{c.lead?.preferredDays || "—"}</td>
              <td>{c.lead?.notes || "—"}</td>
              <td>{fmtAlmaty(c.lastInboundAtMs)}</td>
            </tr>
          ))}
          {leads.length === 0 && (
            <tr><td colSpan={7} className="stub">Бот ещё не собрал данных о лидах.</td></tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
