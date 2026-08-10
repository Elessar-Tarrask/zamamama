/**
 * Первичное наполнение Firestore текстами и настройками.
 *
 * Запуск (см. docs/SETUP.md):
 *   GOOGLE_CLOUD_PROJECT=<PROJECT_ID> GOOGLE_APPLICATION_CREDENTIALS=<sa.json> npm run seed
 *
 * Повторный запуск безопасен: существующие данные не трогаются.
 * `npm run seed -- --force` — перезаписать принудительно.
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { DEFAULT_SETTINGS, SEED_FAQ } from "../src/seed/seedData";

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  initializeApp();
  const db = getFirestore();

  const settingsRef = db.doc("settings/bot");
  const settingsSnap = await settingsRef.get();
  if (settingsSnap.exists && !force) {
    console.log("settings/bot уже существует — пропускаю (--force для перезаписи)");
  } else {
    await settingsRef.set(DEFAULT_SETTINGS);
    console.log("settings/bot записан");
  }

  const faqSnap = await db.collection("faq").limit(1).get();
  if (!faqSnap.empty && !force) {
    console.log("faq уже наполнен — пропускаю (--force для повторного добавления)");
  } else {
    const batch = db.batch();
    for (const item of SEED_FAQ) batch.set(db.collection("faq").doc(), item);
    await batch.commit();
    console.log(`faq: добавлено ${SEED_FAQ.length} вопросов`);
  }

  console.log("Готово. Тексты-черновики и пункты «ЗАПОЛНИТЬ» ждут вычитки Даны в админ-панели.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
