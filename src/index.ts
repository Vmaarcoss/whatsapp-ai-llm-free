/**
 * Bootstrap: env → store + provider → router (com notifyOwner) → HTTP + Baileys.
 */

import "dotenv/config";
import { createProvider } from "./providers/index.js";
import { createStore } from "./store/index.js";
import { Router } from "./core/router.js";
import { createServer } from "./server.js";
import { getOwnerPhone } from "./core/crm.js";

async function main() {
  console.log("=== WhatsApp AI Boilerplate ===");
  console.log(`AI_PROVIDER=groq`);
  console.log(`GROQ_MODEL=${process.env.GROQ_MODEL || "llama-3.1-8b-instant"}`);
  console.log(`PROVIDER=${process.env.PROVIDER || "baileys"}`);
  console.log(`STORE=${process.env.STORE || "sqlite"}`);

  if (!process.env.GROQ_API_KEY) {
    console.error(
      "\n❌ GROQ_API_KEY não encontrada.\n" +
        "   Configure no .env antes de iniciar.\n"
    );
    process.exit(1);
  }

  const store = createStore();
  const provider = createProvider();

  const ownerPhone = getOwnerPhone();
  if (ownerPhone) {
    console.log(`OWNER_PHONE=${ownerPhone.slice(0, 4)}**** (notificações ativas)`);
  } else {
    console.log("OWNER_PHONE não configurado — notificações ao dono desligadas");
  }

  const notifyOwner = async (text: string) => {
    const phone = getOwnerPhone();
    if (!phone) return;
    try {
      await provider.send(phone, text);
      console.log(`[notify] dono ${phone}: ${text.slice(0, 60)}...`);
    } catch (err) {
      console.error("[notify] falha ao avisar dono:", err);
    }
  };

  const router = new Router(provider, store, { notifyOwner });

  provider.onMessage((payload) => router.handle(payload));

  const port = Number(process.env.PORT || 3000);
  const app = createServer(provider);
  app.listen(port, () => {
    console.log(`HTTP :${port}  (GET /health, GET|POST /webhook)`);
  });

  await provider.start();

  const shutdown = async () => {
    console.log("\nEncerrando...");
    await provider.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Falha fatal:", err);
  process.exit(1);
});
