import Anthropic from "@anthropic-ai/sdk";

interface Env {
  /** Claude Code OAuth token (sk-ant-oat...) from `claude setup-token`. */
  CLAUDE_CODE_OAUTH_TOKEN: string;
  /** Shared secret required on manual HTTP pings, so the public URL can't burn your quota. */
  TRIGGER_SECRET: string;
}

const MODEL = "claude-haiku-4-5"; // lightest draw on the subscription quota

async function ping(env: Env) {
  const started = Date.now();
  const client = new Anthropic({
    // Subscription auth: sent as `Authorization: Bearer`, not `x-api-key`.
    // Only this credential opens a 5-hour usage window; an API key does not.
    apiKey: null,
    authToken: env.CLAUDE_CODE_OAUTH_TOKEN,
    defaultHeaders: { "anthropic-beta": "oauth-2025-04-20" },
  });

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 16,
    system: "Reply with exactly one word and nothing else: pong",
    messages: [{ role: "user", content: "ping" }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  return {
    ok: /pong/i.test(text),
    model: res.model,
    reply: text,
    stop_reason: res.stop_reason,
    usage: res.usage,
    ms: Date.now() - started,
    at: new Date().toISOString(),
  };
}

function describeError(e: unknown) {
  if (e instanceof Anthropic.APIError) {
    return {
      kind: e.name,
      status: e.status,
      request_id: e.requestID,
      message: e.message,
      body: e.error,
    };
  }
  return { kind: "unknown", message: e instanceof Error ? e.message : String(e) };
}

export default {
  // Cron-triggered session.
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      ping(env).then(
        (r) => console.log(`[cron ${event.cron}]`, JSON.stringify(r)),
        (e) => console.error(`[cron ${event.cron}] failed:`, JSON.stringify(describeError(e))),
      ),
    );
  },

  // Manual trigger: GET /ping?secret=...  (or header `x-trigger-secret`)
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== "/ping") {
      return new Response("not found", { status: 404 });
    }

    const supplied =
      req.headers.get("x-trigger-secret") ?? url.searchParams.get("secret");
    if (!env.TRIGGER_SECRET || supplied !== env.TRIGGER_SECRET) {
      return new Response("unauthorized", { status: 401 });
    }

    try {
      const result = await ping(env);
      return Response.json(result, { status: result.ok ? 200 : 502 });
    } catch (err) {
      const detail = describeError(err);
      const status =
        err instanceof Anthropic.APIError ? err.status ?? 500 : 500;
      return Response.json({ ok: false, ...detail }, { status });
    }
  },
};
