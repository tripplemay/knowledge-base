import React from 'react';
import { FiAlignJustify } from 'react-icons/fi';
import dynamic from 'next/dynamic';

// 主题调试器改为动态加载：它是整个 admin 布局里唯一的 Chakra 消费方
// （@chakra-ui/modal 的 Drawer + hooks，并连带 @emotion/* 与 framer-motion），
// 静态引入会把这一整条运行时算进每个页面的首屏 JS。
const Configurator = dynamic(() => import('./Configurator'), { ssr: false });

// 模板原版的假搜索框、通知下拉、Horizon 推广下拉、「Hey, Adela」头像菜单
// 已全部移除（全是死链与广告，与本知识库无关）。只保留：当前页标题、
// 移动端汉堡键、主题/暗色抽屉。
const Navbar = (props: {
  onOpenSidenav: () => void;
  brandText: string;
  secondary?: boolean | string;
  [x: string]: any;
}) => {
  const { onOpenSidenav, brandText, mini, hovered } = props;
  const [darkmode, setDarkmode] = React.useState(
    document.body.classList.contains('dark'),
  );
  return (
    <nav
      className={`duration-175 linear fixed right-3 top-3 flex flex-row flex-wrap items-center justify-between rounded-xl bg-white/30 transition-all ${
        mini === false
          ? 'w-[calc(100vw_-_6%)] md:w-[calc(100vw_-_8%)] lg:w-[calc(100vw_-_6%)] xl:w-[calc(100vw_-_350px)] 2xl:w-[calc(100vw_-_365px)]'
          : mini === true && hovered === true
          ? 'w-[calc(100vw_-_6%)] md:w-[calc(100vw_-_8%)] lg:w-[calc(100vw_-_6%)] xl:w-[calc(100vw_-_350px)] 2xl:w-[calc(100vw_-_365px)]'
          : 'w-[calc(100vw_-_6%)] md:w-[calc(100vw_-_8%)] lg:w-[calc(100vw_-_6%)] xl:w-[calc(100vw_-_180px)] 2xl:w-[calc(100vw_-_195px)]'
      }  p-2 backdrop-blur-xl dark:bg-[#0b14374d] md:right-[30px] md:top-4 xl:top-[20px]`}
    >
      <div className="ml-[6px]">
        <p className="shrink text-[33px] capitalize text-navy-700 dark:text-white">
          <span className="font-bold capitalize">{brandText}</span>
        </p>
      </div>

      <div className="relative mt-[3px] flex h-[61px] items-center justify-end gap-3 rounded-full bg-white px-4 py-2 shadow-xl shadow-shadow-500 dark:!bg-navy-800 dark:shadow-none">
        <span
          className="flex cursor-pointer text-xl text-gray-600 dark:text-white xl:hidden"
          onClick={onOpenSidenav}
        >
          <FiAlignJustify className="h-5 w-5" />
        </span>
        <Configurator
          mini={props.mini}
          setMini={props.setMini}
          theme={props.theme}
          setTheme={props.setTheme}
          darkmode={darkmode}
          setDarkmode={setDarkmode}
        />
      </div>
    </nav>
  );
};

export default Navbar;
