"use client";

import { useEffect, useState } from "react";

interface State<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
}

/**
 * Runs an async service call and keeps the previous result on screen while a
 * new one loads, so controls feel immediate. `key` identifies the request.
 */
export function useService<T>(key: string, call: () => Promise<T>): State<T> {
  const [state, setState] = useState<State<T>>({ data: undefined, loading: true, error: null });

  useEffect(() => {
    let live = true;
    call()
      .then((data) => live && setState({ data, loading: false, error: null }))
      .catch((e: unknown) => live && setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : "Request failed" })));
    return () => {
      live = false;
    };
    // The key fully describes the request; `call` is recreated every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
