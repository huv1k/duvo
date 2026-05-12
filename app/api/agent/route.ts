import {
  query,
  type ElicitationRequest,
  type ElicitationResult,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { saveCsvServer } from "../../lib/save-csv-tool";
import {
  getEnabledServerConfigs,
  getEnabledServerNames,
} from "../../lib/mcp-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE_TOOLS = [
  "Read",
  "Grep",
  "Glob",
  "WebFetch",
  "WebSearch",
  "mcp__files__save_csv",
];

const APPEND_SYSTEM_PROMPT = `You can use WebSearch and WebFetch to gather the latest AI news from the web. When the user asks for AI news as a CSV, extract for each article: title, date (ISO 8601 if possible), a short excerpt, and the article link. Then call the \`save_csv\` tool (full name \`mcp__files__save_csv\`) with \`{ filename, rows: [{title, date, excerpt, link}] }\`. The tool returns a JSON object with a \`url\` and \`filename\`. Include a single Markdown link of the form \`[Download <filename>](<url>)\` using exactly the URL the tool returned.

Before ending the run, evaluate your own work against the user's original task. Your final reply MUST end with a fenced code block tagged \`evaluation\` containing JSON with this exact shape:

\`\`\`evaluation
{
  "success": true,
  "summary": "<one-sentence verdict>",
  "criteria": [
    { "name": "<what you checked>", "passed": true, "note": "<short evidence>" }
  ]
}
\`\`\`

Derive \`criteria\` from the user's task (e.g. "CSV produced", "all required columns present", "rows match the requested topic", "download link uses the URL returned by save_csv"). Verify each criterion against the artifacts you actually produced — re-read the relevant tool results, and follow the download URL with \`WebFetch\` if you need to inspect file contents. Set \`success: false\` if any criterion fails, and explain in \`summary\`. The evaluation block must be the very last thing in your reply.`;

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

      const onElicitation = async (
        request: ElicitationRequest,
      ): Promise<ElicitationResult> => {
        if (request.mode === "url" && request.url) {
          send({
            type: "auth_required",
            serverName: request.serverName,
            url: request.url,
            elicitationId: request.elicitationId,
            message: request.message,
          });
          return { action: "accept" };
        }
        return { action: "decline" };
      };

      try {
        const userServers = getEnabledServerConfigs();
        const allowedTools = [
          ...BASE_TOOLS,
          ...getEnabledServerNames().map((n) => `mcp__${n}`),
        ];
        const iterator = query({
          prompt,
          options: {
            cwd: process.cwd(),
            tools: allowedTools,
            allowedTools,
            mcpServers: { files: saveCsvServer, ...userServers },
            onElicitation,
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
