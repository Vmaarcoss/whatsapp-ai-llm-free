/**
 * Camada de IA — Groq (OpenAI-compatible) com function calling.
 * Tools: escalar_para_humano | registrar_lead | agendar_consulta
 * Mini-CRM: CSV + notificação ao dono (via callback).
 */

import OpenAI from "openai";
import type { Message } from "./types.js";
import type { ConversationStore } from "../store/ConversationStore.js";
import { businessConfig } from "../config/business.js";
import {
  saveLeadToCsv,
  saveAgendamentoToCsv,
  type NotifyOwnerFn,
} from "./crm.js";

const MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

export interface EngineResult {
  replyText: string | null;
  handoff: boolean;
  handoffMotivo?: string;
}

export interface EngineOptions {
  /** Envia WhatsApp para o dono (wiring no Router/index) */
  notifyOwner?: NotifyOwnerFn;
}

const ALL_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "escalar_para_humano",
      description:
        "Transfere a conversa para um atendente humano. Use quando as regras de escalonamento se aplicarem ou o cliente pedir explicitamente.",
      parameters: {
        type: "object",
        properties: {
          motivo: {
            type: "string",
            description: "Motivo curto do escalonamento",
          },
        },
        required: ["motivo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "registrar_lead",
      description:
        "Registra um lead/potencial cliente no mini-CRM quando ele demonstra interesse e fornece nome + telefone.",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome do lead" },
          telefone: { type: "string", description: "Telefone com DDD" },
          interesse: { type: "string", description: "O que o lead busca" },
        },
        required: ["nome", "telefone", "interesse"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agendar_consulta",
      description:
        "Agenda uma consulta/serviço quando o cliente informar nome, telefone, serviço e data/horário desejados.",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome do cliente" },
          telefone: { type: "string", description: "Telefone com DDD" },
          servico: {
            type: "string",
            description: "Tipo de serviço (ex.: visita técnica, instalação)",
          },
          dataHora: {
            type: "string",
            description:
              "Data e horário desejados (ex.: quinta 15h, 07/08/2026 14:00)",
          },
          observacao: {
            type: "string",
            description: "Observação opcional do cliente",
          },
        },
        required: ["nome", "telefone", "servico", "dataHora"],
      },
    },
  },
];

function buildSystemPrompt(): string {
  const faqBlock = businessConfig.faq
    .map((f) => `P: ${f.pergunta}\nR: ${f.resposta}`)
    .join("\n\n");

  const regras = businessConfig.regrasEscalonamento
    .map((r) => `- ${r}`)
    .join("\n");

  return `Você é o assistente virtual de ${businessConfig.nomeNegocio}.

Tom de voz: ${businessConfig.tomDeVoz}

Horário de atendimento: ${businessConfig.horarioAtendimento}

=== FAQ (use como fonte prioritária) ===
${faqBlock}

=== Regras de escalonamento (chame a tool escalar_para_humano) ===
${regras}

Instruções gerais:
- Responda em português brasileiro, de forma clara e curta (WhatsApp).
- Não invente dados que não estejam no FAQ.
- Se o cliente quiser só informação de interesse (sem agendar), colete nome + telefone + interesse e use registrar_lead.
- Se o cliente quiser marcar horário, colete nome + telefone + serviço + data/horário e use agendar_consulta.
- Quando escalar, chame a tool; não invente que já transferiu.
- Confirme os dados antes de chamar a tool de agendamento, se estiver incompleto.
`;
}

function toOpenAIMessages(
  history: Message[]
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const result: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt() },
  ];

  for (const m of history) {
    if (m.role === "user") {
      result.push({ role: "user", content: m.text });
    } else if (m.role === "assistant") {
      if (m.toolUseId && m.toolName && m.toolInput) {
        result.push({
          role: "assistant",
          content: m.text || null,
          tool_calls: [
            {
              id: m.toolUseId,
              type: "function",
              function: {
                name: m.toolName,
                arguments: JSON.stringify(m.toolInput),
              },
            },
          ],
        });
      } else {
        result.push({ role: "assistant", content: m.text });
      }
    } else if (m.role === "tool" && m.toolUseId) {
      result.push({
        role: "tool",
        tool_call_id: m.toolUseId,
        content: m.toolResult ?? m.text,
      });
    }
  }

  return result;
}

export class Engine {
  private client: OpenAI;
  private store: ConversationStore;
  private notifyOwner?: NotifyOwnerFn;

  constructor(store: ConversationStore, options: EngineOptions = {}) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error(
        "GROQ_API_KEY não definida. Configure no .env antes de iniciar."
      );
    }
    this.client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    });
    this.store = store;
    this.notifyOwner = options.notifyOwner;
  }

  async process(chatId: string, userMessage: Message): Promise<EngineResult> {
    await this.store.append(chatId, userMessage);

    const history = await this.store.getHistory(chatId, 40);
    let messages = toOpenAIMessages(history);

    const enabledTools = ALL_TOOLS.filter((t) => {
      if (t.type === "function") {
        return businessConfig.toolsHabilitadas.includes(
          t.function.name as (typeof businessConfig.toolsHabilitadas)[number]
        );
      }
      return false;
    });

    let handoff = false;
    let handoffMotivo: string | undefined;
    let finalText: string | null = null;

    let turns = 0;
    const MAX_TURNS = 5;

    while (turns < MAX_TURNS) {
      turns++;

      const response = await this.client.chat.completions.create({
        model: MODEL,
        messages,
        tools: enabledTools.length > 0 ? enabledTools : undefined,
        tool_choice: enabledTools.length > 0 ? "auto" : undefined,
        max_tokens: 1024,
        temperature: 0.7,
      });

      const choice = response.choices[0];
      if (!choice) break;

      if (choice.finish_reason === "tool_calls") {
        const assistantMsg = choice.message;
        const toolCalls = assistantMsg.tool_calls ?? [];
        const assistantText = assistantMsg.content ?? "";

        const functionCalls = toolCalls.filter(
          (tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageToolCall & {
            type: "function";
            function: { name: string; arguments: string };
          } => tc.type === "function"
        );

        const toolResultsForNextTurn: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
          [];

        for (const tc of functionCalls) {
          let input: Record<string, unknown> = {};
          try {
            input = JSON.parse(tc.function.arguments);
          } catch {
            input = {};
          }

          await this.store.append(chatId, {
            role: "assistant",
            text: assistantText,
            ts: Date.now(),
            toolName: tc.function.name,
            toolUseId: tc.id,
            toolInput: input,
          });

          let resultContent = "ok";

          if (tc.function.name === "escalar_para_humano") {
            handoff = true;
            handoffMotivo = String(input.motivo ?? "solicitado pelo modelo");
            resultContent = JSON.stringify({
              status: "handoff_iniciado",
              motivo: handoffMotivo,
            });
          } else if (tc.function.name === "registrar_lead") {
            resultContent = await this.handleRegistrarLead(chatId, input);
          } else if (tc.function.name === "agendar_consulta") {
            resultContent = await this.handleAgendarConsulta(chatId, input);
          } else {
            resultContent = JSON.stringify({
              status: "tool_desconhecida",
              name: tc.function.name,
            });
          }

          await this.store.append(chatId, {
            role: "tool",
            text: resultContent,
            ts: Date.now(),
            toolUseId: tc.id,
            toolName: tc.function.name,
            toolResult: resultContent,
          });

          toolResultsForNextTurn.push({
            role: "tool",
            tool_call_id: tc.id,
            content: resultContent,
          });
        }

        if (handoff) {
          finalText = null;
          break;
        }

        messages.push(assistantMsg);
        messages.push(...toolResultsForNextTurn);
      } else {
        finalText = choice.message.content ?? null;
        if (finalText) {
          await this.store.append(chatId, {
            role: "assistant",
            text: finalText,
            ts: Date.now(),
          });
        }
        break;
      }
    }

    return { replyText: finalText, handoff, handoffMotivo };
  }

  private async handleRegistrarLead(
    chatId: string,
    input: Record<string, unknown>
  ): Promise<string> {
    try {
      const nome = String(input.nome ?? "");
      const telefone = String(input.telefone ?? "");
      const interesse = String(input.interesse ?? "");

      const lead = await this.store.saveLead({
        chatId,
        nome,
        telefone,
        interesse,
      });

      saveLeadToCsv({ chatId, nome, telefone, interesse });

      if (
        businessConfig.notificarDonoEm.includes("lead") &&
        this.notifyOwner
      ) {
        await this.notifyOwner(
          `🆕 *Novo lead — ${businessConfig.nomeNegocio}*\n` +
            `Nome: ${nome}\n` +
            `Tel: ${telefone}\n` +
            `Interesse: ${interesse}`
        );
      }

      console.log(`[CRM] Lead salvo: ${nome} (${telefone})`);
      return JSON.stringify({ status: "lead_registrado", id: lead.id });
    } catch (err) {
      return JSON.stringify({ status: "erro", message: String(err) });
    }
  }

  private async handleAgendarConsulta(
    chatId: string,
    input: Record<string, unknown>
  ): Promise<string> {
    try {
      const nome = String(input.nome ?? "");
      const telefone = String(input.telefone ?? "");
      const servico = String(input.servico ?? "");
      const dataHora = String(input.dataHora ?? "");
      const observacao = input.observacao
        ? String(input.observacao)
        : undefined;

      // Também grava como lead no store (histórico único)
      const lead = await this.store.saveLead({
        chatId,
        nome,
        telefone,
        interesse: `Agendamento: ${servico} @ ${dataHora}`,
      });

      saveAgendamentoToCsv({
        chatId,
        nome,
        telefone,
        servico,
        dataHora,
        observacao,
      });

      if (
        businessConfig.notificarDonoEm.includes("agendamento") &&
        this.notifyOwner
      ) {
        await this.notifyOwner(
          `📅 *Novo agendamento — ${businessConfig.nomeNegocio}*\n` +
            `Nome: ${nome}\n` +
            `Tel: ${telefone}\n` +
            `Serviço: ${servico}\n` +
            `Quando: ${dataHora}` +
            (observacao ? `\nObs: ${observacao}` : "")
        );
      }

      console.log(`[CRM] Agendamento: ${nome} — ${servico} @ ${dataHora}`);
      return JSON.stringify({
        status: "agendamento_registrado",
        id: lead.id,
        dataHora,
      });
    } catch (err) {
      return JSON.stringify({ status: "erro", message: String(err) });
    }
  }
}
