// 加载中 / 错误 的统一展示（基于模板 Card），所有 KB 页面共用
import Card from 'components/card';

export function KbLoading() {
  return (
    <Card extra="w-full mt-3 flex items-center justify-center !p-10">
      <p className="text-sm font-medium text-gray-600">
        加载中…
      </p>
    </Card>
  );
}

export function KbError(props: { message: string }) {
  const { message } = props;
  return (
    <Card extra="w-full mt-3 flex items-center justify-center !p-10">
      <p className="text-sm font-bold text-red-500">{message}</p>
    </Card>
  );
}
