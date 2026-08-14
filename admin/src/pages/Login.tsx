import { useState, type FormEvent } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setError("Не удалось войти. Проверьте email и пароль.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="centered">
      <form className="login-card" onSubmit={onSubmit}>
        <h1>Keystone — панель администратора</h1>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "Входим…" : "Войти"}
        </button>
        <p className="hint">
          Доступ выдаёт разработчик скриптом set-admin (см. docs/SETUP.md).
        </p>
        <p className="credit">
          Разработка — Zhiyentayev Khazretsultan · Telegram{" "}
          <a href="https://t.me/Tarrask" target="_blank" rel="noreferrer">@Tarrask</a>
          <br />© 2026. Все права защищены.
        </p>
      </form>
    </div>
  );
}
