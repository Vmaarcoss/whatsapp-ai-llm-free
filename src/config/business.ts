/**
 * ============================================================
 *  CONFIG POR CLIENTE — edite SÓ este arquivo ao revender.
 * ============================================================
 * Persona, FAQ, regras de escalonamento e tools habilitadas.
 * O resto do sistema permanece intacto.
 */

export interface FaqItem {
  pergunta: string;
  resposta: string;
}

export interface BusinessConfig {
  /** Nome exibido nas respostas */
  nomeNegocio: string;

  /** Tom de voz (instruções para o Claude) */
  tomDeVoz: string;

  /** Ex.: "Seg–Sex 09:00–18:00 (horário de Brasília)" */
  horarioAtendimento: string;

  /** FAQ que o modelo deve usar como fonte prioritária */
  faq: FaqItem[];

  /**
   * Quando transferir para humano (além da tool escalar_para_humano).
   * O system prompt inclui estas regras.
   */
  regrasEscalonamento: string[];

  /**
   * Tools habilitadas para este cliente.
   * Adicione novas tools no engine.ts e habilite aqui.
   */
  toolsHabilitadas: Array<"escalar_para_humano" | "registrar_lead">;

  /** Mensagem enviada ao cliente quando ocorre handoff */
  mensagemHandoff: string;

  /** Mensagem quando fora do horário (opcional, se quiser filtrar) */
  mensagemForaHorario?: string;
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
      resposta: "Atendemos de segunda a sexta, das 09:00 às 18:00 (horário de Brasília).",
    },
    {
      pergunta: "Como faço para agendar um serviço?",
      resposta:
        "Informe seu nome, telefone e o tipo de serviço desejado. Um de nossos atendentes confirmará o horário.",
    },
    {
      pergunta: "Vocês atendem em qual região?",
      resposta: "Atendemos a Grande São Paulo e região metropolitana.",
    },
    {
      pergunta: "Qual o valor da visita técnica?",
      resposta: "A visita técnica tem taxa de R$ 80, abatida do valor do serviço se contratado.",
    },
  ],

  regrasEscalonamento: [
    "Cliente pede explicitamente para falar com um humano / atendente / gerente.",
    "Assunto envolve reclamação grave, cobrança indevida ou ameaça de processo.",
    "Pergunta fora do FAQ e que exige acesso a sistema interno (pedido, nota fiscal, etc.).",
    "Cliente está visivelmente frustrado após 2 tentativas de resolução.",
  ],

  toolsHabilitadas: ["escalar_para_humano", "registrar_lead"],

  mensagemHandoff:
    "Entendi! Vou transferir você para um de nossos atendentes. Aguarde um momento, por favor.",

  // mensagemForaHorario: "No momento estamos fora do horário de atendimento. Retornaremos no próximo dia útil.",
};
