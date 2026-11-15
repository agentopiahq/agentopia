'use client';

import { useEffect, useRef } from 'react';

/**
 * The real office viewer, playing a mock session. The viewer draws to a
 * canvas and reads the window, so it loads only in the browser.
 */
export default function OfficeScene() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let dispose: (() => void) | null = null;
    let cancelled = false;
    void import('@agentopia/viewer/hero').then(({ mountHero }) => {
      if (!cancelled && host.current) {
        dispose = mountHero(host.current);
      }
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);

  return (
    <div
      ref={host}
      role="region"
      aria-label="The agentopia office, playing a demo session"
      className="relative h-full min-h-[360px] w-full overflow-hidden bg-[#e3dac6]"
    />
  );
}
