import { animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue, type PanInfo, type Variants } from 'framer-motion';
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
}

export function SwipeCard({ sender, deck, isTop, expanded, leftLabel, onToggle, onSwipe }: SwipeCardProps) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-400, 400], [-10, 10]);
  const size = () => ({ w: ref.current?.offsetWidth || 360, h: ref.current?.offsetHeight || 420 });

  const unsubOpacity = useOverlayOpacity(x, y, 'left', size);
  const keepOpacity = useOverlayOpacity(x, y, 'right', size);
  const laterOpacity = useOverlayOpacity(x, y, 'up', size);

  function handleDragEnd(_: PointerEvent | MouseEvent | TouchEvent, { offset, velocity }: PanInfo) {
    setDragging(false);
    const { w, h } = size();
    const direction = dragDirection(offset.x, offset.y);
    const past = (distance: number, size: number, speed: number) =>
      distance > COMMIT_FRACTION * size || (speed > FLICK_VELOCITY && distance > MIN_FLICK_DISTANCE);
    const commit =
      (direction === 'left' && past(-offset.x, w, -velocity.x)) ||
      (direction === 'right' && past(offset.x, w, velocity.x)) ||
      (direction === 'up' && past(-offset.y, h, -velocity.y));

    if (commit) {
      onSwipe(direction);
      return;
    }
    const spring = { type: 'spring', stiffness: 500, damping: 35 } as const;
    animate(x, 0, spring);
    animate(y, 0, spring);
  }

  const variants: Variants = {
    enter: { opacity: 0, scale: 0.94, y: 16 },
    top: { opacity: 1, scale: 1, y: 0 },
    behind: { opacity: 1, scale: 0.97, y: 8 },
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
      className="absolute inset-x-0 top-0 bottom-2"
      style={{ zIndex: isTop ? 2 : 1, originY: 1 }}
      variants={variants}
      initial="enter"
      animate={isTop ? 'top' : 'behind'}
      exit="exit"
      aria-hidden={!isTop}
    >
      <motion.div
        ref={ref}
        role="group"
        aria-roledescription="card"
        aria-label={`${senderName(sender)}, ${countLine(sender)}`}
        className={`relative h-full cursor-grab touch-none overflow-hidden rounded-card border border-rule bg-card p-5 select-none active:cursor-grabbing ${
          dragging ? 'shadow-[0_16px_40px_rgba(15,23,42,0.22)]' : ''
        }`}
        style={{ x, y, rotate }}
        drag={isTop}
        dragMomentum={false}
        onPointerDown={(event) => {
          pointerStart.current = { x: event.clientX, y: event.clientY };
        }}
        onDragStart={() => setDragging(true)}
        onDragEnd={handleDragEnd}
        onClick={(event) => {
          // A drag that ends over the card still produces a click; only a pointer that stayed put is a tap.
          const start = pointerStart.current;
          if (!isTop || !start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP) return;
          if (!(event.target as HTMLElement).closest('[data-no-toggle]')) onToggle();
        }}
      >
        <CardBody sender={sender} deck={deck} expanded={expanded} />

        <motion.div aria-hidden="true" className="pointer-events-none absolute top-6 right-5" style={{ opacity: unsubOpacity }}>
          <Stamp>{leftLabel}</Stamp>
        </motion.div>
        <motion.div aria-hidden="true" className="pointer-events-none absolute top-6 left-5" style={{ opacity: keepOpacity }}>
          <span className="inline-block rounded-md border-2 border-post bg-card px-3 py-1 text-lead font-bold text-post">Keep</span>
        </motion.div>
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center"
          style={{ opacity: laterOpacity }}
        >
          <span className="inline-block rounded-md border-2 border-ochre bg-card px-3 py-1 text-lead font-bold text-ochre">Later</span>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
