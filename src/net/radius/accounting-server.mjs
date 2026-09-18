import dgram from "node:dgram";
import { persistAccounting } from "../accounting.mjs";
import { buildAccountingResponse, getAccountingEvent, parseRadiusPacket, verifyAccountingRequest, RADIUS_CODES } from "./codec.mjs";

function normalizeAddress(address) {
  if (address?.startsWith("::ffff:")) return address.slice(7);
  return address;
}

export function parseRadiusClients(raw = process.env.JASLYN_RADIUS_CLIENTS_JSON) {
  if (!raw?.trim()) throw new Error("JASLYN_RADIUS_CLIENTS_JSON is required for RADIUS accounting transport");
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error("JASLYN_RADIUS_CLIENTS_JSON must contain valid JSON"); }
  const entries = Array.isArray(parsed)
    ? parsed
    : Object.entries(parsed ?? {}).map(([address, value]) => ({ address, ...(value ?? {}) }));
  const clients = new Map();
  for (const entry of entries) {
    const address = normalizeAddress(String(entry?.address ?? ""));
    const secret = String(entry?.secret ?? "");
    if (!address || !secret) throw new Error("Each RADIUS client requires address and secret");
    if (clients.has(address)) throw new Error(`Duplicate RADIUS client address: ${address}`);
    clients.set(address, Object.freeze({ address, secret, nasIdentifier: entry.nasIdentifier ? String(entry.nasIdentifier) : null }));
  }
  if (!clients.size) throw new Error("At least one RADIUS client is required");
  return clients;
}

export function createRadiusAccountingServer({
  host = process.env.JASLYN_RADIUS_ACCOUNTING_HOST || "0.0.0.0",
  port = Number(process.env.JASLYN_RADIUS_ACCOUNTING_PORT || 1813),
  clients = parseRadiusClients(),
  onAccounting = persistAccounting,
  logger = console,
} = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("RADIUS accounting port must be an integer between 1 and 65535");
  if (!(clients instanceof Map) || clients.size === 0) throw new Error("At least one RADIUS client must be configured");
  if (typeof onAccounting !== "function") throw new Error("onAccounting must be a function");

  const socket = dgram.createSocket("udp4");
  let listening = false;

  const server = {
    socket,
    address: host,
    port,
    async start() {
      if (listening) return server;
      await new Promise((resolve, reject) => {
        const onError = (error) => { socket.off("listening", onListening); reject(error); };
        const onListening = () => { socket.off("error", onError); listening = true; resolve(); };
        socket.once("error", onError);
        socket.once("listening", onListening);
        socket.bind(port, host);
      });
      return server;
    },
    async close() {
      if (!listening) return;
      await new Promise((resolve) => socket.close(() => resolve()));
      listening = false;
    },
  };

  socket.on("message", async (message, rinfo) => {
    const sourceAddress = normalizeAddress(rinfo.address);
    const client = clients.get(sourceAddress);
    if (!client) {
      logger.warn?.(`RADIUS accounting request rejected from unregistered client ${sourceAddress}`);
      return;
    }

    let packet;
    try {
      packet = parseRadiusPacket(message);
      if (packet.code !== RADIUS_CODES.ACCOUNTING_REQUEST) throw new Error("Unsupported RADIUS packet code on accounting port");
      verifyAccountingRequest(packet, client.secret);
      const event = getAccountingEvent(packet, { nasIdentifier: client.nasIdentifier });
      await onAccounting({ ...event, receivedAt: new Date().toISOString() }, {
        clientAddress: sourceAddress,
        radiusIdentifier: packet.identifier,
      });
      const response = buildAccountingResponse(packet, client.secret);
      socket.send(response, rinfo.port, rinfo.address);
    } catch (error) {
      logger.warn?.(`RADIUS accounting request from ${sourceAddress} was rejected: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  return server;
}
