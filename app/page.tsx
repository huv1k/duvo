"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { StepsTimeline } from "@/components/StepsTimeline";
import type { StreamMessage } from "@/lib/steps";

type View = "compose" | "progress";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [lastPrompt, setLastPrompt] = useState("");
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [view, setView] = useState<View>("compose");
  const abortRef = useRef<AbortController | null>(null);

  async function run() {
    if (!prompt.trim() || running) return;
    setMessages([]);
    setLastPrompt(prompt);
    setRunning(true);
    setView("progress");

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

  function reset() {
    setMessages([]);
    setLastPrompt("");
    setView("compose");
  }

  return (
    <div className="min-h-full flex flex-col bg-zinc-50 dark:bg-black font-sans">
      <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-12 flex flex-col gap-6">
        <header className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Agentic Automation
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {view === "compose"
                ? "Write instructions. Claude runs them with read-only tools."
                : "Live progress of the automation run."}
            </p>
          </div>
          <Link
            href="/settings/mcp-servers"
            className="text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-full border border-zinc-200 dark:border-zinc-800 px-3 h-8 inline-flex items-center whitespace-nowrap"
          >
            + Add MCP server
          </Link>
        </header>

        {view === "compose" ? (
          <div className="flex flex-col gap-3">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Find all files matching 'route.ts' and read the first one."
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
              <span className="text-xs text-zinc-500 self-center ml-auto">
                ⌘/Ctrl + Enter to run
              </span>
            </div>
          </div>
        ) : (
          <StepsTimeline
            messages={messages}
            running={running}
            prompt={lastPrompt}
            onCancel={cancel}
            onReset={reset}
          />
        )}
      </main>
    </div>
  );
}

