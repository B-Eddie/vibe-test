import Link from "next/link";
import { notFound } from "next/navigation";
import { InternshipDetail } from "@/components/InternshipDetail";
import { readListings } from "@/lib/kv";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function InternshipDetailPage({ params }: Props) {
  const { id } = await params;
  const listings = await readListings();
  const internship = listings.find((item) => item.id === id);

  if (!internship) {
    notFound();
  }

  return (
    <main>
      <header className="page-header">
        <p>
          <Link href="/internships">← Back to internships</Link>
        </p>
        <h1>Listing detail</h1>
      </header>
      <InternshipDetail internship={internship} />
    </main>
  );
}
