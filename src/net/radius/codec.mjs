import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const RADIUS_CODES = Object.freeze({
  ACCESS_REQUEST: 1,
  ACCESS_ACCEPT: 2,
  ACCESS_REJECT: 3,
  ACCOUNTING_REQUEST: 4,
  ACCOUNTING_RESPONSE: 5,
});

export const RADIUS_ATTRIBUTES = Object.freeze({
  USER_NAME: 1,
  NAS_IP_ADDRESS: 4,
  FRAMED_IP_ADDRESS: 8,
  CALLING_STATION_ID: 31,
  NAS_IDENTIFIER: 32,
  ACCT_STATUS_TYPE: 40,
  ACCT_INPUT_OCTETS: 42,
  ACCT_OUTPUT_OCTETS: 43,
  ACCT_SESSION_ID: 44,
  ACCT_SESSION_TIME: 46,
  ACCT_TERMINATE_CAUSE: 49,
  ACCT_INPUT_GIGAWORDS: 52,
  ACCT_OUTPUT_GIGAWORDS: 53,
  MESSAGE_AUTHENTICATOR: 80,
});

const STATUS_TYPES = Object.freeze({ 1: "Start", 2: "Stop", 3: "Interim-Update" });

function attributeList(buffer) {
  const attributes = [];
  for (let offset = 0; offset < buffer.length;) {
    if (offset + 2 > buffer.length) throw new Error("Malformed RADIUS attribute header");
    const type = buffer[offset];
    const length = buffer[offset + 1];
    if (length < 2 || offset + length > buffer.length) throw new Error("Malformed RADIUS attribute length");
    attributes.push({ type, value: Buffer.from(buffer.subarray(offset + 2, offset + length)) });
    offset += length;
  }
  return attributes;
}

export function parseRadiusPacket(input) {
  const packet = Buffer.from(input);
  if (packet.length < 20) throw new Error("RADIUS packet is shorter than the 20-byte minimum");
  const code = packet[0];
  const identifier = packet[1];
  const length = packet.readUInt16BE(2);
  if (length < 20 || length > 4095 || length > packet.length) throw new Error("Invalid RADIUS packet length");
  const authenticator = Buffer.from(packet.subarray(4, 20));
  const attributesBuffer = packet.subarray(20, length);
  return {
    code,
    identifier,
    length,
    authenticator,
    attributes: attributeList(attributesBuffer),
    raw: Buffer.from(packet.subarray(0, length)),
  };
}

function firstAttribute(packet, type) {
  return packet.attributes.find((attribute) => attribute.type === type)?.value ?? null;
}

function decodeString(value) {
  return value == null ? null : value.toString("utf8");
}

function decodeUInt32(value, name) {
  if (!value || value.length !== 4) throw new Error(`${name} must be a 4-byte RADIUS integer`);
  return value.readUInt32BE(0);
}

function decodeIPv4(value, name) {
  if (!value || value.length !== 4) throw new Error(`${name} must be a 4-byte IPv4 attribute`);
  return Array.from(value).join(".");
}

function safeCounter(low, high, name) {
  const value = BigInt(low >>> 0) + (BigInt(high >>> 0) * 4294967296n);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${name} exceeds JavaScript safe integer range`);
  return Number(value);
}

export function getAccountingEvent(packet, { nasIdentifier: fallbackNasIdentifier = null } = {}) {
  if (packet.code !== RADIUS_CODES.ACCOUNTING_REQUEST) throw new Error("RADIUS packet is not an Accounting-Request");
  const statusValue = firstAttribute(packet, RADIUS_ATTRIBUTES.ACCT_STATUS_TYPE);
  const statusCode = decodeUInt32(statusValue, "Acct-Status-Type");
  const acctStatusType = STATUS_TYPES[statusCode];
  if (!acctStatusType) throw new Error(`Unsupported RADIUS Acct-Status-Type: ${statusCode}`);

  const nasIdentifier = decodeString(firstAttribute(packet, RADIUS_ATTRIBUTES.NAS_IDENTIFIER)) || fallbackNasIdentifier || decodeIPv4(firstAttribute(packet, RADIUS_ATTRIBUTES.NAS_IP_ADDRESS), "NAS-IP-Address");
  const acctSessionId = decodeString(firstAttribute(packet, RADIUS_ATTRIBUTES.ACCT_SESSION_ID));
  if (!nasIdentifier || !acctSessionId) throw new Error("RADIUS accounting requires NAS-Identifier/NAS-IP-Address and Acct-Session-Id");

  const inputOctets = decodeUInt32(firstAttribute(packet, RADIUS_ATTRIBUTES.ACCT_INPUT_OCTETS) ?? Buffer.alloc(4), "Acct-Input-Octets");
  const outputOctets = decodeUInt32(firstAttribute(packet, RADIUS_ATTRIBUTES.ACCT_OUTPUT_OCTETS) ?? Buffer.alloc(4), "Acct-Output-Octets");
  const inputGigawords = decodeUInt32(firstAttribute(packet, RADIUS_ATTRIBUTES.ACCT_INPUT_GIGAWORDS) ?? Buffer.alloc(4), "Acct-Input-Gigawords");
  const outputGigawords = decodeUInt32(firstAttribute(packet, RADIUS_ATTRIBUTES.ACCT_OUTPUT_GIGAWORDS) ?? Buffer.alloc(4), "Acct-Output-Gigawords");

  return {
    nasIdentifier,
    acctSessionId,
    username: decodeString(firstAttribute(packet, RADIUS_ATTRIBUTES.USER_NAME)),
    macAddress: decodeString(firstAttribute(packet, RADIUS_ATTRIBUTES.CALLING_STATION_ID)),
    ipAddress: firstAttribute(packet, RADIUS_ATTRIBUTES.FRAMED_IP_ADDRESS) ? decodeIPv4(firstAttribute(packet, RADIUS_ATTRIBUTES.FRAMED_IP_ADDRESS), "Framed-IP-Address") : null,
    acctStatusType,
    sessionTime: firstAttribute(packet, RADIUS_ATTRIBUTES.ACCT_SESSION_TIME) ? decodeUInt32(firstAttribute(packet, RADIUS_ATTRIBUTES.ACCT_SESSION_TIME), "Acct-Session-Time") : null,
    inputOctets: safeCounter(inputOctets, inputGigawords, "Acct-Input-Octets"),
    outputOctets: safeCounter(outputOctets, outputGigawords, "Acct-Output-Octets"),
    terminationCause: firstAttribute(packet, RADIUS_ATTRIBUTES.ACCT_TERMINATE_CAUSE) ? String(decodeUInt32(firstAttribute(packet, RADIUS_ATTRIBUTES.ACCT_TERMINATE_CAUSE), "Acct-Terminate-Cause")) : null,
  };
}

export function verifyAccountingRequest(packet, secret) {
  if (!secret) throw new Error("RADIUS shared secret is required");
  if (packet.code !== RADIUS_CODES.ACCOUNTING_REQUEST) throw new Error("Only Accounting-Request packets can be verified by this function");
  const zeroAuthenticator = Buffer.alloc(16);
  const signed = Buffer.concat([
    Buffer.from([packet.code, packet.identifier]),
    Buffer.from([(packet.length >> 8) & 0xff, packet.length & 0xff]),
    zeroAuthenticator,
    packet.raw.subarray(20, packet.length),
    Buffer.from(secret, "utf8"),
  ]);
  const expected = createHash("md5").update(signed).digest();
  if (!timingSafeEqual(expected, packet.authenticator)) throw new Error("Invalid RADIUS Accounting-Request authenticator");

  const messageAuthenticator = packet.attributes.find((attribute) => attribute.type === RADIUS_ATTRIBUTES.MESSAGE_AUTHENTICATOR);
  if (messageAuthenticator) {
    if (messageAuthenticator.value.length !== 16) throw new Error("Invalid RADIUS Message-Authenticator length");
    const message = Buffer.from(packet.raw);
    let offset = 20;
    while (offset < packet.length) {
      const type = message[offset];
      const length = message[offset + 1];
      if (type === RADIUS_ATTRIBUTES.MESSAGE_AUTHENTICATOR) message.fill(0, offset + 2, offset + 18);
      offset += length;
    }
    const expectedMessage = createHmac("md5", secret).update(message).digest();
    if (!timingSafeEqual(expectedMessage, messageAuthenticator.value)) throw new Error("Invalid RADIUS Message-Authenticator");
  }
  return true;
}

export function buildAccountingResponse(packet, secret) {
  if (packet.code !== RADIUS_CODES.ACCOUNTING_REQUEST) throw new Error("Accounting-Response requires an Accounting-Request");
  const length = 20;
  const header = Buffer.alloc(length);
  header[0] = RADIUS_CODES.ACCOUNTING_RESPONSE;
  header[1] = packet.identifier;
  header.writeUInt16BE(length, 2);
  packet.authenticator.copy(header, 4);
  const responseAuthenticator = createHash("md5").update(Buffer.concat([header.subarray(0, 4), packet.authenticator, Buffer.from(secret, "utf8")])).digest();
  responseAuthenticator.copy(header, 4);
  return header;
}
