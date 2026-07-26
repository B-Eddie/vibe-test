const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export function normalizeApplicationUrl(raw: string): string {
  let value = raw.trim();
  if (!value) throw new Error("URL is empty");

  // Common paste issues
  value = value.replace(/^<|>$/g, "").replace(/\s+/g, "");

  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("That doesn’t look like a valid URL");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http(s) application links are supported");
  }

  return url.toString();
}

export type FetchPageResult = {
  html: string;
  finalUrl: string;
  status: number;
  ok: boolean;
};

export async function fetchApplicationPage(
  rawUrl: string,
): Promise<FetchPageResult> {
  const url = normalizeApplicationUrl(rawUrl);

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
      redirect: "follow",
      cache: "no-store",
    });

    const html = await res.text();
    return {
      html,
      finalUrl: res.url || url,
      status: res.status,
      ok: res.ok,
    };
  } catch {
    return {
      html: "",
      finalUrl: url,
      status: 0,
      ok: false,
    };
  }
}

export { BROWSER_UA };
