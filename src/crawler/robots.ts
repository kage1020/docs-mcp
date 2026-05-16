import robotsParser from "robots-parser";

export type RobotsAdvisor = {
  isAllowed(url: string, userAgent: string): boolean;
  crawlDelay(userAgent: string): number | undefined;
  sitemaps(): string[];
};

export function createRobots(robotsTxt: string, baseUrl: string): RobotsAdvisor {
  const robotsUrl = robotsUrlFor(baseUrl);
  const parsed = robotsParser(robotsUrl, robotsTxt ?? "");
  return {
    isAllowed(url, userAgent) {
      const result = parsed.isAllowed(url, userAgent);
      return result === undefined ? true : result;
    },
    crawlDelay(userAgent) {
      const d = parsed.getCrawlDelay(userAgent);
      return typeof d === "number" && Number.isFinite(d) ? d : undefined;
    },
    sitemaps() {
      return parsed.getSitemaps();
    },
  };
}

function robotsUrlFor(baseUrl: string): string {
  try {
    const u = new URL(baseUrl);
    return `${u.protocol}//${u.host}/robots.txt`;
  } catch {
    return "https://invalid.example/robots.txt";
  }
}
