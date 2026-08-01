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
            src="https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=2000&q=80"
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
          <h1>Internships for high school students.</h1>
          <p className="hero-lead">
            Find openings, draft applications, and send them from one place.
          </p>
          <div className="hero-cta">
            <Link className="btn-primary" href="/apply">
              Start applying
            </Link>
            <Link className="btn-secondary" href="/internships">
              Browse openings
            </Link>
          </div>
        </div>
      </section>

      <section className="home-matches">
        <div className="shell">
          <div className="section-heading">
            <h2>Openings</h2>
            <p>A short list to get started. Browse the full board anytime.</p>
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
