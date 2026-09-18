import { createRadiusAccountingServer } from "../src/net/radius/accounting-server.mjs";

const server = createRadiusAccountingServer();
await server.start();

const bound = server.socket.address();
console.log(`Jaslyn RADIUS accounting transport listening on ${bound.address}:${bound.port}`);

const shutdown = async (signal) => {
  console.log(`Stopping RADIUS accounting transport after ${signal}`);
  await server.close();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
