'use client';
// 上传文档 —— 拖放选文件 + 选域 + 提交，成功后跳转任务详情
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Card from 'components/card';
import InputField from 'components/fields/InputField';
import SwitchField from 'components/fields/SwitchField';
import UploadDropzone from 'components/admin/kb/jobs/UploadDropzone';
import { KbError } from 'components/admin/kb/KbState';
import { fetchDomains } from 'lib/kb/client';
import { uploadDocument } from 'lib/kb/ingest';
import { useKbFetch } from 'lib/kb/useKbFetch';

const UploadPage = () => {
  const router = useRouter();
  const { data: domains } = useKbFetch(fetchDomains, []);
  const [file, setFile] = useState<File | null>(null);
  const [domain, setDomain] = useState('');
  const [slug, setSlug] = useState('');
  const [layout, setLayout] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!file || !domain) return;
    setSubmitting(true);
    setError(null);
    try {
      const job = await uploadDocument(file, domain, slug || undefined, layout);
      router.push(`/admin/kb/jobs/${job.id}`);
    } catch (err: any) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-3 h-full w-full">
      <Card extra="w-full !p-6">
        <h5 className="mb-4 text-lg font-bold text-navy-700 dark:text-white">
          上传文档到知识库
        </h5>
        <UploadDropzone onFile={setFile} fileName={file?.name} />
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="ml-1.5 text-sm font-bold text-navy-700 dark:text-white">
              知识域
            </label>
            <select
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="mt-2 flex h-12 w-full items-center rounded-xl border border-gray-200 bg-white/0 p-3 text-sm text-navy-700 outline-none dark:!border-white/10 dark:text-white [&>option]:dark:bg-navy-800"
            >
              <option value="">选择知识域…</option>
              {(domains ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}（{d.id}）
                </option>
              ))}
            </select>
          </div>
          <InputField
            id="slug"
            label="自定义 slug（可选）"
            placeholder="留空自动从文件名生成"
            type="text"
            value={slug}
            onChange={(e: any) => setSlug(e.target.value)}
          />
        </div>
        <SwitchField
          id="layout-switch"
          label="生成保版式中文 PDF"
          desc="PDF 文档额外生成 zh.pdf 与 dual.pdf（耗时较长、CPU 占用高）"
          mt="mt-4"
          mb="mb-1"
          checked={layout}
          onChange={() => setLayout(!layout)}
        />
        <button
          onClick={submit}
          disabled={!file || !domain || submitting}
          className="linear mt-5 rounded-xl bg-brand-500 px-5 py-3 text-base font-medium text-white transition duration-200 hover:bg-brand-600 active:bg-brand-700 disabled:opacity-50 dark:bg-brand-400 dark:text-white dark:hover:bg-brand-300 dark:active:bg-brand-200"
        >
          {submitting ? '上传中…' : '开始摄取'}
        </button>
      </Card>
      {error ? <KbError message={error} /> : null}
    </div>
  );
};

export default UploadPage;
