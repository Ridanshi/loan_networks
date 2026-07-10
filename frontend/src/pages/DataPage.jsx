import { AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';
import SearchBox from '../components/SearchBox';
import StatusTabs from '../components/StatusTabs';
import VerifyDocumentButton from '../components/VerifyDocumentButton';
import { fetchPageData, getApiErrorMessage } from '../services/api';

const pageSize = 20;

export default function DataPage({ pageKey, title, tabs = [], enableDocumentVerification = false }) {
  const [data, setData] = useState(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState();
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function loadData() {
    setLoading(true);
    setError('');

    return fetchPageData(pageKey, { page, limit: pageSize, search, tab: activeTab })
      .then(setData)
      .catch((err) => {
        setData(null);
        setError(getApiErrorMessage(err, 'Unable to load records'));
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const timeout = window.setTimeout(loadData, 250);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, page, pageKey, search]);

  const actions = enableDocumentVerification
    ? (row) => <VerifyDocumentButton disbursementId={row.id} onVerified={loadData} />
    : undefined;

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{data ? `Table: ${data.table}` : 'PostgreSQL records'}</p>
        </div>
        <SearchBox
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
      </div>

      <StatusTabs
        tabs={tabs}
        activeTab={activeTab}
        onChange={(value) => {
          setActiveTab(value);
          setPage(1);
        }}
      />

      {error ? (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          {error}
        </div>
      ) : null}

      {data?.missingColumns.length ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Missing requested columns in actual schema: {data.missingColumns.join(', ')}
        </div>
      ) : null}

      <DataTable columns={data?.columns ?? []} rows={data?.rows ?? []} loading={loading} actions={actions} />

      <Pagination page={page} pageSize={pageSize} total={data?.total ?? 0} onPageChange={setPage} />
    </section>
  );
}
