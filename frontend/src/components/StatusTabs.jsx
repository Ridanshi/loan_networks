export default function StatusTabs({ tabs, activeTab, onChange }) {
  if (!tabs.length) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onChange(undefined)}
        className={[
          'h-9 rounded-md border px-3 text-sm font-medium',
          !activeTab ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'
        ].join(' ')}
      >
        All
      </button>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={[
            'h-9 rounded-md border px-3 text-sm font-medium',
            activeTab === tab.key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'
          ].join(' ')}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
