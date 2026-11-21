import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import type { Page } from './strategy.ts';

export function useStrategyPlayback(pages: readonly Page[], pageIndex: number, selectPage: (index: number) => void) {
  const [playing, setPlaying] = useState(false);
  const [animate, setAnimate] = useState(false);
  const [transitionFrom, setTransitionFrom] = useState<Page>();

  const changePage = useCallback((index: number) => {
    const target = Math.max(0, Math.min(pages.length - 1, index));
    if (target !== pageIndex) setTransitionFrom(pages[pageIndex]);
    selectPage(target);
    setAnimate(true);
  }, [pages, pageIndex, selectPage]);

  useEffect(() => {
    if (!animate) return;
    const timer = setTimeout(() => { setAnimate(false); setTransitionFrom(undefined); }, 440);
    return () => clearTimeout(timer);
  }, [animate, pageIndex]);

  const advance = useEffectEvent(() => {
    if (pageIndex + 1 < pages.length) changePage(pageIndex + 1);
    else setPlaying(false);
  });

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => advance(), 1400);
    return () => clearTimeout(timer);
  }, [playing, pageIndex, pages.length]);

  function togglePlayback() {
    if (!playing && pageIndex === pages.length - 1) changePage(0);
    setPlaying(!playing);
  }

  return { playing, setPlaying, animate, transitionFrom, changePage, togglePlayback };
}
