import test from "node:test";
import assert from "node:assert/strict";
import { inferenceConfig } from "../src-js/runtime/provider.js";

test("JavaScript runtime resolves Jaslyn inference configuration", () => {
  const config = inferenceConfig({
    JASLYN_INFERENCE_URL: "http://localhost:11434/v1/",
    JASLYN_MODEL: "jaslyn-fast",
    JASLYN_INFERENCE_TOKEN: "secret",
  });

  assert.equal(config.baseUrl, "http://localhost:11434/v1");
  assert.equal(config.model, "jaslyn-fast");
  assert.equal(config.token, "secret");
});

test("JavaScript runtime defaults to the Jaslyn model identity", () => {
  const config = inferenceConfig({});
  assert.equal(config.model, "jaslyn");
  assert.equal(config.baseUrl, "");
});
