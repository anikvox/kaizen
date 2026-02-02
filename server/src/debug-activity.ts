import { prisma } from "./lib/prisma";

async function checkActivity() {
  console.log("\n=== Checking Activity Timestamps ===\n");

  // Check WebsiteVisit
  const websiteVisits = await prisma.websiteVisit.findMany({
    orderBy: { updatedAt: "desc" },
    take: 3,
    select: {
      url: true,
      openedAt: true,
      updatedAt: true,
      activeTime: true,
      userId: true,
    },
  });

  console.log("Recent WebsiteVisits:");
  websiteVisits.forEach((visit, i) => {
    const now = new Date();
    const hoursSinceUpdate = (now.getTime() - visit.updatedAt.getTime()) / (1000 * 60 * 60);
    const hoursSinceOpen = (now.getTime() - visit.openedAt.getTime()) / (1000 * 60 * 60);

    console.log(`\n${i + 1}. ${visit.url.substring(0, 60)}...`);
    console.log(`   User ID: ${visit.userId}`);
    console.log(`   Opened: ${visit.openedAt.toISOString()} (${hoursSinceOpen.toFixed(2)}h ago)`);
    console.log(`   Updated: ${visit.updatedAt.toISOString()} (${hoursSinceUpdate.toFixed(2)}h ago)`);
    console.log(`   Active Time: ${visit.activeTime}ms`);
  });

  // Check TextAttention
  const textAttentions = await prisma.textAttention.findMany({
    orderBy: { timestamp: "desc" },
    take: 3,
    select: {
      url: true,
      text: true,
      timestamp: true,
      userId: true,
    },
  });

  console.log("\n\nRecent TextAttention:");
  textAttentions.forEach((text, i) => {
    const now = new Date();
    const hoursSinceActivity = (now.getTime() - text.timestamp.getTime()) / (1000 * 60 * 60);

    console.log(`\n${i + 1}. ${text.url.substring(0, 60)}...`);
    console.log(`   User ID: ${text.userId}`);
    console.log(`   Timestamp: ${text.timestamp.toISOString()} (${hoursSinceActivity.toFixed(2)}h ago)`);
    console.log(`   Text length: ${text.text.length} chars`);
  });

  // Check what the scheduler would find
  const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
  console.log(`\n\n=== Scheduler Check (looking for activity after ${oneHourAgo.toISOString()}) ===\n`);

  const websiteUsers = await prisma.websiteVisit.findMany({
    where: { openedAt: { gte: oneHourAgo } },
    select: { userId: true },
    distinct: ["userId"],
  });

  const textUsers = await prisma.textAttention.findMany({
    where: { timestamp: { gte: oneHourAgo } },
    select: { userId: true },
    distinct: ["userId"],
  });

  console.log(`WebsiteVisit users (openedAt >= 1h ago): ${websiteUsers.length}`);
  console.log(`TextAttention users (timestamp >= 1h ago): ${textUsers.length}`);

  // Also check with updatedAt for comparison
  const websiteUsersUpdated = await prisma.websiteVisit.findMany({
    where: { updatedAt: { gte: oneHourAgo } },
    select: { userId: true },
    distinct: ["userId"],
  });

  console.log(`\nIf we checked updatedAt instead of openedAt:`);
  console.log(`WebsiteVisit users (updatedAt >= 1h ago): ${websiteUsersUpdated.length}`);

  await prisma.$disconnect();
}

checkActivity().catch(console.error);
