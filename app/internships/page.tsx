import { InternshipBrowser } from "@/components/InternshipBrowser";
import { getSeedInternships } from "@/lib/seed";

export default function InternshipsPage() {
  const listings = getSeedInternships();

  return (
    <main>
      <header className="page-header">
        <h1>Find opportunities</h1>
        <p>
          Curated high school programs plus on-demand AI search. Listings with
          passed deadlines are filtered out automatically.
        </p>
      </header>
      <InternshipBrowser initialListings={listings} />
    </main>
  );
}
