/**
 * Ingress HTTP:
 * - GET  /health
 * - GET  /webhook  (Meta verify token)
 * - POST /webhook  (Meta incoming + assinatura)
 *
 * No modo Baileys o provider empurra mensagens direto (sem webhook HTTP).
 */

import express, { type Request, type Response } from "express";
import crypto from "node:crypto";
import type { WhatsAppProvider } from "./providers/WhatsAppProvider.js";
import { MetaProvider } from "./providers/meta.provider.js";

export function createServer(provider: WhatsAppProvider) {
  const app = express();

  // Raw body necessário para validar assinatura X-Hub-Signature-256
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as any).rawBody = buf;
      },
    })
  );

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true, ts: Date.now() });
  });

  // --- Meta webhook verification (GET) ---
  app.get("/webhook", (req: Request, res: Response) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    const verifyToken = process.env.META_VERIFY_TOKEN;

    if (mode === "subscribe" && token === verifyToken) {
      console.log("Meta webhook verificado");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  });

  //Meta webhook metood (POST)
  app.post("/webhook", async (req: Request, res: Response) => {
    // Valida assinatura se APP_SECRET estiver configurado
    const appSecret = process.env.META_APP_SECRET;
    if (appSecret) {
      const signature = req.headers["x-hub-signature-256"] as string | undefined;
      if (!signature) {
        res.sendStatus(401);
        return;
      }
      const expected =
        "sha256=" +
        crypto
          .createHmac("sha256", appSecret)
          .update((req as any).rawBody)
          .digest("hex");
      if (signature !== expected) {
        console.warn("Assinatura Meta inválida");
        res.sendStatus(401);
        return;
      }
    }

    // Responde 200 rpido
    res.sendStatus(200);

    // Processa boleano se  MetaProvider falhar
    if (provider instanceof MetaProvider) {
      try {
        await provider.handleWebhookPayload(req.body);
      } catch (err) {
        console.error("Erro ao processar webhook Meta:", err);
      }
    }
  });

  return app;
}
