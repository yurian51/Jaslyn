import type { ToolDefinition } from "../types.js";

export const echoTool: ToolDefinition<{ text?: string }, { text: string }> = {
  name: "echo",
  description: "Returns the supplied text. Safe baseline tool used for runtime verification.",
  async execute(input) {
    return { text: input.text ?? "" };
  }
};
