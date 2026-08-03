/**
 * Camada de IA — Groq (OpenAI-compatible) com function calling.
 * Substitui o motor Anthropic por um modelo gratuito da Groq.
 *
 * Mantém a mesma interface EngineResult para não quebrar o Router.
 */

import OpenAI from "openai";
import type { Message } from "./types.js";
import type { ConversationStore } from "../store/index.js"; // <-- import via barrel
import { businessConfig } from "../config/business.js";

const MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

export interface EngineResult {
  /** Texto final para enviar ao usuário (null se handoff) */
  replyText: string | null;
  /** true se a tool escalar_para_humano foi chamada */
  handoff: boolean;
  handoffMotivo?: string;
}

/** Definição das tools no formato OpenAI function calling */
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
- Se precisar de dados do cliente (nome, telefone, interesse), pergunte educadamente e use registrar_lead quando tiver os três campos.
- Quando escalar, chame a tool; não invente que já transferiu.
`;
}

/**
 * Converte histórico interno (Message[]) para o formato de mensagens da OpenAI.
 * Inclui suporte a tool_calls e tool results salvos anteriormente.
 */
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
        const toolCallBlock = {
          id: m.toolUseId,
          type: "function" as const,
          function: {
            name: m.toolName,
            arguments: JSON.stringify(m.toolInput),
          },
        };
        result.push({
          role: "assistant",
          content: m.text || null,
          tool_calls: [toolCallBlock],
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

  constructor(store: ConversationStore) {
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
  }

  async process(chatId: string, userMessage: Message): Promise<EngineResult> {
    // Persiste a mensagem do usuário
    await this.store.append(chatId, userMessage);

    const history = await this.store.getHistory(chatId, 40);
    let messages = toOpenAIMessages(history);

    // Filtra tools habilitadas no config (type guard para evitar erro de tipo)
    const enabledTools = ALL_TOOLS.filter((t) => {
      if (t.type === "function") {
        return businessConfig.toolsHabilitadas.includes(t.function.name as any);
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
      const finishReason = choice.finish_reason;

      if (finishReason === "tool_calls") {
        const assistantMsg = choice.message;
        const toolCalls = assistantMsg.tool_calls ?? [];
        const assistantText = assistantMsg.content ?? "";

        // Type guard: só processa chamadas do tipo "function"
        const functionCalls = toolCalls.filter(
          (
            tc
          ): tc is OpenAI.Chat.Completions.ChatCompletionMessageToolCall & {
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
            try {
              const lead = await this.store.saveLead({
                chatId,
                nome: String(input.nome ?? ""),
                telefone: String(input.telefone ?? ""),
                interesse: String(input.interesse ?? ""),
              });
              resultContent = JSON.stringify({
                status: "lead_registrado",
                id: lead.id,
              });
              console.log(`[CRM] Lead salvo: ${lead.nome} (${lead.telefone})`);
            } catch (err) {
              resultContent = JSON.stringify({
                status: "erro",
                message: String(err),
              });
            }
          } else {
            resultContent = JSON.stringify({
              status: "tool_desconhecida",
              name: tc.function.name,
            });
          }

          // Salva tool result
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

        // Continua o loop: mensagem do assistente + resultados das tools
        messages.push(assistantMsg);
        messages.push(...toolResultsForNextTurn);
      } else {
        // Resposta final (texto)
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

    return {
      replyText: finalText,
      handoff,
      handoffMotivo,
    };
  }
}