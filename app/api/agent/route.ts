import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { saveCsvServer } from "../../lib/save-csv-tool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_TOOLS = [
  "Read",
  "Grep",
  "Glob",
  "WebFetch",
  "WebSearch",
  "mcp__files__save_csv",
];

const APPEND_SYSTEM_PROMPT = `You can use WebSearch and WebFetch to gather the latest AI news from the web. When the user asks for AI news as a CSV, extract for each article: title, date (ISO 8601 if possible), a short excerpt, and the article link. Then call the \`save_csv\` tool (full name \`mcp__files__save_csv\`) with \`{ filename, rows: [{title, date, excerpt, link}] }\`. The tool returns a JSON object with a \`url\` and \`filename\`. End your final reply with a single Markdown link of the form \`[Download <filename>](<url>)\` using exactly the URL the tool returned.`;

export async function POST(request: Request) {
  let prompt: string;
  try {
    const body = (await request.json()) as { prompt?: unknown };
    if (typeof body.prompt !== "string" || body.prompt.trim() === "") {
      return new Response(JSON.stringify({ error: "Missing 'prompt' string" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    prompt = body.prompt;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const abortController = new AbortController();
  request.signal.addEventListener("abort", () => abortController.abort());

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (msg: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));
      };

      try {
        const iterator = query({
          prompt,
          options: {
            cwd: process.cwd(),
            tools: ALLOWED_TOOLS,
            allowedTools: ALLOWED_TOOLS,
            mcpServers: { files: saveCsvServer },
            systemPrompt: {
              type: "preset",
              preset: "claude_code",
              append: APPEND_SYSTEM_PROMPT,
            },
            model: "claude-sonnet-4-6",
            permissionMode: "default",
            abortController,
          },
        });

        for await (const message of iterator as AsyncIterable<SDKMessage>) {
          send(message);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
