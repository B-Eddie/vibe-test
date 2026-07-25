"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/internships", label: "Internships" },
  { href: "/profile", label: "Profile" },
  { href: "/tracker", label: "Tracker" },
];

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="site-nav">
      <Link href="/" className="brand-mark">
        InternHarbor
      </Link>
      <nav className="site-nav-links" aria-label="Primary">
        {LINKS.map((link) => {
          const active =
            link.href === "/"
              ? pathname === "/"
              : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={active ? "nav-link active" : "nav-link"}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
