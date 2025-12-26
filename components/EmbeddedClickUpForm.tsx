"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import CreativeRequestForm from "@/components/CreativeRequestForm";

export default function EmbeddedClickUpForm() {
  const search = useSearchParams();
  const paramUrl = search?.get("formUrl") || search?.get("form_url") || "";
  const defaultUrl = process.env.NEXT_PUBLIC_CLICKUP_FORM_URL || "";
  const formUrl = useMemo(() => (paramUrl ? paramUrl : defaultUrl), [paramUrl, defaultUrl]);

  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  // If the iframe doesn't load in time, show a fallback
  useEffect(() => {
    // If the iframe doesn't load quickly, assume CSP blocked and fall back to native form
    const t = setTimeout(() => {
      if (!loaded) setFailed(true);
    }, 2500);
    return () => clearTimeout(t);
  }, [loaded]);

  return (
    <div className="min-h-screen bg-[#f8f9fb] text-slate-900">
      {/* Hero */}
      <div className="max-w-5xl mx-auto px-4 pt-10 pb-6">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight mb-2">
          <span className="mr-2">🎨</span> Submit a Creative Banner Request
        </h1>
        <p className="text-slate-600">
          Fill out the form below — BannerBot will automatically generate your first design draft.
        </p>
      </div>

      {/* Form Container */}
      <div className="max-w-5xl mx-auto px-4 pb-16">
        <div className="relative rounded-xl shadow-xl border border-slate-200 bg-white overflow-hidden">
          {/* Loader overlay */}
          {!loaded && !failed && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/70">
              <div className="w-16 h-16 rounded-full border-4 border-slate-300 border-t-indigo-500 animate-spin mb-4" />
              <div className="h-4 w-48 rounded bg-slate-200 animate-pulse" />
            </div>
          )}

          {formUrl && !failed ? (
            <iframe
              src={formUrl}
              className="w-full min-h-[1200px] md:min-h-[1100px] lg:min-h-[1000px]"
              style={{ display: loaded ? "block" : "block" }}
              onLoad={() => setLoaded(true)}
              loading="eager"
              referrerPolicy="no-referrer-when-downgrade"
              title="ClickUp Form"
            />
          ) : (
            <div className="p-4 md:p-6">
              <div className="mb-4 text-slate-600">
                We couldn’t embed the ClickUp form (blocked by site security). You can
                <a className="text-indigo-600 underline ml-1" href={formUrl || "#"} target="_blank" rel="noreferrer">
                  open it in a new tab
                </a>
                , or submit using the Sidekick form below.
              </div>
              <CreativeRequestForm />
            </div>
          )}
        </div>

        {/* Fallback hint */}
        {failed && formUrl && (
          <div className="mt-4 text-center text-slate-600">
            <span>Embedding blocked by ClickUp. </span>
            <a className="text-indigo-600 underline" href={formUrl} target="_blank" rel="noreferrer">
              Open form in a new tab
            </a>
            <span> or use the Sidekick form above.</span>
          </div>
        )}
      </div>
    </div>
  );
}
