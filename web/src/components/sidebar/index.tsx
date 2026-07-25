/* eslint-disable */

import { HiX } from 'react-icons/hi';
import Links from './components/Links';

import {
  renderThumb,
  renderTrack,
  renderView,
  renderViewMini,
} from 'components/scrollbar/Scrollbar';
import { Scrollbars } from 'react-custom-scrollbars-2';
import Card from 'components/card';
import { IRoute } from 'types/navigation';
import { useContext } from 'react';
import { ConfiguratorContext } from 'contexts/ConfiguratorContext';

function SidebarHorizon(props: { routes: IRoute[]; [x: string]: any }) {
  const { routes, open, setOpen, variant, setHovered, hovered } = props;
  const context = useContext(ConfiguratorContext);
  const { mini } = context;
  return (
    <div
      className={`sm:none ${
        mini === false
          ? 'w-[285px]'
          : mini === true && hovered === true
          ? 'w-[285px]'
          : 'w-[285px] xl:!w-[120px]'
      } duration-175 linear fixed !z-50 min-h-full transition-all md:!z-50 lg:!z-50 xl:!z-0 ${
        variant === 'auth' ? 'xl:hidden' : 'xl:block'
      } ${open ? '' : '-translate-x-[110%] xl:translate-x-[unset]'}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Card
        extra={`ml-3 w-full h-[96.5vh] sm:mr-4 sm:my-4 m-7 !rounded-[20px]`}
      >
        <Scrollbars
          autoHide
          renderTrackVertical={renderTrack}
          renderThumbVertical={renderThumb}
          renderView={
            mini === false
              ? renderView
              : mini === true && hovered === true
              ? renderView
              : renderViewMini
          }
        >
          <div className="flex h-full flex-col justify-between">
            <div>
              <span
                className="absolute right-4 top-4 block cursor-pointer xl:hidden"
                onClick={() => setOpen(false)}
              >
                <HiX />
              </span>
              <div className={`ml-[52px] mt-[44px] flex items-center `}>
                <div
                  className={`ml-1 mt-1 h-2.5 font-poppins text-[26px] font-bold uppercase text-navy-700 dark:text-white ${
                    mini === false
                      ? 'block'
                      : mini === true && hovered === true
                      ? 'block'
                      : 'hidden'
                  }`}
                >
                  知识库
                </div>
                <div
                  className={`ml-1 mt-1 h-2.5 font-poppins text-[26px] font-bold uppercase text-navy-700 dark:text-white ${
                    mini === false
                      ? 'hidden'
                      : mini === true && hovered === true
                      ? 'hidden'
                      : 'block'
                  }`}
                >
                  知
                </div>
              </div>
              <div className="mb-7 mt-[58px] h-px bg-gray-200 dark:bg-white/10" />
              {/* Nav item */}
              <ul>
                <Links mini={mini} hovered={hovered} routes={routes} />
              </ul>
            </div>
            {/* 模板底部区块整体移除：促销卡（引 apexcharts 进每页首屏）与
                「Adela Parkson / Product Designer」假身份都与本项目无关 */}
          </div>
        </Scrollbars>
      </Card>
    </div>
  );
}

export default SidebarHorizon;
