import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { replaceChunks } from "../storage/repositories/chunks.ts";
import {
  getPageByUrl,
  insertPage,
  type PageUpsertInput,
  touchPage,
  updatePage,
} from "../storage/repositories/pages.ts";
import type { Chunk } from "./chunk.ts";

export type IndexPageInput = Omit<PageUpsertInput, "contentHash"> & {
  // contentHash is computed here from markdown.
};

export type IndexPageResult = {
  pageId: number;
  state: "inserted" | "updated" | "unchanged";
  chunkCount: number;
};

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function indexPage(
  db: Database,
  input: IndexPageInput,
  chunks: readonly Chunk[],
): IndexPageResult {
  const contentHash = sha256(input.markdown);
  const full: PageUpsertInput = { ...input, contentHash };
  const existing = getPageByUrl(db, input.siteId, input.url);
  if (!existing) {
    const pageId = insertPage(db, full);
    const chunkCount = replaceChunks(db, pageId, chunks);
    return { pageId, state: "inserted", chunkCount };
  }
  if (existing.content_hash === contentHash) {
    touchPage(db, existing.id, input.fetchedAt, input.etag, input.lastModified);
    return { pageId: existing.id, state: "unchanged", chunkCount: 0 };
  }
  updatePage(db, existing.id, full);
  const chunkCount = replaceChunks(db, existing.id, chunks);
  return { pageId: existing.id, state: "updated", chunkCount };
}
