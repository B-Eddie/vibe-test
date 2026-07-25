import { InternshipBrowser } from "@/components/InternshipBrowser";
import { readListings } from "@/lib/kv";

export const dynamic = "force-dynamic";

export default async function InternshipsPage() {
  const listings = await readListings();

  return (
    <main>
      <header className="page-header">
        <h1>Internships</h1>
        <p>
          Curated high school programs plus refreshed remote listings. Filter by
          field, remote preference, and deadline.
        </p>
      </header>
      <InternshipBrowser listings={listings} />
    </main>
  );
}
