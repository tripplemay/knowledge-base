// KB 子树的加载边界 —— 服务端 await 期间展示，客户端路由跳转时同样生效
// 注意：全站包在 NoSSR 内，首屏看不到它；仍值得保留，用于软导航
import { KbLoading } from 'components/admin/kb/KbState';

export default function Loading() {
  return <KbLoading />;
}
