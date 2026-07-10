import { useState } from 'react';
import { verifyDisbursementDocument, getApiErrorMessage } from '../services/api';

export default function VerifyDocumentButton({ disbursementId, onVerified }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setBusy(true);
    setError('');

    try {
      const result = await verifyDisbursementDocument(disbursementId, file);
      onVerified(result);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Verification failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="inline-flex cursor-pointer items-center rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
        {busy ? 'Verifying...' : 'Verify Document'}
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.tiff"
          className="hidden"
          onChange={handleChange}
          disabled={busy}
        />
      </label>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
