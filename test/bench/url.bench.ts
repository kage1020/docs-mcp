import { bench, describe } from "vitest";
import { normalize } from "../../src/crawler/url.ts";

describe("crawler/url.normalize", () => {
  bench("hot path", () => {
    normalize("https://Example.COM:443/a/index.html?b=2&a=1#frag");
  });

  bench("with base + many params", () => {
    normalize(
      "https://docs.example.com/path/page?utm_source=g&utm_medium=cpc&fbclid=x&z=1&a=2&b=3&c=4",
      { baseUrl: "https://docs.example.com/" },
    );
  });
});
