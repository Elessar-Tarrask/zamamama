/**
 * Выдаёт пользователю права администратора панели (custom claim `admin: true`).
 *
 * Запуск:
 *   GOOGLE_CLOUD_PROJECT=<PROJECT_ID> GOOGLE_APPLICATION_CREDENTIALS=<sa.json> \
 *     npm run set-admin -- dana@example.com
 *
 * Пользователь должен уже существовать в Firebase Authentication.
 */
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email || !email.includes("@")) {
    console.error("Использование: npm run set-admin -- admin@example.com");
    process.exit(1);
  }
  initializeApp();
  const user = await getAuth().getUserByEmail(email);
  await getAuth().setCustomUserClaims(user.uid, { admin: true });
  console.log(`Готово: ${email} (${user.uid}) — администратор панели.`);
  console.log("Нужно перезайти в панель, чтобы права подхватились.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
