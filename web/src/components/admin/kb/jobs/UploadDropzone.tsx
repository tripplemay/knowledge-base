// 上传拖放区 —— 基于模板 settings-product/DropZonefile 改造（补 onDrop 透传）
import { useDropzone } from 'react-dropzone';
import { MdOutlineCloudUpload } from 'react-icons/md';

function UploadDropzone(props: {
  onFile: (file: File) => void;
  fileName?: string;
}) {
  const { onFile, fileName } = props;
  const { getRootProps, getInputProps } = useDropzone({
    multiple: false,
    accept: {
      'application/pdf': ['.pdf'],
      'text/markdown': ['.md'],
      'text/plain': ['.txt'],
    },
    onDrop: (accepted) => accepted[0] && onFile(accepted[0]),
  });
  return (
    <div
      className="flex w-full cursor-pointer items-center justify-center rounded-xl"
      {...getRootProps({ className: 'dropzone' })}
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
          支持 PDF / Markdown / TXT，最大 200MB
        </p>
      </button>
    </div>
  );
}

export default UploadDropzone;
