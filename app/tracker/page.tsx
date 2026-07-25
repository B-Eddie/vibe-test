import { TrackerBoard } from "@/components/TrackerBoard";
import { getSeedInternships } from "@/lib/seed";

export default function TrackerPage() {
  const listings = getSeedInternships();

  return (
    <main>
      <header className="page-header">
        <h1>Application tracker</h1>
        <p>
          Keep saved, drafted, applied, and rejected roles in this browser. Move
          items between columns as you go.
        </p>
      </header>
      <TrackerBoard listings={listings} />
    </main>
  );
}
