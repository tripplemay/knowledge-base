// 域内文档列表 —— Server Component 直读文件系统，表格交互留在 DocTable（'use client'）
import { notFound } from 'next/navigation';
import DocTable from 'components/admin/kb/doc-list/DocTable';
import { KbNotFoundError, listDocs } from 'lib/kb/server';

// 同 domains 页：fs 读不被 Next 追踪，必须强制动态
export const dynamic = 'force-dynamic';

export default async function DomainDocsPage(props: {
  params: Promise<{ domain: string }>;
}) {
  // Next 15 的 params 是 Promise，不能沿用 useParams()
  const { domain } = await props.params;
  let docs;
  try {
    docs = await listDocs(domain);
  } catch (err) {
    // 只有"域不存在"才是 404；meta.yaml 损坏等读取故障要抛给 error.tsx，
    // 一律 notFound() 会把真实故障伪装成 404
    if (!(err instanceof KbNotFoundError)) throw err;
    docs = null;
  }
  // notFound() 靠抛错实现，写在 try 内会被自己的 catch 吞掉
  if (docs === null) notFound();
  return (
    <div className="mt-3 h-full w-full">
      <DocTable tableData={docs} />
    </div>
  );
}
