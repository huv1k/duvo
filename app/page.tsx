"use client";

import { useRef, useState, type ReactNode } from "react";

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

type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock
  | ThinkingBlock
  | OtherBlock;

type AssistantMessage = {
  type: "assistant";
  message: { content: ContentBlock[] };
  uuid?: string;
};
type UserMessage = {
  type: "user";
  message: { content: ContentBlock[] | string };
  uuid?: string;
};
type ResultMessage = {
  type: "result";
  subtype: string;
  result?: string;
  is_error?: boolean;
  total_cost_usd?: number;
  duration_ms?: number;
  num_turns?: number;
};
type ErrorMessage = { type: "error"; error: string };
type OtherMessage = { type: string };

type StreamMessage =
  | AssistantMessage
  | UserMessage
  | ResultMessage
  | ErrorMessage
  | OtherMessage;

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function run() {
    if (!prompt.trim() || running) return;
    setMessages([]);
    setRunning(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        setMessages((m) => [...m, { type: "error", error: text || `HTTP ${res.status}` }]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const payload = line.slice(6);
          try {
            const msg = JSON.parse(payload) as StreamMessage;
            setMessages((m) => [...m, msg]);
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((m) => [
          ...m,
          { type: "error", error: (err as Error).message },
        ]);
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  return (
    <div className="min-h-full flex flex-col bg-zinc-50 dark:bg-black font-sans">
      <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-12 flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Agentic Automation
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Write instructions. Claude runs them with read-only tools.
          </p>
        </header>

        <div className="flex flex-col gap-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. List the files in this repo and summarize what it is."
            rows={6}
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600 resize-y"
            disabled={running}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                run();
              }
            }}
          />
          <div className="flex gap-2">
            <button
              onClick={run}
              disabled={running || !prompt.trim()}
              className="rounded-full bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-5 h-10 text-sm font-medium disabled:opacity-40"
            >
              {running ? "Running…" : "Run"}
            </button>
            {running && (
              <button
                onClick={cancel}
                className="rounded-full border border-zinc-300 dark:border-zinc-700 px-5 h-10 text-sm font-medium text-zinc-900 dark:text-zinc-100"
              >
                Cancel
              </button>
            )}
            <span className="text-xs text-zinc-500 self-center ml-auto">
              ⌘/Ctrl + Enter to run
            </span>
          </div>
        </div>

        <section className="flex flex-col gap-3">
          {messages.map((msg, i) => (
            <MessageView key={i} msg={msg} />
          ))}
          {running && messages.length === 0 && (
            <div className="text-sm text-zinc-500">Waiting for agent…</div>
          )}
        </section>
      </main>
    </div>
  );
}

function MessageView({ msg }: { msg: StreamMessage }) {
  if (msg.type === "assistant") {
    const m = msg as AssistantMessage;
    const blocks = m.message?.content ?? [];
    return (
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
          Assistant
        </div>
        <div className="flex flex-col gap-2">
          {blocks.map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </div>
      </div>
    );
  }

  if (msg.type === "user") {
    const m = msg as UserMessage;
    const content = m.message?.content;
    const blocks: ContentBlock[] = Array.isArray(content)
      ? content
      : typeof content === "string"
        ? [{ type: "text", text: content }]
        : [];
    const isToolResult = blocks.some((b) => b.type === "tool_result");
    if (!isToolResult) return null;
    return (
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
          Tool result
        </div>
        <div className="flex flex-col gap-2">
          {blocks.map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </div>
      </div>
    );
  }

  if (msg.type === "result") {
    const r = msg as ResultMessage;
    return (
      <div
        className={`rounded-lg border p-3 ${
          r.is_error
            ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950"
            : "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950"
        }`}
      >
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
          Result
        </div>
        {r.result && (
          <div className="text-sm text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap">
            {r.result}
          </div>
        )}
        <div className="mt-2 text-xs text-zinc-500">
          {r.num_turns != null && <>{r.num_turns} turns · </>}
          {r.duration_ms != null && <>{(r.duration_ms / 1000).toFixed(1)}s · </>}
          {r.total_cost_usd != null && <>${r.total_cost_usd.toFixed(4)}</>}
        </div>
      </div>
    );
  }

  if (msg.type === "error") {
    const e = msg as ErrorMessage;
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950 p-3 text-sm text-red-900 dark:text-red-200">
        {e.error}
      </div>
    );
  }

  return null;
}

function BlockView({ block }: { block: ContentBlock }) {
  if (block.type === "text") {
    const b = block as TextBlock;
    return (
      <div className="text-sm text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap">
        {renderInline(b.text)}
      </div>
    );
  }
  if (block.type === "thinking") {
    const b = block as ThinkingBlock;
    return (
      <details className="text-xs text-zinc-500">
        <summary className="cursor-pointer">Thinking</summary>
        <div className="mt-1 whitespace-pre-wrap">{b.thinking}</div>
      </details>
    );
  }
  if (block.type === "tool_use") {
    const b = block as ToolUseBlock;
    return (
      <details className="rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-2 text-xs">
        <summary className="cursor-pointer text-zinc-700 dark:text-zinc-300">
          <span className="font-mono font-semibold">{b.name}</span>
          <span className="ml-2 text-zinc-500">{summarizeInput(b.input)}</span>
        </summary>
        <pre className="mt-2 overflow-x-auto text-[11px] text-zinc-600 dark:text-zinc-400">
          {JSON.stringify(b.input, null, 2)}
        </pre>
      </details>
    );
  }
  if (block.type === "tool_result") {
    const b = block as ToolResultBlock;
    const content = b.content;
    const text =
      typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content
              .map((c: { type?: string; text?: string }) =>
                c.type === "text" ? c.text ?? "" : "",
              )
              .join("\n")
          : JSON.stringify(content);
    return (
      <details className="text-xs">
        <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">
          {b.is_error ? "error" : "output"} ({text.length} chars)
        </summary>
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[11px] text-zinc-600 dark:text-zinc-400">
          {text}
        </pre>
      </details>
    );
  }
  return null;
}

function renderInline(text: string): ReactNode[] {
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const [, label, url] = m;
    out.push(
      <a
        key={key++}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 dark:text-blue-400 underline underline-offset-2"
      >
        {label}
      </a>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function summarizeInput(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const obj = input as Record<string, unknown>;
  const keys = ["file_path", "path", "pattern", "url", "command", "query"];
  for (const k of keys) {
    if (typeof obj[k] === "string") return String(obj[k]);
  }
  return "";
}
