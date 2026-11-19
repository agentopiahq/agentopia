'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import GetStartedCard, { GET_STARTED_HASH } from '@/components/getStarted/GetStartedCard';

/** The words of the link under the slogan. */
const GET_STARTED_LABEL = 'What is this, and how do I get it?';

/**
 * The real office viewer, playing a mock session, with a link under its
 * slogan that opens the get started card. The viewer draws to a canvas and
 * reads the window, so it loads only in the browser. The card has its own
 * address (`/#get-started`), so it can be linked to.
 */
export default function OfficeScene() {
  const host = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const show = useCallback((shown: boolean) => {
    setOpen(shown);
    const { pathname, search } = window.location;
    window.history.replaceState(null, '', shown ? GET_STARTED_HASH : `${pathname}${search}`);
  }, []);

  useEffect(() => {
    const sync = () => setOpen(window.location.hash === GET_STARTED_HASH);
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  useEffect(() => {
    let dispose: (() => void) | null = null;
    let cancelled = false;
    void import('@agentopia/viewer/hero').then(({ mountHero }) => {
      if (!cancelled && host.current) {
        dispose = mountHero(host.current, {
          link: { label: GET_STARTED_LABEL, href: GET_STARTED_HASH, onOpen: () => show(true) },
        });
      }
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [show]);

  return (
    <>
      <div
        ref={host}
        role="region"
        aria-label="The agentopia office, playing a demo session"
        className="relative h-full min-h-[360px] w-full overflow-hidden bg-[#e3dac6]"
      />
      <GetStartedCard open={open} onClose={() => show(false)} />
    </>
  );
}
