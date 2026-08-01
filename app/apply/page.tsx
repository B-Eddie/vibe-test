import { Suspense } from "react";
import { ApplyWorkspace } from "@/components/ApplyWorkspace";

export default function ApplyPage() {
  return (
    <main>
      <header className="page-header">
        <h1>Apply</h1>
        <p>Paste a form link, review drafted answers, then autofill.</p>
      </header>
      <Suspense fallback={<p className="provider-note">Loading…</p>}>
        <ApplyWorkspace />
      </Suspense>
    </main>
  );
}
