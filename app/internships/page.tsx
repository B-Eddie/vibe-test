import { InternshipBrowser } from "@/components/InternshipBrowser";
import { getSeedInternships } from "@/lib/seed";

export default function InternshipsPage() {
  const listings = getSeedInternships();

  return (
    <main>
      <header className="page-header">
        <h1>Internships</h1>
        <p>
          Curated high school programs plus on-demand AI web search via Hack
          Club. No cron jobs — search runs when you open this page.
        </p>
      </header>
      <InternshipBrowser initialListings={listings} />
    </main>
  );
}
