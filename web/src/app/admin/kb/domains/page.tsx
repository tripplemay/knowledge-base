'use client';
// 知识域总览 —— 沿用模板 NFT marketplace 的卡片网格布局
import DomainCard from 'components/admin/kb/domains/DomainCard';
import { KbError, KbLoading } from 'components/admin/kb/KbState';
import { fetchDomains } from 'lib/kb/client';
import { useKbFetch } from 'lib/kb/useKbFetch';

const DomainsPage = () => {
  const { data, loading, error } = useKbFetch(fetchDomains, []);

  if (loading) return <KbLoading />;
  if (error) return <KbError message={error} />;
  return (
    <div className="mt-3 grid h-full grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {data.map((domain) => (
        <DomainCard key={domain.id} domain={domain} />
      ))}
    </div>
  );
};

export default DomainsPage;
