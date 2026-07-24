'use client';
// 文档阅读器 —— 沿用模板 course-page 的双栏布局（内容 7 栏 + 侧栏 4 栏）
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Card from 'components/card';
import DocMetaPanel from 'components/admin/kb/reader/DocMetaPanel';
import LangTabs from 'components/admin/kb/reader/LangTabs';
import MarkdownReader from 'components/admin/kb/reader/MarkdownReader';
import { KbError, KbLoading } from 'components/admin/kb/KbState';
import { fetchDoc } from 'lib/kb/client';
import { useKbFetch } from 'lib/kb/useKbFetch';
import type { KbDocVariant } from 'types/kb';

const DocReaderPage = () => {
  const params = useParams<{ domain: string; doc: string }>();
  const domain = params?.domain ?? '';
  const doc = params?.doc ?? '';
  const [variant, setVariant] = useState<KbDocVariant>('zh');
  const { data, loading, error } = useKbFetch(
    () => fetchDoc(domain, doc, variant),
    [domain, doc, variant],
  );

  if (error) return <KbError message={error} />;
  return (
    <div className="mt-3 grid h-full w-full grid-cols-1 gap-5 lg:grid-cols-11">
      <div className="lg:col-span-7">
        <Card extra="w-full !p-6">
          {data ? (
            <LangTabs
              variants={data.variants}
              active={data.variant}
              onChange={setVariant}
            />
          ) : null}
          {loading ? (
            <p className="py-10 text-center text-sm font-medium text-gray-600 dark:text-white/70">
              加载中…
            </p>
          ) : (
            <MarkdownReader markdown={data.markdown} />
          )}
        </Card>
      </div>
      <div className="lg:col-span-4">
        {loading ? <KbLoading /> : <DocMetaPanel meta={data.meta} />}
      </div>
    </div>
  );
};

export default DocReaderPage;
