'use client';

// ─────────────────────────────────────────────────────────────────────────
//  AnalystDock — "Ask the Analyst", site-wide.
//
//  A floating chat bubble (bottom-right, every page) that expands into a
//  fixed chat window. Streams NDJSON from /api/chat. Tool activity
//  ("🔍 checking …") is shown live while the agent grounds itself in the
//  site's own data — making the grounding VISIBLE is the trust feature.
//
//  Mounted once in the root layout inside <AnalystProvider>, so chat
//  history survives navigation. /upcoming sets the event context so the
//  analyst talks the selected card by default.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { useAnalyst } from './AnalystContext';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTED_EVENT = [
  'Talk me through the main event',
  "Who's the live dog on this card?",
  'Which fight is closest on paper?',
];

const SUGGESTED_FIGHTER = [
  "What's driving their rank?",
  "How's their form trending?",
  'Talk me through their next fight',
];

const SUGGESTED_GLOBAL = [
  'Talk me through the next main event',
  "Who's the live dog on the next card?",
  'Which upcoming fight is closest on paper?',
];

export default function AnalystDock() {
  const { open, setOpen, pageContext } = useAnalyst();
  const { eventName, fighter } = pageContext;
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
  }, [messages, activity, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

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
        body: JSON.stringify({ messages: history, eventName, fighter }),
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

  // What the analyst is "talking": the fighter whose profile is open, the
  // selected card on /upcoming, or nothing (global).
  const subject = fighter?.name ?? eventName?.split(' - ')[0];
  const suggested = fighter ? SUGGESTED_FIGHTER : eventName ? SUGGESTED_EVENT : SUGGESTED_GLOBAL;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Ask the Analyst"
        title="Ask the Analyst"
        className="fixed bottom-5 right-5 z-[60] w-14 h-14 rounded-full flex items-center justify-center shadow-lg cursor-pointer transition-transform hover:scale-105"
        style={{ backgroundColor: 'var(--accent-red)' }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 3C7 3 3 6.6 3 11c0 2.2 1 4.2 2.7 5.6-.1 1.1-.5 2.3-1.4 3.4-.2.2 0 .6.3.6 1.9-.1 3.5-.8 4.6-1.6.9.2 1.8.4 2.8.4 5 0 9-3.6 9-8.4S17 3 12 3Z"
            fill="#fff"
          />
        </svg>
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-5 right-5 left-4 sm:left-auto z-[60] sm:w-[400px] flex flex-col rounded-xl border overflow-hidden shadow-2xl"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)' }}
    >
      <button
        onClick={() => setOpen(false)}
        className="w-full flex items-center justify-between px-4 py-3 text-left cursor-pointer"
        style={{ backgroundColor: 'var(--bg-card-hover)' }}
      >
        <span className="flex items-baseline gap-2.5 min-w-0">
          <span className="font-display text-sm uppercase tracking-wide shrink-0" style={{ color: 'var(--text-primary)' }}>
            Ask the Analyst
          </span>
          <span className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
            {subject ? `Talking ${subject}` : 'Grounded in our numbers, not vibes'}
          </span>
        </span>
        <span className="font-mono text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
          −
        </span>
      </button>

      <div className="border-t" style={{ borderColor: 'var(--border)' }}>
        <div ref={scrollRef} className="h-[min(400px,55vh)] overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && (
            <div className="space-y-2.5">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Every answer is pulled live from the site&apos;s own Elo ratings, form data, and win
                probabilities — if the analyst didn&apos;t look it up, it won&apos;t say it.
              </p>
              <div className="flex flex-wrap gap-2">
                {suggested.map((s) => (
                  <button
                    key={s}
                    onClick={() => ask(s)}
                    disabled={busy}
                    className="text-[11px] px-2.5 py-1.5 rounded-full border transition-colors hover:border-[var(--accent-red)] cursor-pointer"
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
            placeholder={subject ? `Ask about ${subject}…` : 'Ask about an upcoming fight…'}
            disabled={busy}
            maxLength={500}
            className="flex-1 bg-transparent text-[13px] outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="font-mono text-[11px] uppercase tracking-wider px-3 py-1.5 rounded disabled:opacity-40 cursor-pointer"
            style={{ backgroundColor: 'var(--accent-red)', color: '#fff' }}
          >
            {busy ? '…' : 'Ask'}
          </button>
        </form>
      </div>
    </div>
  );
}
