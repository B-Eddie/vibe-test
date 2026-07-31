import Image from "next/image";
import Link from "next/link";
import { InternshipBrowser } from "@/components/InternshipBrowser";
import { getSeedInternships } from "@/lib/seed";

export default function HomePage() {
  const listings = getSeedInternships();

  return (
    <main>
      <section className="hero">
        <div className="hero-media" aria-hidden="true">
          <Image
            src="https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=2000&q=80"
            alt=""
            fill
            priority
            sizes="100vw"
            className="hero-media-img"
          />
          <div className="hero-media-wash" />
        </div>
        <div className="shell hero-copy">
          <p className="hero-brand">InternHarbor</p>
          <h1>Find it. Fill it. Send it.</h1>
          <p className="hero-lead">HS internships, one apply desk.</p>
          <div className="hero-cta">
            <Link className="btn-primary" href="/apply">
              Apply
            </Link>
            <Link className="btn-secondary" href="/internships">
              Browse
            </Link>
          </div>
        </div>
      </section>

      <section className="home-matches">
        <div className="shell">
          <div className="section-heading">
            <h2>Matches</h2>
          </div>
          <InternshipBrowser
            initialListings={listings}
            limit={5}
            showFilters={false}
          />
        </div>
      </section>
    </main>
  );
}
