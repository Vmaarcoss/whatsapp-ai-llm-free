/**
 * Implementação Baileys (MVP).
 * - Sessão persistente em ./data/baileys-auth
 * - Pairing code (8 dígitos) uma única vez
 * - Fallback QR no terminal
 * - 515 = restart normal (não pede código de novo)
 * - 401 = limpa auth e PARA (você reinicia o processo)
 * - saveCreds nunca derruba o processo (ENOENT)
 */

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  makeCacheableSignalKeyStore,
  type WASocket,
  type WAMessage,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import qrcode from "qrcode-terminal";
import path from "node:path";
import fs from "node:fs";
import type { WhatsAppProvider, MessageHandler } from "./WhatsAppProvider.js";
import type { IncomingPayload } from "../core/types.js";

const AUTH_DIR = path.resolve(process.cwd(), "data", "baileys-auth");

function ensureAuthDir(): void {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

function clearAuthDir(): void {
  try {
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn("Baileys: não foi possível limpar auth:", err);
  }
  ensureAuthDir();
}

export class BaileysProvider implements WhatsAppProvider {
  private sock: WASocket | null = null;
  private handler: MessageHandler | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 15;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  /** Impede pedir pairing code mais de uma vez por "vida" do processo */
  private pairingRequested = false;
  private connecting = false;

  onMessage(handler: MessageHandler): void {
    this.handler = handler;
  }

  async send(to: string, text: string): Promise<void> {
    if (!this.sock) throw new Error("Baileys: socket não conectado");
    const jid = to.includes("@") ? to : `${to.replace(/\D/g, "")}@s.whatsapp.net`;
    await this.sock.sendMessage(jid, { text });
  }

  async start(): Promise<void> {
    this.stopped = false;
    ensureAuthDir();
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.sock?.end(undefined);
    } catch {
      /* ignore */
    }
    this.sock = null;
  }

  private async connect(): Promise<void> {
    if (this.stopped || this.connecting) return;
    this.connecting = true;

    try {
      ensureAuthDir();

      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      const { version } = await fetchLatestBaileysVersion();

      // Nunca deixa saveCreds derrubar o processo (ENOENT no Windows/OneDrive)
      const safeSaveCreds = async () => {
        try {
          ensureAuthDir();
          await saveCreds();
        } catch (err: unknown) {
          const code = (err as NodeJS.ErrnoException)?.code;
          if (code === "ENOENT") {
            ensureAuthDir();
            try {
              await saveCreds();
            } catch {
              /* ignora segunda falha */
            }
          } else {
            console.warn("Baileys: falha ao salvar creds:", err);
          }
        }
      };

      const sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        },
        logger: pino({ level: "silent" }),
        browser: Browsers.ubuntu("Chrome"),
        printQRInTerminal: false,
        connectTimeoutMs: 60_000,
        keepAliveIntervalMs: 25_000,
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
        markOnlineOnConnect: false,
      });

      this.sock = sock;

      sock.ev.on("creds.update", () => {
        void safeSaveCreds();
      });

      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // QR só se ainda não registrado
        if (qr && !sock.authState.creds.registered) {
          console.log("\n📱 QR Code (WhatsApp > Aparelhos conectados > Conectar um aparelho):\n");
          qrcode.generate(qr, { small: true });
          console.log("");
        }

        if (connection === "open") {
          console.log("✅ Baileys: conectado ao WhatsApp");
          this.reconnectAttempts = 0;
          // Já conectou = pairing concluído (não peça código de novo)
          this.pairingRequested = true;
          return;
        }

        if (connection === "close") {
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;

          // 401 = logged out de verdade
          if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
            console.log(
              "\nBaileys: sessão deslogada (401).\n" +
                "1) No celular: desconecte o aparelho Ubuntu\n" +
                "2) No PC: apague a pasta data\\baileys-auth\n" +
                "3) Rode de novo: npm run dev\n" +
                "4) Digite o NOVO pairing code em até 60s\n"
            );
            this.sock = null;
            clearAuthDir();
            this.pairingRequested = false;
            this.reconnectAttempts = 0;
            // NÃO reconecta sozinho — evita loop de códigos inválidos
            return;
          }

          // 515 = WhatsApp pediu restart (normal após requestPairingCode)
          if (statusCode === 515) {
            console.log("Baileys: WhatsApp pediu restart (515). Reconectando...");
            this.scheduleReconnect(2000);
            return;
          }

          // Demais erros: backoff
          if (!this.stopped && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(2000 * 2 ** this.reconnectAttempts, 60_000);
            console.log(
              `Baileys: conexão fechada (code=${statusCode}). Reconectando em ${Math.round(delay / 1000)}s... (tentativa ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
            );
            this.scheduleReconnect(delay);
          } else if (!this.stopped) {
            console.error(
              "Baileys: esgotou tentativas. Apague data/baileys-auth e rode npm run dev de novo."
            );
          }
        }
      });

      // Pairing code: UMA vez só por vida do processo
      const phone = process.env.BAILEYS_PHONE?.replace(/\D/g, "");
      if (phone && !state.creds.registered && !this.pairingRequested) {
        this.pairingRequested = true;
        setTimeout(async () => {
          try {
            if (!this.sock || this.sock.authState.creds.registered) return;
            const code = await this.sock.requestPairingCode(phone);
            const pretty = code.match(/.{1,4}/g)?.join("-") ?? code;
            console.log("\n========================================");
            console.log(`🔑 Pairing code: ${pretty}`);
            console.log("WhatsApp > Aparelhos conectados >");
            console.log("Conectar um aparelho > Conectar com número de telefone");
            console.log("Digite em até ~60 segundos. NÃO reinicie o bot.");
            console.log("========================================\n");
          } catch (err) {
            console.error("Erro ao gerar pairing code (use o QR se aparecer):", err);
            this.pairingRequested = false;
          }
        }, 3000);
      }

      sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;
        for (const msg of messages) {
          await this.handleIncoming(msg);
        }
      });
    } finally {
      this.connecting = false;
    }
  }

  private scheduleReconnect(delayMs: number): void {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((err) => console.error("Baileys: falha na reconexão:", err));
    }, delayMs);
  }

  private async handleIncoming(msg: WAMessage): Promise<void> {
    if (!this.handler) return;
    // if (msg.key.fromMe) return;

    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      "";

    if (!text.trim()) return;

    const chatId = msg.key.remoteJid || "";
    if (!chatId || chatId.endsWith("@g.us")) return;

    const payload: IncomingPayload = {
      chatId,
      text: text.trim(),
      fromMe: false,
      pushName: msg.pushName || undefined,
      raw: msg,
    };

    try {
      await this.handler(payload);
    } catch (err) {
      console.error("Erro no handler de mensagem:", err);
    }
  }
}
