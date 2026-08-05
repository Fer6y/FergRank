// ─────────────────────────────────────────────────────────────────────────
//  /api/chat — the "Ask the Analyst" agent loop.
//
//  POST { messages: [{role, content}], eventName?, fighter?: {id, name} } → NDJSON stream:
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
  // Opportunistic sweep: expired buckets otherwise accumulate one per IP for
  // the life of the process. Only bothers once the map is non-trivially sized.
  if (rateBuckets.size > 500) {
    for (const [key, b] of rateBuckets) {
      if (b.resetAt < now) rateBuckets.delete(key);
    }
  }
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
  fighter?: { id: string; name: string };
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
  const rawFighter = (body as Record<string, unknown>).fighter;
  let fighter: ChatRequest['fighter'];
  if (rawFighter && typeof rawFighter === 'object') {
    const id = (rawFighter as Record<string, unknown>).id;
    const name = (rawFighter as Record<string, unknown>).name;
    if (typeof id === 'string' && id.trim() && typeof name === 'string' && name.trim()) {
      fighter = { id: id.slice(0, 60), name: name.slice(0, 80) };
    }
  }
  return {
    messages,
    eventName: typeof eventName === 'string' ? eventName.slice(0, 120) : undefined,
    fighter,
  };
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
  const { messages: history, eventName, fighter } = parsed;

  const client = new Anthropic({ apiKey });

  // Chat history → API messages. What the user is looking at (card and/or
  // fighter profile) rides along as context lines on the latest user turn
  // (volatile content stays at the very end of the prompt, after the cache
  // breakpoint on the system block). The fighter_id lets the model call
  // get_fighter directly without a search_fighter round-trip.
  const contextLines = [
    eventName ? `(Context: the user is currently viewing the card "${eventName}".)` : null,
    fighter
      ? `(Context: the user is currently viewing the profile page of "${fighter.name}", fighter_id "${fighter.id}" — pronouns and bare references like "their next fight" refer to this fighter.)`
      : null,
  ].filter(Boolean);
  const messages: Anthropic.MessageParam[] = history.map((m, i) => {
    const isLast = i === history.length - 1;
    const text =
      isLast && m.role === 'user' && contextLines.length
        ? `${m.content}\n\n${contextLines.join('\n')}`
        : m.content;
    return { role: m.role, content: [{ type: 'text' as const, text }] };
  });

  const abort = new AbortController();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));

      let settled = false; // a terminal stop reason was reached and reported
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

          // ── Terminal stop reasons ────────────────────────────────────────
          // Every arm below says something to the user. A silent `break` here
          // leaves the reply looking like it simply stopped mid-thought, with
          // no way to tell a finished answer from a truncated one.
          //
          // The final `else` is the load-bearing part: an unrecognized stop
          // reason degrades to a visible message instead of silence. That is
          // exactly how `model_context_window_exceeded` slipped in when the SDK
          // added it (0.114.0) — enumerating today's reasons alone would let
          // the next addition regress this the same way.
          if (response.stop_reason === 'refusal') {
            send({ type: 'text', text: "I can't help with that one — ask me about the fights." });
          } else if (response.stop_reason === 'max_tokens') {
            send({ type: 'text', text: '\n\n(Cut off — that answer hit the length limit. Ask me to continue, or narrow the question.)' });
          } else if (response.stop_reason === 'model_context_window_exceeded') {
            send({ type: 'text', text: '\n\n(This conversation has outgrown my context window. Start a new chat to keep going.)' });
          } else if (response.stop_reason !== 'end_turn') {
            console.warn('[api/chat] unhandled stop_reason:', response.stop_reason);
            send({ type: 'text', text: '\n\n(The analyst stopped early. Try asking again.)' });
          }
          settled = true;
          break;
        }
        // Falling out of the loop without a terminal stop reason means every
        // iteration wanted another tool call — say so rather than ending on a
        // trail of tool labels and no answer.
        if (!settled) {
          send({
            type: 'text',
            text: `\n\n(I stopped after ${MAX_TOOL_ITERATIONS} lookups without landing on an answer. Try narrowing the question.)`,
          });
        }
        send({ type: 'done' });
      } catch (err) {
        if (!abort.signal.aborted) {
          console.error('[api/chat]', err);
          let message = 'Something went wrong on our end.';
          if (err instanceof Anthropic.APIError) {
            // Surface operator-fixable setup problems plainly; keep the rest generic.
            if (err.status === 400 && err.message.includes('credit balance')) {
              message = 'The analyst\'s API account is out of credits — add credits in the Anthropic console (Plans & Billing).';
            } else if (err.status === 401) {
              message = 'The analyst\'s API key was rejected — check ANTHROPIC_API_KEY in .env.local.';
            } else {
              message = 'The analyst hit an upstream error. Try again in a moment.';
            }
          }
          send({ type: 'error', message });
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
