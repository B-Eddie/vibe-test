import { Suspense } from "react";
import { ApplyWorkspace } from "@/components/ApplyWorkspace";

export default function ApplyPage() {
  return (
    <main>
      <header className="page-header">
        <h1>Apply</h1>
        <p>
          Paste any application link — Google Forms, job portals, school
          programs, and more. InternHarbor drafts answers from your background,
          then autofills the live page.
        </p>
      </header>
      <Suspense fallback={<p className="provider-note">Loading apply desk…</p>}>
        <ApplyWorkspace />
      </Suspense>
    </main>
  );
}
