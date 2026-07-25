import Link from "next/link";
import { InternshipBrowser } from "@/components/InternshipBrowser";
import { getSeedInternships } from "@/lib/seed";

export default function HomePage() {
  const listings = getSeedInternships();

  return (
    <main>
      <section className="hero">
        <p className="hero-brand">InternHarbor</p>
        <h1>High school internships, matched to you.</h1>
        <p className="hero-lead">
          Discover programs that actually accept HS students, see why they fit,
          and draft applications you review before you send.
        </p>
        <div className="hero-cta">
          <Link className="btn-primary" href="/internships">
            Browse matches
          </Link>
          <Link className="btn-secondary" href="/profile">
            Set up profile
          </Link>
        </div>
      </section>

      <section className="home-matches">
        <div className="section-heading">
          <h2>Today’s top matches</h2>
          <p>
            Ranked from your saved profile. Live results use Hack Club AI search
            when an API key is set.
          </p>
        </div>
        <InternshipBrowser
          initialListings={listings}
          limit={5}
          showFilters={false}
        />
      </section>
    </main>
  );
}
