import { Suspense } from "react";
import { ApplyWorkspace } from "@/components/ApplyWorkspace";

export default function ApplyPage() {
  return (
    <main>
      <header className="page-header">
        <h1>Apply</h1>
        <p>
          One desk for Google Forms and other program applications — filled from
          your background, reviewed by you, then submitted or pasted.
        </p>
      </header>
      <Suspense fallback={<p className="provider-note">Loading apply desk…</p>}>
        <ApplyWorkspace />
      </Suspense>
    </main>
  );
}
