/**
 * Converte IncomingPayload do provider → Message interna.
 * Fronteira: o core nunca vê o formato bruto do Baileys ou da Meta.
 */

import type { IncomingPayload, Message } from "./types.js";

export function toInternalMessage(payload: IncomingPayload): Message {
  return {
    chatId: payload.chatId,
    role: "user",
    text: payload.text,
    ts: Date.now(),
  };
}
