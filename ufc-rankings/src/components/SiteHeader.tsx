import Link from 'next/link';
import SearchTrigger from './SearchTrigger';
import AnalystNavButton from './AnalystNavButton';

// Top nav per DESIGN_VISION §3. Rankings is live; P4P / Leaderboards / Compare
// are vision-stage routes shown muted until built.
export default function SiteHeader() {
  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
    >
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6 min-w-0">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span
              className="w-7 h-7 rounded-md flex items-center justify-center text-sm font-bold text-white"
              style={{ backgroundColor: 'var(--accent-red)' }}
            >
              U
            </span>
            <span className="font-display text-lg tracking-wide" style={{ color: 'var(--text-primary)' }}>
              FERGRANK
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-4 text-sm">
            <Link href="/" style={{ color: 'var(--text-secondary)' }}>
              Rankings
            </Link>
            <Link href="/upcoming" style={{ color: 'var(--text-secondary)' }}>
              Upcoming
            </Link>
            <Link href="/prospects" style={{ color: 'var(--text-secondary)' }}>
              Prospects
            </Link>
            <Link href="/p4p" style={{ color: 'var(--text-secondary)' }}>
              P4P
            </Link>
            <Link href="/leaderboards" style={{ color: 'var(--text-secondary)' }}>
              Leaderboards
            </Link>
            <Link href="/compare" style={{ color: 'var(--text-secondary)' }}>
              Compare
            </Link>
            <Link href="/odds" style={{ color: 'var(--text-secondary)' }}>
              Odds
            </Link>
            <AnalystNavButton />
          </nav>
        </div>

        <SearchTrigger />
      </div>

      {/* Mobile/tablet: the desktop nav is hidden below md (8 items overflow
          narrower viewports), so give small screens a scrollable link row —
          otherwise these pages are unreachable without typing a URL. */}
      <nav
        className="md:hidden flex items-center gap-5 overflow-x-auto whitespace-nowrap px-4 pb-2.5 text-sm"
        style={{ scrollbarWidth: 'none' }}
      >
        <Link href="/" style={{ color: 'var(--text-secondary)' }}>
          Rankings
        </Link>
        <Link href="/upcoming" style={{ color: 'var(--text-secondary)' }}>
          Upcoming
        </Link>
        <Link href="/prospects" style={{ color: 'var(--text-secondary)' }}>
          Prospects
        </Link>
        <Link href="/p4p" style={{ color: 'var(--text-secondary)' }}>
          P4P
        </Link>
        <Link href="/leaderboards" style={{ color: 'var(--text-secondary)' }}>
          Leaderboards
        </Link>
        <Link href="/compare" style={{ color: 'var(--text-secondary)' }}>
          Compare
        </Link>
        <Link href="/odds" style={{ color: 'var(--text-secondary)' }}>
          Odds
        </Link>
        <AnalystNavButton />
      </nav>
    </header>
  );
}
