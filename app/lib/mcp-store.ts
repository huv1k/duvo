import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";

export type McpServerType = "stdio" | "sse" | "http";

export type McpServerEntry = {
  id: string;
  name: string;
  type: McpServerType;
  enabled: boolean;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
};

export type McpServerInput = {
  name: string;
  type: McpServerType;
  enabled?: boolean;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
};

export type McpServerPatch = Partial<Omit<McpServerEntry, "id">>;

const NAME_RE = /^[a-z0-9_]+$/;

const g = globalThis as unknown as {
  __mcpStore?: Map<string, McpServerEntry>;
};

function seed(map: Map<string, McpServerEntry>) {
  if (map.size > 0) return;
  const id = crypto.randomUUID();
  map.set(id, {
    id,
    name: "linear",
    type: "sse",
    enabled: true,
    url: "https://mcp.linear.app/sse",
  });
}

const store: Map<string, McpServerEntry> =
  g.__mcpStore ?? (g.__mcpStore = new Map());
seed(store);

export function listServers(): McpServerEntry[] {
  return Array.from(store.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export function getServer(id: string): McpServerEntry | null {
  return store.get(id) ?? null;
}

export class McpStoreError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

function validate(input: McpServerInput | McpServerPatch, existingId?: string) {
  if (input.name !== undefined) {
    if (!NAME_RE.test(input.name)) {
      throw new McpStoreError(
        "name must match /^[a-z0-9_]+$/ (lowercase letters, digits, underscore)",
      );
    }
    for (const entry of store.values()) {
      if (entry.name === input.name && entry.id !== existingId) {
        throw new McpStoreError(`name "${input.name}" already in use`, 409);
      }
    }
  }
  if (input.type !== undefined) {
    if (!["stdio", "sse", "http"].includes(input.type)) {
      throw new McpStoreError("type must be stdio, sse, or http");
    }
  }
}

export function addServer(input: McpServerInput): McpServerEntry {
  if (!input.name) throw new McpStoreError("name is required");
  if (!input.type) throw new McpStoreError("type is required");
  validate(input);

  if (input.type === "stdio" && !input.command?.trim()) {
    throw new McpStoreError("command is required for stdio servers");
  }
  if ((input.type === "sse" || input.type === "http") && !input.url?.trim()) {
    throw new McpStoreError(`url is required for ${input.type} servers`);
  }

  const entry: McpServerEntry = {
    id: crypto.randomUUID(),
    name: input.name,
    type: input.type,
    enabled: input.enabled ?? true,
    command: input.command,
    args: input.args,
    env: input.env,
    url: input.url,
    headers: input.headers,
  };
  store.set(entry.id, entry);
  return entry;
}

export function updateServer(
  id: string,
  patch: McpServerPatch,
): McpServerEntry | null {
  const current = store.get(id);
  if (!current) return null;
  validate(patch, id);
  const next: McpServerEntry = { ...current, ...patch, id: current.id };
  store.set(id, next);
  return next;
}

export function removeServer(id: string): boolean {
  return store.delete(id);
}

function toConfig(entry: McpServerEntry): McpServerConfig | null {
  switch (entry.type) {
    case "stdio":
      if (!entry.command) return null;
      return {
        type: "stdio",
        command: entry.command,
        args: entry.args,
        env: entry.env,
      };
    case "sse":
      if (!entry.url) return null;
      return { type: "sse", url: entry.url, headers: entry.headers };
    case "http":
      if (!entry.url) return null;
      return { type: "http", url: entry.url, headers: entry.headers };
  }
}

export function getEnabledServerConfigs(): Record<string, McpServerConfig> {
  const out: Record<string, McpServerConfig> = {};
  for (const entry of store.values()) {
    if (!entry.enabled) continue;
    const config = toConfig(entry);
    if (config) out[entry.name] = config;
  }
  return out;
}

export function getEnabledServerNames(): string[] {
  return Array.from(store.values())
    .filter((e) => e.enabled)
    .map((e) => e.name);
}
