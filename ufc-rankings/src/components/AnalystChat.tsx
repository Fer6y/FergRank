'use client';

// ─────────────────────────────────────────────────────────────────────────
//  AnalystChat — "Ask the Analyst" chat panel on /upcoming.
//
//  Streams NDJSON from /api/chat. Tool activity ("🔍 checking …") is shown
//  live while the agent grounds itself in the site's own data — making the
//  grounding VISIBLE is the trust feature.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTED = [
  'Talk me through the main event',
  "Who's the live dog on this card?",
  'Which fight is closest on paper?',
];

export default function AnalystChat({ eventName }: { eventName?: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, activity]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setError(null);
    setInput('');
    setBusy(true);
    setActivity(null);

    const history = [...messages, { role: 'user' as const, content: q }];
    setMessages([...history, { role: 'assistant', content: '' }]);

    const controller = new AbortController();
    abortRef.current = controller;

    // Append streamed text to the trailing assistant message.
    const appendText = (text: string) =>
      setMessages((cur) => {
        const next = [...cur];
        const last = next[next.length - 1];
        next[next.length - 1] = { ...last, content: last.content + text };
        return next;
      });

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, eventName }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let evt: { type: string; text?: string; label?: string; message?: string };
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }
          if (evt.type === 'text' && evt.text) {
            setActivity(null);
            appendText(evt.text);
          } else if (evt.type === 'tool' && evt.label) {
            setActivity(evt.label);
          } else if (evt.type === 'error') {
            setError(evt.message || 'Something went wrong.');
          }
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      }
    } finally {
      setActivity(null);
      setBusy(false);
      // Drop an empty assistant bubble if the stream produced nothing.
      setMessages((cur) =>
        cur.length && cur[cur.length - 1].role === 'assistant' && !cur[cur.length - 1].content
          ? cur.slice(0, -1)
          : cur,
      );
    }
  }

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)' }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        style={{ backgroundColor: 'var(--bg-card-hover)' }}
      >
        <span className="flex items-baseline gap-2.5">
          <span className="font-display text-sm uppercase tracking-wide" style={{ color: 'var(--text-primary)' }}>
            Ask the Analyst
          </span>
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {eventName ? `Talking ${eventName.split(' - ')[0]}` : 'Grounded in our numbers, not vibes'}
          </span>
        </span>
        <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
          {open ? '−' : '+'}
        </span>
      </button>

      {open && (
        <div className="border-t" style={{ borderColor: 'var(--border)' }}>
          <div ref={scrollRef} className="max-h-96 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-2.5">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Every answer is pulled live from the site&apos;s own Elo ratings, form data, and win
                  probabilities — if the analyst didn&apos;t look it up, it won&apos;t say it.
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED.map((s) => (
                    <button
                      key={s}
                      onClick={() => ask(s)}
                      disabled={busy}
                      className="text-[11px] px-2.5 py-1.5 rounded-full border transition-colors hover:border-[var(--accent-red)]"
                      style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="flex justify-end">
                  <div
                    className="max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-relaxed"
                    style={{ backgroundColor: 'rgba(210,10,10,0.12)', color: 'var(--text-primary)' }}
                  >
                    {m.content}
                  </div>
                </div>
              ) : (
                (m.content || busy) && (
                  <div key={i} className="flex">
                    <div
                      className="max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap"
                      style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                    >
                      {m.content || (!activity && <span style={{ color: 'var(--text-muted)' }}>Thinking…</span>)}
                      {i === messages.length - 1 && activity && (
                        <span className="block mt-1 font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          🔍 {activity}…
                        </span>
                      )}
                    </div>
                  </div>
                )
              ),
            )}

            {error && (
              <p className="text-[12px]" style={{ color: 'var(--accent-red-light)' }}>
                {error}
              </p>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
            className="flex items-center gap-2 border-t px-3 py-2.5"
            style={{ borderColor: 'var(--border)' }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={eventName ? `Ask about ${eventName.split(' - ')[0]}…` : 'Ask about an upcoming fight…'}
              disabled={busy}
              maxLength={500}
              className="flex-1 bg-transparent text-[13px] outline-none"
              style={{ color: 'var(--text-primary)' }}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="font-mono text-[11px] uppercase tracking-wider px-3 py-1.5 rounded disabled:opacity-40"
              style={{ backgroundColor: 'var(--accent-red)', color: '#fff' }}
            >
              {busy ? '…' : 'Ask'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
