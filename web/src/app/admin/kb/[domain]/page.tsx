'use client';
// 域内文档列表
import { useParams } from 'next/navigation';
import DocTable from 'components/admin/kb/doc-list/DocTable';
import { KbError, KbLoading } from 'components/admin/kb/KbState';
import { fetchDocs } from 'lib/kb/client';
import { useKbFetch } from 'lib/kb/useKbFetch';

const DomainDocsPage = () => {
  const params = useParams<{ domain: string }>();
  const domain = params?.domain ?? '';
  const { data, loading, error } = useKbFetch(
    () => fetchDocs(domain),
    [domain],
  );

  if (loading) return <KbLoading />;
  if (error) return <KbError message={error} />;
  return (
    <div className="mt-3 h-full w-full">
      <DocTable tableData={data} />
    </div>
  );
};

export default DomainDocsPage;
