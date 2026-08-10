// Константы рантайма. Бизнес-настройки (тексты, часы, цены) живут в Firestore
// `settings/bot` и правятся из админ-панели — см. types.ts / seed/seedData.ts.

export const REGION = "europe-west1";

// Максимум итераций tool-loop за один ответ (слоты → бронь → текст и т.п.).
export const MAX_LLM_ITERATIONS = 5;

// Сколько последних сообщений диалога отдаём модели.
export const HISTORY_LIMIT = 30;

// Имя очереди Cloud Tasks для функции processConversation (с регионом,
// иначе admin SDK ищет её в us-central1).
export const PROCESS_QUEUE = `locations/${REGION}/functions/processConversation`;
