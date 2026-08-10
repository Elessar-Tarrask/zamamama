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

- [x] **M0** — архитектура, план, каркас проекта (этот коммит)
- [ ] **M1** — эхо-бот: вебхук + ответ через Wazzup *(нужны ключ Wazzup и проект Firebase)*
- [ ] **M2** — LLM-мозг: сценарии Даны, FAQ, память диалога, handoff
- [ ] **M3** — запись на экскурсию через Google Calendar
- [ ] **M4** — админ-панель (6 страниц)
- [ ] **M5** — hardening: лимиты, алерты, тесты, деплой-документация
