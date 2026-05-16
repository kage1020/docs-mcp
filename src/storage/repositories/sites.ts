import type { Database } from "bun:sqlite";

export type SiteRow = {
  id: number;
  base_url: string;
  name: string;
  robots_txt: string | null;
  crawl_options_json: string;
  created_at: number;
  updated_at: number;
  last_crawled_at: number | null;
};

export type CreateSiteInput = {
  baseUrl: string;
  name: string;
  crawlOptionsJson: string;
  robotsTxt?: string | null;
};

export function createSite(db: Database, input: CreateSiteInput): number {
  const now = Date.now();
  const stmt = db.prepare(
    `INSERT INTO sites (base_url, name, robots_txt, crawl_options_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const r = stmt.run(
    input.baseUrl,
    input.name,
    input.robotsTxt ?? null,
    input.crawlOptionsJson,
    now,
    now,
  );
  return Number(r.lastInsertRowid);
}

export function getSite(db: Database, id: number): SiteRow | undefined {
  return db.query<SiteRow, [number]>("SELECT * FROM sites WHERE id = ?").get(id) ?? undefined;
}

export function getSiteByBaseUrl(db: Database, baseUrl: string): SiteRow | undefined {
  return (
    db.query<SiteRow, [string]>("SELECT * FROM sites WHERE base_url = ?").get(baseUrl) ?? undefined
  );
}

export function listSites(db: Database): SiteRow[] {
  return db.query<SiteRow, []>("SELECT * FROM sites ORDER BY id").all();
}

export function deleteSite(db: Database, id: number): number {
  const r = db.prepare("DELETE FROM sites WHERE id = ?").run(id);
  return Number(r.changes);
}

export function touchLastCrawledAt(db: Database, id: number, at: number = Date.now()): void {
  db.prepare("UPDATE sites SET last_crawled_at = ?, updated_at = ? WHERE id = ?").run(at, at, id);
}
