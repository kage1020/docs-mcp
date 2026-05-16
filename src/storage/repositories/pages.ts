import type { Database } from "bun:sqlite";

export type PageRow = {
  id: number;
  site_id: number;
  url: string;
  title: string | null;
  etag: string | null;
  last_modified: string | null;
  content_hash: string;
  markdown: string;
  markdown_size: number;
  fetched_at: number;
  depth: number;
};

export type PageUpsertInput = {
  siteId: number;
  url: string;
  title: string | null;
  etag: string | null;
  lastModified: string | null;
  contentHash: string;
  markdown: string;
  fetchedAt: number;
  depth: number;
};

export function getPageByUrl(db: Database, siteId: number, url: string): PageRow | undefined {
  return (
    db
      .query<PageRow, [number, string]>("SELECT * FROM pages WHERE site_id = ? AND url = ?")
      .get(siteId, url) ?? undefined
  );
}

export function listPageUrls(db: Database, siteId: number): string[] {
  return db
    .query<{ url: string }, [number]>("SELECT url FROM pages WHERE site_id = ?")
    .all(siteId)
    .map((r) => r.url);
}

export function countPages(db: Database, siteId: number): number {
  return (
    db
      .query<{ c: number }, [number]>("SELECT COUNT(*) AS c FROM pages WHERE site_id = ?")
      .get(siteId)?.c ?? 0
  );
}

export function insertPage(db: Database, input: PageUpsertInput): number {
  const r = db
    .prepare(
      `INSERT INTO pages
        (site_id, url, title, etag, last_modified, content_hash, markdown, markdown_size, fetched_at, depth)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.siteId,
      input.url,
      input.title,
      input.etag,
      input.lastModified,
      input.contentHash,
      input.markdown,
      Buffer.byteLength(input.markdown, "utf8"),
      input.fetchedAt,
      input.depth,
    );
  return Number(r.lastInsertRowid);
}

export function updatePage(db: Database, id: number, input: PageUpsertInput): void {
  db.prepare(
    `UPDATE pages
       SET title = ?, etag = ?, last_modified = ?, content_hash = ?,
           markdown = ?, markdown_size = ?, fetched_at = ?, depth = ?
     WHERE id = ?`,
  ).run(
    input.title,
    input.etag,
    input.lastModified,
    input.contentHash,
    input.markdown,
    Buffer.byteLength(input.markdown, "utf8"),
    input.fetchedAt,
    input.depth,
    id,
  );
}

export function touchPage(
  db: Database,
  id: number,
  fetchedAt: number,
  etag: string | null,
  lastModified: string | null,
): void {
  db.prepare("UPDATE pages SET fetched_at = ?, etag = ?, last_modified = ? WHERE id = ?").run(
    fetchedAt,
    etag,
    lastModified,
    id,
  );
}

export function deletePagesNotIn(db: Database, siteId: number, keepUrls: string[]): number {
  if (keepUrls.length === 0) {
    return Number(db.prepare("DELETE FROM pages WHERE site_id = ?").run(siteId).changes);
  }
  const placeholders = keepUrls.map(() => "?").join(",");
  const r = db
    .prepare(`DELETE FROM pages WHERE site_id = ? AND url NOT IN (${placeholders})`)
    .run(siteId, ...keepUrls);
  return Number(r.changes);
}
