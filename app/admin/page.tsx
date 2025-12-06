"use client";

import React, { useEffect, useMemo, useState } from "react";

type User = { username: string; role: "admin" | "user" };

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [saving, setSaving] = useState(false);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || json?.message || String(res.status));
      setUsers(json.users || []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const addUser = async () => {
    if (!username || !password) return;
    try {
      setSaving(true);
      setError(null);
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, role }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || json?.message || String(res.status));
      setUsername("");
      setPassword("");
      setRole("user");
      fetchUsers();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async (u: string) => {
    try {
      setSaving(true);
      setError(null);
      const res = await fetch(`/api/admin/users?username=${encodeURIComponent(u)}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || json?.message || String(res.status));
      fetchUsers();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">Admin – Users</h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">Manage who can sign in.</p>
        </div>
        <a href="/" className="text-[11px] px-3 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800">Back</a>
      </header>

      <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="text-sm font-semibold mb-2">Add user</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          <input className="bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-sm" placeholder="Username" value={username} onChange={(e)=>setUsername(e.target.value)} />
          <input type="password" className="bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-sm" placeholder="Password" value={password} onChange={(e)=>setPassword(e.target.value)} />
          <select className="bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-sm" value={role} onChange={(e)=>setRole(e.target.value as any)}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="mt-2">
          <button onClick={addUser} disabled={saving || !username || !password} className="text-xs px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50">{saving ? "Saving…" : "Add user"}</button>
        </div>
        {error && <p className="text-[11px] text-rose-400 mt-2">{error}</p>}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="text-sm font-semibold mb-2">Users</h2>
        {loading ? (
          <p className="text-[11px] text-slate-400">Loading…</p>
        ) : users.length === 0 ? (
          <p className="text-[11px] text-slate-500">No users yet.</p>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-[360px] text-xs">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="text-left p-2">Username</th>
                  <th className="text-left p-2">Role</th>
                  <th className="text-right p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u)=> (
                  <tr key={u.username} className="border-t border-slate-800">
                    <td className="p-2">{u.username}</td>
                    <td className="p-2">{u.role}</td>
                    <td className="p-2 text-right">
                      <button onClick={()=>deleteUser(u.username)} className="text-[11px] px-2 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800">Delete</button>
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
