import { clsx } from 'clsx';
import { ComponentPropsWithoutRef } from 'react';

import { MAIN_COLOR, MINOR_COLOR, TITLE } from '@/constants';

interface LogoProps extends ComponentPropsWithoutRef<'div'> {
  size?: string;
}

export function Logo({ size = 'text-5xl', ...props }: LogoProps) {
  return (
    <div
      // The gradient paints only inside the border box, and text-5xl has
      // line-height 1 while Lexend's em box spans 1.25em — without the padding
      // the descenders of g and p fall outside the box and render transparent.
      // The negative margin cancels the padding's effect on layout.
      className={clsx(
        `font-display font-medium tracking-tight text-slate-700 py-[0.125em] -my-[0.125em]`,
        size
      )}
      {...props}
      style={{
        background: `linear-gradient(to right, ${MAIN_COLOR}, ${MINOR_COLOR})`,
        WebkitBackgroundClip: 'text' as any,
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        color: 'transparent',
      }}
    >
      {TITLE}
    </div>
  );
}
