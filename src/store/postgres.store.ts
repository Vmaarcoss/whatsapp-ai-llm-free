/**
 * Stub Postgres — pronto para ativar depois.
 * Substitua pela implementação real com pg ou drizzle quando precisar de multi-instância.
 */

import type { ConversationStore } from "./ConversationStore.js";
import type { Message, Lead, HandoffState } from "../core/types.js";

export class PostgresStore implements ConversationStore {
  constructor() {
    // TODO: conectar com process.env.DATABASE_URL
    console.warn(
      "PostgresStore: stub ativo. Implemente a conexão real ou use STORE=sqlite."
    );
  }

  async getHistory(_chatId: string, _limit?: number): Promise<Message[]> {
    throw new Error("PostgresStore não implementado. Use STORE=sqlite no MVP.");
  }

  async append(_chatId: string, _msg: Omit<Message, "chatId">): Promise<void> {
    throw new Error("PostgresStore não implementado.");
  }

  async getHandoff(_chatId: string): Promise<HandoffState | null> {
    throw new Error("PostgresStore não implementado.");
  }

  async setHandoff(_chatId: string, _active: boolean, _motivo?: string): Promise<void> {
    throw new Error("PostgresStore não implementado.");
  }

  async saveLead(_lead: Omit<Lead, "id" | "createdAt">): Promise<Lead> {
    throw new Error("PostgresStore não implementado.");
  }

  async listLeads(_limit?: number): Promise<Lead[]> {
    throw new Error("PostgresStore não implementado.");
  }
}
