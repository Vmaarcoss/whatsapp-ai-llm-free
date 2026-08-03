/**
 * Fábrica de providers.
 * Troque via env PROVIDER=baileys|meta sem alterar o core.
 */

import type { WhatsAppProvider } from "./WhatsAppProvider.js";
import { BaileysProvider } from "./baileys.provider.js";
import { MetaProvider } from "./meta.provider.js";

export type { WhatsAppProvider, MessageHandler } from "./WhatsAppProvider.js";
export { BaileysProvider } from "./baileys.provider.js";
export { MetaProvider } from "./meta.provider.js";

export function createProvider(): WhatsAppProvider {
  const kind = (process.env.PROVIDER || "baileys").toLowerCase();

  switch (kind) {
    case "baileys":
      console.log("Provider: Baileys (local)");
      return new BaileysProvider();
    case "meta":
      console.log("Provider: Meta Cloud API");
      return new MetaProvider();
    default:
      throw new Error(`PROVIDER desconhecido: ${kind}. Use baileys|meta`);
  }
}
