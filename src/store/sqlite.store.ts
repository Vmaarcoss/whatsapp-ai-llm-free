/**
 * Implementação de store durável (MVP).
 * Usa um arquivo JSON em ./data/store.json — zero dependência nativa.
 * A interface ConversationStore permanece idêntica; troque por better-sqlite3
 * ou Postgres quando precisar de performance / concorrência.
 *
 * Fronteira: o core só fala com ConversationStore.
 */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ConversationStore } from "./ConversationStore.js";
import type { Message, Lead, HandoffState } from "../core/types.js";

const DATA_PATH = path.resolve(process.cwd(), "data", "store.json");

interface DbShape {
  messages: Array<Message & { id?: number }>;
  handoffs: Record<string, HandoffState>;
  leads: Lead[];
}

function emptyDb(): DbShape {
  return { messages: [], handoffs: {}, leads: [] };
}

export class SqliteStore implements ConversationStore {
  private db: DbShape;
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(filePath = DATA_PATH) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (fs.existsSync(filePath)) {
      try {
        this.db = JSON.parse(fs.readFileSync(filePath, "utf8")) as DbShape;
      } catch {
        this.db = emptyDb();
      }
    } else {
      this.db = emptyDb();
    }
    // flush periódico
    setInterval(() => this.flush(filePath), 2000).unref?.();
  }

  private scheduleSave(filePath = DATA_PATH): void {
    this.dirty = true;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush(filePath);
    }, 300);
  }

  private flush(filePath = DATA_PATH): void {
    if (!this.dirty) return;
    this.dirty = false;
    fs.writeFileSync(filePath, JSON.stringify(this.db, null, 2), "utf8");
  }

  async getHistory(chatId: string, limit = 40): Promise<Message[]> {
    return this.db.messages
      .filter((m) => m.chatId === chatId)
      .sort((a, b) => a.ts - b.ts)
      .slice(-limit);
  }

  async append(chatId: string, msg: Omit<Message, "chatId">): Promise<void> {
    this.db.messages.push({ chatId, ...msg });
    // limita histórico global a 5000 msgs no MVP
    if (this.db.messages.length > 5000) {
      this.db.messages = this.db.messages.slice(-4000);
    }
    this.scheduleSave();
  }

  async getHandoff(chatId: string): Promise<HandoffState | null> {
    return this.db.handoffs[chatId] ?? null;
  }

  async setHandoff(chatId: string, active: boolean, motivo?: string): Promise<void> {
    this.db.handoffs[chatId] = {
      chatId,
      active,
      motivo,
      since: Date.now(),
    };
    this.scheduleSave();
  }

  async saveLead(lead: Omit<Lead, "id" | "createdAt">): Promise<Lead> {
    const full: Lead = {
      id: randomUUID(),
      ...lead,
      createdAt: Date.now(),
    };
    this.db.leads.push(full);
    this.scheduleSave();
    return full;
  }

  async listLeads(limit = 50): Promise<Lead[]> {
    return this.db.leads
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }
}
