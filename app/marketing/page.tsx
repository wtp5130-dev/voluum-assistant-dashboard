import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ProjectX — Performance marketing companion",
  description: "ProjectX Sidekick helps you monitor KPIs, pause bad zones, and generate on‑brand creatives.",
};

export default function MarketingPage() {
  return (
    <main className="min-h-screen px-6 py-10 text-slate-100">
      <section className="max-w-6xl mx-auto grid gap-6 md:grid-cols-2 items-center">
        <div>
          <h1 className="text-3xl md:text-5xl font-extrabold leading-tight">
            ProjectX Sidekick
          </h1>
          <p className="mt-3 text-sm md:text-base text-slate-300">
            A fast, opinionated companion for media buyers: live dashboard, auto‑pause optimizer, and
            on‑brand creative generation.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href="/login"
              className="text-sm px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 border border-emerald-500"
            >
              Sign in
            </a>
            <a
              href="#features"
              className="text-sm px-4 py-2 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700"
            >
              Learn more
            </a>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-slate-400">Dashboard</div>
              <div className="mt-1 text-lg font-semibold">Live KPIs</div>
              <p className="mt-1 text-slate-400">Filter by source, country, and date.</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-slate-400">Optimizer</div>
              <div className="mt-1 text-lg font-semibold">Pause bad zones</div>
              <p className="mt-1 text-slate-400">Preview and apply zone blacklists.</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-slate-400">Creatives</div>
              <div className="mt-1 text-lg font-semibold">On‑brand prompts</div>
              <p className="mt-1 text-slate-400">Generate consistent assets quickly.</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-slate-400">Access control</div>
              <div className="mt-1 text-lg font-semibold">Per‑app perms</div>
              <p className="mt-1 text-slate-400">Sidekick, Roadmap, or WhatsApp portals.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="max-w-6xl mx-auto mt-12 grid gap-4 md:grid-cols-3">
        {[{
          title: "Login‑gated access",
          body: "Require login globally with app‑level permissions enforced at the edge.",
        },{
          title: "Audit trail",
          body: "Track logins and access grants/denials for compliance and debugging.",
        },{
          title: "Zero‑drama setup",
          body: "Simple cookie/KV auth, no 3rd‑party dependency required.",
        }].map((f)=> (
          <div key={f.title} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="text-sm font-semibold">{f.title}</h3>
            <p className="mt-1 text-xs text-slate-300">{f.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
