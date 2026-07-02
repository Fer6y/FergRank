// ─────────────────────────────────────────────────────────────────────────
//  /api/chat — the "Ask the Analyst" agent loop.
//
//  POST { messages: [{role, content}], eventName? } → NDJSON stream:
//    {"type":"text","text":"…"}   incremental answer tokens
//    {"type":"tool","label":"…"}  a tool fired (UI activity affordance)
//    {"type":"done"}              turn complete
//    {"type":"error","message"}   terminal failure
//
//  Claude starts with zero fight facts and grounds every claim through the
//  tool layer (src/lib/agent/tools.ts) — the same display-path accessors the
//  UI reads. This is the app's SECOND external runtime call (alongside the
//  Octagon rankings fetch); see data/SOURCES.md.
// ─────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { ANALYST_TOOLS, executeTool, toolActivityLabel } from '@/lib/agent/tools';
import { ANALYST_SYSTEM_PROMPT } from '@/lib/agent/systemPrompt';

// Needs the in-process CSV data cache — must NOT run on the edge.
export const runtime = 'nodejs';

const MODEL = 'claude-sonnet-5';
const MAX_TOOL_ITERATIONS = 8;   // hard cap on tool round-trips per turn
const MAX_TOKENS = 4096;         // per-iteration output ceiling (streamed)
const MAX_HISTORY_MESSAGES = 16; // server-side cap on replayed chat history
const MAX_MESSAGE_CHARS = 2000;

// ── Rate limit (in-memory, per IP — fine for a single-process server) ────
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX_REQUESTS = 20;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_MAX_REQUESTS;
}

// ── Request parsing ───────────────────────────────────────────────────────
interface ChatRequest {
  messages: { role: 'user' | 'assistant'; content: string }[];
  eventName?: string;
}

function parseBody(body: unknown): ChatRequest | null {
  if (!body || typeof body !== 'object') return null;
  const raw = (body as Record<string, unknown>).messages;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const messages: ChatRequest['messages'] = [];
  for (const m of raw.slice(-MAX_HISTORY_MESSAGES)) {
    if (!m || typeof m !== 'object') return null;
    const role = (m as Record<string, unknown>).role;
    const content = (m as Record<string, unknown>).content;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return null;
    if (!content.trim()) continue;
    messages.push({ role, content: content.slice(0, MAX_MESSAGE_CHARS) });
  }
  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') return null;
  const eventName = (body as Record<string, unknown>).eventName;
  return { messages, eventName: typeof eventName === 'string' ? eventName.slice(0, 120) : undefined };
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'The analyst is not configured (missing ANTHROPIC_API_KEY).' },
      { status: 503 },
    );
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: 'Slow down — too many questions at once. Try again in a few minutes.' },
      { status: 429 },
    );
  }

  let parsed: ChatRequest | null = null;
  try {
    parsed = parseBody(await request.json());
  } catch {
    parsed = null;
  }
  if (!parsed) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const { messages: history, eventName } = parsed;

  const client = new Anthropic({ apiKey });

  // Chat history → API messages. The card the user is looking at rides along
  // as a context line on the latest user turn (volatile content stays at the
  // very end of the prompt, after the cache breakpoint on the system block).
  const messages: Anthropic.MessageParam[] = history.map((m, i) => {
    const isLast = i === history.length - 1;
    const text =
      isLast && m.role === 'user' && eventName
        ? `${m.content}\n\n(Context: the user is currently viewing the card "${eventName}".)`
        : m.content;
    return { role: m.role, content: [{ type: 'text' as const, text }] };
  });

  const abort = new AbortController();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));

      try {
        for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
          const msgStream = client.messages.stream(
            {
              model: MODEL,
              max_tokens: MAX_TOKENS,
              // Latency/quality knob for the chat surface. Adaptive thinking
              // stays on (Sonnet 5 default) — it drives tool triggering.
              output_config: { effort: 'medium' },
              system: [
                {
                  type: 'text',
                  text: ANALYST_SYSTEM_PROMPT,
                  // Prefix breakpoint: caches tools + system together across
                  // every request and every loop iteration.
                  cache_control: { type: 'ephemeral' },
                },
              ],
              tools: ANALYST_TOOLS,
              messages,
            },
            { signal: abort.signal },
          );

          msgStream.on('text', (delta) => send({ type: 'text', text: delta }));
          const response = await msgStream.finalMessage();

          if (response.stop_reason === 'tool_use') {
            // Echo the full assistant content back (thinking blocks included —
            // required for the loop to continue on the same model).
            messages.push({ role: 'assistant', content: response.content });

            const toolUses = response.content.filter(
              (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
            );
            const results: Anthropic.ToolResultBlockParam[] = [];
            for (const tu of toolUses) {
              send({ type: 'tool', label: toolActivityLabel(tu.name, tu.input as Record<string, unknown>) });
              const result = await executeTool(tu.name, tu.input as Record<string, unknown>);
              results.push({ type: 'tool_result', tool_use_id: tu.id, content: result });
            }
            // All results in ONE user message.
            messages.push({ role: 'user', content: results });
            continue;
          }

          if (response.stop_reason === 'pause_turn') {
            messages.push({ role: 'assistant', content: response.content });
            continue;
          }

          if (response.stop_reason === 'refusal') {
            send({ type: 'text', text: "I can't help with that one — ask me about the fights." });
          }
          break; // end_turn / max_tokens / refusal → turn over
        }
        send({ type: 'done' });
      } catch (err) {
        if (!abort.signal.aborted) {
          console.error('[api/chat]', err);
          send({
            type: 'error',
            message:
              err instanceof Anthropic.APIError
                ? 'The analyst hit an upstream error. Try again in a moment.'
                : 'Something went wrong on our end.',
          });
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed by cancel */
        }
      }
    },
    cancel() {
      abort.abort(); // client walked away — stop paying for tokens
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
