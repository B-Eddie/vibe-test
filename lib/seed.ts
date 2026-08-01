import type { Internship } from "./types";
import { normalizeListing } from "./ingest/normalize";
import seed from "@/data/seed-internships.json";

export function getSeedInternships(): Internship[] {
  return (seed as Internship[]).map((item) =>
    normalizeListing({
      ...item,
      source: item.source || "seed",
    }),
  );
}
