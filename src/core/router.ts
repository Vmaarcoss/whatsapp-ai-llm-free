/**
 * Router: decide auto-resposta vs handoff humano.
 * Recebe o IncomingPayload, normaliza, consulta handoff, chama engine e envia.
 */

import type { WhatsAppProvider } from "../providers/WhatsAppProvider.js";
import type { ConversationStore } from "../store/ConversationStore.js";
import type { IncomingPayload } from "./types.js";
import { toInternalMessage } from "./normalizer.js";
import { Engine } from "./engine.js";
import { businessConfig } from "../config/business.js";

export class Router {
  private engine: Engine;

  constructor(
    private provider: WhatsAppProvider,
    private store: ConversationStore
  ) {
    this.engine = new Engine(store);
  }

  /** Handler principal — registrado no provider via onMessage */
  async handle(payload: IncomingPayload): Promise<void> {
    const { chatId, text } = payload;
    console.log(`[in] ${chatId}: ${text.slice(0, 80)}`);

    // Se já está em handoff, não responde automaticamente
    const handoff = await this.store.getHandoff(chatId);
    if (handoff?.active) {
      console.log(
        `[handoff ativo] ${chatId} — mensagem ignorada pelo bot. Motivo: ${handoff.motivo}`
      );
      // No MVP só logamos; em produção você notificaria o painel humano.
      return;
    }

    const userMsg = toInternalMessage(payload);

    let result;
    try {
      result = await this.engine.process(chatId, userMsg);
    } catch (err) {
      console.error("[engine error]", err);
      await this.provider.send(
        chatId,
        "Desculpe, tive um problema técnico. Tente novamente em instantes."
      );
      return;
    }

    if (result.handoff) {
      await this.store.setHandoff(chatId, true, result.handoffMotivo);
      console.log(
        `\n🚨 HANDOFF → ${chatId}\n   Motivo: ${result.handoffMotivo}\n   (no MVP: apenas log; conecte seu painel humano aqui)\n`
      );
      await this.provider.send(chatId, businessConfig.mensagemHandoff);
      return;
    }

    if (result.replyText) {
      await this.provider.send(chatId, result.replyText);
      console.log(`[out] ${chatId}: ${result.replyText.slice(0, 80)}`);
    }
  }
}
