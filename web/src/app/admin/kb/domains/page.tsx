// 知识域总览 —— Server Component 直读文件系统，数据随首份 Flight 载荷送达，不再走 /api/kb/domains
import DomainCard from 'components/admin/kb/domains/DomainCard';
import NavLink from 'components/link/NavLink';
import { KbEmpty } from 'components/admin/kb/KbState';
import { listDomains } from 'lib/kb/server';

// fs 读不被 Next 追踪，必须强制动态；否则 build 会把当时的语料烤成静态页，
// 之后 Python 流水线新写入的文档永远不显示（dev 恒动态渲染，只有 next start 才暴露）
export const dynamic = 'force-dynamic';

export default async function DomainsPage() {
  const domains = await listDomains();
  // 空态放在页面层：空网格什么都不显示，用户无从判断是"没数据"还是"加载失败"
  if (domains.length === 0) {
    return (
      <KbEmpty
        message="还没有知识域"
        hint="上传第一篇文档后，系统会按内容自动归类并创建知识域"
        action={
          // borderRadius 必须显式传：NavLink 会注入内联 border-radius:0，压掉任何 rounded-* 类
          <NavLink
            href="/admin/kb/upload"
            borderRadius="8px"
            className="linear inline-flex items-center bg-brand-500 px-3 py-2.5 text-sm font-medium text-white transition duration-200 hover:bg-brand-600 active:bg-brand-700 dark:bg-brand-400 dark:text-white dark:hover:bg-brand-300 dark:active:bg-brand-200"
          >
            上传文档
          </NavLink>
        }
      />
    );
  }
  return (
    <div className="mt-3 grid h-full grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {domains.map((domain) => (
        <DomainCard key={domain.id} domain={domain} />
      ))}
    </div>
  );
}
