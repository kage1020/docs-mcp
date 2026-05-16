export const M001_INIT: readonly string[] = [
  "PRAGMA journal_mode = WAL",
  "PRAGMA foreign_keys = ON",
  `CREATE TABLE sites (
    id                  INTEGER PRIMARY KEY,
    base_url            TEXT NOT NULL UNIQUE,
    name                TEXT NOT NULL,
    robots_txt          TEXT,
    crawl_options_json  TEXT NOT NULL,
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    last_crawled_at     INTEGER
  )`,
  `CREATE TABLE pages (
    id              INTEGER PRIMARY KEY,
    site_id         INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    url             TEXT NOT NULL,
    title           TEXT,
    etag            TEXT,
    last_modified   TEXT,
    content_hash    TEXT NOT NULL,
    markdown        TEXT NOT NULL,
    markdown_size   INTEGER NOT NULL,
    fetched_at      INTEGER NOT NULL,
    depth           INTEGER NOT NULL DEFAULT 0,
    UNIQUE(site_id, url)
  )`,
  "CREATE INDEX idx_pages_site ON pages(site_id)",
  "CREATE INDEX idx_pages_hash ON pages(content_hash)",
  `CREATE TABLE chunks (
    id            INTEGER PRIMARY KEY,
    page_id       INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    ord           INTEGER NOT NULL,
    heading_path  TEXT NOT NULL,
    text          TEXT NOT NULL,
    token_count   INTEGER NOT NULL,
    UNIQUE(page_id, ord)
  )`,
  "CREATE INDEX idx_chunks_page ON chunks(page_id)",
  `CREATE TABLE embeddings_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
];

export const M002_FTS: readonly string[] = [
  `CREATE VIRTUAL TABLE chunks_fts USING fts5(
    text,
    heading_path,
    content='chunks',
    content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
  )`,
  `CREATE TRIGGER chunks_ai AFTER INSERT ON chunks BEGIN
    INSERT INTO chunks_fts(rowid, text, heading_path)
    VALUES (new.id, new.text, new.heading_path);
  END`,
  `CREATE TRIGGER chunks_ad AFTER DELETE ON chunks BEGIN
    INSERT INTO chunks_fts(chunks_fts, rowid, text, heading_path)
    VALUES ('delete', old.id, old.text, old.heading_path);
  END`,
  `CREATE TRIGGER chunks_au AFTER UPDATE ON chunks BEGIN
    INSERT INTO chunks_fts(chunks_fts, rowid, text, heading_path)
    VALUES ('delete', old.id, old.text, old.heading_path);
    INSERT INTO chunks_fts(rowid, text, heading_path)
    VALUES (new.id, new.text, new.heading_path);
  END`,
];

export const MIGRATIONS: readonly (readonly string[])[] = [M001_INIT, M002_FTS];
export const LATEST_VERSION = MIGRATIONS.length;
