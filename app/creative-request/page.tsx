import { Suspense } from "react";
import CreativeRequestForm from "@/components/CreativeRequestForm";

export const dynamic = "force-dynamic";

export default function CreativeRequestPage() {
  return (
    <Suspense fallback={<div className="max-w-2xl mx-auto px-4 py-8 text-slate-200">Loading form…</div>}>
      <CreativeRequestForm />
    </Suspense>
  );
}
