export default function NoAccessPage({ searchParams }: { searchParams: { app?: string } }) {
  const app = searchParams?.app || "this application";
  return (
    <main className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-xl border border-slate-800 bg-slate-900/70 p-5 text-slate-200">
        <h1 className="text-lg font-semibold mb-2">Access required</h1>
        <p className="text-sm text-slate-300 mb-3">
          You are signed in, but your account does not have permission to access <span className="font-semibold">{app}</span>.
        </p>
        <ul className="text-xs text-slate-400 list-disc ml-4 space-y-1 mb-4">
          <li>If you think this is a mistake, contact an administrator to grant access.</li>
          <li>Admins can manage user permissions in the Admin panel.</li>
        </ul>
        <div className="flex gap-2">
          <a href="/" className="text-xs px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700">Go home</a>
          <a href="/login" className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500">Switch account</a>
        </div>
      </div>
    </main>
  );
}
