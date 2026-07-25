"use client";

import type { Internship } from "./types";

const CACHE_KEY = "hsif-listings-cache-v1";

export function cacheListings(listings: Internship[]): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(listings));
  } catch {
    /* ignore quota errors */
  }
}

export function getCachedListings(): Internship[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Internship[];
  } catch {
    return [];
  }
}

export function findCachedListing(id: string): Internship | null {
  return getCachedListings().find((item) => item.id === id) ?? null;
}
