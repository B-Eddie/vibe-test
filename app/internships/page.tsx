import { InternshipBrowser } from "@/components/InternshipBrowser";
import { getSeedInternships } from "@/lib/seed";

export default function InternshipsPage() {
  const listings = getSeedInternships();

  return (
    <main>
      <header className="page-header">
        <h1>Find</h1>
      </header>
      <InternshipBrowser initialListings={listings} />
    </main>
  );
}
