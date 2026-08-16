import { courseEventSchema, type CourseEvent } from "./course_event.js";
import { decideDelivery } from "./delivery_policy.js";
import { infrai, type QueueMessage } from "./infrai_queue.js";

async function sendWebhook(event: CourseEvent): Promise<boolean> {
  try {
    const response = await fetch(event.webhook_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": event.event_id
      },
      body: JSON.stringify(event)
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function deliverMessage(message: QueueMessage, now = new Date()): Promise<void> {
  const parsed = courseEventSchema.safeParse(message.payload);
  if (!parsed.success) {
    await infrai.queue.ack(message.message_id);
    console.log(JSON.stringify({ message_id: message.message_id, outcome: "invalid-payload-acknowledged" }));
    return;
  }

  const delivered = await sendWebhook(parsed.data);
  const decision = decideDelivery(delivered, parsed.data.delivery_deadline, now);
  if (decision !== "retry") await infrai.queue.ack(message.message_id);

  console.log(JSON.stringify({
    event_id: parsed.data.event_id,
    course_id: parsed.data.course_id,
    learner_id: parsed.data.learner_id,
    educator_id: parsed.data.educator_id,
    outcome: decision
  }));
}

async function runOnce(): Promise<void> {
  const batch = await infrai.queue.consume(10, 30);
  for (const message of batch.messages ?? []) await deliverMessage(message);
}

runOnce().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
