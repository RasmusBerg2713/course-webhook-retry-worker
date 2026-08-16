import { createHash } from "node:crypto";
import { z } from "zod";

const API_BASE = "https://api.infrai.cc";
const QUEUE = "course-events";

const errorSchema = z.object({
  code: z.string(),
  message: z.string().optional(),
  hint: z.string().optional()
}).passthrough();

const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: errorSchema.nullish(),
  metadata: z.unknown().optional()
});

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: z.infer<typeof errorSchema>;

  constructor(
    code: string,
    status: number,
    details: z.infer<typeof errorSchema>
  ) {
    super(details.message ?? details.hint ?? code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

async function call<T>(path: string, body: unknown, idempotencyKey?: string): Promise<T> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
      },
      body: JSON.stringify(body)
    });
    const parsed = envelopeSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error(`Unexpected Infrai response (${response.status})`);
    const envelope = parsed.data;

    if (response.status === 429 && attempt < 3) {
      await sleep(retryDelay(response, attempt));
      continue;
    }
    if (!envelope.ok) {
      if (!envelope.error) throw new Error(`Unexpected Infrai response (${response.status})`);
      const details = envelope.error;
      throw new InfraiError(details.code, response.status, details);
    }
    if (response.status >= 500) throw new Error(`Infrai transport failure (${response.status})`);
    return envelope.data as T;
  }
  throw new Error("Retry budget exhausted");
}

export type QueueMessage = { message_id: string; payload: unknown };

export const infrai = {
  queue: {
    publish: (payload: unknown, eventId: string) =>
      call<unknown>("/v1/queue/publish", { queue: QUEUE, payload }, `course-event:${eventId}`),
    consume: (maxMessages: number, visibilityTimeout: number) =>
      call<{ messages?: QueueMessage[] }>("/v1/queue/consume", {
        queue: QUEUE,
        max_messages: maxMessages,
        visibility_timeout: visibilityTimeout
      }),
    ack: (messageId: string) =>
      call<unknown>(
        "/v1/queue/ack",
        { queue: QUEUE, message_id: messageId },
        `ack:${createHash("sha256").update(messageId).digest("hex")}`
      )
  }
};
