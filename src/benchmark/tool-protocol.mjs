export const TOOL_TAG = "jaslyn_tool_call";

export function buildToolPrompt(tools = []) {
  if (!tools.length) return "";
  const definitions = tools.map((tool) => ({
    name: tool.name,
    description: tool.description || "",
    input: tool.inputSchema || { type: "object" },
  }));
  return [
    "JASLYN TOOL PROTOCOL",
    "Use a tool only when it materially advances the user's goal.",
    "When a tool is required, emit exactly one JSON object inside <jaslyn_tool_call>...</jaslyn_tool_call>.",
    JSON.stringify(definitions),
  ].join("\n");
}

export function parseToolCalls(text) {
  const calls = [];
  const re = /<jaslyn_tool_call>([\s\S]*?)<\/jaslyn_tool_call>/g;
  let match;
  while ((match = re.exec(String(text || "")))) {
    try {
      const value = JSON.parse(match[1].trim());
      if (!value?.name || typeof value.name !== "string") continue;
      calls.push({ id: value.id || crypto.randomUUID(), name: value.name, input: value.input && typeof value.input === "object" ? value.input : {} });
    } catch {
      // Malformed tool output is ignored rather than executed.
    }
  }
  return calls;
}

export function stripToolCalls(text) {
  return String(text || "").replace(/<jaslyn_tool_call>[\s\S]*?<\/jaslyn_tool_call>/g, "").trim();
}
