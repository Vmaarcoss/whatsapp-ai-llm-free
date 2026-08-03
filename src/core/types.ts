/**
 * Tipos internos do sistema.
 * Fronteira: tudo que passa entre provider ↔ normalizer ↔ store ↔ engine ↔ router
 * usa estes tipos. Nunca exponha payloads brutos de Baileys/Meta para o core.
 */

export type Role = "user" | "assistant" | "system" | "tool";

export interface Message {
  chatId: string;
  role: Role;
  text: string;
  ts: number;
  /** Nome de tool quando role === "tool" ou assistant tool_use */
  toolName?: string;
  toolUseId?: string;
  /** Conteúdo estruturado de tool_use / tool_result (JSON serializado) */
  toolInput?: Record<string, unknown>;
  toolResult?: string;
}

export interface Lead {
  id: string;
  chatId: string;
  nome: string;
  telefone: string;
  interesse: string;
  createdAt: number;
}

/** Estado de handoff por chat */
export interface HandoffState {
  chatId: string;
  active: boolean;
  motivo?: string;
  since: number;
}

/** Payload normalizado que chega do provider */
export interface IncomingPayload {
  chatId: string;
  text: string;
  fromMe: boolean;
  pushName?: string;
  raw?: unknown;
}
