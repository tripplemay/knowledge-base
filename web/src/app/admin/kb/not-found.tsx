// KB 子树的 404 边界 —— 未知知识域 / 文档时由 notFound() 命中，替代原先的错误卡
import { KbError } from 'components/admin/kb/KbState';

export default function NotFound() {
  return <KbError message="知识域 / 文档不存在" />;
}
