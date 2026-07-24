// 知识域卡片 —— 基于模板 Card 容器；内部行样式沿用模板 Transaction 列表惯例
import NavLink from 'components/link/NavLink';
import Card from 'components/card';
import { MdOutlineLibraryBooks } from 'react-icons/md';
import type { KbDomainInfo } from 'types/kb';

function DomainCard(props: { domain: KbDomainInfo }) {
  const { domain } = props;
  return (
    <NavLink href={`/admin/kb/${domain.id}`}>
      <Card extra="flex flex-col w-full h-full !p-5 bg-white hover:cursor-pointer">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center rounded-full bg-lightPrimary p-2.5 text-xl text-brand-500 dark:bg-navy-700 dark:text-white">
            <MdOutlineLibraryBooks className="h-6 w-6" />
          </div>
          <div>
            <h5 className="text-base font-bold text-navy-700 dark:text-white">
              {domain.name}
            </h5>
            <p className="text-sm font-medium text-gray-600">{domain.id}</p>
          </div>
        </div>
        <p className="mt-3 text-sm font-medium text-gray-600">
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
    </NavLink>
  );
}

export default DomainCard;
