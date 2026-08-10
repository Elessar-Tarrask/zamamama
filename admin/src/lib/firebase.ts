import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";

// TODO(запуск): вставить конфиг веб-приложения из Firebase Console
// (Project settings → General → Your apps → Web). Эти значения не секретны —
// доступ к данным защищают Firestore rules (custom claim `admin`).
const firebaseConfig = {
  apiKey: "REPLACE_ME", // появится после регистрации веб-приложения в консоли
  authDomain: "bolatbektestproject.firebaseapp.com",
  projectId: "bolatbektestproject",
  appId: "REPLACE_ME", // появится после регистрации веб-приложения в консоли
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
// Регион должен совпадать с REGION в functions/src/config.ts
export const functions = getFunctions(app, "europe-west1");

// Локальная разработка: VITE_USE_EMULATORS=1 npm run dev (+ firebase emulators:start)
if (import.meta.env.VITE_USE_EMULATORS === "1") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
