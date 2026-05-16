import { describe, expect, it } from "bun:test";
import { isSameOrigin, isUnderBase, matchPatterns, normalize } from "../../../src/crawler/url.ts";

describe("crawler/url > normalize", () => {
  it("lowercases host, strips default port, drops fragment, sorts query, collapses /index.html", () => {
    expect(normalize("https://Example.COM:443/a/index.html?b=2&a=1#frag")).toBe(
      "https://example.com/a/?a=1&b=2",
    );
  });

  it("strips :80 on http and collapses /index.htm", () => {
    expect(normalize("http://Foo.com:80/x/index.htm")).toBe("http://foo.com/x/");
  });

  it("strips utm_* trackers by default", () => {
    expect(normalize("https://x.dev/a?utm_source=g&utm_medium=cpc&keep=1")).toBe(
      "https://x.dev/a?keep=1",
    );
  });

  it("strips fbclid / gclid", () => {
    expect(normalize("https://x.dev/a?fbclid=abc&gclid=def&z=9")).toBe("https://x.dev/a?z=9");
  });

  it("sorts query parameters alphabetically", () => {
    expect(normalize("https://x.dev/path?b=2&a=1")).toBe("https://x.dev/path?a=1&b=2");
  });

  it("preserves root /", () => {
    expect(normalize("https://x.dev/")).toBe("https://x.dev/");
  });

  it("keeps trackers when stripTrackingParams=false", () => {
    expect(normalize("https://x.dev/?utm_source=g&a=1", { stripTrackingParams: false })).toBe(
      "https://x.dev/?a=1&utm_source=g",
    );
  });

  it("forces trailing slash on directory-like paths when base ends with /", () => {
    expect(normalize("https://x.dev/docs/intro", { baseUrl: "https://x.dev/docs/" })).toBe(
      "https://x.dev/docs/intro/",
    );
  });

  it("does not force slash on file-like paths even when base ends with /", () => {
    expect(normalize("https://x.dev/docs/page.html", { baseUrl: "https://x.dev/docs/" })).toBe(
      "https://x.dev/docs/page.html",
    );
  });

  it("removes trailing slash when base does not end with /", () => {
    expect(normalize("https://x.dev/docs/intro/", { baseUrl: "https://x.dev/docs" })).toBe(
      "https://x.dev/docs/intro",
    );
  });

  it("removes pagination params when configured", () => {
    expect(
      normalize("https://x.dev/list?page=2&p=3&offset=10&keep=yes", {
        stripPaginationParams: ["page", "p", "offset"],
      }),
    ).toBe("https://x.dev/list?keep=yes");
  });
});

describe("crawler/url > isSameOrigin", () => {
  it("matches scheme + host", () => {
    expect(isSameOrigin("https://x.dev/a", "https://x.dev/b")).toBe(true);
  });

  it("differs by scheme", () => {
    expect(isSameOrigin("https://x.dev/a", "http://x.dev/a")).toBe(false);
  });

  it("differs by host", () => {
    expect(isSameOrigin("https://x.dev/a", "https://y.dev/a")).toBe(false);
  });

  it("returns false on invalid URLs", () => {
    expect(isSameOrigin("not-a-url", "https://x.dev")).toBe(false);
  });
});

describe("crawler/url > isUnderBase", () => {
  it("returns true for sub-paths", () => {
    expect(isUnderBase("https://x.dev/docs/a/b", "https://x.dev/docs/")).toBe(true);
  });

  it("returns true for the base path itself", () => {
    expect(isUnderBase("https://x.dev/docs", "https://x.dev/docs/")).toBe(true);
  });

  it("returns false for sibling paths", () => {
    expect(isUnderBase("https://x.dev/other", "https://x.dev/docs/")).toBe(false);
  });

  it("returns false across origins", () => {
    expect(isUnderBase("https://y.dev/docs/a", "https://x.dev/docs/")).toBe(false);
  });
});

describe("crawler/url > matchPatterns", () => {
  it("matches all when patterns are empty", () => {
    expect(matchPatterns("/a/b", [])).toBe(true);
    expect(matchPatterns("/a/b", undefined)).toBe(true);
  });

  it("uses micromatch globs", () => {
    expect(matchPatterns("/docs/api/v1", ["/docs/**"])).toBe(true);
    expect(matchPatterns("/blog/post-1", ["/docs/**"])).toBe(false);
  });

  it("respects negative patterns", () => {
    expect(matchPatterns("/docs/x", ["/docs/**", "!/docs/exclude/**"])).toBe(true);
    expect(matchPatterns("/docs/exclude/x", ["/docs/**", "!/docs/exclude/**"])).toBe(false);
  });
});
