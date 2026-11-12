import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight } from './icons';

/** Releasing past this share of the travel confirms; before it, the knob returns. */
const COMMIT_AT = 0.8;
const KNOB = 48;
const INSET = 4;
const KEY_STEP = 10;
const ARMED_FOR_MS = 5000;

interface SlideToConfirmProps {
  /** Visible label and accessible name, such as "Slide to unsubscribe from 8". */
  label: string;
  /** What the keyboard path asks for before confirming, such as "unsubscribe from 8". */
  confirmPhrase: string;
  disabled?: boolean;
  onConfirm(): void;
}

/**
 * The irreversible action's control. Dragging is the touch path; the keyboard path is arrow keys to move
 * the knob, then Enter or Space twice. A slide-only control would shut out keyboard and screen-reader users.
 */
export function SlideToConfirm({ label, confirmPhrase, disabled = false, onConfirm }: SlideToConfirmProps) {
  const reduceMotion = useReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const [value, setValue] = useState(0);
  const [armed, setArmed] = useState(false);
  const [done, setDone] = useState(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Where the knob is headed, so quick key presses add up instead of reading a position mid-animation. */
  const target = useRef(0);

  const travel = () => Math.max(1, (trackRef.current?.offsetWidth ?? 320) - KNOB - INSET * 2);
  const fillWidth = useTransform(x, (v) => v + KNOB + INSET * 2);
  const labelOpacity = useTransform(x, (v) => Math.max(0, 1 - (v / travel()) * 1.4));
  useMotionValueEvent(x, 'change', (v) => setValue(Math.round((v / travel()) * 100)));

  useEffect(() => () => void (armTimer.current && clearTimeout(armTimer.current)), []);

  const moveTo = (fraction: number) => {
    target.current = Math.min(1, Math.max(0, fraction));
    const px = target.current * travel();
    if (reduceMotion) x.set(px);
    else animate(x, px, { type: 'spring', stiffness: 600, damping: 40 });
  };

  const confirm = () => {
    if (done || disabled) return;
    setDone(true);
    setArmed(false);
    moveTo(1);
    navigator.vibrate?.(20);
    onConfirm();
  };

  const arm = () => {
    setArmed(true);
    if (armTimer.current) clearTimeout(armTimer.current);
    armTimer.current = setTimeout(() => {
      setArmed(false);
      moveTo(0);
    }, ARMED_FOR_MS);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled || done) return;
    const current = target.current;
    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = current + KEY_STEP / 100;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = current - KEY_STEP / 100;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = 1;
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (armed) confirm();
      else {
        moveTo(1);
        arm();
      }
      return;
    } else return;

    event.preventDefault();
    moveTo(next);
    if (next >= 1) arm();
    else setArmed(false);
  };

  const visibleLabel = armed ? `Press Enter again to ${confirmPhrase}` : label;

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={armed ? visibleLabel : `${value}%`}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      className={`relative flex h-14 w-full items-center justify-center overflow-hidden rounded-full bg-track pl-10 text-body font-semibold text-on-track select-none ${
        disabled ? 'opacity-50' : ''
      }`}
    >
      <motion.span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: fillWidth, background: 'color-mix(in srgb, var(--knob) 22%, var(--track))' }}
      />
      <motion.span aria-live="polite" className="relative" style={{ opacity: armed ? 1 : labelOpacity }}>
        {visibleLabel}
      </motion.span>
      <motion.span
        aria-hidden="true"
        className="absolute top-1 left-1 grid size-12 cursor-grab touch-none place-items-center rounded-full bg-knob text-on-knob active:cursor-grabbing"
        style={{ x }}
        drag={disabled || done ? false : 'x'}
        dragConstraints={trackRef}
        dragElastic={0}
        dragMomentum={false}
        onDragEnd={() => {
          if (x.get() / travel() >= COMMIT_AT) confirm();
          else moveTo(0);
        }}
      >
        <ArrowRight size={22} />
      </motion.span>
    </div>
  );
}
