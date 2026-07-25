import { XMLParser } from "fast-xml-parser";
import type { Internship } from "../types";
import { getSeedInternships } from "../kv";
import { mergeListings, normalizeListing } from "./normalize";

const STUDENT_HINTS = [
  "intern",
  "internship",
  "student",
  "high school",
  "entry level",
  "junior",
  "apprentice",
];

type RemotiveJob = {
  id: number;
  url: string;
  title: string;
  company_name: string;
  candidate_required_location?: string;
  description?: string;
  tags?: string[];
  job_type?: string;
  publication_date?: string;
  category?: string;
};

function looksStudentFriendly(text: string): boolean {
  const lower = text.toLowerCase();
  return STUDENT_HINTS.some((hint) => lower.includes(hint));
}

async function fetchRemotive(): Promise<Internship[]> {
  try {
    const res = await fetch(
      "https://remotive.com/api/remote-jobs?category=software-dev",
      { next: { revalidate: 0 } },
    );
    if (!res.ok) return [];

    const data = (await res.json()) as { jobs?: RemotiveJob[] };
    const jobs = data.jobs ?? [];

    return jobs
      .filter((job) =>
        looksStudentFriendly(
          `${job.title} ${job.description ?? ""} ${job.job_type ?? ""}`,
        ),
      )
      .slice(0, 40)
      .map((job) =>
        normalizeListing({
          id: `remotive-${job.id}`,
          title: job.title,
          org: job.company_name,
          url: job.url,
          location: job.candidate_required_location || "Remote",
          remote: true,
          deadline: null,
          tags: [
            ...(job.tags ?? []).slice(0, 6),
            "remote",
            job.category ?? "software",
          ],
          description: (job.description ?? "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 700),
          source: "remotive",
          updatedAt: job.publication_date
            ? new Date(job.publication_date).toISOString()
            : new Date().toISOString(),
        }),
      );
  } catch {
    return [];
  }
}

async function fetchWeWorkRemotelyRss(): Promise<Internship[]> {
  try {
    const res = await fetch(
      "https://weworkremotely.com/categories/remote-programming-jobs.rss",
      { next: { revalidate: 0 } },
    );
    if (!res.ok) return [];

    const xml = await res.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
    });
    const parsed = parser.parse(xml) as {
      rss?: { channel?: { item?: unknown } };
    };

    const items = parsed.rss?.channel?.item;
    const list = Array.isArray(items) ? items : items ? [items] : [];

    return list
      .map((raw) => {
        const item = raw as {
          title?: string;
          link?: string;
          description?: string;
          pubDate?: string;
        };
        const title = item.title ?? "";
        const description = (item.description ?? "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (!looksStudentFriendly(`${title} ${description}`)) return null;

        const [orgPart, rolePart] = title.includes(":")
          ? title.split(":").map((part) => part.trim())
          : ["We Work Remotely", title];

        return normalizeListing({
          title: rolePart || title,
          org: orgPart || "We Work Remotely",
          url: item.link ?? "https://weworkremotely.com/",
          location: "Remote",
          remote: true,
          deadline: null,
          tags: ["remote", "programming", "internship"],
          description: description.slice(0, 700),
          source: "weworkremotely-rss",
          updatedAt: item.pubDate
            ? new Date(item.pubDate).toISOString()
            : new Date().toISOString(),
        });
      })
      .filter((item): item is Internship => Boolean(item))
      .slice(0, 25);
  } catch {
    return [];
  }
}

export async function ingestAllSources(): Promise<Internship[]> {
  const [remotive, wwr] = await Promise.all([
    fetchRemotive(),
    fetchWeWorkRemotelyRss(),
  ]);

  return mergeListings([getSeedInternships(), remotive, wwr]);
}
