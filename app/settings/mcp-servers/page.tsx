"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { McpServerEntry, McpServerType } from "../../lib/mcp-store";

type FormState = {
  name: string;
  type: McpServerType;
  command: string;
  args: string;
  env: string;
  url: string;
  headers: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  type: "sse",
  command: "",
  args: "",
  env: "",
  url: "",
  headers: "",
};

function parseKvLines(text: string, separator: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const idx = line.indexOf(separator);
    if (idx === -1) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + separator.length).trim();
    if (k) out[k] = v;
  }
  return out;
}

function parseArgs(text: string): string[] {
  return text
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function McpServersPage() {
  const [servers, setServers] = useState<McpServerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/mcp-servers", { cache: "no-store" });
    const data = (await res.json()) as { servers: McpServerEntry[] };
    setServers(data.servers);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function toggle(entry: McpServerEntry) {
    await fetch(`/api/mcp-servers/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !entry.enabled }),
    });
    refresh();
  }

  async function remove(entry: McpServerEntry) {
    if (!confirm(`Remove "${entry.name}"?`)) return;
    await fetch(`/api/mcp-servers/${entry.id}`, { method: "DELETE" });
    refresh();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        type: form.type,
        enabled: true,
      };
      if (form.type === "stdio") {
        payload.command = form.command.trim();
        if (form.args.trim()) payload.args = parseArgs(form.args);
        if (form.env.trim()) payload.env = parseKvLines(form.env, "=");
      } else {
        payload.url = form.url.trim();
        if (form.headers.trim())
          payload.headers = parseKvLines(form.headers, ":");
      }
      const res = await fetch("/api/mcp-servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setForm(EMPTY_FORM);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-full flex flex-col bg-zinc-50 dark:bg-black font-sans">
      <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-12 flex flex-col gap-8">
        <header className="flex flex-col gap-1">
          <Link
            href="/"
            className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 w-fit"
          >
            ← Back to chat
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            MCP servers
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Connect MCP servers the agent can call. Stored in memory — resets
            when the server restarts.
          </p>
        </header>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Connected servers
          </h2>
          {loading ? (
            <div className="text-sm text-zinc-500">Loading…</div>
          ) : servers.length === 0 ? (
            <div className="text-sm text-zinc-500">
              No servers yet. Add one below.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {servers.map((s) => (
                <li
                  key={s.id}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-zinc-900 dark:text-zinc-100">
                        {s.name}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                        {s.type}
                      </span>
                      {!s.enabled && (
                        <span className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400">
                          disabled
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500 truncate">
                      {s.type === "stdio"
                        ? [s.command, ...(s.args ?? [])].join(" ")
                        : s.url}
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={s.enabled}
                      onChange={() => toggle(s)}
                    />
                    Enabled
                  </label>
                  <button
                    onClick={() => remove(s)}
                    className="text-xs text-red-600 dark:text-red-400 hover:underline"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Add a server
          </h2>
          <form
            onSubmit={submit}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 flex flex-col gap-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3">
              <Field label="Name (lowercase, used as namespace)">
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="github"
                  className={inputClass}
                />
              </Field>
              <Field label="Type">
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      type: e.target.value as McpServerType,
                    })
                  }
                  className={inputClass}
                >
                  <option value="sse">sse</option>
                  <option value="http">http</option>
                  <option value="stdio">stdio</option>
                </select>
              </Field>
            </div>

            {form.type === "stdio" ? (
              <>
                <Field label="Command">
                  <input
                    required
                    value={form.command}
                    onChange={(e) =>
                      setForm({ ...form, command: e.target.value })
                    }
                    placeholder="npx"
                    className={inputClass}
                  />
                </Field>
                <Field label="Args (space-separated)">
                  <input
                    value={form.args}
                    onChange={(e) =>
                      setForm({ ...form, args: e.target.value })
                    }
                    placeholder="-y @modelcontextprotocol/server-github"
                    className={inputClass}
                  />
                </Field>
                <Field label="Env (KEY=VALUE per line)">
                  <textarea
                    rows={3}
                    value={form.env}
                    onChange={(e) =>
                      setForm({ ...form, env: e.target.value })
                    }
                    placeholder="GITHUB_TOKEN=ghp_..."
                    className={inputClass}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label="URL">
                  <input
                    required
                    value={form.url}
                    onChange={(e) =>
                      setForm({ ...form, url: e.target.value })
                    }
                    placeholder="https://example.com/mcp"
                    className={inputClass}
                  />
                </Field>
                <Field label="Headers (Header: value per line)">
                  <textarea
                    rows={3}
                    value={form.headers}
                    onChange={(e) =>
                      setForm({ ...form, headers: e.target.value })
                    }
                    placeholder="Authorization: Bearer ..."
                    className={inputClass}
                  />
                </Field>
              </>
            )}

            {error && (
              <div className="text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-full bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-5 h-10 text-sm font-medium disabled:opacity-40"
              >
                {submitting ? "Adding…" : "Add server"}
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-zinc-600 dark:text-zinc-400">{label}</span>
      {children}
    </label>
  );
}
