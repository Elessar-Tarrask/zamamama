import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";

// TODO(запуск): вставить конфиг веб-приложения из Firebase Console
// (Project settings → General → Your apps → Web). Эти значения не секретны —
// доступ к данным защищают Firestore rules (custom claim `admin`).
const firebaseConfig = {
  apiKey: "AIzaSyCzYS8eRAF4tBZ5EPcmTJ4YA5tN7N1F3PM",
  authDomain: "bolatbektestproject.firebaseapp.com",
  projectId: "bolatbektestproject",
  appId: "1:314213169973:web:5340c1b8fc767e7ecbea7c",
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
