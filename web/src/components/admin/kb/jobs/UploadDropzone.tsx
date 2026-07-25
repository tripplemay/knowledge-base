// 上传拖放区 —— 基于模板 settings-product/DropZonefile 改造（补 onDrop 透传）
import { useDropzone, type FileRejection } from 'react-dropzone';
import { MdOutlineCloudUpload } from 'react-icons/md';

// 与后端 _kb/server/app.py:29 MAX_UPLOAD_BYTES 对齐
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / 1024 / 1024;

// 按 react-dropzone 的 error code 给出对应文案（同一批可能混有多种 code）
function rejectMessage(rejections: FileRejection[]): string {
  const has = (code: string) =>
    rejections.some((r) => r.errors.some((e) => e.code === code));
  if (has('too-many-files')) return '一次只能上传一个文件';
  if (has('file-too-large')) return `文件超过 ${MAX_UPLOAD_MB}MB 上限`;
  return '不支持的文件类型（仅 PDF / Markdown / TXT）';
}

function UploadDropzone(props: {
  onFile: (file: File | null) => void;
  onReject?: (message: string) => void;
  fileName?: string;
  disabled?: boolean;
}) {
  const { onFile, onReject, fileName, disabled } = props;
  const { getRootProps, getInputProps } = useDropzone({
    multiple: false,
    maxSize: MAX_UPLOAD_BYTES,
    // 提交在途时禁止再拖放：否则被拒文件的 onFile(null) 会清掉正在上传的文件，
    // 上传失败后用户会看到「有错误但没有文件可重试」
    disabled,
    accept: {
      'application/pdf': ['.pdf'],
      'text/markdown': ['.md'],
      'text/plain': ['.txt'],
    },
    // 只用 onDrop 一处收口：它同时拿到 accepted 与 rejections，
    // 避免 onDrop / onDropRejected 分开写时的调用顺序竞争
    onDrop: (accepted, rejections) => {
      if (accepted[0]) {
        // 混合拖放（合法文件 + 非法文件）时以 accepted 为准，不留残余错误
        onReject?.('');
        onFile(accepted[0]);
        return;
      }
      if (rejections.length > 0) {
        // 被拒时一并清掉上一次已选中的文件，避免「有错误却仍可提交旧文件」
        onFile(null);
        onReject?.(rejectMessage(rejections));
      }
    },
  });
  return (
    <div
      {...getRootProps({
        className:
          'flex w-full cursor-pointer items-center justify-center rounded-xl',
      })}
    >
      <input {...getInputProps()} />
      <button
        type="button"
        className="flex h-[205px] w-full flex-col items-center justify-center rounded-xl !border border-dashed border-gray-200 bg-gray-100 px-[5px] dark:!border-white/10 dark:!bg-navy-700"
      >
        <p className="text-[80px] text-navy-700 dark:text-white">
          <MdOutlineCloudUpload />
        </p>
        <p className="text-lg font-bold text-navy-700 dark:text-white">
          {fileName ?? '拖入文档，或'}
          {!fileName && (
            <span className="pl-2 font-bold text-brand-500 dark:text-brand-400">
              点击选择
            </span>
          )}
        </p>
        <p className="pt-2 text-sm font-medium text-gray-600">
          支持 PDF / Markdown / TXT，最大 {MAX_UPLOAD_BYTES / 1024 / 1024}MB
        </p>
      </button>
    </div>
  );
}

export default UploadDropzone;
