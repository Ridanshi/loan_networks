import { AlertCircle, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import Pagination from '../components/Pagination';
import { fetchBtJourneys, getApiErrorMessage } from '../services/api';

const pageSize = 20;

function value(text) {
  return text === null || text === undefined || text === '' ? '-' : String(text);
}

export default function BtJourneysPage() {
  const [data, setData] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    const timeout = window.setTimeout(() => {
      fetchBtJourneys({ page, limit: pageSize, search })
        .then(setData)
        .catch((err) => setError(getApiErrorMessage(err, 'Unable to load BT journeys')))
        .finally(() => setLoading(false));
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [page, search]);

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">All Journeys</h2>
        <p className="mt-1 text-sm text-slate-500">BT Journey records backed by bt_journeys and related pools.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {['all', 'active', 'inactive'].map((key) => (
          <div key={key} className="rounded-md border border-slate-200 bg-white p-4">
            <div className="text-sm font-medium capitalize text-slate-500">{key}</div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">{data?.counts[key] ?? '-'}</div>
          </div>
        ))}
      </div>

      <label className="relative block w-full max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search journeys"
          className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-slate-900"
        />
      </label>

      {error ? (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-100 text-left text-xs font-semibold uppercase text-slate-600">
              <tr>
                <th className="px-4 py-3">Journey</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Default Sales</th>
                <th className="px-4 py-3">DSA Pool</th>
                <th className="px-4 py-3">Lender Offers</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Loading journeys...</td></tr>
              ) : data?.rows.length ? (
                data.rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-950">{value(row.name)}</div>
                      <div className="mt-1 text-xs text-slate-500">#{row.id} - {value(row.property_type)} - {value(row.journey_for)}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{value(row.city_name)}</td>
                    <td className="px-4 py-3 text-slate-700">{value(row.default_sales_name)}</td>
                    <td className="px-4 py-3 text-slate-700">{row.dsa_count}</td>
                    <td className="px-4 py-3 text-slate-700">{row.lender_offer_count}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded px-2 py-1 text-xs font-medium ${row.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                        {row.is_active ? 'active' : 'inactive'}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No journeys found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination page={page} pageSize={pageSize} total={data?.total ?? 0} onPageChange={setPage} />
    </section>
  );
}
