// 知识域总览 —— Server Component 直读文件系统，数据随首份 Flight 载荷送达，不再走 /api/kb/domains
import DomainCard from 'components/admin/kb/domains/DomainCard';
import { listDomains } from 'lib/kb/server';

// fs 读不被 Next 追踪，必须强制动态；否则 build 会把当时的语料烤成静态页，
// 之后 Python 流水线新写入的文档永远不显示（dev 恒动态渲染，只有 next start 才暴露）
export const dynamic = 'force-dynamic';

export default async function DomainsPage() {
  const domains = await listDomains();
  return (
    <div className="mt-3 grid h-full grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {domains.map((domain) => (
        <DomainCard key={domain.id} domain={domain} />
      ))}
    </div>
  );
}
