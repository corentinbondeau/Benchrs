"use client";

import { useEffect, useRef, useState } from "react";

export function usePullToRefresh(onRefresh: () => Promise<void> | void) {
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pullDistance = useRef(0);
  const isPulling = useRef(false);

  useEffect(() => {
    let container: HTMLElement | null = document.getElementById("main-content");
    if (!container) return;

    const onTouchStart = (e: TouchEvent) => {
      if (container!.scrollTop === 0) {
        startY.current = e.touches[0].clientY;
        isPulling.current = true;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isPulling.current || refreshing) return;
      const currentY = e.touches[0].clientY;
      pullDistance.current = currentY - startY.current;
      if (pullDistance.current > 60 && container!.scrollTop === 0) {
        e.preventDefault();
        setPulling(true);
      }
    };

    const onTouchEnd = async () => {
      if (pullDistance.current > 80 && !refreshing) {
        setRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
        }
      }
      isPulling.current = false;
      pullDistance.current = 0;
      setPulling(false);
    };

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd);
    return () => {
      container?.removeEventListener("touchstart", onTouchStart);
      container?.removeEventListener("touchmove", onTouchMove);
      container?.removeEventListener("touchend", onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRefresh, refreshing]);

  return { pulling, refreshing };
}
