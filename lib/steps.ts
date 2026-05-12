export type StepStatus = "running" | "done" | "failed";

export type Step = {
  id: string;
  name: string;
  summary: string;
  input: unknown;
  status: StepStatus;
  result?: { isError: boolean; text: string };
  startedAt: number;
};

type TextBlock = { type: "text"; text: string };
type ToolUseBlock = { type: "tool_use"; id: string; name: string; input: unknown };
type ToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: unknown;
  is_error?: boolean;
};
type ThinkingBlock = { type: "thinking"; thinking: string };
type OtherBlock = { type: string };

export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock
  | ThinkingBlock
  | OtherBlock;

export type AssistantMessage = {
  type: "assistant";
  message: { content: ContentBlock[] };
  uuid?: string;
};
export type UserMessage = {
  type: "user";
  message: { content: ContentBlock[] | string };
  uuid?: string;
};
export type ResultMessage = {
  type: "result";
  subtype: string;
  result?: string;
  is_error?: boolean;
  total_cost_usd?: number;
  duration_ms?: number;
  num_turns?: number;
};
export type ErrorMessage = { type: "error"; error: string };
export type AuthRequiredMessage = {
  type: "auth_required";
  serverName: string;
  url: string;
  elicitationId?: string;
  message?: string;
};
export type SystemMessage = {
  type: "system";
  subtype?: string;
  mcp_server_name?: string;
  elicitation_id?: string;
};
export type OtherMessage = { type: string };

export type StreamMessage =
  | AssistantMessage
  | UserMessage
  | ResultMessage
  | ErrorMessage
  | AuthRequiredMessage
  | SystemMessage
  | OtherMessage;

export type AuthPrompt = {
  serverName: string;
  url: string;
  elicitationId?: string;
  message?: string;
  resolved: boolean;
};

export function deriveAuthPrompts(messages: StreamMessage[]): AuthPrompt[] {
  const resolved = new Set<string>();
  for (const m of messages) {
    if (
      m.type === "system" &&
      (m as SystemMessage).subtype === "elicitation_complete"
    ) {
      const id = (m as SystemMessage).elicitation_id;
      if (id) resolved.add(id);
    }
  }
  const prompts: AuthPrompt[] = [];
  for (const m of messages) {
    if (m.type !== "auth_required") continue;
    const a = m as AuthRequiredMessage;
    prompts.push({
      serverName: a.serverName,
      url: a.url,
      elicitationId: a.elicitationId,
      message: a.message,
      resolved: a.elicitationId ? resolved.has(a.elicitationId) : false,
    });
  }
  return prompts;
}

export function summarizeInput(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const obj = input as Record<string, unknown>;
  const keys = ["file_path", "path", "pattern", "url", "command", "query"];
  for (const k of keys) {
    if (typeof obj[k] === "string") return String(obj[k]);
  }
  return "";
}

export function flattenToolResult(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c: { type?: string; text?: string }) =>
        c.type === "text" ? c.text ?? "" : "",
      )
      .join("\n");
  }
  return JSON.stringify(content);
}

export function deriveSteps(messages: StreamMessage[], running: boolean): Step[] {
  const steps: Step[] = [];
  const byId = new Map<string, Step>();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.type === "assistant") {
      const blocks = (msg as AssistantMessage).message?.content ?? [];
      for (const block of blocks) {
        if (block.type === "tool_use") {
          const b = block as ToolUseBlock;
          if (byId.has(b.id)) continue;
          const step: Step = {
            id: b.id,
            name: b.name,
            summary: summarizeInput(b.input),
            input: b.input,
            status: "running",
            startedAt: i,
          };
          steps.push(step);
          byId.set(b.id, step);
        }
      }
      continue;
    }

    if (msg.type === "user") {
      const content = (msg as UserMessage).message?.content;
      const blocks: ContentBlock[] = Array.isArray(content) ? content : [];
      for (const block of blocks) {
        if (block.type === "tool_result") {
          const b = block as ToolResultBlock;
          const step = byId.get(b.tool_use_id);
          if (!step) continue;
          step.status = b.is_error ? "failed" : "done";
          step.result = {
            isError: !!b.is_error,
            text: flattenToolResult(b.content),
          };
        }
      }
    }
  }

  if (!running) {
    for (const step of steps) {
      if (step.status === "running") step.status = "failed";
    }
  }

  return steps;
}

export function findResultMessage(messages: StreamMessage[]): ResultMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].type === "result") return messages[i] as ResultMessage;
  }
  return null;
}

export function findErrorMessage(messages: StreamMessage[]): ErrorMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].type === "error") return messages[i] as ErrorMessage;
  }
  return null;
}
