import { useState } from 'react';

function formatHeader(column) {
  return column
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatValue(value) {
  if (value === null || value === undefined) {
    return '-';
  }

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Date(value).toLocaleString();
  }

  return String(value);
}

export default function DataTable({ columns, rows, loading, actions }) {
  const [expandedCell, setExpandedCell] = useState(null);

  if (loading) {
    return <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading data...</div>;
  }

  if (!columns.length) {
    return <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500">No columns found.</div>;
  }

  const columnCount = columns.length + (actions ? 1 : 0);

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-100">
            <tr>
              {columns.map((column) => (
                <th key={column} className="whitespace-nowrap px-4 py-3 text-left font-semibold text-slate-700">
                  {formatHeader(column)}
                </th>
              ))}
              {actions ? (
                <th className="whitespace-nowrap px-4 py-3 text-left font-semibold text-slate-700">Actions</th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-slate-500" colSpan={columnCount}>
                  No records found.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={String(row.id ?? index)} className="hover:bg-slate-50">
                  {columns.map((column) => {
                    const cellKey = `${row.id ?? index}-${column}`;
                    const isExpanded = expandedCell === cellKey;
                    const value = formatValue(row[column]);

                    return (
                      <td
                        key={column}
                        className={
                          isExpanded
                            ? 'max-w-sm cursor-pointer whitespace-normal break-words px-4 py-3 text-slate-700'
                            : 'max-w-xs cursor-pointer truncate px-4 py-3 text-slate-700'
                        }
                        title={isExpanded ? undefined : value}
                        onClick={() => setExpandedCell(isExpanded ? null : cellKey)}
                      >
                        {value}
                      </td>
                    );
                  })}
                  {actions ? <td className="px-4 py-3">{actions(row)}</td> : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
