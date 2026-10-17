/**
 * ============================================================
 *  CONFIG POR CLIENTE — edite SÓ este arquivo ao revender.
 * ============================================================
 * Persona, FAQ, regras, tools e contatos do dono.
 */

export interface FaqItem {
  pergunta: string;
  resposta: string;
}

export type ToolName =
  | "escalar_para_humano"
  | "registrar_lead"
  | "agendar_consulta";

export interface BusinessConfig {
  nomeNegocio: string;
  tomDeVoz: string;
  horarioAtendimento: string;
  faq: FaqItem[];
  regrasEscalonamento: string[];
  toolsHabilitadas: ToolName[];
  mensagemHandoff: string;
  mensagemForaHorario?: string;

  /**
   * WhatsApp do dono (DDI + número, só dígitos).
   * Deve ser DIFERENTE do número do bot.
   * Ex.: "5511999999"
   * Também pode vir de process.env.OWNER_PHONE (tem prioridade).
   */
  ownerPhone?: string;

  /** Quando notificar o dono no WhatsApp */
  notificarDonoEm: Array<"lead" | "agendamento">;
}

export const businessConfig: BusinessConfig = {
  nomeNegocio: "Acme Assistência",

  tomDeVoz:
    "Seja cordial, objetivo e profissional. Use português brasileiro. " +
    "Não invente informações que não estejam no FAQ ou nas regras. " +
    "Se não souber, diga que vai verificar e ofereça transferir para um humano.",

  horarioAtendimento: "Segunda a Sexta, 09:00–18:00 (horário de Brasília)",

  faq: [
    {
      pergunta: "Quais são os horários de atendimento?",
      resposta:
        "Atendemos de segunda a sexta, das 09:00 às 18:00 (horário de Brasília).",
    },
    {
      pergunta: "Como faço para agendar um serviço?",
      resposta:
        "Informe seu nome, telefone, o tipo de serviço e a data/horário desejados. Confirmaremos o agendamento.",
    },
    {
      pergunta: "Vocês atendem em qual região?",
      resposta: "Atendemos a Grande São Paulo e região metropolitana.",
    },
    {
      pergunta: "Qual o valor da visita técnica?",
      resposta:
        "A visita técnica tem taxa de R$ 80, abatida do valor do serviço se contratado.",
    },
  ],

  regrasEscalonamento: [
    "Cliente pede explicitamente para falar com um humano / atendente / gerente.",
    "Assunto envolve reclamação grave, cobrança indevida ou ameaça de processo.",
    "Pergunta fora do FAQ e que exige acesso a sistema interno (pedido, nota fiscal, etc.).",
    "Cliente está visivelmente frustrado após 2 tentativas de resolução.",
  ],

  toolsHabilitadas: [
    "escalar_para_humano",
    "registrar_lead",
    "agendar_consulta",
  ],

  mensagemHandoff:
    "Entendi! Vou transferir você para um de nossos atendentes. Aguarde um momento, por favor.",

  // Número do dono (só dígitos, com DDI). Preferível via .env OWNER_PHONE
  ownerPhone: undefined,

  notificarDonoEm: ["lead", "agendamento"],
};
