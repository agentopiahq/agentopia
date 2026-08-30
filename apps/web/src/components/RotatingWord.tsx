'use client';

import { useEffect, useRef, useState } from 'react';

import { MAIN_COLOR, MINOR_COLOR } from '@/constants';

/** What the little clones get up to in town. */
const WORDS = ['live', 'work', 'browse', 'read', 'build', 'plan', 'tinker', 'nap'];

/** Brand pair first, then a rotation of muted, low-saturation tones. */
const COLORS = [
  MAIN_COLOR, // periwinkle indigo
  MINOR_COLOR, // coral
  '#8ba888', // sage
  '#5f9ea0', // muted teal
  '#c29a5b', // ochre
  '#b87e8e', // dusty rose
  '#7d87b0', // slate blue
  '#a288b8', // mauve
  '#6ba292', // seafoam
  '#ad8f68', // camel
];

const HOLD_MS = 2000; // how long the full word stays visible
const LETTER_MS = 100; // delay per letter when typing or deleting

export default function RotatingWord() {
  const [wordIndex, setWordIndex] = useState(0);
  const [colorIndex, setColorIndex] = useState(0);
  const [displayed, setDisplayed] = useState(WORDS[0]);
  const [phase, setPhase] = useState<'hold' | 'deleting' | 'typing'>('hold');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const word = WORDS[wordIndex];
  const color = COLORS[colorIndex];
  const nextWordIndex = (wordIndex + 1) % WORDS.length;
  const nextColorIndex = (colorIndex + 1) % COLORS.length;

  useEffect(() => {
    const schedule = (fn: () => void, delay: number) => {
      timeoutRef.current = setTimeout(fn, delay);
    };

    // Every transition is scheduled, never set synchronously in the effect —
    // that keeps the render/effect cycle acyclic (and the linter happy).
    if (phase === 'hold') {
      schedule(() => setPhase('deleting'), HOLD_MS);
    } else if (phase === 'deleting') {
      if (displayed.length === 0) {
        schedule(() => {
          setWordIndex(nextWordIndex);
          setColorIndex(nextColorIndex);
          setPhase('typing');
        }, LETTER_MS);
      } else {
        schedule(() => setDisplayed((d) => d.slice(0, -1)), LETTER_MS);
      }
    } else if (phase === 'typing') {
      if (displayed.length === word.length) {
        schedule(() => setPhase('hold'), 0);
      } else {
        schedule(() => setDisplayed(word.slice(0, displayed.length + 1)), LETTER_MS);
      }
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [phase, displayed, nextWordIndex, nextColorIndex, word]);

  return (
    <span className="relative inline-block whitespace-nowrap">
      <span style={{ color }}>
        {displayed}
        <span
          className="ml-[0.05em] inline-block w-[0.12em] animate-[blink_1s_step-end_infinite] align-baseline"
          style={{ backgroundColor: color, height: '0.85em' }}
        />
      </span>
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 0.3; }
          50%       { opacity: 0; }
        }
      `}</style>
    </span>
  );
}
