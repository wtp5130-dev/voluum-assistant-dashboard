import { Suspense } from "react";
import EmbeddedClickUpForm from "@/components/EmbeddedClickUpForm";

export const dynamic = "force-dynamic";

export default function CreativeRequestPage() {
  return (
    <Suspense fallback={<div className="max-w-2xl mx-auto px-4 py-8 text-slate-200">Loading form…</div>}>
      <EmbeddedClickUpForm />
    </Suspense>
  );
}
