/**
 * Fábrica de stores.
 * Troque via env STORE=sqlite|postgres.
 * "sqlite" no MVP = arquivo JSON em ./data/store.json (sem dependência nativa).
 * Substitua por better-sqlite3 real quando precisar.
 */

import type { ConversationStore } from "./ConversationStore.js";
import { SqliteStore } from "./sqlite.store.js";
import { PostgresStore } from "./postgres.store.js";

export type { ConversationStore } from "./ConversationStore.js";
export { SqliteStore } from "./sqlite.store.js";
export { PostgresStore } from "./postgres.store.js";

export function createStore(): ConversationStore {
  const kind = (process.env.STORE || "sqlite").toLowerCase();

  switch (kind) {
    case "sqlite":
      console.log("Store: JSON file (./data/store.json)");
      return new SqliteStore();
    case "postgres":
      console.log("Store: Postgres (stub)");
      return new PostgresStore();
    default:
      throw new Error(`STORE desconhecido: ${kind}. Use sqlite|postgres`);
  }
}
