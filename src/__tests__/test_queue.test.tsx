import { renderHook, waitFor } from "@testing-library/react";
import { useState, useLayoutEffect, useEffect } from "react";
import { describe, it, expect } from "vitest";

const cacheQ = new Map<string, number>();

function useHookQueue(key: string) {
  const [state, setState] = useState({ loading: true, data: null as number | null });
  
  useLayoutEffect(() => {
    const cached = cacheQ.get(key);
    if (cached !== undefined) {
      queueMicrotask(() => {
        setState({ loading: false, data: cached });
      });
    }
  }, [key]);
  
  useEffect(() => {
    if (cacheQ.has(key)) return;
    Promise.resolve(42).then((val) => {
      cacheQ.set(key, val);
      setState({ loading: false, data: val });
    });
  }, [key]);
  
  return state;
}

describe("queueMicrotask", () => {
  it("first: cache miss, loading true", async () => {
    const { result } = renderHook(() => useHookQueue("q-key"));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });
  
  it("second: cache hot, loading ??", () => {
    const { result } = renderHook(() => useHookQueue("q-key"));
    console.log("cache hot:", result.current.loading);
  });
  
  it("swr test", async () => {
    const { result: r1, unmount } = renderHook(() => useHookQueue("q-swr"));
    await waitFor(() => expect(r1.current.loading).toBe(false));
    unmount();
    const { result: r2 } = renderHook(() => useHookQueue("q-swr"));
    console.log("swr:", r2.current.loading);
  });
});
