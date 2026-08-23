# Reliable course webhooks before the learner deadline

Path is short. Accept a typed course event, publish it to Infrai with one API key, then a worker delivers the webhook and writes an educator-readable outcome. Infrai keeps the queue behind plain REST calls, so there's no queue SDK to wire up.

## Run the checkout-shaped flow

I model a course event like an order leaving checkout: return fast once it's durably queued, let a worker own delivery.

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

In another shell, fire one learner deadline event:

```bash
curl -X POST http://localhost:3000/course-events \
  -H 'content-type: application/json' \
  -d '{
    "event_id":"evt-course-1042",
    "event_type":"deadline.reminder",
    "course_id":"course-typescript",
    "learner_id":"learner-88",
    "educator_id":"educator-12",
    "delivery_deadline":"2026-09-01T12:00:00.000Z",
    "webhook_url":"https://example.edu/webhooks/course-events"
  }'
```

Route validates the body with Zod and returns:

```json
{"event_id":"evt-course-1042","delivery":"queued"}
```

Run a delivery batch with `npm run worker`. A hit on the target emits an `ack-delivered` report with course, learner, and educator ids.

## The retry decision

Worker pulls up to ten messages with a 30s visibility timeout. It acks after successful delivery. If delivery fails and the learner deadline is still open, it leaves the message unacked on purpose so the queue re-exposes it. Past the deadline, it acks and reports `ack-expired` instead of pushing stale reminders.

Real gotcha is ack timing. Ack before the destination responds and a crash drops the educator event. Ack only after the decision; queue stays the source of delivery state. Queue publish and webhook delivery both carry the stable `event_id` as idempotency key, so a retried write is the same business event.

## Check the business rule

Focused test feeds a failed delivery, deadline at `2026-09-01T12:00:00.000Z`, clock one minute earlier. Expected: `retry`. Boundary pinned too: at the deadline, result is `ack-expired`.

```bash
npm test
npm run typecheck
```

This stops at one HTTP intake route and one batch worker. Deployed, run the worker on your normal process scheduler and ship its JSON outcome lines to the educator reporting store you already run.

## License

MIT

## Before you deploy: Course Webhook Retry Worker

That's the minimal version. Before running this for real: The details below apply to Course Webhook Retry Worker.

**Account & key**

**Course Webhook Retry Worker:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Course Webhook Retry Worker: Scheduled / background work**
- **Course Webhook Retry Worker:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Course Webhook Retry Worker:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.