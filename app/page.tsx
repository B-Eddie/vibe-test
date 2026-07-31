import Link from "next/link";
import { InternshipBrowser } from "@/components/InternshipBrowser";
import { getSeedInternships } from "@/lib/seed";

export default function HomePage() {
  const listings = getSeedInternships();

  return (
    <main>
      <section className="hero">
        <p className="hero-brand">InternHarbor</p>
        <h1>Find it. Fill it. Send it.</h1>
        <p className="hero-lead">
          Discover HS-friendly programs, then apply from one desk using your
          saved background — Google Forms included.
        </p>
        <div className="hero-cta">
          <Link className="btn-primary" href="/apply">
            Apply to a link
          </Link>
          <Link className="btn-secondary" href="/internships">
            Find opportunities
          </Link>
        </div>
      </section>

      <section className="home-matches">
        <div className="section-heading">
          <h2>Today&apos;s top matches</h2>
          <p>
            Ranked from your background. Hit Apply on any card to draft and
            submit from your profile.
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
