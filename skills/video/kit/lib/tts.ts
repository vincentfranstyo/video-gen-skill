import { createHash, randomBytes, randomUUID } from "node:crypto";

/**
 * Voice-over via Microsoft Edge's read-aloud service: free, no key, and
 * `en-US-AndrewNeural` is a natural US English male voice. Everything is behind
 * `TtsProvider`, so swapping in a paid vendor later touches this file only.
 *
 * The service is not a documented public API. It speaks a small WebSocket
 * protocol: a config frame, an SSML frame, then interleaved text frames
 * (word-boundary metadata) and binary frames (MP3 chunks) until `turn.end`.
 * Since 2024 it also requires the `Sec-MS-GEC` token below, derived from the
 * clock and a public client token.
 */
const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const ENDPOINT = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;
/** Must track a plausible Edge build — the service rejects the handshake outright on a stale one. */
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;
const CHROMIUM_ORIGIN = "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold";
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split(".")[0];
const USER_AGENT =
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)` +
  ` Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`;

/** Windows epoch offset in seconds, and the 5-minute window the token is bucketed into. */
const WINDOWS_EPOCH_OFFSET_SEC = 11_644_473_600;
const TICKS_PER_SECOND = 10_000_000;
const TOKEN_WINDOW_TICKS = 5 * 60 * TICKS_PER_SECOND;

const SYNTHESIS_TIMEOUT_MS = 60_000;

export interface WordBoundary {
  text: string;
  offsetMs: number;
  durationMs: number;
}

export interface SpeechResult {
  mp3: Buffer;
  /** Per-word timings — the pacing signal the renderer uses to size each scene. */
  words: WordBoundary[];
  durationMs: number;
}

export interface TtsProvider {
  synthesize(text: string): Promise<SpeechResult>;
}

export const DEFAULT_VOICE = "en-US-AndrewNeural";

export class TtsError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TtsError";
  }
}

function secMsGec(): string {
  const ticks = Math.floor((Date.now() / 1000 + WINDOWS_EPOCH_OFFSET_SEC) * TICKS_PER_SECOND);
  const windowed = ticks - (ticks % TOKEN_WINDOW_TICKS);
  return createHash("sha256").update(`${windowed}${TRUSTED_CLIENT_TOKEN}`).digest("hex").toUpperCase();
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSsml(text: string, voice: string, rate: string, pitch: string): string {
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${voice.split("-").slice(0, 2).join("-")}'>` +
    `<voice name='${voice}'>` +
    `<prosody pitch='${pitch}' rate='${rate}' volume='+0%'>${escapeXml(text)}</prosody>` +
    `</voice></speak>`;
}

function configMessage(): string {
  return (
    `X-Timestamp:${new Date().toISOString()}\r\n` +
    "Content-Type:application/json; charset=utf-8\r\n" +
    "Path:speech.config\r\n\r\n" +
    JSON.stringify({
      context: {
        synthesis: {
          audio: {
            metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: true },
            outputFormat: "audio-24khz-48kbitrate-mono-mp3",
          },
        },
      },
    })
  );
}

function ssmlMessage(requestId: string, ssml: string): string {
  return (
    `X-RequestId:${requestId}\r\n` +
    "Content-Type:application/ssml+xml\r\n" +
    `X-Timestamp:${new Date().toISOString()}Z\r\n` +
    "Path:ssml\r\n\r\n" +
    ssml
  );
}

/** Binary frames are `[2-byte header length][ascii header][audio bytes]`. */
function splitBinaryFrame(frame: Buffer): { path: string; audio: Buffer } {
  const headerLength = frame.readUInt16BE(0);
  const header = frame.subarray(2, 2 + headerLength).toString("ascii");
  const path = header.match(/Path:([a-zA-Z.]+)/)?.[1] ?? "";
  return { path, audio: frame.subarray(2 + headerLength) };
}

interface MetadataFrame {
  Metadata?: {
    Type?: string;
    Data?: {
      Offset?: number;
      Duration?: number;
      text?: { Text?: string };
    };
  }[];
}

function parseWordBoundaries(payload: string, into: WordBoundary[]): void {
  const jsonStart = payload.indexOf("{");
  if (jsonStart < 0) return;

  const parsed = JSON.parse(payload.slice(jsonStart)) as MetadataFrame;
  for (const entry of parsed.Metadata ?? []) {
    if (entry.Type !== "WordBoundary" || !entry.Data?.text?.Text) continue;
    into.push({
      text: entry.Data.text.Text,
      offsetMs: Math.round((entry.Data.Offset ?? 0) / 10_000),
      durationMs: Math.round((entry.Data.Duration ?? 0) / 10_000),
    });
  }
}

export interface EdgeTtsOptions {
  voice?: string;
  /** Percentage strings the service expects, e.g. "+8%" for a slightly faster read. */
  rate?: string;
  pitch?: string;
}

/**
 * Speaks one block of text and returns the MP3 plus word timings. One socket
 * per call: the service closes the connection after `turn.end` anyway, and a
 * per-scene call keeps a failure scoped to that scene.
 */
export function createEdgeTtsProvider(options: EdgeTtsOptions = {}): TtsProvider {
  const voice = options.voice ?? DEFAULT_VOICE;
  const rate = options.rate ?? "+8%";
  const pitch = options.pitch ?? "+0Hz";

  return {
    synthesize(text: string): Promise<SpeechResult> {
      return new Promise<SpeechResult>((resolve, reject) => {
        const url = `${ENDPOINT}&Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=${GEC_VERSION}`;

        // Bun accepts per-socket headers; the service rejects the handshake without a browser-ish Origin.
        // The handshake is rejected (403) without this exact header set, including the muid cookie.
        const socket = new WebSocket(url, {
          headers: {
            Pragma: "no-cache",
            "Cache-Control": "no-cache",
            Origin: CHROMIUM_ORIGIN,
            "Accept-Language": "en-US,en;q=0.9",
            Cookie: `muid=${randomBytes(16).toString("hex").toUpperCase()};`,
            "User-Agent": USER_AGENT,
          },
        } as unknown as string[]);
        socket.binaryType = "arraybuffer";

        const chunks: Buffer[] = [];
        const words: WordBoundary[] = [];
        let settled = false;

        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          socket.close();
          reject(new TtsError(`Edge TTS timed out after ${SYNTHESIS_TIMEOUT_MS}ms`));
        }, SYNTHESIS_TIMEOUT_MS);

        const fail = (error: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          socket.close();
          reject(error instanceof TtsError ? error : new TtsError("Edge TTS request failed", { cause: error }));
        };

        socket.onopen = () => {
          try {
            socket.send(configMessage());
            socket.send(ssmlMessage(randomUUID().replace(/-/g, ""), buildSsml(text, voice, rate, pitch)));
          } catch (error) {
            fail(error);
          }
        };

        socket.onmessage = (event: MessageEvent) => {
          try {
            if (typeof event.data === "string") {
              if (event.data.includes("Path:audio.metadata")) parseWordBoundaries(event.data, words);
              if (event.data.includes("Path:turn.end")) {
                settled = true;
                clearTimeout(timer);
                socket.close();
                const mp3 = Buffer.concat(chunks);
                if (mp3.length === 0) {
                  reject(new TtsError("Edge TTS returned no audio"));
                  return;
                }
                const last = words.at(-1);
                resolve({
                  mp3,
                  words,
                  durationMs: last ? last.offsetMs + last.durationMs : 0,
                });
              }
              return;
            }

            const { path, audio } = splitBinaryFrame(Buffer.from(event.data as ArrayBuffer));
            if (path === "audio" && audio.length > 0) chunks.push(audio);
          } catch (error) {
            fail(error);
          }
        };

        socket.onerror = () => fail(new TtsError("Edge TTS socket error"));
        socket.onclose = () => {
          if (!settled) fail(new TtsError("Edge TTS socket closed before turn.end"));
        };
      });
    },
  };
}
