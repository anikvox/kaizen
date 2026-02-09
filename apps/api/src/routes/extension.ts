import { Hono } from "hono";
import { stream } from "hono/streaming";
import archiver from "archiver";
import { existsSync, statSync } from "fs";
import { readdir } from "fs/promises";
import path from "path";

const app = new Hono();

// Paths to extension builds - check prod first, then dev
const EXTENSION_PROD_PATH = path.resolve(
  process.cwd(),
  "../extension/build/chrome-mv3-prod"
);
const EXTENSION_DEV_PATH = path.resolve(
  process.cwd(),
  "../extension/build/chrome-mv3-dev"
);

// Helper to find the available build path
function getAvailableBuildPath(): { path: string; type: "prod" | "dev" } | null {
  if (existsSync(EXTENSION_PROD_PATH)) {
    const stats = statSync(EXTENSION_PROD_PATH);
    if (stats.isDirectory()) {
      return { path: EXTENSION_PROD_PATH, type: "prod" };
    }
  }
  if (existsSync(EXTENSION_DEV_PATH)) {
    const stats = statSync(EXTENSION_DEV_PATH);
    if (stats.isDirectory()) {
      return { path: EXTENSION_DEV_PATH, type: "dev" };
    }
  }
  return null;
}

app.get("/download", async (c) => {
  const build = getAvailableBuildPath();

  // Check if any build exists
  if (!build) {
    return c.json(
      {
        error: "Extension build not found",
        message:
          "The Chrome extension has not been built yet. Please build the extension first.",
      },
      404
    );
  }

  // Check if directory has contents
  const files = await readdir(build.path);
  if (files.length === 0) {
    return c.json({ error: "Extension build is empty" }, 500);
  }

  // Set headers for zip download
  const filename = build.type === "prod"
    ? "kaizen-extension.zip"
    : "kaizen-extension-dev.zip";

  c.header("Content-Type", "application/zip");
  c.header("Content-Disposition", `attachment; filename="${filename}"`);

  return stream(c, async (stream) => {
    const archive = archiver("zip", {
      zlib: { level: 9 }, // Maximum compression
    });

    // Handle archive errors
    archive.on("error", (err) => {
      console.error("Archive error:", err);
    });

    // Pipe archive data to the response stream
    archive.on("data", (chunk) => {
      stream.write(chunk);
    });

    // Add the extension directory to the archive
    archive.directory(build.path, false);

    // Finalize the archive
    await archive.finalize();
  });
});

// Endpoint to check if extension is available
app.get("/status", async (c) => {
  const build = getAvailableBuildPath();

  if (!build) {
    return c.json({
      available: false,
      message: "Extension build not found",
    });
  }

  const stats = statSync(build.path);
  const files = await readdir(build.path);

  return c.json({
    available: files.length > 0,
    buildType: build.type,
    buildPath: build.path,
    fileCount: files.length,
    lastModified: stats.mtime.toISOString(),
  });
});

export default app;
