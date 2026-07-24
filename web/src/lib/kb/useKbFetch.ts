'use client';
// 统一的数据获取 hook：所有 KB 页面共用，不在页面内散写 fetch/loading/error 逻辑
import { useEffect, useState } from 'react';

export interface KbFetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useKbFetch<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
): KbFetchState<T> {
  const [state, setState] = useState<KbFetchState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    fetcher()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ data: null, loading: false, error: err.message });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
