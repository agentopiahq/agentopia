'use client';

import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import Link from 'next/link';

import CommandLine from '@/components/getStarted/CommandLine';
import { ABOUT, GITHUB_URL, INSTALL_STEPS, SLOGAN, TITLE } from '@/constants';

/** Where the card can be linked to: the home page opens it when its hash is this. */
export const GET_STARTED_HASH = '#get-started';

interface GetStartedCardProps {
  open: boolean;
  onClose: () => void;
}

/**
 * What the office is and how to get it, on a card drawn like the office's own
 * panels (paper, ink, the sheet's hand): what opens from the link under the
 * slogan.
 */
export default function GetStartedCard({ open, onClose }: GetStartedCardProps) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div
        aria-hidden="true"
        className="fixed inset-0 bg-[rgba(250,247,238,0.72)] backdrop-blur-[1.5px]"
      />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="flex max-h-full w-full max-w-[640px] flex-col overflow-hidden rounded-[14px] border-[2.5px] border-sheet-ink bg-sheet-paper font-hand text-sheet-ink shadow-[5px_6px_0_var(--color-sheet-ink)]">
          <div className="flex items-start justify-between gap-4 border-b-2 border-sheet-ink px-6 pt-5 pb-3.5">
            <div>
              <DialogTitle className="font-title text-[28px] leading-tight sm:text-[34px]">
                {TITLE}
              </DialogTitle>
              <p className="mt-1 text-base leading-snug text-sheet-lead sm:text-lg">
                {SLOGAN[0]}
                <br />
                {SLOGAN[1]}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 cursor-pointer rounded-full border-[1.5px] border-sheet-ink bg-sheet-paper px-3 py-0.5 text-base font-bold shadow-[0_2px_0_var(--color-sheet-ink)] hover:bg-sheet-pill"
            >
              done
            </button>
          </div>
          <div className="overflow-y-auto px-6 pt-4 pb-6 text-lg leading-snug">
            {ABOUT.map((paragraph) => (
              <p key={paragraph} className="mb-3">
                {paragraph}
              </p>
            ))}
            <h2 className="mt-5 mb-2 font-title text-2xl">Get started</h2>
            <ol className="space-y-3">
              {INSTALL_STEPS.map((step, i) => (
                <li key={step.command}>
                  <p className="mb-1.5">
                    <span className="font-bold">{i + 1}.</span> {step.note}
                  </p>
                  <CommandLine command={step.command} />
                </li>
              ))}
            </ol>
            <p className="mt-4">
              Then use Claude Code as you always do, in a terminal or the desktop app: every session
              gets a desk.
            </p>
            <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 font-bold">
              <Link href="/docs" className="underline underline-offset-4">
                Read the docs →
              </Link>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                Source on GitHub ↗
              </a>
            </p>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
