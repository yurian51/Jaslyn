import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildAccountingResponse, getAccountingEvent, parseRadiusPacket, verifyAccountingRequest } from "../../src/net/radius/codec.mjs";
import { parseRadiusClients } from "../../src/net/radius/accounting-server.mjs";

function attr(type, value) {
  const data = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return Buffer.concat([Buffer.from([type, data.length + 2]), data]);
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value);
  return buffer;
}

function buildAccountingRequest({ secret, identifier = 7, attributes }) {
  const attributeBuffer = Buffer.concat(attributes);
  const length = 20 + attributeBuffer.length;
  const header = Buffer.alloc(20);
  header[0] = 4;
  header[1] = identifier;
  header.writeUInt16BE(length, 2);
  const unsigned = Buffer.concat([header.subarray(0, 4), Buffer.alloc(16), attributeBuffer, Buffer.from(secret)]);
  createHash("md5").update(unsigned).digest().copy(header, 4);
  return Buffer.concat([header, attributeBuffer]);
}

test("RADIUS accounting codec verifies RFC 2866 request authenticator and normalizes session fields", () => {
  const secret = "testing-shared-secret";
  const request = buildAccountingRequest({
    secret,
    attributes: [
      attr(32, "router-01"),
      attr(1, "alice"),
      attr(31, "AA-BB-CC-DD-EE-FF"),
      attr(8, Buffer.from([10, 20, 30, 40])),
      attr(40, uint32(1)),
      attr(44, "session-123"),
      attr(46, uint32(120)),
      attr(42, uint32(500)),
      attr(43, uint32(700)),
    ],
  });
  const packet = parseRadiusPacket(request);
  assert.doesNotThrow(() => verifyAccountingRequest(packet, secret));
  const event = getAccountingEvent(packet);
  assert.deepEqual(event, {
    nasIdentifier: "router-01",
    acctSessionId: "session-123",
    username: "alice",
    macAddress: "AA-BB-CC-DD-EE-FF",
    ipAddress: "10.20.30.40",
    acctStatusType: "Start",
    sessionTime: 120,
    inputOctets: 500,
    outputOctets: 700,
    terminationCause: null,
  });
});

test("RADIUS accounting codec rejects a wrong shared secret", () => {
  const request = buildAccountingRequest({ secret: "correct-secret", attributes: [attr(32, "router-01"), attr(40, uint32(2)), attr(44, "session-123")] });
  const packet = parseRadiusPacket(request);
  assert.throws(() => verifyAccountingRequest(packet, "wrong-secret"), /Invalid RADIUS Accounting-Request authenticator/);
});

test("RADIUS accounting response carries the correct response authenticator", () => {
  const secret = "response-secret";
  const request = buildAccountingRequest({ secret, identifier: 9, attributes: [attr(32, "router-01"), attr(40, uint32(3)), attr(44, "session-123")] });
  const packet = parseRadiusPacket(request);
  const response = buildAccountingResponse(packet, secret);
  const expected = createHash("md5").update(Buffer.concat([response.subarray(0, 4), packet.authenticator, Buffer.from(secret)])).digest();
  assert.deepEqual(response.subarray(4, 20), expected);
  assert.equal(response[0], 5);
  assert.equal(response[1], 9);
});

test("RADIUS client configuration is explicit and rejects duplicate NAS source addresses", () => {
  const clients = parseRadiusClients(JSON.stringify([{ address: "10.0.0.1", secret: "one", nasIdentifier: "router-01" }]));
  assert.deepEqual(clients.get("10.0.0.1"), { address: "10.0.0.1", secret: "one", nasIdentifier: "router-01" });
  assert.throws(() => parseRadiusClients(JSON.stringify([{ address: "10.0.0.1", secret: "one" }, { address: "10.0.0.1", secret: "two" }])), /Duplicate RADIUS client address/);
});
