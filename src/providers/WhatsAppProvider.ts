/**
 * Interface do provedor de WhatsApp.
 * Fronteira: troque a implementação (Baileys ↔ Meta Cloud API) sem tocar no core.
 * O core só conhece onMessage + send.
 */

import type { IncomingPayload } from "../core/types.js";

export type MessageHandler = (payload: IncomingPayload) => Promise<void>;

export interface WhatsAppProvider {
  /** Registra o handler que recebe mensagens normalizadas */
  onMessage(handler: MessageHandler): void;

  /** Envia texto puro para um chatId (jid no Baileys, wa_id na Meta) */
  send(to: string, text: string): Promise<void>;

  /** Inicia a conexão / autenticação. Idempotente. */
  start(): Promise<void>;

  /** Encerra graciosamente */
  stop(): Promise<void>;
}
