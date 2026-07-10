import { AlertCircle, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import Pagination from '../components/Pagination';
import { fetchDsaOverview, getApiErrorMessage } from '../services/api';

const pageSize = 20;

const tabs = [
  { key: 'all', label: 'All' },
  { key: 'drafts', label: 'Drafts' },
  { key: 'active', label: 'Active' },
  { key: 'pending_approval', label: 'Pending Approval' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'rejected', label: 'Rejected' }
];

const dsaTypes = [
  { key: 'all', label: 'All DSAs' },
  { key: 'bt', label: 'BT' },
  { key: 'resale', label: 'Resale' },
  { key: 'afford', label: 'Afford' }
];

function asText(value) {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function firstItem(items) {
  return items?.[0] ?? null;
}

function StatusBadge({ status, active }) {
  const label = active === false ? 'inactive' : status || 'unknown';
  const tone = label === 'active' ? 'bg-emerald-50 text-emerald-700' : label === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-700';
  return <span className={`rounded px-2 py-1 text-xs font-medium ${tone}`}>{label.replace(/_/g, ' ')}</span>;
}

function DsaRow({ row }) {
  const billing = firstItem(row.billing_companies);
  const commission = firstItem(row.commission_structures);
  const scorecard = firstItem(row.scorecards);

  return (
    <tr className="align-top hover:bg-slate-50">
      <td className="px-4 py-4">
        <div className="font-medium text-slate-950">{asText(row.name)}</div>
        <div className="mt-1 text-xs text-slate-500">#{row.id} - {asText(row.city_name)}</div>
        <div className="mt-1 text-xs text-slate-500">{asText(row.email)}</div>
        <div className="mt-1 text-xs text-slate-500">{asText(row.country_code)} {asText(row.mobile_number)}</div>
        <div className="mt-2 flex flex-wrap gap-1">
          {row.bt_journey_enabled ? <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">BT</span> : null}
          {row.resale_enabled ? <span className="rounded bg-violet-50 px-1.5 py-0.5 text-xs text-violet-700">Resale</span> : null}
          {row.is_affordable ? <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">Afford</span> : null}
        </div>
      </td>
      <td className="px-4 py-4 text-sm text-slate-700">
        <div>{asText(row.assigned_employee_name)}</div>
        <div className="mt-1 text-xs text-slate-500">{asText(row.assigned_employee_code)}</div>
        <div className="mt-1 text-xs text-slate-500">{asText(row.assigned_employee_email)}</div>
      </td>
      <td className="px-4 py-4 text-sm text-slate-700">
        <div>{asText(row.organization_name)}</div>
        <div className="mt-1 max-w-xs truncate text-xs text-slate-500">{asText(row.organization_address)}</div>
      </td>
      <td className="px-4 py-4 text-sm text-slate-700">
        <div>{asText(billing?.name)}</div>
        <div className="mt-1 text-xs text-slate-500">{asText(billing?.status)} - {row.billing_count || 0} record(s)</div>
        <div className="mt-1 text-xs text-slate-500">GST: {asText(billing?.gstin)}</div>
      </td>
      <td className="px-4 py-4 text-sm text-slate-700">
        <div>{asText(commission?.loanType)}</div>
        <div className="mt-1 text-xs text-slate-500">{asText(commission?.status)} - {row.commission_count || 0} structure(s)</div>
        <div className="mt-1 text-xs text-slate-500">Self: {asText(commission?.selfValue)} {asText(commission?.selfUnit)}</div>
      </td>
      <td className="px-4 py-4 text-sm text-slate-700">
        <div>{row.scorecard_count || 0} scorecard(s)</div>
        <div className="mt-1 text-xs text-slate-500">Avg: {asText(row.average_score)}</div>
        <div className="mt-1 text-xs text-slate-500">{asText(scorecard?.productType)} {scorecard?.score ? `- ${scorecard.score}` : ''}</div>
      </td>
      <td className="px-4 py-4">
        <StatusBadge status={row.status} active={row.active} />
      </td>
    </tr>
  );
}

export default function AllDsaPage() {
  const [data, setData] = useState(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [type, setType] = useState('all');
  const [cityId, setCityId] = useState('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    const timeout = window.setTimeout(() => {
      fetchDsaOverview({ page, limit: pageSize, search, tab, type, cityId })
        .then(setData)
        .catch((err) => setError(getApiErrorMessage(err, 'Unable to load DSA data')))
        .finally(() => setLoading(false));
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [cityId, page, search, tab, type]);

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">All DSA</h2>
        <p className="mt-1 text-sm text-slate-500">DSA operations view backed by direct_selling_agent and related schema.</p>
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <label className="relative block w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search DSA, employee, organisation"
            className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-slate-900"
          />
        </label>
        <select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm">
          {dsaTypes.map((item) => (
            <option key={item.key} value={item.key}>{item.label}</option>
          ))}
        </select>
        <select value={cityId} onChange={(event) => { setCityId(event.target.value); setPage(1); }} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm">
          <option value="all">Cities</option>
          {data?.filters.cities.map((city) => (
            <option key={city.id} value={city.id}>{city.name} ({city.count})</option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              setTab(item.key);
              setPage(1);
            }}
            className={[
              'h-9 rounded-md border px-3 text-sm font-medium',
              tab === item.key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'
            ].join(' ')}
          >
            {item.label} {data?.counts[item.key] !== undefined ? `(${data.counts[item.key]})` : ''}
          </button>
        ))}
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          {error}
        </div>
      ) : null}

      <div className="rounded-md border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-[1200px] divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-100 text-xs font-semibold uppercase text-slate-600">
              <tr>
                <th className="px-4 py-3">Name & Details</th>
                <th className="px-4 py-3">Assigned Employee</th>
                <th className="px-4 py-3">Organisation</th>
                <th className="px-4 py-3">Billing</th>
                <th className="px-4 py-3">Commission</th>
                <th className="px-4 py-3">Scorecards</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Loading DSAs...</td></tr>
              ) : data?.rows.length ? (
                data.rows.map((row) => <DsaRow key={row.id} row={row} />)
              ) : (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No DSAs found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Schema note: All DSA uses verified joins from direct_selling_agent to employees, organization, billing_company,
        commission_structures, dsa_scorecards, and cities. Create/edit actions are not enabled because no writable workflow
        has been mapped in this demo.
      </div>

      <Pagination page={page} pageSize={pageSize} total={data?.total ?? 0} onPageChange={setPage} />
    </section>
  );
}
