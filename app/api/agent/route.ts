import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const READ_ONLY_TOOLS = ["Read", "Grep", "Glob", "WebFetch"];

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
            tools: READ_ONLY_TOOLS,
            allowedTools: READ_ONLY_TOOLS,
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
