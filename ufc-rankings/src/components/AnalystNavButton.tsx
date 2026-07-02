'use client';

// Header nav entry for the analyst dock — a button styled like the nav
// links, since it opens the floating chat rather than navigating.

import { useAnalyst } from './AnalystContext';

export default function AnalystNavButton() {
  const { setOpen } = useAnalyst();
  return (
    <button
      onClick={() => setOpen(true)}
      className="cursor-pointer"
      style={{ color: 'var(--text-secondary)' }}
    >
      Analyst
    </button>
  );
}
