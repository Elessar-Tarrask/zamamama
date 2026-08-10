import { describe, expect, it } from "vitest";
import { parseWazzupWebhook } from "../src/providers/wazzup";

describe("parseWazzupWebhook", () => {
  it("нормализует входящее сообщение", () => {
    const [msg] = parseWazzupWebhook({
      messages: [
        {
          messageId: "m1",
          channelId: "ch1",
          chatType: "whatsapp",
          chatId: "77011234567",
          dateTime: "2026-08-10T10:00:00.000Z",
          type: "text",
          text: "Здравствуйте!",
          isEcho: false,
          contact: { name: "Айгерим" },
        },
      ],
    });
    expect(msg).toEqual({
      providerMessageId: "m1",
      channelId: "ch1",
      chatId: "77011234567",
      chatType: "whatsapp",
      type: "text",
      text: "Здравствуйте!",
      contactName: "Айгерим",
      isEcho: false,
      crmMessageId: undefined,
      dateTime: "2026-08-10T10:00:00.000Z",
    });
  });

  it("прокидывает isEcho и crmMessageId", () => {
    const [msg] = parseWazzupWebhook({
      messages: [{ messageId: "m2", chatId: "77011234567", isEcho: true, crmMessageId: "our-id" }],
    });
    expect(msg.isEcho).toBe(true);
    expect(msg.crmMessageId).toBe("our-id");
  });

  it("игнорирует записи без messageId/chatId и посторонние тела", () => {
    expect(parseWazzupWebhook({ messages: [{ chatId: "1" }, { messageId: "x" }] })).toEqual([]);
    expect(parseWazzupWebhook({ statuses: [{ messageId: "s1" }] })).toEqual([]);
    expect(parseWazzupWebhook(undefined)).toEqual([]);
    expect(parseWazzupWebhook("мусор")).toEqual([]);
  });
});
