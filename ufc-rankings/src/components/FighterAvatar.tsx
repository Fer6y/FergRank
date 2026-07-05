'use client';

import { useState } from 'react';
import Image from 'next/image';
import { initials } from '@/lib/fighterDisplay';

interface FighterAvatarProps {
  src?: string;
  name: string;
  sizeClass: string;       // e.g. "w-10 h-10"
  initialsClass: string;   // e.g. "text-xs"
  bg: string;              // wrapper background
  initialsColor: string;
  border?: string;         // optional CSS border (champion gold, etc.)
}

// One avatar for every surface (rows, pills, hero, profile). Renders the photo
// when present, framed head-up (cover + top), and falls back to the initials
// chip if there is no photo OR the image fails to load — so a rotted UFC.com URL
// degrades gracefully instead of showing a broken image.
export default function FighterAvatar({
  src,
  name,
  sizeClass,
  initialsClass,
  bg,
  initialsColor,
  border,
}: FighterAvatarProps) {
  const [failed, setFailed] = useState(false);
  const showImg = !!src && !failed;

  return (
    <div
      className={`${sizeClass} rounded-full shrink-0 overflow-hidden relative flex items-center justify-center font-medium`}
      style={{ backgroundColor: bg, color: initialsColor, border }}
      aria-hidden
    >
      {/* Initials sit underneath as the always-present fallback — visible while
          the photo loads and if it errors; the image covers them once painted. */}
      <span className={initialsClass}>{initials(name)}</span>
      {showImg && (
        // next/image optimizes + resizes the remote UFC/Commons photo down to the
        // avatar box (see next.config remotePatterns). `fill` covers the wrapper;
        // the initials underneath remain the fallback if it errors. `sizes` is the
        // largest avatar box we render (~96px hero) so the optimizer never over-fetches.
        <Image
          src={src}
          alt=""
          fill
          sizes="96px"
          onError={() => setFailed(true)}
          className="object-cover"
          style={{ objectPosition: 'center top', backgroundColor: bg }}
        />
      )}
    </div>
  );
}
