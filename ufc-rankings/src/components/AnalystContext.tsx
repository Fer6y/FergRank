'use client';

// ─────────────────────────────────────────────────────────────────────────
//  AnalystContext — shared state for the site-wide analyst dock.
//
//  Lives at the layout level so the dock (and its chat history) survives
//  client-side navigation. Pages point the analyst at what the user is
//  looking at — /upcoming sets the selected card, /fighter/[id] sets the
//  fighter — so questions like "talk me through this" land on the right
//  subject without a lookup round-trip.
// ─────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useMemo, useState } from 'react';

export interface AnalystPageInfo {
  eventName?: string;
  fighter?: { id: string; name: string };
}

interface AnalystState {
  open: boolean;
  setOpen: (open: boolean) => void;
  pageContext: AnalystPageInfo;
  setPageContext: (info: AnalystPageInfo) => void;
}

const AnalystContext = createContext<AnalystState | null>(null);

export function AnalystProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pageContext, setPageContext] = useState<AnalystPageInfo>({});
  const value = useMemo(() => ({ open, setOpen, pageContext, setPageContext }), [open, pageContext]);
  return <AnalystContext.Provider value={value}>{children}</AnalystContext.Provider>;
}

export function useAnalyst(): AnalystState {
  const ctx = useContext(AnalystContext);
  if (!ctx) throw new Error('useAnalyst must be used inside <AnalystProvider>');
  return ctx;
}
