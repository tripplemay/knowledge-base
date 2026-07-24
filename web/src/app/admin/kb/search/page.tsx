'use client';
// 全文搜索 —— 搜索框结构与交互复刻模板 SearchTableOrders：
// 同一张 Card 内「搜索框 + 结果区」，即输即搜（防抖），无独立搜索按钮
import { useEffect, useState } from 'react';
import NavLink from 'components/link/NavLink';
import Card from 'components/card';
import SearchIcon from 'components/icons/SearchIcon';
import { KbError } from 'components/admin/kb/KbState';
import { fetchSearch } from 'lib/kb/client';
import type { KbSearchHit } from 'types/kb';

const DEBOUNCE_MS = 400;
const MIN_QUERY_LEN = 2;

const SearchPage = () => {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<KbSearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < MIN_QUERY_LEN) {
      setHits(null);
      setError(null);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      fetchSearch(query)
        .then((data) => {
          setHits(data);
          setError(null);
        })
        .catch((err: Error) => {
          setError(err.message);
          setHits(null);
        })
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="mt-3 h-full w-full">
      <Card extra={'w-full h-full sm:overflow-auto px-6'}>
        <div className="flex w-[400px] max-w-full items-center rounded-xl pt-[20px]">
          <div className="flex h-[38px] w-[400px] flex-grow items-center rounded-xl bg-lightPrimary text-sm text-gray-600 dark:!bg-navy-900 dark:text-white">
            <SearchIcon />
            <input
              value={query}
              onChange={(e: any) => setQuery(e.target.value)}
              type="text"
              placeholder="搜索知识库全文…"
              className="block w-full rounded-full bg-lightPrimary text-base text-navy-700 outline-none dark:!bg-navy-900 dark:text-white"
            />
          </div>
        </div>

        <div className="mt-8">
          {error ? <KbError message={error} /> : null}
          {loading ? (
            <p className="text-sm font-medium text-gray-600">搜索中…</p>
          ) : null}
          {hits !== null && !loading ? (
            <>
              <h5 className="text-lg font-bold text-navy-700 dark:text-white">
                {hits.length} 条结果
              </h5>
              {hits.map((hit, i) => (
                <NavLink
                  key={i}
                  href={`/admin/kb/${hit.domain}/${hit.slug}`}
                  className="mt-2 block px-1 py-2 hover:cursor-pointer"
                >
                  <p className="text-sm font-bold text-brand-500 dark:text-brand-400">
                    {hit.title}
                    <span className="ml-2 text-xs font-normal text-gray-600">
                      {hit.domain} · 第 {hit.line} 行
                    </span>
                  </p>
                  <p className="mt-1 text-sm font-medium text-navy-700 dark:text-white">
                    {hit.snippet}
                  </p>
                </NavLink>
              ))}
            </>
          ) : null}
          {hits === null && !loading && !error ? (
            <p className="pb-6 text-sm font-medium text-gray-600">
              输入至少 {MIN_QUERY_LEN} 个字符开始搜索
            </p>
          ) : null}
        </div>
      </Card>
    </div>
  );
};

export default SearchPage;
