// Markdown 渲染器 —— 模板无内容渲染能力，统一在此封装（全站唯一入口）
import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function MarkdownReader(props: { markdown: string }) {
  const { markdown } = props;
  return (
    <div className="prose prose-sm max-w-none font-dm dark:prose-invert md:prose-base prose-headings:text-navy-700 prose-a:text-brand-500 prose-blockquote:border-brand-500 dark:prose-headings:text-white dark:prose-a:text-brand-400">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  );
}

// props 只有一个 string，浅比较天然正确：父组件因视图切换等原因重渲染时可跳过重新解析
export default memo(MarkdownReader);
