import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth } from "./lib/firebase";
import { Login } from "./pages/Login";
import { Settings } from "./pages/Settings";
import { Faq } from "./pages/Faq";
import { Conversations } from "./pages/Conversations";
import { Leads } from "./pages/Leads";
import { Unanswered } from "./pages/Unanswered";

const PAGES: Record<string, { title: string; render: () => JSX.Element }> = {
  conversations: { title: "Диалоги", render: () => <Conversations /> },
  faq: { title: "FAQ", render: () => <Faq /> },
  settings: { title: "Настройки бота", render: () => <Settings /> },
  leads: { title: "Лиды и записи", render: () => <Leads /> },
  unanswered: { title: "Неотвеченные", render: () => <Unanswered /> },
};

function useHashRoute(): string {
  const read = () => window.location.hash.replace(/^#\/?/, "") || "conversations";
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const route = useHashRoute();

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setReady(true);
      }),
    [],
  );

  if (!ready) return <div className="centered">Загрузка…</div>;
  if (!user) return <Login />;

  const page = PAGES[route] ?? PAGES.conversations;

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="brand">Keystone 🌱</div>
        {Object.entries(PAGES).map(([key, p]) => (
          <a key={key} href={`#/${key}`} className={route === key ? "active" : ""}>
            {p.title}
          </a>
        ))}
        <button className="signout" onClick={() => void signOut(auth)}>
          Выйти ({user.email})
        </button>
      </nav>
      <main className="content">{page.render()}</main>
    </div>
  );
}
