import { useEffect, useRef, useState } from 'react';

/**
 * Smooth reveal for streamed LLM text (ChatGPT/Claude-style rhythm).
 *
 * Target = full text received so far. Display catches up on an adaptive cadence
 * so irregular on-device token bursts still feel like steady typing.
 */

function advanceUtf16(text: string, from: number, charCount: number): number {
  let i = from;
  let n = 0;
  while (i < text.length && n < charCount) {
    const code = text.charCodeAt(i);
    i += code >= 0xd800 && code <= 0xdbff && i + 1 < text.length ? 2 : 1;
    n += 1;
  }
  return i;
}

function snapToWordBoundary(text: string, from: number, proposed: number): number {
  if (proposed >= text.length) return text.length;
  const at = text[proposed - 1];
  if (at && /[\s.,!?;:]/.test(at)) return proposed;

  const lookAhead = Math.min(text.length, proposed + 14);
  for (let i = proposed; i < lookAhead; i++) {
    if (/[\s.,!?;:]/.test(text[i]!)) return i + 1;
  }
  return proposed;
}

export function useSmoothRevealText(target: string, isStreaming: boolean) {
  const [displayed, setDisplayed] = useState(() => (isStreaming ? '' : target));
  const [isCatchingUp, setIsCatchingUp] = useState(false);

  const displayedLenRef = useRef(isStreaming ? 0 : target.length);
  const targetRef = useRef(target);
  const streamingRef = useRef(isStreaming);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);

  targetRef.current = target;
  streamingRef.current = isStreaming;

  // Regenerate / clear: target shrank — restart reveal.
  useEffect(() => {
    if (target.length >= displayedLenRef.current) return;
    displayedLenRef.current = 0;
    lastTsRef.current = 0;
    setDisplayed('');
    setIsCatchingUp(false);
  }, [target]);

  useEffect(() => {
    const stopRaf = () => {
      if (rafRef.current == null) return;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };

    const snapToFull = () => {
      const full = targetRef.current;
      if (displayedLenRef.current !== full.length) {
        displayedLenRef.current = full.length;
        setDisplayed(full);
      }
      setIsCatchingUp(false);
    };

    // Idle historical message: show full text, no loop.
    if (!isStreaming && displayedLenRef.current >= targetRef.current.length) {
      snapToFull();
      stopRaf();
      return;
    }

    let active = true;

    const tick = (ts: number) => {
      if (!active) return;

      const full = targetRef.current;
      const lag = full.length - displayedLenRef.current;

      if (lag > 0) {
        const dt = lastTsRef.current ? Math.min(48, ts - lastTsRef.current) : 16;
        lastTsRef.current = ts;

        const baseCps = 72;
        const boost = Math.min(lag * 4, 360);
        const chars = Math.max(1, Math.round(((baseCps + boost) * dt) / 1000));
        const len = displayedLenRef.current;
        let next = advanceUtf16(full, len, chars);
        if (lag < 56) next = snapToWordBoundary(full, len, next);

        if (next !== len) {
          displayedLenRef.current = next;
          setDisplayed(full.slice(0, next));
        }
        setIsCatchingUp(next < full.length);
      } else {
        lastTsRef.current = 0;
        setIsCatchingUp(false);
        if (!streamingRef.current) {
          snapToFull();
          return;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      active = false;
      stopRaf();
    };
  }, [isStreaming]);

  const catchingUp =
    isCatchingUp || (isStreaming && displayed.length < target.length);

  return {
    displayed,
    isCatchingUp: catchingUp,
    isRevealing: isStreaming || catchingUp,
  };
}
