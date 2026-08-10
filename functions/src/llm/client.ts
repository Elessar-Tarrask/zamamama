import { AzureOpenAI } from "openai";
import type { BotSettings } from "../types";

export function createLlmClient(settings: BotSettings, apiKey: string): AzureOpenAI {
  if (!settings.azureEndpoint) {
    throw new Error("settings/bot.azureEndpoint не заполнен — см. docs/SETUP.md");
  }
  return new AzureOpenAI({
    endpoint: settings.azureEndpoint,
    apiKey,
    apiVersion: settings.azureApiVersion,
    deployment: settings.azureDeployment,
  });
}
