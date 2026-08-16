export type DeliveryDecision = "ack-delivered" | "ack-expired" | "retry";

export function decideDelivery(delivered: boolean, deadline: string, now: Date): DeliveryDecision {
  if (delivered) return "ack-delivered";
  return now.getTime() >= Date.parse(deadline) ? "ack-expired" : "retry";
}
