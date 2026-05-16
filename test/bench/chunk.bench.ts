import { bench, describe } from "vitest";
import { chunk } from "../../src/indexer/chunk.ts";

function buildMarkdown(): string {
  const sections: string[] = [];
  for (let i = 0; i < 30; i++) {
    sections.push(`## Section ${i}`);
    sections.push("");
    sections.push("Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(40));
    sections.push("");
    if (i % 3 === 0) {
      sections.push("```ts");
      sections.push(Array.from({ length: 10 }, (_, k) => `const x${k}: number = ${k};`).join("\n"));
      sections.push("```");
      sections.push("");
    }
  }
  return `# Big Page\n\n${sections.join("\n")}`;
}
const MD = buildMarkdown();

describe("indexer/chunk.chunk", () => {
  bench("~50KB heading-rich markdown", () => {
    chunk(MD);
  });
});
