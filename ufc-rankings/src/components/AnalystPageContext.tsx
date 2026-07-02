'use client';

// Effect-only bridge: lets a server-rendered page (e.g. /fighter/[id]) tell
// the analyst dock what the user is looking at. Renders nothing; clears the
// context when the page unmounts.

import { useEffect } from 'react';
import { useAnalyst } from './AnalystContext';

export default function AnalystPageContext({
  eventName,
  fighterId,
  fighterName,
}: {
  eventName?: string;
  fighterId?: string;
  fighterName?: string;
}) {
  const { setPageContext } = useAnalyst();

  useEffect(() => {
    setPageContext({
      eventName,
      fighter: fighterId && fighterName ? { id: fighterId, name: fighterName } : undefined,
    });
    return () => setPageContext({});
  }, [eventName, fighterId, fighterName, setPageContext]);

  return null;
}
