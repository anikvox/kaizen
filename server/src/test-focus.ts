import {
  processFocusSession,
  getActiveFocus,
  getFocusHistory,
} from "./lib/focus";
import { processWebsiteSummaries } from "./lib/website-summary";
import { prisma } from "./lib/prisma";

async function testFocusSystem() {
  console.log("\n=== Testing Focus System (Neuropilot Approach) ===\n");

  try {
    // Get or create a test user
    let userId: string;

    const recentVisit = await prisma.websiteVisit.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { userId: true },
    });

    if (!recentVisit) {
      console.log("ℹ️  No existing activity data found.\n");
      console.log("Expected Behavior:\n");
      console.log("✅ No Activity:");
      console.log("   - processFocusSession returns { action: 'no_activity' }");
      console.log("   - No 'Idle' focus is created");
      console.log("   - Previous focus remains unchanged\n");

      console.log("✅ With Activity:");
      console.log("   - First time: Creates focus with detected keyword");
      console.log("   - Same context: Updates focus, merges keywords");
      console.log("   - Context drift: Closes previous focus\n");

      console.log("✅ Data Structure:");
      console.log("   - item: 1-2 word focus description");
      console.log("   - keywords[]: accumulates over time");
      console.log("   - timeSpent[]: array of {start, end} segments");
      console.log("   - Active session: last segment has end=null\n");

      return;
    }

    userId = recentVisit.userId;
    console.log(`Testing for user: ${userId}\n`);

    // Test 1: Generate website summaries
    console.log("--- Test 1: Website Summary Generation ---");
    const summaryResult = await processWebsiteSummaries(userId, 3);
    console.log(
      `✅ Processed ${summaryResult.processed} website summaries (${summaryResult.errors} errors)\n`
    );

    // Test 2: Process focus detection
    console.log("--- Test 2: Focus Detection ---");
    const focusResult = await processFocusSession(userId);
    console.log(`✅ Action: ${focusResult.action}`);
    if (focusResult.sessionId) {
      console.log(`   ID: ${focusResult.sessionId}`);
      console.log(`   Item: ${focusResult.item}`);
      console.log(`   Keywords: ${focusResult.keywords?.join(", ")}`);
    } else {
      console.log(`   Reason: ${focusResult.action === "no_activity" ? "No recent activity" : "Focus drift detected"}`);
    }
    console.log();

    // Test 3: Get current focus
    console.log("--- Test 3: Get Current Focus ---");
    const currentFocus = await getActiveFocus(userId);
    if (currentFocus) {
      console.log(`✅ Current focus:`);
      console.log(`   ID: ${currentFocus.id}`);
      console.log(`   Item: ${currentFocus.item}`);
      console.log(`   Keywords: ${currentFocus.keywords.join(", ")}`);
      console.log(`   Is Active: ${currentFocus.isActive}`);
      console.log(`   Last Updated: ${currentFocus.lastUpdated.toISOString()}`);

      const timeSpent = currentFocus.timeSpent as Array<{
        start: number;
        end: number | null;
      }>;
      console.log(`   Time segments: ${timeSpent.length}`);

      if (timeSpent.length > 0) {
        const lastSegment = timeSpent[timeSpent.length - 1];
        const startStr = new Date(lastSegment.start).toISOString();
        const endStr = lastSegment.end
          ? new Date(lastSegment.end).toISOString()
          : "active";
        console.log(`   Latest: ${startStr} → ${endStr}`);
      }
      console.log();
    } else {
      console.log("⚠️  No focus found (expected if no activity)\n");
    }

    // Test 4: Get focus history
    console.log("--- Test 4: Focus History ---");
    const history = await getFocusHistory(userId, 5);
    console.log(`✅ Found ${history.length} focus records:\n`);

    history.forEach((focus, i) => {
      console.log(`${i + 1}. ${focus.item}`);
      console.log(`   Keywords: ${focus.keywords.join(", ")}`);
      console.log(`   Last Updated: ${focus.lastUpdated.toISOString()}`);

      const timeSpent = focus.timeSpent as Array<{
        start: number;
        end: number | null;
      }>;
      console.log(`   Segments: ${timeSpent.length}`);

      // Calculate total time
      let totalMs = 0;
      for (const segment of timeSpent) {
        if (segment.end) {
          totalMs += segment.end - segment.start;
        } else {
          totalMs += Date.now() - segment.start;
        }
      }

      const minutes = Math.round(totalMs / 60000);
      console.log(`   Total time: ${minutes} minutes`);
      console.log();
    });

    console.log("✅ All tests completed!\n");
  } catch (error) {
    console.error("\n❌ Error during testing:");
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

testFocusSystem();
