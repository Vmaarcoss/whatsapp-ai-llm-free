/**
 * Bootstrap: carrega env → cria store + provider → wiring do router → sobe HTTP + provider.
 */

import "dotenv/config";
import { createProvider } from "./providers/index.js";
import { createStore } from "./store/index.js";
import { Router } from "./core/router.js";
import { createServer } from "./server.js";

async function main() {
  console.log("=== WhatsApp AI Boilerplate ===");
  // Agora lemos variáveis específicas da Groq (ou genérico)
  console.log(`AI_PROVIDER=${process.env.AI_PROVIDER || "groq"}`);
  console.log(`GROQ_MODEL=${process.env.GROQ_MODEL || "llama-3.1-8b-instant"}`);
  console.log(`PROVIDER=${process.env.PROVIDER || "baileys"}`);
  console.log(`STORE=${process.env.STORE || "sqlite"}`);

  // A validação da chave fica a cargo do Engine, que lança exceção se necessário.
  // Mas podemos dar uma dica amigável se nenhuma chave conhecida estiver presente.
  if (!process.env.ANTHROPIC_API_KEY && !process.env.GROQ_API_KEY) {
    console.error(
      "\n❌ Nenhuma chave de IA encontrada.\n" +
        "   Configure GROQ_API_KEY (gratuito) ou ANTHROPIC_API_KEY no .env\n"
    );
    process.exit(1);
  }

  const store = createStore();
  const provider = createProvider();
  const router = new Router(provider, store);

  // Wiring: provider → router
  provider.onMessage((payload) => router.handle(payload));

  // HTTP (health + Meta webhook)
  const port = Number(process.env.PORT || 3000);
  const app = createServer(provider);
  app.listen(port, () => {
    console.log(`HTTP :${port}  (GET /health, GET|POST /webhook)`);
  });

  // Inicia provider (Baileys conecta / Meta só loga)
  await provider.start();

  // Graceful shutdown
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
});""