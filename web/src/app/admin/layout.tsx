'use client';
// Layout components
import { usePathname } from 'next/navigation';
import { useContext, useState } from 'react';
import { ConfiguratorContext } from 'contexts/ConfiguratorContext';
import routes from 'routes';
import {
  getActiveNavbar,
  getActiveRoute,
  isWindowAvailable,
} from 'utils/navigation';
import React from 'react';
// 用 React 原生 createPortal 取代 @chakra-ui/portal：后者是 admin 布局里
// 唯一的静态 Chakra 引用，会把 chakra + @emotion 运行时算进每个页面的首屏 JS。
// 本布局是 'use client' 且整站经 AppWrappers 关闭了 SSR，渲染时 document 必然存在。
import { createPortal } from 'react-dom';
import Navbar from 'components/navbar';
import Sidebar from 'components/sidebar';
import Footer from 'components/footer/Footer';

export default function Admin({ children }: { children: React.ReactNode }) {
  // states and functions
  const [fixed] = useState(false);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const pathname = usePathname();
  if (isWindowAvailable()) document.documentElement.dir = 'ltr';
  const context = useContext(ConfiguratorContext);
  const { mini, theme, setTheme, setMini } = context;
  return (
    <div className="flex h-full w-full bg-background-100 dark:bg-background-900">
      <Sidebar
        routes={routes}
        open={open}
        setOpen={() => setOpen(!open)}
        hovered={hovered}
        setHovered={setHovered}
        mini={mini}
        variant="admin"
      />
      {/* Navbar & Main Content */}
      <div className="h-full w-full font-dm dark:bg-navy-900">
        {/* Main Content */}
        <main
          className={`mx-2.5 flex-none transition-all dark:bg-navy-900 md:pr-2 ${
            mini === false
              ? 'xl:ml-[313px]'
              : mini === true && hovered === true
              ? 'xl:ml-[313px]'
              : 'ml-0 xl:ml-[142px]'
          } `}
        >
          {/* Routes */}
          <div>
            {isWindowAvailable()
              ? createPortal(
                  <Navbar
                    onOpenSidenav={() => setOpen(!open)}
                    brandText={getActiveRoute(routes, pathname)}
                    secondary={getActiveNavbar(routes, pathname)}
                    theme={theme}
                    setTheme={setTheme}
                    hovered={hovered}
                    mini={mini}
                    setMini={setMini}
                  />,
                  document.body,
                )
              : null}
            <div className="mx-auto min-h-screen p-2 !pt-[100px] md:p-2">
              {children}
            </div>
            <div className="p-3">
              <Footer />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
