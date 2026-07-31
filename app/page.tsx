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
          <p className="hero-lead">
            Discover HS-friendly programs, then apply from one desk using your
            saved background.
          </p>
          <div className="hero-cta">
            <Link className="btn-primary" href="/apply">
              Apply to a link
            </Link>
            <Link className="btn-secondary" href="/internships">
              Find opportunities
            </Link>
          </div>
        </div>
      </section>

      <section className="flow-section">
        <div className="shell">
          <div className="section-heading">
            <h2>Three steps, one desk</h2>
            <p>
              Built like a personal apply cockpit — save your background once,
              then reuse it on any form or posting.
            </p>
          </div>
          <ol className="flow-rail">
            <li>
              <span className="flow-index">01</span>
              <strong>Find</strong>
              <p>Browse curated programs or paste any application URL.</p>
            </li>
            <li>
              <span className="flow-index">02</span>
              <strong>Fill</strong>
              <p>Gemini drafts answers from your stored background.</p>
            </li>
            <li>
              <span className="flow-index">03</span>
              <strong>Send</strong>
              <p>Review, then submit Google Forms or autofill the live page.</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="home-matches">
        <div className="shell">
          <div className="section-heading">
            <h2>Today&apos;s top matches</h2>
            <p>
              Ranked from your background. Hit Apply to draft and send from your
              profile.
            </p>
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
