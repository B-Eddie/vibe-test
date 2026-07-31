import { TrackerBoard } from "@/components/TrackerBoard";
import { getSeedInternships } from "@/lib/seed";

export default function TrackerPage() {
  const listings = getSeedInternships();

  return (
    <main>
      <header className="page-header">
        <h1>Tracker</h1>
      </header>
      <TrackerBoard listings={listings} />
    </main>
  );
}
