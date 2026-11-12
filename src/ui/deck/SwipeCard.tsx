import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform, type MotionValue, type PanInfo, type Variants } from 'framer-motion';
import { useRef, useState } from 'react';
import type { Sender } from '../../storage';
import type { DeckId, SwipeDirection } from '../../state/deckLogic';
import { countLine, senderName } from '../format';
import { Stamp } from '../Stamp';
import { CardBody } from './CardBody';

/** A swipe commits past this fraction of the card's width (or height, for up). */
const COMMIT_FRACTION = 0.3;
const FLICK_VELOCITY = 600;
const MIN_FLICK_DISTANCE = 40;
const TAP_SLOP = 8;
/** How far a drag has to lean before the matching action button lights up. */
const ARM_PROGRESS = 0.25;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function dragDirection(dx: number, dy: number): SwipeDirection | 'down' | null {
  if (dx === 0 && dy === 0) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

function useOverlayOpacity(x: MotionValue<number>, y: MotionValue<number>, direction: SwipeDirection, size: () => { w: number; h: number }) {
  return useTransform([x, y], ([dx = 0, dy = 0]: number[]) => {
    if (dragDirection(dx, dy) !== direction) return 0;
    const { w, h } = size();
    const distance = direction === 'up' ? -dy : Math.abs(dx);
    return clamp01(distance / (COMMIT_FRACTION * (direction === 'up' ? h : w)));
  });
}

interface SwipeCardProps {
  sender: Sender;
  deck: DeckId;
  isTop: boolean;
  expanded: boolean;
  /** "Unsubscribe", or a repeat offender's next escalation step. */
  leftLabel: string;
  onToggle(): void;
  onSwipe(direction: SwipeDirection): void;
  /** Which way the card leans far enough to light up an action button, or null. */
  onLean?(direction: SwipeDirection | null): void;
}

export function SwipeCard({ sender, deck, isTop, expanded, leftLabel, onToggle, onSwipe, onLean }: SwipeCardProps) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const lean = useRef<SwipeDirection | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-130, 130], [-8, 8], { clamp: false });
  const size = () => ({ w: ref.current?.offsetWidth || 358, h: ref.current?.offsetHeight || 384 });

  const unsubOpacity = useOverlayOpacity(x, y, 'left', size);
  const keepOpacity = useOverlayOpacity(x, y, 'right', size);
  const laterOpacity = useOverlayOpacity(x, y, 'up', size);

  const reportLean = () => {
    const progress = { left: unsubOpacity.get(), right: keepOpacity.get(), up: laterOpacity.get() };
    const next = (Object.keys(progress) as SwipeDirection[]).find((d) => progress[d] >= ARM_PROGRESS) ?? null;
    if (next !== lean.current) {
      lean.current = next;
      onLean?.(next);
    }
  };
  useMotionValueEvent(x, 'change', reportLean);
  useMotionValueEvent(y, 'change', reportLean);

  function handleDragEnd(_: PointerEvent | MouseEvent | TouchEvent, { offset, velocity }: PanInfo) {
    setDragging(false);
    const { w, h } = size();
    const direction = dragDirection(offset.x, offset.y);
    const past = (distance: number, length: number, speed: number) =>
      distance > COMMIT_FRACTION * length || (speed > FLICK_VELOCITY && distance > MIN_FLICK_DISTANCE);
    const commit =
      (direction === 'left' && past(-offset.x, w, -velocity.x)) ||
      (direction === 'right' && past(offset.x, w, velocity.x)) ||
      (direction === 'up' && past(-offset.y, h, -velocity.y));

    if (commit) {
      onSwipe(direction);
      return;
    }
    if (reduceMotion) {
      x.set(0);
      y.set(0);
      return;
    }
    const spring = { type: 'spring', stiffness: 500, damping: 35 } as const;
    animate(x, 0, spring);
    animate(y, 0, spring);
  }

  const variants: Variants = {
    enter: { opacity: 0, scale: 0.96 },
    shown: { opacity: 1, scale: 1 },
    exit: (exitDirections: Map<string, SwipeDirection>) => {
      const direction = exitDirections.get(sender.id);
      if (reduceMotion || !direction) return { opacity: 0, zIndex: 3, transition: { duration: 0.15 } };
      const transition = { duration: 0.3, ease: 'easeOut' } as const;
      const away = window.innerWidth / 2 + size().w;
      if (direction === 'left') return { x: -away, rotate: -18, zIndex: 3, transition };
      if (direction === 'right') return { x: away, rotate: 18, zIndex: 3, transition };
      return { y: -(window.innerHeight + size().h), zIndex: 3, transition };
    },
  };

  return (
    <motion.div
      className="absolute inset-0"
      style={{ zIndex: isTop ? 2 : 1, originX: 0.5, originY: 1 }}
      variants={variants}
      initial="enter"
      animate="shown"
      exit="exit"
      aria-hidden={!isTop}
    >
      <motion.div
        ref={ref}
        role="group"
        aria-roledescription="card"
        aria-label={`${senderName(sender)}, ${countLine(sender)}`}
        className={`relative h-full cursor-grab touch-none rounded-card border border-rule bg-card select-none active:cursor-grabbing ${
          dragging ? 'shadow-lift' : ''
        }`}
        style={{ x, y, rotate: reduceMotion ? 0 : rotate, originX: 0.5, originY: 1 }}
        drag={isTop}
        dragMomentum={false}
        onPointerDown={(event) => {
          pointerStart.current = { x: event.clientX, y: event.clientY };
        }}
        onDragStart={() => setDragging(true)}
        onDragEnd={(event, info) => {
          onLean?.(null);
          lean.current = null;
          handleDragEnd(event, info);
        }}
        onClick={(event) => {
          // A drag that ends over the card still produces a click; only a pointer that stayed put is a tap.
          const start = pointerStart.current;
          if (!isTop || !start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP) return;
          if (!(event.target as HTMLElement).closest('[data-no-toggle]')) onToggle();
        }}
      >
        <div className="h-full overflow-hidden rounded-card p-7 short:!p-5">
          <CardBody sender={sender} deck={deck} expanded={expanded} />
        </div>

        <motion.div aria-hidden="true" className="pointer-events-none absolute top-14 left-[134px]" style={{ opacity: unsubOpacity }}>
          <Stamp>{leftLabel}</Stamp>
        </motion.div>
        <motion.div aria-hidden="true" className="pointer-events-none absolute top-14 left-6" style={{ opacity: keepOpacity }}>
          <ActionLabel tone="keep">Keep</ActionLabel>
        </motion.div>
        <motion.div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-20 flex justify-center" style={{ opacity: laterOpacity }}>
          <ActionLabel tone="later">Later</ActionLabel>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

/** Keep and Later echo the stamp's shape in their own color, but stay sentence case and clean-edged: the stamp is the loud one. */
function ActionLabel({ tone, children }: { tone: 'keep' | 'later'; children: string }) {
  return (
    <span
      className={`inline-block rotate-6 rounded-md border-4 border-double bg-card px-3.5 py-1.5 text-[28px] leading-8 font-extrabold tracking-[0.02em] whitespace-nowrap ${
        tone === 'keep' ? 'border-keep text-keep' : 'rotate-0 border-later text-later'
      }`}
      style={{ fontStretch: '125%', fontVariationSettings: "'wdth' 125" }}
    >
      {children}
    </span>
  );
}
