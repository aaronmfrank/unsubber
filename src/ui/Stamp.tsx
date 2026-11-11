import type { ReactNode } from 'react';

/** The app's one loud element: cancel-red, expanded heavy caps, rotated, with a rough ink edge. */
export function Stamp({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`stamp ${className}`}>{children}</span>;
}

/** SVG filter behind the stamp's rough edge. Render once near the root. */
export function InkFilter() {
  return (
    <svg aria-hidden="true" width="0" height="0" className="absolute">
      <filter id="ink-edge" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="7" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.5" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}
