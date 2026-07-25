import type { Internship } from "./types";
import seed from "@/data/seed-internships.json";

export function getSeedInternships(): Internship[] {
  return seed as Internship[];
}
