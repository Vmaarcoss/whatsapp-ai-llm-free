/**
 * Interface do store de conversas + mini-CRM.
 * Fronteira: troque SQLite ↔ Postgres (ou Redis) sem tocar no core.
 */

import type { Message, Lead, HandoffState } from "../core/types.js";

export interface ConversationStore {
  /** Histórico ordenado por ts (mais antigo primeiro) */
  getHistory(chatId: string, limit?: number): Promise<Message[]>;

  /** Acrescenta uma mensagem (user, assistant ou tool) */
  append(chatId: string, msg: Omit<Message, "chatId">): Promise<void>;

  /** Handoff */
  getHandoff(chatId: string): Promise<HandoffState | null>;
  setHandoff(chatId: string, active: boolean, motivo?: string): Promise<void>;

  /** Mini-CRM de leads */
  saveLead(lead: Omit<Lead, "id" | "createdAt">): Promise<Lead>;
  listLeads(limit?: number): Promise<Lead[]>;
}