export const PAYMENT_STATES = Object.freeze(["INITIATED", "PENDING", "VERIFIED", "SETTLED", "FAILED", "REVERSED", "REFUNDED"]);
export const SESSION_STATES = Object.freeze(["REQUESTED", "AUTHENTICATED", "ACTIVE", "STALE", "TERMINATING", "TERMINATED"]);
export const DEVICE_STATES = Object.freeze(["ONLINE", "OFFLINE", "DEGRADED", "UNKNOWN"]);
export const COMMAND_STATES = Object.freeze(["QUEUED", "SENT", "ACCEPTED", "EXECUTED", "VERIFIED", "FAILED", "RETRYING", "ABANDONED"]);

const transitions = {
  payment: {
    INITIATED: ["PENDING", "FAILED"],
    PENDING: ["VERIFIED", "FAILED", "REVERSED"],
    VERIFIED: ["SETTLED", "REVERSED", "REFUNDED"],
    SETTLED: ["REVERSED", "REFUNDED"],
    FAILED: [],
    REVERSED: ["REFUNDED"],
    REFUNDED: [],
  },
  session: {
    REQUESTED: ["AUTHENTICATED", "TERMINATED"],
    AUTHENTICATED: ["ACTIVE", "TERMINATING", "TERMINATED"],
    ACTIVE: ["STALE", "TERMINATING", "TERMINATED"],
    STALE: ["ACTIVE", "TERMINATING", "TERMINATED"],
    TERMINATING: ["TERMINATED"],
    TERMINATED: [],
  },
  command: {
    QUEUED: ["SENT", "ABANDONED"],
    SENT: ["ACCEPTED", "FAILED", "RETRYING"],
    ACCEPTED: ["EXECUTED", "FAILED", "RETRYING"],
    EXECUTED: ["VERIFIED", "FAILED", "RETRYING"],
    VERIFIED: [],
    FAILED: ["RETRYING", "ABANDONED"],
    RETRYING: ["SENT", "ABANDONED"],
    ABANDONED: [],
  },
};

export function transition(kind, current, next) {
  const allowed = transitions[kind]?.[current];
  if (!allowed) throw new Error(`Unknown ${kind} state: ${current}`);
  if (!allowed.includes(next)) throw new Error(`Invalid ${kind} transition: ${current} -> ${next}`);
  return next;
}

export function deriveEntitlement(payment, subscription) {
  if (!payment || !subscription) return { state: "INACTIVE", reason: "MISSING_STATE" };
  if (["REVERSED", "REFUNDED", "FAILED"].includes(payment.status)) return { state: "SUSPENDED", reason: `PAYMENT_${payment.status}` };
  if (!["VERIFIED", "SETTLED"].includes(payment.status)) return { state: "PENDING", reason: `PAYMENT_${payment.status}` };
  if (subscription.status !== "ACTIVE") return { state: "INACTIVE", reason: `SUBSCRIPTION_${subscription.status}` };
  if (new Date(subscription.expiresAt).getTime() <= Date.now()) return { state: "EXPIRED", reason: "SUBSCRIPTION_EXPIRED" };
  return { state: "ACTIVE", reason: "PAYMENT_AND_SUBSCRIPTION_VALID" };
}

export function createCommand(input) {
  if (!input?.commandId || !input?.target || !input?.actor) throw new Error("commandId, target and actor are required");
  return {
    commandId: input.commandId,
    actor: input.actor,
    target: input.target,
    provider: input.provider ?? "unknown",
    request: input.request ?? {},
    response: null,
    verification: null,
    error: null,
    attempts: 0,
    status: "QUEUED",
    createdAt: input.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function applyCommandResult(command, result) {
  const now = new Date().toISOString();
  if (result.accepted === true) {
    return { ...command, status: "ACCEPTED", response: result.response ?? null, attempts: command.attempts + 1, updatedAt: now };
  }
  return { ...command, status: result.retryable ? "RETRYING" : "FAILED", response: result.response ?? null, error: result.error ?? "Provider rejected command", attempts: command.attempts + 1, updatedAt: now };
}
