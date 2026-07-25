import { TrackerBoard } from "@/components/TrackerBoard";
import { readListings } from "@/lib/kv";

export const dynamic = "force-dynamic";

export default async function TrackerPage() {
  const listings = await readListings();

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
