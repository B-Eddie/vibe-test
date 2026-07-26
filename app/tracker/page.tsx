import { TrackerBoard } from "@/components/TrackerBoard";
import { getSeedInternships } from "@/lib/seed";

export default function TrackerPage() {
  const listings = getSeedInternships();

  return (
    <main>
      <header className="page-header">
        <h1>Tracker</h1>
        <p>
          Follow every opportunity from saved → drafted → ready → applied.
          Google Form submissions land in Applied automatically.
        </p>
      </header>
      <TrackerBoard listings={listings} />
    </main>
  );
}
