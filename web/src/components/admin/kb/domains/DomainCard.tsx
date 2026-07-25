// 知识域卡片 —— 基于模板 Card 容器；内部行样式沿用模板 Transaction 列表惯例
import NavLink from 'components/link/NavLink';
import Card from 'components/card';
import { MdOutlineLibraryBooks } from 'react-icons/md';
import type { KbDomainInfo } from 'types/kb';

// 徽标配色注意两点：
// 1. brand-* 在 tailwind.config.js 里是 var(--color-*)，tailwind 3 解析不出 RGB，
//    透明度修饰符（如 bg-brand-400/20）会被整条丢弃、编译不出任何 CSS —— 不要那样写。
//    暗色底改用模板惯例 white/10（半透明，卡片 hover 到 navy-700 时仍能透出层次）。
// 2. 原来的 text-brand-500 / text-amber-600 压在各自 -100 底色上只有 3.9:1 / 2.9:1，
//    text-xs 不算大文本，AA 要 4.5:1，故各下沉一档。暗色文字取 -100/-200，
//    这两档在 Configurator 的全部 7 套主题里都是浅色，方向安全。
const ORIGIN_BADGE: Record<string, { text: string; className: string }> = {
  auto: {
    text: '自动创建',
    className:
      'bg-brand-100 text-brand-600 dark:bg-white/10 dark:text-brand-100',
  },
  system: {
    text: '待归类',
    className:
      'bg-amber-100 text-amber-700 dark:bg-amber-400/20 dark:text-amber-200',
  },
};

function DomainCard(props: { domain: KbDomainInfo }) {
  const { domain } = props;
  const badge = ORIGIN_BADGE[domain.origin];
  return (
    // className 必须显式传：NavLink 直接把它插进模板字符串，缺省会渲染出字面量 class="undefined"。
    // 卡片在 grid 里，block h-full 让链接撑满网格单元，整卡都是可点区域。
    <NavLink href={`/admin/kb/${domain.id}`} className="block h-full">
      {/* dark:hover 必须带 ! 才能压过 card/index.tsx 的 dark:!bg-navy-800 */}
      <Card extra="linear flex flex-col w-full h-full !p-5 bg-white transition duration-200 hover:cursor-pointer hover:shadow-2xl dark:hover:!bg-navy-700">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center rounded-full bg-lightPrimary p-2.5 text-xl text-brand-500 dark:bg-navy-700 dark:text-white">
            <MdOutlineLibraryBooks className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h5 className="text-base font-bold text-navy-700 dark:text-white">
                {domain.name}
              </h5>
              {badge ? (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${badge.className}`}
                >
                  {badge.text}
                </span>
              ) : null}
            </div>
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
