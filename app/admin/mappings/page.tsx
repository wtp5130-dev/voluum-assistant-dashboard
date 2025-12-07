"use client";
import React, { useEffect, useState } from "react";

type Mapping = Record<string, string>;

export default function MappingsPage() {
  const [mappings, setMappings] = useState<Mapping>({});
  const [unresolved, setUnresolved] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchMappings();
    fetchUnresolved();
  }, []);

  async function fetchMappings() {
    try {
      const res = await fetch('/api/optimizer/mappings');
      const json = await res.json();
      setMappings(json.mapping || {});
    } catch (e) {
      console.error(e);
    }
  }

  async function fetchUnresolved() {
    setLoading(true);
    try {
      // call sync in dryRun to get diagnostics without writing
      const res = await fetch('/api/optimizer/sync-blacklist?dateRange=last7days&dryRun=1');
      const json = await res.json();
      const diag: any[] = json.diagnostics || [];
      const unresolvedEntry = diag.find((d: any) => d.campaignId === '_unresolved');
      if (unresolvedEntry && unresolvedEntry.error) {
        const txt = String(unresolvedEntry.error || '');
        const parts = txt.split(':');
        const rest = parts.slice(1).join(':');
        const list = rest ? rest.split(',').map((s: string) => s.trim()) : [];
        setUnresolved(list);
      } else {
        setUnresolved([]);
      }
    } catch (e) {
      console.error(e);
      setUnresolved([]);
    }
    setLoading(false);
  }

  async function addMapping(dashboardIdOrName: string) {
    const providerId = prompt(`Provider numeric campaign ID for ${dashboardIdOrName}`);
    if (!providerId) return;
    try {
      setSaving(s => ({ ...s, [dashboardIdOrName]: true }));
      const payload: any = { dashboardId: dashboardIdOrName, providerId };
      // if unresolved entry contains a name in parentheses, set dashboardName as well
      const nameMatch = dashboardIdOrName.match(/^([^\s]+)\s*\((.+)\)$/);
      if (nameMatch) {
        payload.dashboardId = nameMatch[1];
        payload.dashboardName = nameMatch[2];
      }
      const res = await fetch('/api/optimizer/mappings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (json.ok) {
        await fetchMappings();
        await fetchUnresolved();
      } else {
        alert('Failed to save mapping: ' + (json.error || JSON.stringify(json)));
      }
    } catch (e: any) {
      alert('Error saving mapping: ' + (e?.message || String(e)));
    } finally {
      setSaving(s => ({ ...s, [dashboardIdOrName]: false }));
    }
  }

  async function removeMapping(key: string) {
    if (!confirm(`Remove mapping for ${key}?`)) return;
    try {
      const res = await fetch('/api/optimizer/mappings', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dashboardId: key }) });
      const json = await res.json();
      if (json.ok) {
        setMappings(json.mapping || {});
      } else {
        alert('Failed to remove mapping');
      }
    } catch (e) {
      alert('Error removing mapping');
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Admin — Campaign Mappings</h1>

      <section className="mb-6">
        <h2 className="text-lg font-medium">Manual Mappings</h2>
        <div className="mt-2">
          {Object.keys(mappings).length === 0 && <div className="text-sm text-gray-500">No mappings configured.</div>}
          <ul className="mt-2 space-y-2">
            {Object.entries(mappings).map(([k, v]) => (
              <li key={k} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                <div className="text-sm">
                  <div className="font-medium">{k}</div>
                  <div className="text-xs text-gray-600">Provider ID: {v}</div>
                </div>
                <div>
                  <button className="text-sm text-red-600" onClick={() => removeMapping(k)}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-3">
          <button className="px-3 py-1 bg-blue-600 text-white rounded" onClick={async () => {
            const dashboardId = prompt('Dashboard ID or name to map (use the exact ID or name)');
            if (!dashboardId) return;
            await addMapping(dashboardId);
          }}>Add mapping</button>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium">Unresolved Dashboard Campaigns</h2>
        <div className="mt-2">
          <div className="flex items-center gap-2">
            <button className="px-3 py-1 bg-green-600 text-white rounded" onClick={fetchUnresolved} disabled={loading}>{loading ? 'Checking...' : 'Refresh'}</button>
            <button className="px-3 py-1 bg-indigo-600 text-white rounded" onClick={async () => { await fetch('/api/optimizer/sync-blacklist?dateRange=last7days'); alert('Ran full sync (may have written entries). Check diagnostics.'); }}>Run full sync</button>
          </div>
          <div className="mt-3">
            {unresolved.length === 0 && <div className="text-sm text-gray-500">No unresolved campaigns.</div>}
            <ul className="mt-2 space-y-2">
              {unresolved.map(u => (
                <li key={u} className="flex items-center justify-between bg-yellow-50 p-2 rounded">
                  <div className="text-sm">{u}</div>
                  <div>
                    <button className="mr-2 px-2 py-1 bg-blue-600 text-white rounded" onClick={() => addMapping(u)} disabled={Boolean(saving[u])}>{saving[u] ? 'Saving...' : 'Add mapping'}</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
