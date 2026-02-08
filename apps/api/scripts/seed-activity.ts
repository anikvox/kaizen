#!/usr/bin/env tsx
/**
 * Seed Activity Script
 *
 * Seeds realistic browsing activity for all users to test the focus agent
 * and alerting system.
 *
 * Creates:
 * 1. Historical activity (past 24h) with calculated focus sessions
 * 2. Recent activity (last 5 mins) that triggers focus agent analysis
 *
 * Usage: pnpm --filter @kaizen/api seed:activity
 */

import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// Domain categories for realistic browsing patterns
const PRODUCTIVE_DOMAINS = [
  { domain: "github.com", titles: ["Pull Request", "Issues", "Code Review", "Repository"] },
  { domain: "stackoverflow.com", titles: ["How to", "Error in", "Best practice for"] },
  { domain: "docs.google.com", titles: ["Document", "Spreadsheet", "Presentation"] },
  { domain: "notion.so", titles: ["Project Notes", "Meeting Notes", "Documentation"] },
  { domain: "linear.app", titles: ["Issue", "Project", "Cycle"] },
  { domain: "figma.com", titles: ["Design", "Prototype", "Components"] },
  { domain: "vercel.com", titles: ["Deployment", "Dashboard", "Analytics"] },
  { domain: "aws.amazon.com", titles: ["Console", "S3", "Lambda", "EC2"] },
];

const SOCIAL_MEDIA_DOMAINS = [
  { domain: "twitter.com", titles: ["Home / X", "Notifications", "For You", "Following"] },
  { domain: "x.com", titles: ["Home / X", "Notifications", "For You", "Explore"] },
  { domain: "reddit.com", titles: ["r/programming", "r/technology", "r/worldnews", "r/funny", "Front Page"] },
  { domain: "facebook.com", titles: ["Facebook", "News Feed", "Notifications"] },
  { domain: "instagram.com", titles: ["Instagram", "Explore", "Reels"] },
  { domain: "linkedin.com/feed", titles: ["LinkedIn Feed", "Notifications", "My Network"] },
  { domain: "tiktok.com", titles: ["TikTok - For You", "Following", "Discover"] },
];

const ENTERTAINMENT_DOMAINS = [
  { domain: "youtube.com", titles: ["YouTube", "Watch", "Trending", "Subscriptions"] },
  { domain: "youtube.com/shorts", titles: ["Shorts - YouTube", "YouTube Shorts"] },
  { domain: "netflix.com", titles: ["Netflix", "Home", "My List"] },
  { domain: "twitch.tv", titles: ["Twitch", "Following", "Browse"] },
];

const NEWS_DOMAINS = [
  { domain: "news.ycombinator.com", titles: ["Hacker News", "Show HN", "Ask HN"] },
  { domain: "techcrunch.com", titles: ["TechCrunch", "Startups", "AI"] },
  { domain: "theverge.com", titles: ["The Verge", "Tech", "Reviews"] },
];

// Text content for attention data
const READING_CONTENT = {
  technical: [
    "React hooks provide a way to use state and other React features without writing a class component.",
    "TypeScript generics allow you to write flexible, reusable code that works with multiple types.",
    "Docker containers package applications with their dependencies for consistent deployment.",
    "Kubernetes orchestrates containerized applications across multiple hosts.",
    "GraphQL provides a complete description of the data in your API.",
  ],
  social: [
    "Just saw this amazing sunset photo! #nofilter #blessed",
    "Breaking: Major tech company announces layoffs affecting thousands",
    "10 things you won't believe happened today",
    "This thread is absolutely wild, you need to read the whole thing",
    "Hot take: unpopular opinion about popular thing",
  ],
  news: [
    "The latest developments in artificial intelligence are reshaping industries.",
    "Market analysis shows significant growth in the tech sector.",
    "New research suggests breakthrough in renewable energy.",
  ],
};

function randomFromArray<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateUrl(domainInfo: { domain: string; titles: string[] }): { url: string; title: string } {
  const title = randomFromArray(domainInfo.titles);
  const path = faker.helpers.slugify(faker.lorem.words(3)).toLowerCase();
  return {
    url: `https://${domainInfo.domain}/${path}`,
    title: `${title} - ${faker.lorem.words(3)}`,
  };
}

interface SeedOptions {
  userId: string;
  scenario: "productive" | "doomscroll" | "distracted" | "mixed";
}

async function seedHistoricalActivity(userId: string) {
  console.log(`  Seeding historical activity (past 24h)...`);

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Create 3-5 focus sessions throughout the day
  const focusSessions = [];
  let currentTime = dayAgo.getTime();

  for (let i = 0; i < faker.number.int({ min: 3, max: 5 }); i++) {
    // Gap between sessions (30 mins to 2 hours)
    currentTime += faker.number.int({ min: 30 * 60 * 1000, max: 2 * 60 * 60 * 1000 });

    const startedAt = new Date(currentTime);
    const duration = faker.number.int({ min: 30 * 60 * 1000, max: 3 * 60 * 60 * 1000 }); // 30 min to 3 hours
    const endedAt = new Date(currentTime + duration);

    if (endedAt.getTime() > now.getTime() - 30 * 60 * 1000) break; // Don't create focuses too close to now

    const focusTopics = [
      "Building API endpoints",
      "Reviewing pull requests",
      "Writing documentation",
      "Debugging auth flow",
      "Database optimization",
      "Frontend styling",
      "Testing features",
    ];

    const focus = await db.focus.create({
      data: {
        userId,
        item: randomFromArray(focusTopics),
        keywords: faker.helpers.arrayElements(
          ["typescript", "react", "api", "database", "testing", "css", "auth"],
          { min: 2, max: 5 }
        ),
        isActive: false,
        startedAt,
        endedAt,
        lastActivityAt: endedAt,
        lastCalculatedAt: endedAt,
      },
    });

    focusSessions.push({ focus, startedAt, endedAt });
    currentTime = endedAt.getTime();

    // Create website visits during this focus session
    let visitTime = startedAt.getTime();
    while (visitTime < endedAt.getTime()) {
      const domain = randomFromArray(PRODUCTIVE_DOMAINS);
      const { url, title } = generateUrl(domain);
      const activeTime = faker.number.int({ min: 30000, max: 300000 }); // 30s to 5 min

      await db.websiteVisit.create({
        data: {
          userId,
          url,
          title,
          openedAt: new Date(visitTime),
          closedAt: new Date(visitTime + activeTime),
          activeTime,
          metadata: {},
        },
      });

      // Add text attention
      await db.textAttention.create({
        data: {
          userId,
          url,
          text: randomFromArray(READING_CONTENT.technical),
          wordsRead: faker.number.int({ min: 50, max: 300 }),
          timestamp: new Date(visitTime + activeTime / 2),
        },
      });

      visitTime += activeTime + faker.number.int({ min: 5000, max: 30000 }); // Gap between visits
    }
  }

  console.log(`    Created ${focusSessions.length} focus sessions with visits`);
}

async function seedRecentDoomscrollActivity(userId: string) {
  console.log(`  Seeding recent doomscroll pattern (last 5 mins)...`);

  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);

  // Rapid social media switching - classic doomscroll pattern
  let visitTime = fiveMinAgo.getTime();
  const visits = [];

  while (visitTime < now.getTime() - 10000) {
    // Pick social media or entertainment
    const domains = [...SOCIAL_MEDIA_DOMAINS, ...ENTERTAINMENT_DOMAINS];
    const domain = randomFromArray(domains);
    const { url, title } = generateUrl(domain);

    // Short dwell times - 5 to 20 seconds per page (doomscroll pattern)
    const activeTime = faker.number.int({ min: 5000, max: 20000 });

    visits.push({
      userId,
      url,
      title,
      openedAt: new Date(visitTime),
      closedAt: new Date(visitTime + activeTime),
      activeTime,
      metadata: {},
    });

    // Very short gaps - rapid switching
    visitTime += activeTime + faker.number.int({ min: 500, max: 2000 });
  }

  // Batch insert visits
  for (const visit of visits) {
    await db.websiteVisit.create({ data: visit });

    // Add shallow text attention (quick scrolling, not really reading)
    await db.textAttention.create({
      data: {
        userId,
        url: visit.url,
        text: randomFromArray(READING_CONTENT.social),
        wordsRead: faker.number.int({ min: 5, max: 30 }), // Very few words - just scrolling
        timestamp: new Date(visit.openedAt.getTime() + visit.activeTime / 2),
      },
    });
  }

  console.log(`    Created ${visits.length} rapid social media visits`);
}

async function seedRecentDistractedActivity(userId: string) {
  console.log(`  Seeding recent distracted pattern (last 5 mins)...`);

  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);

  // Has an active focus but browsing unrelated content
  const focus = await db.focus.create({
    data: {
      userId,
      item: "Writing documentation",
      keywords: ["docs", "api", "readme", "guide"],
      isActive: true,
      startedAt: new Date(now.getTime() - 30 * 60 * 1000), // Started 30 mins ago
      lastActivityAt: new Date(now.getTime() - 10 * 60 * 1000), // Last relevant activity 10 mins ago
      lastCalculatedAt: new Date(now.getTime() - 5 * 60 * 1000),
    },
  });

  // But recent activity is all social media (focus drift)
  let visitTime = fiveMinAgo.getTime();
  const visits = [];

  while (visitTime < now.getTime() - 10000) {
    const allDomains = [...SOCIAL_MEDIA_DOMAINS, ...NEWS_DOMAINS, ...ENTERTAINMENT_DOMAINS];
    const domain = randomFromArray(allDomains);
    const { url, title } = generateUrl(domain);

    const activeTime = faker.number.int({ min: 15000, max: 60000 }); // 15s to 1 min

    visits.push({
      userId,
      url,
      title,
      openedAt: new Date(visitTime),
      closedAt: new Date(visitTime + activeTime),
      activeTime,
      metadata: {},
    });

    visitTime += activeTime + faker.number.int({ min: 2000, max: 10000 });
  }

  for (const visit of visits) {
    await db.websiteVisit.create({ data: visit });

    await db.textAttention.create({
      data: {
        userId,
        url: visit.url,
        text: randomFromArray([...READING_CONTENT.social, ...READING_CONTENT.news]),
        wordsRead: faker.number.int({ min: 20, max: 100 }),
        timestamp: new Date(visit.openedAt.getTime() + visit.activeTime / 2),
      },
    });
  }

  console.log(`    Created active focus "${focus.item}" with ${visits.length} unrelated visits`);
}

async function seedRecentTabSwitchingActivity(userId: string) {
  console.log(`  Seeding recent tab-switching chaos (last 5 mins)...`);

  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);

  // Chaotic tab switching - many different domains, very short times
  let visitTime = fiveMinAgo.getTime();
  const visits = [];
  const allDomains = [
    ...PRODUCTIVE_DOMAINS,
    ...SOCIAL_MEDIA_DOMAINS,
    ...ENTERTAINMENT_DOMAINS,
    ...NEWS_DOMAINS,
  ];

  // Track unique domains for distraction metric
  const usedDomains = new Set<string>();

  while (visitTime < now.getTime() - 5000) {
    // Pick a domain we haven't used much (maximize switching)
    let domain = randomFromArray(allDomains);
    let attempts = 0;
    while (usedDomains.has(domain.domain) && attempts < 5) {
      domain = randomFromArray(allDomains);
      attempts++;
    }
    usedDomains.add(domain.domain);

    const { url, title } = generateUrl(domain);

    // Very short dwell times - constant switching
    const activeTime = faker.number.int({ min: 3000, max: 15000 }); // 3-15 seconds

    visits.push({
      userId,
      url,
      title,
      openedAt: new Date(visitTime),
      closedAt: new Date(visitTime + activeTime),
      activeTime,
      metadata: {},
    });

    // Rapid switching
    visitTime += activeTime + faker.number.int({ min: 200, max: 1000 });
  }

  for (const visit of visits) {
    await db.websiteVisit.create({ data: visit });

    // Minimal reading - just glancing
    await db.textAttention.create({
      data: {
        userId,
        url: visit.url,
        text: faker.lorem.sentence(),
        wordsRead: faker.number.int({ min: 2, max: 15 }),
        timestamp: new Date(visit.openedAt.getTime() + visit.activeTime / 2),
      },
    });
  }

  console.log(`    Created ${visits.length} visits across ${usedDomains.size} different domains`);
}

async function seedUserActivity(userId: string, email: string) {
  console.log(`\nSeeding activity for user: ${email}`);

  // Seed historical activity for context
  await seedHistoricalActivity(userId);

  // Pick a random recent pattern to trigger different nudge types
  const patterns = ["doomscroll", "distracted", "tabswitch"] as const;
  const pattern = randomFromArray([...patterns]);

  switch (pattern) {
    case "doomscroll":
      await seedRecentDoomscrollActivity(userId);
      break;
    case "distracted":
      await seedRecentDistractedActivity(userId);
      break;
    case "tabswitch":
      await seedRecentTabSwitchingActivity(userId);
      break;
  }

  console.log(`  Pattern: ${pattern}`);
}

async function main() {
  console.log("🌱 Seeding activity data for focus agent testing\n");
  console.log("=".repeat(60));

  // Get all users
  const users = await db.user.findMany({
    select: { id: true, email: true },
  });

  if (users.length === 0) {
    console.log("❌ No users found in database. Please create users first.");
    process.exit(1);
  }

  console.log(`Found ${users.length} user(s) to seed\n`);

  // Ensure focus agent is enabled for all users
  for (const user of users) {
    await db.userSettings.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        focusAgentEnabled: true,
        focusAgentSensitivity: 0.5,
        focusAgentCooldownMs: 60000, // 1 min for testing (normally 5 min)
      },
      update: {
        focusAgentEnabled: true,
        focusAgentCooldownMs: 60000, // 1 min for testing
      },
    });
  }

  // Seed activity for each user
  for (const user of users) {
    await seedUserActivity(user.id, user.email);
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ Seeding complete!");
  console.log("\nThe focus agent job runs every 1 minute and will analyze");
  console.log("the last 15 minutes of activity. Watch the logs for nudges!");
  console.log("\nTo see nudges, make sure the extension is connected via SSE.");
}

main()
  .catch((e) => {
    console.error("Error seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
