"use client";

import React, { useEffect, useState } from "react";

type Perms = { dashboard: boolean; optimizer: boolean; creatives: boolean; builder: boolean; sidekick?: boolean };
type User = { username?: string; email?: string; role: "admin" | "user"; perms: Perms; createdAt?: string | null; lastLogin?: string | null };

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<{ email: string; password: string; role: "admin" | "user"; perms: Perms }>(
    {
      email: "",
      password: "",
      role: "user",
      perms: { dashboard: true, optimizer: false, creatives: false, builder: false, sidekick: true },
    }
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || String(res.status));
      setUsers(Array.isArray(json.users) ? json.users : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const upsert = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || String(res.status));
      setForm({ email: "", password: "", role: "user", perms: { dashboard: true, optimizer: false, creatives: false, builder: false, sidekick: true, roadmap: false, whatsapp: false } });
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const remove = async (email: string) => {
    if (!confirm(`Delete user ${email}?`)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users?email=${encodeURIComponent(email)}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || String(res.status));
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const togglePerm = (key: keyof Perms) => setForm((f) => ({ ...f, perms: { ...f.perms, [key]: !f.perms[key] } }));

  return (
    <main className="max-w-4xl mx-auto p-4 text-slate-200">
      <h1 className="text-lg font-semibold mb-3">Admin: Users</h1>
      {error && <div className="mb-3 text-rose-400 text-sm">{error}</div>}

      <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 mb-6">
        <h2 className="text-sm font-semibold mb-2">Add / Update User</h2>
        <div className="grid gap-2 md:grid-cols-3 items-end">
          <div>
            <label className="block text-[10px] uppercase text-slate-400 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase text-slate-400 mb-1">
              Password {form.email ? <span className="text-slate-500">(leave blank to keep)</span> : null}
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase text-slate-400 mb-1">Role</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as any })}
              className="w-full bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-xs"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-3 text-xs">
          {["dashboard", "optimizer", "creatives", "builder", "sidekick"] as (keyof Perms)[]).map((k) => (
            <label key={k} className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                className="accent-emerald-500"
                checked={!!form.perms[k]}
                onChange={() => togglePerm(k)}
              />
              {k}
            </label>
          ))}
        </div>
        <div className="mt-3">
          <button
            onClick={upsert}
            disabled={loading || !form.email.trim()}
            className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Save"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-sm font-semibold mb-2">Users</h2>
        {users.length === 0 ? (
          <div className="text-sm text-slate-400">No users.</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-900/70 text-slate-400">
                <tr>
                  <th className="text-left p-2">Email</th>
                  <th className="text-left p-2">Role</th>
                  <th className="text-left p-2">Created</th>
                  <th className="text-left p-2">Last login</th>
                  <th className="text-left p-2">Perms</th>
                  <th className="text-right p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={(u.email || u.username) || ""} className="border-b border-slate-800/60">
                    <td className="p-2">{u.email || u.username}</td>
                    <td className="p-2">{u.role}</td>
                    <td className="p-2">{u.createdAt ? new Date(u.createdAt).toLocaleString() : "—"}</td>
                    <td className="p-2">{u.lastLogin ? new Date(u.lastLogin).toLocaleString() : "—"}</td>
                    <td className="p-2">{Object.entries(u.perms || {}).filter(([, v]) => v).map(([k]) => k).join(", ") || "—"}</td>
                    <td className="p-2 text-right">
                      <button
                        onClick={() =>
                          setForm({
                            email: u.email || u.username || "",
                            password: "",
                            role: u.role,
                            perms: {
                              dashboard: !!u.perms.dashboard,
                              optimizer: !!u.perms.optimizer,
                              creatives: !!u.perms.creatives,
                              builder: !!u.perms.builder,
                              sidekick: !!u.perms.sidekick,
                            },
                          })
                        }
                        className="text-[11px] px-2 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 mr-2"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => remove(u.email || u.username || "")}
                        className="text-[11px] px-2 py-1 rounded-md border border-rose-700 bg-rose-900/30 hover:bg-rose-900/50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
