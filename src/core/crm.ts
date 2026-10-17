/**
 * Mini-CRM helpers: CSV local + notificação ao dono.
 * Fronteira isolada — engine chama estas funções, não sabe de planilha/WhatsApp.
 */

import fs from "node:fs";
import path from "node:path";
import { businessConfig } from "../config/business.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const LEADS_CSV = path.join(DATA_DIR, "leads.csv");
const AGENDAMENTOS_CSV = path.join(DATA_DIR, "agendamentos.csv");

function ensureDataDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function csvEscape(value: string): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function appendCsv(file: string, header: string, columns: string[]): void {
  ensureDataDir();
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, header + "\n", "utf8");
  }
  fs.appendFileSync(file, columns.map(csvEscape).join(",") + "\n", "utf8");
}

export interface LeadRow {
  chatId: string;
  nome: string;
  telefone: string;
  interesse: string;
}

export interface AgendamentoRow {
  chatId: string;
  nome: string;
  telefone: string;
  servico: string;
  dataHora: string;
  observacao?: string;
}

export function saveLeadToCsv(row: LeadRow): void {
  appendCsv(
    LEADS_CSV,
    "data,nome,telefone,interesse,chatId",
    [
      new Date().toISOString(),
      row.nome,
      row.telefone,
      row.interesse,
      row.chatId,
    ]
  );
  console.log(`[CRM] Lead → ${LEADS_CSV}`);
}

export function saveAgendamentoToCsv(row: AgendamentoRow): void {
  appendCsv(
    AGENDAMENTOS_CSV,
    "data_registro,nome,telefone,servico,data_hora,observacao,chatId",
    [
      new Date().toISOString(),
      row.nome,
      row.telefone,
      row.servico,
      row.dataHora,
      row.observacao ?? "",
      row.chatId,
    ]
  );
  console.log(`[CRM] Agendamento → ${AGENDAMENTOS_CSV}`);
}

/** Resolve telefone do dono: env tem prioridade sobre business.ts */
export function getOwnerPhone(): string | undefined {
  const fromEnv = process.env.OWNER_PHONE?.replace(/\D/g, "");
  if (fromEnv) return fromEnv;
  return businessConfig.ownerPhone?.replace(/\D/g, "") || undefined;
}

export type NotifyOwnerFn = (text: string) => Promise<void>;
