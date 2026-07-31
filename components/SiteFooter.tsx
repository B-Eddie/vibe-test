import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell site-footer-inner">
        <p className="footer-brand">InternHarbor</p>
        <nav className="footer-links" aria-label="Footer">
          <Link href="/internships">Find</Link>
          <Link href="/apply">Apply</Link>
          <Link href="/profile">Background</Link>
          <Link href="/tracker">Tracker</Link>
        </nav>
      </div>
    </footer>
  );
}
