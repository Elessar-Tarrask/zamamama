# Keystone WhatsApp AI Answerer

AI-администратор на WhatsApp для детского сада **Keystone** (Алматы): отвечает родителям по сценариям администратора, уточняет возраст ребёнка, рассказывает про подходящую группу и цены, отвечает на частые вопросы и записывает на экскурсию через Google Calendar.

## Стек

| Компонент | Технология |
|---|---|
| WhatsApp-шлюз | [Wazzup](https://wazzup24.com) (тариф Inbox), за swappable-адаптером |
| Backend | Firebase Cloud Functions v2 (Node 20, TypeScript) + Firestore + Cloud Tasks |
| LLM | Azure OpenAI, деплоймент `gpt-5-mini` (tool calling) |
| Запись на экскурсию | Google Calendar API (сервисный аккаунт) |
| Админ-панель | React + Vite + TypeScript, Firebase Hosting + Firebase Auth |

## Документация

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — архитектура: схема, поток сообщений, модель данных, дизайн LLM-части, безопасность.
- [`docs/IMPLEMENTATION_PLAN.md`](./docs/IMPLEMENTATION_PLAN.md) — план внедрения: этапы M0–M5, что нужно от заказчика, стоимость эксплуатации.
- [`docs/SETUP.md`](./docs/SETUP.md) — пошаговая настройка Firebase, Wazzup, Azure OpenAI и Google Calendar.

## Структура репозитория

```
functions/        Cloud Functions: вебхук Wazzup, обработчик диалогов, LLM, календарь
admin/            Админ-панель (SPA): промпт, FAQ, диалоги, лиды, неотвеченные вопросы
docs/             План внедрения и инструкция по настройке
firebase.json     Конфигурация Firebase (functions + hosting + firestore + emulators)
firestore.rules   Права доступа (только админы с custom claim)
```

## Статус

Весь код, не требующий учёток, готов. Дальше нужен доступ к сервисам (см. «Что нужно от заказчика» в [плане](./docs/IMPLEMENTATION_PLAN.md)).

- [x] **M0** — архитектура, план, каркас проекта
- [x] **M2 (код)** — LLM-мозг: сборка промпта из Firestore, склейка сообщений, инструменты, handoff, лимиты
- [x] **M3 (код)** — слоты и запись в Google Calendar с защитой от двойной брони
- [x] **M4 (код)** — админ-панель: настройки, FAQ, диалоги с ручным перехватом, лиды/записи, неотвеченные
- [x] **Тесты** — 30 юнит-тестов на ядро (`cd functions && npm test`): слоты, промпт, вебхук, процессор
- [x] **M1 — задеплоено и работает**: проект `bolatbektestproject`, функции в europe-west1, вебхук Wazzup подписан (канал 77770351140), панель на https://bolatbektestproject.web.app
- [ ] **Живая проверка M2–M4**: диалог с реального номера, запись в календарь (календарь ещё не расшарен), вычитка текстов Даной
- [ ] **M5** — полировка после запуска: алерты об ошибках, TTL-политики Firestore, ротация ключей, финальная приёмка
