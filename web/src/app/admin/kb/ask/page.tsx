'use client';
// 语义问答 —— LightRAG 图谱+向量混合检索，答案带来源引用
import { useState } from 'react';
import Card from 'components/card';
import MarkdownReader from 'components/admin/kb/reader/MarkdownReader';
import { KbError } from 'components/admin/kb/KbState';
import { INGEST_BASE } from 'lib/kb/ingest';

const AskPage = () => {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    if (question.trim().length < 4 || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${INGEST_BASE}/api/v1/kg/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: 'ai-engineering', question }),
      });
      const body = await res.json();
      if (!body.success) throw new Error(body.error ?? body.detail ?? '查询失败');
      setAnswer(body.data.answer);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3 h-full w-full">
      <Card extra="w-full !p-6">
        <h5 className="mb-3 text-lg font-bold text-navy-700 dark:text-white">
          知识库问答（ai-engineering 域）
        </h5>
        <div className="flex w-full items-center gap-3">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ask()}
            type="text"
            placeholder="向知识库提问，例如：智能体失败的主要原因是什么？"
            className="flex h-12 w-full items-center rounded-xl border border-gray-200 bg-white/0 p-3 text-sm text-navy-700 outline-none dark:!border-white/10 dark:text-white"
          />
          <button
            onClick={ask}
            disabled={loading}
            className="linear rounded-lg bg-brand-500 px-3 py-2.5 text-sm font-medium text-white transition duration-200 hover:bg-brand-600 active:bg-brand-700 disabled:opacity-50 dark:bg-brand-400 dark:text-white dark:hover:bg-brand-300 dark:active:bg-brand-200"
          >
            {loading ? '检索中…' : '提问'}
          </button>
        </div>
        <p className="mt-2 text-xs font-medium text-gray-600">
          图谱 + 向量混合检索，生成约需 30-60 秒，答案附来源文档引用
        </p>
      </Card>
      {error ? <KbError message={error} /> : null}
      {answer ? (
        <Card extra="w-full mt-3 !p-6">
          <MarkdownReader markdown={answer} />
        </Card>
      ) : null}
    </div>
  );
};

export default AskPage;
