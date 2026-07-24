// 知识域卡片 —— 基于模板 Card 容器
import Link from 'next/link';
import Card from 'components/card';
import { MdOutlineLibraryBooks } from 'react-icons/md';
import type { KbDomainInfo } from 'types/kb';

function DomainCard(props: { domain: KbDomainInfo }) {
  const { domain } = props;
  return (
    <Link href={`/admin/kb/${domain.id}`}>
      <Card extra="flex flex-col w-full h-full !p-5 bg-white transition duration-200 cursor-pointer hover:-translate-y-1">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-lightPrimary dark:bg-navy-700">
            <MdOutlineLibraryBooks className="h-6 w-6 text-brand-500 dark:text-white" />
          </div>
          <div>
            <p className="text-lg font-bold text-navy-700 dark:text-white">
              {domain.name}
            </p>
            <p className="text-sm font-medium text-gray-600">{domain.id}</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-gray-600 dark:text-white/70">
          {domain.description || '（暂无描述）'}
        </p>
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm font-bold text-navy-700 dark:text-white">
            {domain.docCount} 份文档
          </p>
          <p className="text-sm font-medium text-gray-600">
            {domain.lastIngestedAt
              ? `最近摄取 ${domain.lastIngestedAt.slice(0, 10)}`
              : '尚无文档'}
          </p>
        </div>
      </Card>
    </Link>
  );
}

export default DomainCard;
