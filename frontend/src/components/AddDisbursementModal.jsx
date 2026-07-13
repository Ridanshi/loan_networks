import { useEffect, useState } from 'react';
import { createDisbursement, fetchPageData, getApiErrorMessage } from '../services/api';

const emptyForm = {
  customerName: '',
  lendingPartnerId: '',
  branchName: '',
  bankApplicationId: '',
  sanctionAmountRupees: '',
  loanAccountNumber: '',
  disbursementAmountRupees: '',
  disbursementDate: ''
};

export default function AddDisbursementModal({ onClose, onCreated }) {
  const [lendingPartners, setLendingPartners] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchPageData('lending-partners', { page: 1, limit: 100 })
      .then((data) => setLendingPartners(data.rows))
      .catch(() => setLendingPartners([]));
  }, []);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      await createDisbursement({
        ...form,
        lendingPartnerId: Number(form.lendingPartnerId),
        sanctionAmountRupees: Number(form.sanctionAmountRupees),
        disbursementAmountRupees: Number(form.disbursementAmountRupees)
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to create disbursement'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-950">Add Disbursement</h3>
        <p className="mt-1 text-sm text-slate-500">Creates a new case in Pending on Ops for testing.</p>

        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <div>
            <label className="text-xs font-medium text-slate-700">Customer Name</label>
            <input
              required
              value={form.customerName}
              onChange={(event) => updateField('customerName', event.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-900"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700">Lending Partner</label>
            <select
              required
              value={form.lendingPartnerId}
              onChange={(event) => updateField('lendingPartnerId', event.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-900"
            >
              <option value="" disabled>
                Select a lending partner
              </option>
              {lendingPartners.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-700">Branch</label>
              <input
                required
                value={form.branchName}
                onChange={(event) => updateField('branchName', event.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-900"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Application ID</label>
              <input
                required
                value={form.bankApplicationId}
                onChange={(event) => updateField('bankApplicationId', event.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700">Loan Account Number (LAN)</label>
            <input
              required
              value={form.loanAccountNumber}
              onChange={(event) => updateField('loanAccountNumber', event.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-700">Sanction Amount (₹)</label>
              <input
                required
                type="number"
                min="0"
                value={form.sanctionAmountRupees}
                onChange={(event) => updateField('sanctionAmountRupees', event.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-900"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Disbursement Amount (₹)</label>
              <input
                required
                type="number"
                min="0"
                value={form.disbursementAmountRupees}
                onChange={(event) => updateField('disbursementAmountRupees', event.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700">Disbursement Date</label>
            <input
              required
              type="date"
              value={form.disbursementDate}
              onChange={(event) => updateField('disbursementDate', event.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-900"
            />
          </div>

          {error ? <p className="text-xs text-red-600">{error}</p> : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {busy ? 'Creating...' : 'Create Disbursement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
