const DEFAULT_MODEL = "jaslyn";

export function inferenceConfig(env = process.env) {
  return {
    baseUrl: String(env.JASLYN_INFERENCE_URL || "").replace(/\/$/, ""),
    model: String(env.JASLYN_MODEL || DEFAULT_MODEL),
    token: env.JASLYN_INFERENCE_TOKEN ? String(env.JASLYN_INFERENCE_TOKEN) : "",
  };
}

export async function complete(messages, options = {}) {
  const config = inferenceConfig(options.env || process.env);
  if (!config.baseUrl) {
    throw new Error("Jaslyn self-hosted inference is not configured. Set JASLYN_INFERENCE_URL.");
  }

  const headers = { "content-type": "application/json" };
  if (config.token) headers.authorization = `Bearer ${config.token}`;

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.model,
      temperature: options.temperature ?? 0.2,
      stream: false,
      messages,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Jaslyn inference server returned ${response.status}: ${body.slice(0, 500)}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Jaslyn inference server returned no message.");

  return { content: String(content), model: config.model };
}
