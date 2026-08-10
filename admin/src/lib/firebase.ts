import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

// TODO(M4): вставить конфиг веб-приложения из Firebase Console
// (Project settings → General → Your apps → Web). Эти значения не секретны —
// доступ к данным защищают Firestore rules (custom claim `admin`).
const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  appId: "REPLACE_ME",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
// Регион должен совпадать с REGION в functions/src/config.ts
export const functions = getFunctions(app, "europe-west1");
