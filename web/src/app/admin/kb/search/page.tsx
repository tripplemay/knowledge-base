'use client';
// 全文搜索 —— 搜索框结构与交互复刻模板 SearchTableOrders：
// 同一张 Card 内「搜索框 + 结果区」，即输即搜（防抖），无独立搜索按钮
import { useEffect, useState } from 'react';
import NavLink from 'components/link/NavLink';
import Card from 'components/card';
import SearchIcon from 'components/icons/SearchIcon';
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
      // 关键词不足时必须复位 loading，否则页面会卡在「搜索中…」的假加载态
      setLoading(false);
      return;
    }
    // 连打字时：cancelled 拦住迟到的 setState，ac.abort() 取消已发出的在途请求
    const ac = new AbortController();
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      fetchSearch(query, undefined, ac.signal)
        .then((data) => {
          if (!cancelled) {
            setHits(data);
            setError(null);
          }
        })
        .catch((err: Error) => {
          // abort 触发的 rejection 不是真错误，不能落到 error 上
          if (cancelled || err.name === 'AbortError') return;
          setError(err.message);
          setHits(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      ac.abort();
    };
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
          {/* 错误以行内红字呈现：本处已在 Card 内，再用 KbError 会形成卡中卡 */}
          {error ? (
            <p className="mb-2 text-sm font-bold text-red-500">{error}</p>
          ) : null}
          {loading ? (
            <p className="text-sm font-medium text-gray-600">搜索中…</p>
          ) : null}
          {hits !== null && !loading ? (
            <>
              <h5 className="text-lg font-bold text-navy-700 dark:text-white">
                {hits.length} 条结果
              </h5>
              {hits.map((hit) => (
                <NavLink
                  key={`${hit.domain}/${hit.slug}#${hit.line}`}
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
