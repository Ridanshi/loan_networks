export default function ComingSoon({ title, description }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-600">
        This route is shown as a placeholder because no verified writable workflow or table-backed create screen has been mapped yet.
      </div>
    </section>
  );
}
