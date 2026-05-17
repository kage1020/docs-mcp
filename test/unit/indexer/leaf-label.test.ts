import { describe, expect, it } from "bun:test";
import { chunk } from "../../../src/indexer/chunk.ts";

describe("indexer/chunk > leafLabel", () => {
  it("is opt-in (default off, back-compat with Phase 4)", () => {
    const md = "# Top\n\n[`Foo`](https://x/foo) explains Foo.";
    const chunks = chunk(md);
    expect(chunks[0]?.headingPath).toBe("Top");
  });

  it("appends a link-derived leaf when enabled", () => {
    const md = "## services\n\n[`CampaignService`](https://x/c) Manage campaigns.";
    const chunks = chunk(md, { leafLabel: true });
    expect(chunks[0]?.headingPath).toBe("services > CampaignService");
  });

  it("uses heading text as leaf when chunk starts with a sub-heading", () => {
    const md = "## resources\n\n### CampaignResource\n\nbody";
    const chunks = chunk(md, { leafLabel: true });
    const path = chunks.find((c) => c.text.includes("CampaignResource"))?.headingPath;
    expect(path).toContain("CampaignResource");
  });

  it("uses inline-code identifier when present", () => {
    const md = "## misc\n\n`AdGroupAd` represents an ad.";
    const chunks = chunk(md, { leafLabel: true });
    expect(chunks[0]?.headingPath).toBe("misc > AdGroupAd");
  });

  it("leaves headingPath untouched when no leaf is derivable", () => {
    const md = "## section\n\n```ts\nconst x = 1;\n```";
    const chunks = chunk(md, { leafLabel: true });
    expect(chunks[0]?.headingPath).toBe("section");
  });

  it("avoids duplicate leaf when parent already ends with it", () => {
    const md = "## CampaignService\n\nCampaignService is a service.";
    const chunks = chunk(md, { leafLabel: true });
    expect(chunks[0]?.headingPath).toBe("CampaignService");
  });

  it("gives oversize splits within the same h2 distinct leaves", () => {
    const links = Array.from(
      { length: 60 },
      (_, i) => `[\`Service${i}\`](https://x/${i}) explains thing number ${i}.`,
    ).join("\n\n");
    const md = `## services\n\n${links}`;
    const chunks = chunk(md, { maxTokens: 80, overlapTokens: 0, leafLabel: true });
    expect(chunks.length).toBeGreaterThan(2);
    const paths = new Set(chunks.map((c) => c.headingPath));
    expect(paths.size).toBeGreaterThan(1);
    for (const c of chunks) expect(c.headingPath).toMatch(/^services > Service\d+/);
  });

  it("clips long heading-derived leaves to <= 80 chars", () => {
    const longHeading = "x".repeat(200);
    const md = `## parent\n\n### ${longHeading}\n\nbody`;
    const chunks = chunk(md, { leafLabel: true });
    const path = chunks.find((c) => c.text.includes(longHeading))?.headingPath;
    const leaf = path?.split(" > ").pop() ?? "";
    expect(leaf.length).toBeLessThanOrEqual(80);
  });
});
