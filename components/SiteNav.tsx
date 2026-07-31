"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/internships", label: "Find" },
  { href: "/apply", label: "Apply" },
  { href: "/profile", label: "Background" },
  { href: "/tracker", label: "Tracker" },
];

export function SiteNav() {
  const pathname = usePathname();
  const home = pathname === "/";
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!home) {
      setScrolled(false);
      return;
    }
    const onScroll = () => setScrolled(window.scrollY > 48);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [home]);

  const classes = [
    "site-nav",
    home ? "site-nav-home" : "",
    home && scrolled ? "site-nav-scrolled" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <header className={classes}>
      <div className="shell site-nav-inner">
        <Link href="/" className="brand-mark" aria-label="InternHarbor home">
          <span className="brand-dot" aria-hidden />
          InternHarbor
        </Link>
        <nav className="site-nav-links" aria-label="Primary">
          {LINKS.map((link) => {
            const active = pathname.startsWith(link.href);
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
      </div>
    </header>
  );
}
