import type { ToolDefinition, ToolName } from "../types.js";

export class ToolRegistry {
  private readonly tools = new Map<ToolName, ToolDefinition>();

  register<TInput, TOutput>(tool: ToolDefinition<TInput, TOutput>): void {
    if (this.tools.has(tool.name)) throw new Error(`Tool already registered: ${tool.name}`);
    this.tools.set(tool.name, tool as ToolDefinition);
  }

  get(name: ToolName): ToolDefinition {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    return tool;
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }
}
