'use client';
// 全文搜索 —— 搜索框沿用模板 SearchTableOrders 的搜索样式
import { useState } from 'react';
import Link from 'next/link';
import Card from 'components/card';
import SearchIcon from 'components/icons/SearchIcon';
import { KbError } from 'components/admin/kb/KbState';
import { fetchSearch } from 'lib/kb/client';
import type { KbSearchHit } from 'types/kb';

const SearchPage = () => {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<KbSearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = async () => {
    if (query.trim().length < 2) return;
    setLoading(true);
    setError(null);
    try {
      setHits(await fetchSearch(query));
    } catch (err: any) {
      setError(err.message);
      setHits(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3 h-full w-full">
      <Card extra="w-full !p-6">
        <div className="flex w-full items-center gap-3">
          <div className="flex h-[38px] w-full flex-grow items-center rounded-xl bg-lightPrimary text-sm text-gray-600 dark:!bg-navy-900 dark:text-white">
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runSearch()}
              type="text"
              placeholder="搜索知识库全文（中文，至少 2 个字符）…"
              className="block w-full rounded-full bg-lightPrimary text-base text-navy-700 outline-none dark:!bg-navy-900 dark:text-white"
            />
          </div>
          <button
            onClick={runSearch}
            className="linear rounded-xl bg-brand-500 px-5 py-2 text-base font-medium text-white transition duration-200 hover:bg-brand-600 active:bg-brand-700 dark:bg-brand-400 dark:hover:bg-brand-300 dark:active:bg-brand-200"
          >
            搜索
          </button>
        </div>
      </Card>

      {error ? <KbError message={error} /> : null}
      {loading ? (
        <Card extra="w-full mt-3 !p-6">
          <p className="text-sm font-medium text-gray-600 dark:text-white/70">
            搜索中…
          </p>
        </Card>
      ) : null}
      {hits !== null && !loading ? (
        <Card extra="w-full mt-3 !p-6">
          <p className="mb-3 text-sm font-bold text-navy-700 dark:text-white">
            {hits.length} 条结果
          </p>
          <div className="divide-y divide-gray-200 dark:divide-white/10">
            {hits.map((hit, i) => (
              <Link
                key={i}
                href={`/admin/kb/${hit.domain}/${hit.slug}`}
                className="block py-3 hover:bg-lightPrimary dark:hover:bg-navy-700"
              >
                <p className="text-sm font-bold text-brand-500 dark:text-brand-400">
                  {hit.title}
                  <span className="ml-2 text-xs font-normal text-gray-600">
                    {hit.domain} · 第 {hit.line} 行
                  </span>
                </p>
                <p className="mt-1 text-sm text-navy-700 dark:text-white/80">
                  {hit.snippet}
                </p>
              </Link>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
};

export default SearchPage;
