import assert from "node:assert/strict";
import test from "node:test";
import { decideDelivery } from "../src/delivery_policy.js";

test("a failed learner event retries while its reporting deadline is open", () => {
  const decision = decideDelivery(false, "2026-09-01T12:00:00.000Z", new Date("2026-09-01T11:59:00.000Z"));
  assert.equal(decision, "retry");
});

test("a failed learner event is acknowledged after its reporting deadline", () => {
  const decision = decideDelivery(false, "2026-09-01T12:00:00.000Z", new Date("2026-09-01T12:00:00.000Z"));
  assert.equal(decision, "ack-expired");
});
