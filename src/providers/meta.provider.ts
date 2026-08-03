/**
 * Stub da Meta Cloud API.
 * Ative depois: preencha META_* no .env e set PROVIDER=meta.
 * O webhook HTTP é montado em server.ts; este provider só implementa send + registra handler.
 */

import type { WhatsAppProvider, MessageHandler } from "./WhatsAppProvider.js";
import type { IncomingPayload } from "../core/types.js";

export class MetaProvider implements WhatsAppProvider {
  private handler: MessageHandler | null = null;

  onMessage(handler: MessageHandler): void {
    this.handler = handler;
  }

  /**
   * Chamado pelo server.ts quando chega um webhook válido da Meta.
   * Converte o payload bruto → IncomingPayload e dispara o handler.
   */
  async handleWebhookPayload(body: unknown): Promise<void> {
    if (!this.handler) return;

    // Estrutura típica: body.entry[].changes[].value.messages[]
    const entries = (body as any)?.entry ?? [];
    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value?.messages) continue;

        for (const msg of value.messages) {
          if (msg.type !== "text") continue; // MVP: só texto

          const payload: IncomingPayload = {
            chatId: msg.from, // wa_id
            text: msg.text?.body?.trim() ?? "",
            fromMe: false,
            pushName: value.contacts?.[0]?.profile?.name,
            raw: msg,
          };

          if (payload.text) {
            await this.handler(payload);
          }
        }
      }
    }
  }

  async send(to: string, text: string): Promise<void> {
    const token = process.env.META_ACCESS_TOKEN;
    const phoneNumberId = process.env.META_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId) {
      throw new Error(
        "MetaProvider: configure META_ACCESS_TOKEN e META_PHONE_NUMBER_ID no .env"
      );
    }

    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/\D/g, ""),
        type: "text",
        text: { body: text },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Meta send failed: ${res.status} ${err}`);
    }
  }

  async start(): Promise<void> {
    console.log(
      "MetaProvider: pronto. Webhook deve estar apontando para POST /webhook"
    );
  }

  async stop(): Promise<void> {
    // nada a fazer
  }
}
