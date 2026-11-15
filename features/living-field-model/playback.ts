"use client";

import { useEffect, useRef, useState } from "react";

/** Steps the model date forward through the season; stops when the date is moved by hand. */
export function useSeasonPlayback(idx: number, setIdx: (n: number) => void, minIndex: number, maxIndex: number) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 3>(1);
  const position = useRef(idx);
  const lastStep = useRef<number | null>(null);

  useEffect(() => {
    position.current = idx;
    if (lastStep.current !== idx) setPlaying(false);
  }, [idx]);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const next = position.current + 1;
      if (next > maxIndex) { setPlaying(false); return; }
      position.current = next;
      lastStep.current = next;
      setIdx(next);
      if (next === maxIndex) setPlaying(false);
    }, 450 / speed);
    return () => clearInterval(timer);
  }, [playing, speed, maxIndex, setIdx]);

  return {
    playing,
    speed,
    toggle: () => {
      if (!playing && idx >= maxIndex) {
        lastStep.current = minIndex;
        position.current = minIndex;
        setIdx(minIndex);
      }
      setPlaying((p) => !p);
    },
    stop: () => setPlaying(false),
    cycleSpeed: () => setSpeed((s) => (s === 1 ? 3 : 1)),
  };
}

export type SeasonPlayback = ReturnType<typeof useSeasonPlayback>;
