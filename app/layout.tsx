import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Syne } from "next/font/google";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";
import "./globals.css";

const display = Syne({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const body = Plus_Jakarta_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "InternHarbor",
  description: "Find HS internships and apply from one desk.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${display.variable} ${body.variable} antialiased`}
        suppressHydrationWarning
      >
        <div className="app-frame">
          <SiteNav />
          {children}
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
