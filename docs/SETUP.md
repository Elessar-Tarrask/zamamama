# Настройка окружения

Пошаговая инструкция подключения всех сервисов. Выполняется один раз при развёртывании (этапы M1–M3).

## 1. Firebase

1. Создайте проект на [console.firebase.google.com](https://console.firebase.google.com) (например, `keystone-whatsapp-bot`).
2. Переключите тариф на **Blaze** (pay-as-you-go). Без него Cloud Functions не могут делать исходящие HTTP-запросы (Wazzup, Azure, Google Calendar). При нашем трафике фактический счёт ≈ $0–5/мес.
3. Включите **Firestore** (Native mode, регион `europe-west1` — тот же, что у функций) и **Authentication** → Sign-in method → Email/Password.
4. Локально: `npm i -g firebase-tools`, затем `firebase login` и в корне репозитория пропишите проект:
   ```bash
   firebase use --add   # выбрать проект, алиас default
   ```
   (файл `.firebaserc` обновится автоматически).
5. Установите зависимости и соберите функции:
   ```bash
   cd functions && npm install && npm run build
   ```

### Секреты

```bash
firebase functions:secrets:set WAZZUP_API_KEY        # ключ из кабинета Wazzup
firebase functions:secrets:set AZURE_OPENAI_API_KEY  # ключ Azure OpenAI
firebase functions:secrets:set GCAL_SA_KEY           # весь JSON сервисного аккаунта одной строкой
firebase functions:secrets:set WEBHOOK_TOKEN         # придумайте длинную случайную строку: openssl rand -hex 24
```

### Деплой

```bash
firebase deploy --only functions,firestore
# панель (после M4): cd admin && npm install && npm run build && firebase deploy --only hosting
```

После деплоя URL вебхука: `https://europe-west1-<PROJECT_ID>.cloudfunctions.net/wazzupWebhook?token=<WEBHOOK_TOKEN>`.

### Первичное наполнение данных (seed)

Скрипт заливает в Firestore тексты Даны (приветствие, питчи по возрастам, стартовые FAQ) и настройки по умолчанию:

```bash
cd functions
GOOGLE_CLOUD_PROJECT=<PROJECT_ID> GOOGLE_APPLICATION_CREDENTIALS=<путь-к-admin-sa.json> npm run seed
```

Скрипт не перезаписывает существующие данные (повторный запуск безопасен); `npm run seed -- --force` — принудительно.

### Права админов панели

```bash
cd functions
GOOGLE_CLOUD_PROJECT=<PROJECT_ID> GOOGLE_APPLICATION_CREDENTIALS=<путь-к-admin-sa.json> \
  npm run set-admin -- dana@example.com
```

Пользователь должен сначала зарегистрироваться в панели (или создайте его в Firebase Console → Authentication).

## 2. Wazzup

1. Зарегистрируйтесь на [wazzup24.com](https://wazzup24.com), добавьте канал WhatsApp и подключите номер садика по QR-коду (телефон должен оставаться онлайн). Тариф **Inbox** (12 000 ₸/мес) достаточен для старта.
2. В кабинете: Настройки → «Интеграция по API» → скопируйте **API-ключ**. `channelId` виден в настройках канала (или запросом `GET https://api.wazzup24.com/v3/channels`).
3. `channelId` внесите в Firestore `settings/bot.wazzupChannelId` (через панель или при seed).
4. Подпишите вебхук (после деплоя функций):
   ```bash
   curl -X PATCH https://api.wazzup24.com/v3/webhooks \
     -H "Authorization: Bearer <WAZZUP_API_KEY>" \
     -H "Content-Type: application/json" \
     -d '{
       "webhooksUri": "https://europe-west1-<PROJECT_ID>.cloudfunctions.net/wazzupWebhook?token=<WEBHOOK_TOKEN>",
       "subscriptions": { "messagesAndStatuses": true }
     }'
   ```
   Wazzup сразу пришлёт тестовый POST `{"test": true}` — функция ответит 200, подписка активируется.
5. **Алерты Дане**: на тарифе Inbox бот не может писать первым, поэтому пусть Дана один раз напишет что-нибудь с личного номера на номер садика — диалог откроется, и алерты будут доходить. (Либо тариф Pro.)

## 3. Azure OpenAI

1. В Azure AI Foundry разверните деплоймент модели **gpt-5-mini** (имя деплоймента запомните).
2. Понадобятся: endpoint (`https://<resource>.openai.azure.com`), API-ключ (→ в секрет `AZURE_OPENAI_API_KEY`), имя деплоймента и версия API (например `2024-10-21`).
3. Endpoint, деплоймент и версию внесите в `settings/bot` (`azureEndpoint`, `azureDeployment`, `azureApiVersion`) — они не секретны и правятся из панели.

## 4. Google Calendar

1. В Google Cloud Console (можно в том же проекте Firebase) включите **Google Calendar API**.
2. Создайте **сервисный аккаунт** (IAM → Service Accounts), выпустите JSON-ключ → положите его содержимое в секрет `GCAL_SA_KEY`. Роли в проекте не нужны — доступ даётся шарингом календаря.
3. В Google Calendar того аккаунта, где будут жить экскурсии, создайте отдельный календарь «Экскурсии Keystone». Настройки календаря → «Доступ для отдельных пользователей» → добавьте **email сервисного аккаунта** (`...@...iam.gserviceaccount.com`) с правом **«Внесение изменений в мероприятия»**.
4. ID календаря (Настройки → «Интеграция календаря», вида `xxx@group.calendar.google.com`) внесите в `settings/bot.calendarId`.
5. Часы экскурсий и длина слота — `settings/bot.tourHours` / `tourSlotMinutes` (по умолчанию пн–пт 09:00–16:00, 60 мин).

## 5. Локальная разработка

Проверенный поток (реальные учётки не нужны, `demo-` проект работает офлайн):

```bash
cd functions && npm install && npm run build
cp .secret.local.example .secret.local   # фиктивные секреты для эмулятора
cd ..
firebase emulators:start --only functions,firestore,tasks --project demo-keystone
```

В соседнем терминале — залить тексты в эмуляторный Firestore и проверить цикл:

```bash
cd functions
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GOOGLE_CLOUD_PROJECT=demo-keystone npm run seed
```

Юнит-тесты ядра (слоты, промпт, вебхук, процессор): `cd functions && npm test`.

Симуляция входящего сообщения (payload как у Wazzup):

```bash
curl -X POST "http://127.0.0.1:5001/demo-keystone/europe-west1/wazzupWebhook?token=dev" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{
      "messageId": "test-001",
      "channelId": "dev-channel",
      "chatType": "whatsapp",
      "chatId": "77011234567",
      "dateTime": "2026-01-01T10:00:00.000Z",
      "type": "text",
      "text": "Здравствуйте! Сколько стоит садик?",
      "isEcho": false,
      "contact": { "name": "Тест" }
    }]
  }'
```

В эмуляторе секрет `WEBHOOK_TOKEN` можно задать через `functions/.secret.local` (файл в .gitignore):

```
WEBHOOK_TOKEN=dev
WAZZUP_API_KEY=dev
AZURE_OPENAI_API_KEY=<реальный ключ, если тестируете LLM>
GCAL_SA_KEY={}
```

## 6. Чек-лист готовности к запуску

- [ ] Blaze включён, функции задеплоены, `{"test":true}` на вебхук возвращает 200
- [ ] Секреты установлены (4 шт.)
- [ ] `settings/bot` заполнен: channelId, azure*, calendarId, номер Даны для алертов
- [ ] Seed выполнен, тексты вычитаны Даной (все «ЗАПОЛНИТЬ» заменены)
- [ ] Календарь расшарен на сервисный аккаунт, тестовая бронь появляется
- [ ] Админы получили claim и входят в панель
- [ ] Тестовый номер прошёл полный сценарий (возраст → питч → FAQ → запись → handoff)
