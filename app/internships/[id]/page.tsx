import Link from "next/link";
import { InternshipDetail } from "@/components/InternshipDetail";
import { getSeedInternships } from "@/lib/seed";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function InternshipDetailPage({ params }: Props) {
  const { id } = await params;
  const internship = getSeedInternships().find((item) => item.id === id) ?? null;

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
