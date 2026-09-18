export const NETWORK_CAPABILITIES = Object.freeze([
  "health",
  "identity",
  "sessions",
  "hotspot",
  "pppoe",
  "clients",
  "devices",
  "interfaces",
  "metrics",
  "disconnect",
  "policy",
  "configuration",
  "backup",
  "firmware",
  "reconcile",
]);

export class UnsupportedCapabilityError extends Error {
  constructor(provider, capability) {
    super(provider + " does not support capability: " + capability);
    this.name = "UnsupportedCapabilityError";
    this.provider = provider;
    this.capability = capability;
  }
}

export function assertCapability(provider, capability) {
  const capabilities = provider?.getCapabilities?.();
  if (!capabilities || capabilities[capability] !== true) {
    throw new UnsupportedCapabilityError(provider?.name ?? "unknown-provider", capability);
  }
  return true;
}

export function normalizeProviderCapabilities(input = {}) {
  return Object.freeze(Object.fromEntries(
    NETWORK_CAPABILITIES.map((name) => [name, input[name] === true]),
  ));
}
