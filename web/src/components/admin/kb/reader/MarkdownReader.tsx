// Markdown 渲染器 —— 模板无内容渲染能力，统一在此封装（全站唯一入口）
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

export default MarkdownReader;
