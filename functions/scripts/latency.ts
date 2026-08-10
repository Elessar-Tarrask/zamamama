/**
 * Замер реальной задержки LLM с боевым промптом бота.
 *
 * Запуск:
 *   AZURE_OPENAI_API_KEY=<key> npx tsx scripts/latency.ts
 *
 * Печатает время ответа gpt-5-mini для разных уровней reasoning_effort —
 * по этим цифрам выбирается значение settings/bot.azureReasoningEffort.
 */
import { AzureOpenAI } from "openai";
import { DEFAULT_SETTINGS, SEED_FAQ } from "../src/seed/seedData";
import { buildSystemPrompt } from "../src/llm/prompt";
import { toolDefinitions } from "../src/llm/tools";
import type { Conversation, FaqItem } from "../src/types";

const USER_MESSAGE = "Здравствуйте! Сколько стоит садик для ребёнка 3 лет?";

async function main(): Promise<void> {
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  if (!apiKey) throw new Error("Нужен AZURE_OPENAI_API_KEY в окружении");

  const conv: Conversation = { mode: "bot", lead: {}, lastInboundAtMs: 0, createdAtMs: 0 };
  const faq: FaqItem[] = SEED_FAQ.filter((f) => f.enabled).map((f, i) => ({ id: String(i), ...f }));
  const system = buildSystemPrompt(DEFAULT_SETTINGS, faq, conv, Date.now());
  console.log(`Промпт: ~${Math.round(system.length / 4)} токенов (${system.length} символов)\n`);

  const client = new AzureOpenAI({
    endpoint: DEFAULT_SETTINGS.azureEndpoint,
    apiKey,
    apiVersion: DEFAULT_SETTINGS.azureApiVersion,
    deployment: DEFAULT_SETTINGS.azureDeployment,
  });

  for (const effort of ["minimal", "low"]) {
    for (let run = 1; run <= 2; run++) {
      const t0 = Date.now();
      try {
        const res = await client.chat.completions.create({
          model: DEFAULT_SETTINGS.azureDeployment,
          messages: [
            { role: "system", content: system },
            { role: "user", content: USER_MESSAGE },
          ],
          tools: toolDefinitions,
          max_completion_tokens: 2000,
          reasoning_effort: effort as "low",
        });
        const ms = Date.now() - t0;
        const msg = res.choices[0]?.message;
        const usage = res.usage as { completion_tokens_details?: { reasoning_tokens?: number } } | undefined;
        console.log(
          `${effort} #${run}: ${ms} мс | reasoning tokens: ${usage?.completion_tokens_details?.reasoning_tokens ?? "?"} | ` +
            `tools: ${msg?.tool_calls?.map((t) => t.function.name).join(",") || "—"} | ` +
            `текст: ${(msg?.content ?? "").replace(/\n/g, " ").slice(0, 70)}`,
        );
      } catch (e) {
        console.log(`${effort} #${run}: ОШИБКА ${String(e).slice(0, 140)}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
