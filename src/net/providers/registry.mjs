import { UnsupportedCapabilityError } from "./contract.mjs";
import { MikroTikRestProvider } from "./mikrotik-rest.mjs";
import { OmadaOpenApiProvider } from "./omada-openapi.mjs";

const PROVIDER_TYPES = Object.freeze({
  "mikrotik-rest": MikroTikRestProvider,
  "omada-openapi": OmadaOpenApiProvider,
});

export function listRegisteredProviders() {
  return Object.freeze(Object.keys(PROVIDER_TYPES));
}

export function createNetworkProvider({ type, ...config } = {}) {
  const Provider = PROVIDER_TYPES[type];
  if (!Provider) {
    throw new UnsupportedCapabilityError(String(type ?? "unknown"), "provider");
  }
  return new Provider(config);
}

export function getProviderTypes() {
  return Object.freeze(Object.keys(PROVIDER_TYPES));
}
