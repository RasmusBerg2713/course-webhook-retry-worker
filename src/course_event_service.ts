import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { courseEventSchema } from "./course_event.js";
import { InfraiError, infrai } from "./infrai_queue.js";

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

export async function handleCourseEvent(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== "POST" || request.url !== "/course-events") {
    json(response, 404, { error: "route_not_found" });
    return;
  }

  try {
    const parsed = courseEventSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      json(response, 400, { error: "invalid_course_event", issues: parsed.error.issues });
      return;
    }
    await infrai.queue.publish(parsed.data, parsed.data.event_id);
    json(response, 202, { event_id: parsed.data.event_id, delivery: "queued" });
  } catch (error) {
    if (error instanceof SyntaxError) {
      json(response, 400, { error: "invalid_json" });
    } else if (error instanceof InfraiError && error.status >= 400 && error.status < 500) {
      json(response, error.status, { error: error.code, message: error.message });
    } else {
      json(response, 502, { error: "queue_unavailable" });
    }
  }
}

const port = Number(process.env.PORT ?? 3000);
createServer((request, response) => void handleCourseEvent(request, response)).listen(port, () => {
  console.log(`Course event service listening on http://localhost:${port}`);
});
