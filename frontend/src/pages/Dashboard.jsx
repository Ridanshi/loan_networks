import { AlertCircle, Database } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchDashboard, getApiErrorMessage } from '../services/api';

const dashboardItems = [
  { label: 'Total Projects', key: 'projects', table: 'projects' },
  { label: 'Total Builders', key: 'builders', table: 'builders' },
  { label: 'Total Bankers', key: 'bankers', table: 'bankers' },
  { label: 'Total Lending Partners', key: 'lendingPartners', table: 'lending_partners' },
  { label: 'Total Disbursements', key: 'disbursements', table: 'disbursements' },
  { label: 'Total DSA Invoices', key: 'dsaInvoices', table: 'dsa_invoices' },
  { label: 'Total Collections', key: 'collections', table: 'collections' },
  { label: 'Total Payouts', key: 'payouts', table: 'payouts' },
  { label: 'Total Commission Approvals', key: 'commissionApprovals', table: 'commission_approvals' }
];

export default function Dashboard() {
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchDashboard()
      .then(setCounts)
      .catch((err) => setError(getApiErrorMessage(err, 'Unable to load dashboard')))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">Dashboard</h2>
        <p className="mt-1 text-sm text-slate-500">Counts from the configured PostgreSQL database.</p>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading
          ? Array.from({ length: 9 }).map((_, index) => (
              <div key={index} className="h-28 rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-400">
                Loading...
              </div>
            ))
          : dashboardItems.map((item) => (
              <div key={item.table} className="rounded-md border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-slate-500">{item.label}</span>
                  <Database className="h-4 w-4 text-slate-400" aria-hidden="true" />
                </div>
                <div className="mt-4 text-3xl font-semibold text-slate-950">{counts?.[item.key] ?? '-'}</div>
                <div className="mt-1 text-xs text-slate-400">{item.table}</div>
              </div>
            ))}
      </div>
    </section>
  );
}
