'use client';

import { useEffect, useState } from 'react';

/** How long "copied" shows after a copy, in ms. */
const COPIED_MS = 1600;

/** A shell command on its own line, lettered like a terminal, with a key that copies it. */
export default function CommandLine({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    void navigator.clipboard?.writeText(command).then(
      () => setCopied(true),
      () => undefined
    );
  };

  return (
    <div className="flex items-center gap-2 rounded-xl border-[1.5px] border-sheet-ink bg-sheet-ink py-1.5 pr-1.5 pl-3 text-sheet-paper">
      <span aria-hidden="true" className="font-mono text-sm text-sheet-pill/60 select-none">
        $
      </span>
      <code className="min-w-0 flex-1 overflow-x-auto font-mono text-sm whitespace-nowrap">
        {command}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Copied' : `Copy ${command}`}
        className="shrink-0 cursor-pointer rounded-full border-[1.5px] border-sheet-paper/70 px-2.5 py-0.5 font-hand text-sm font-bold text-sheet-paper hover:bg-sheet-paper hover:text-sheet-ink"
      >
        {copied ? 'copied!' : 'copy'}
      </button>
    </div>
  );
}
