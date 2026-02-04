"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth, SignInButton, useUser } from "@clerk/nextjs";
import { createApiClient, type AttentionResponse } from "@kaizen/api-client";
import Link from "next/link";

const apiUrl =
  process.env.NEXT_PUBLIC_KAIZEN_API_URL || "http://localhost:60092";

type TimeRange = "1h" | "24h" | "7d" | "30d";

const TIME_RANGE_MS: Record<TimeRange, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export default function AttentionDashboard() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const [attentionData, setAttentionData] = useState<AttentionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());

  const getTokenFn = useCallback(async () => {
    return getToken();
  }, [getToken]);

  const fetchAttentionData = useCallback(async () => {
    if (!isSignedIn || !clerkUser) return;

    setLoading(true);
    const api = createApiClient(apiUrl, getTokenFn);
    const email = clerkUser.emailAddresses[0]?.emailAddress;
    if (!email) return;

    try {
      // Sync user first
      await api.users.sync({
        email,
        name: clerkUser.fullName || undefined,
      });

      const from = new Date(Date.now() - TIME_RANGE_MS[timeRange]);
      const result = await api.export.getAttention({ from });
      setAttentionData(result);
      setError("");
    } catch (err) {
      console.error("Fetch attention error:", err);
      setError("Failed to fetch attention data");
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, clerkUser, getTokenFn, timeRange]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setLoading(false);
      return;
    }
    fetchAttentionData();
  }, [isLoaded, isSignedIn, fetchAttentionData]);

  const togglePage = (url: string) => {
    setExpandedPages((prev) => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else {
        next.add(url);
      }
      return next;
    });
  };

  if (!isLoaded || loading) {
    return (
      <main style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
        <h1>Attention Dashboard</h1>
        <p>Loading...</p>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
        <h1>Attention Dashboard</h1>
        <p>Sign in to view your attention data.</p>
        <div style={{ marginTop: "1rem" }}>
          <SignInButton mode="modal" />
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0 }}>Attention Dashboard</h1>
        <Link href="/" style={{ color: "#666" }}>Back to Home</Link>
      </div>

      {/* Time Range Selector */}
      <div style={{ marginBottom: "1.5rem", display: "flex", gap: "0.5rem" }}>
        {(["1h", "24h", "7d", "30d"] as TimeRange[]).map((range) => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            style={{
              padding: "0.5rem 1rem",
              border: "1px solid #ddd",
              borderRadius: "4px",
              background: timeRange === range ? "#007bff" : "white",
              color: timeRange === range ? "white" : "#333",
              cursor: "pointer",
            }}
          >
            {range === "1h" ? "Last Hour" : range === "24h" ? "Last 24 Hours" : range === "7d" ? "Last 7 Days" : "Last 30 Days"}
          </button>
        ))}
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {attentionData && (
        <>
          {/* Summary Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
            <SummaryCard label="Pages Visited" value={attentionData.summary.totalPages} />
            <SummaryCard label="Active Time" value={attentionData.summary.totalActiveTimeFormatted} />
            <SummaryCard label="Words Read" value={attentionData.summary.totalWordsRead.toLocaleString()} />
            <SummaryCard label="Images Viewed" value={attentionData.summary.totalImagesViewed} />
            <SummaryCard label="Audio Listened" value={attentionData.summary.totalAudioListened} />
            <SummaryCard label="YouTube Videos" value={attentionData.summary.totalYoutubeVideos} />
          </div>

          {/* Time Range Info */}
          <p style={{ fontSize: "0.85rem", color: "#666", marginBottom: "1rem" }}>
            Showing data from {new Date(attentionData.timeRange.from).toLocaleString()} to {new Date(attentionData.timeRange.to).toLocaleString()}
          </p>

          {/* Pages List */}
          {attentionData.pages.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem", background: "#f5f5f5", borderRadius: "8px" }}>
              <p>No attention data recorded for this time period.</p>
              <p style={{ fontSize: "0.9rem", color: "#666" }}>
                Browse the web with the Kaizen extension to start tracking your attention.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {attentionData.pages.map((page) => (
                <div
                  key={page.url}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    overflow: "hidden",
                  }}
                >
                  {/* Page Header */}
                  <div
                    onClick={() => togglePage(page.url)}
                    style={{
                      padding: "1rem",
                      background: "#f9f9f9",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: "bold", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {page.title || page.url}
                      </p>
                      <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: "#666" }}>
                        {page.domain} • {new Date(page.visitedAt).toLocaleString()}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginLeft: "1rem" }}>
                      {page.activeTime > 0 && (
                        <span style={{ fontSize: "0.85rem", color: "#666" }}>
                          {page.activeTimeFormatted}
                        </span>
                      )}
                      <span style={{ fontSize: "1.2rem" }}>
                        {expandedPages.has(page.url) ? "▼" : "▶"}
                      </span>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {expandedPages.has(page.url) && (
                    <div style={{ padding: "1rem", borderTop: "1px solid #eee" }}>
                      {/* Text Attention */}
                      {page.attention.text.totalWordsRead > 0 && (
                        <AttentionSection title={`Text (${page.attention.text.totalWordsRead} words read)`}>
                          {page.attention.text.excerpts.map((excerpt, i) => (
                            <div key={i} style={{ marginBottom: "0.5rem", padding: "0.5rem", background: "#f5f5f5", borderRadius: "4px" }}>
                              <p style={{ margin: 0, fontSize: "0.9rem", fontStyle: "italic" }}>
                                &ldquo;{excerpt.text}&rdquo;
                              </p>
                              <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "#666" }}>
                                {excerpt.wordsRead} words • {new Date(excerpt.timestamp).toLocaleTimeString()}
                              </p>
                            </div>
                          ))}
                        </AttentionSection>
                      )}

                      {/* Image Attention */}
                      {page.attention.images.count > 0 && (
                        <AttentionSection title={`Images (${page.attention.images.count} viewed)`}>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "0.5rem" }}>
                            {page.attention.images.items.map((img, i) => (
                              <div key={i} style={{ padding: "0.5rem", background: "#f5f5f5", borderRadius: "4px", fontSize: "0.8rem" }}>
                                <p style={{ margin: 0, fontWeight: "500", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {img.alt || "Image"}
                                </p>
                                <p style={{ margin: "0.25rem 0 0", color: "#666" }}>
                                  Hover: {img.hoverDurationFormatted}
                                </p>
                              </div>
                            ))}
                          </div>
                        </AttentionSection>
                      )}

                      {/* Audio Attention */}
                      {page.attention.audio.count > 0 && (
                        <AttentionSection title={`Audio (${page.attention.audio.count} played)`}>
                          {page.attention.audio.items.map((audio, i) => (
                            <div key={i} style={{ marginBottom: "0.5rem", padding: "0.5rem", background: "#f5f5f5", borderRadius: "4px" }}>
                              <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: "500" }}>
                                {audio.title}
                              </p>
                              <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "#666" }}>
                                Played: {audio.playbackDurationFormatted}
                              </p>
                            </div>
                          ))}
                        </AttentionSection>
                      )}

                      {/* YouTube Attention */}
                      {page.attention.youtube.videos.length > 0 && (
                        <AttentionSection title={`YouTube (${page.attention.youtube.videos.length} videos)`}>
                          {page.attention.youtube.videos.map((video, i) => (
                            <div key={i} style={{ marginBottom: "0.75rem", padding: "0.75rem", background: "#f5f5f5", borderRadius: "4px" }}>
                              <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: "500" }}>
                                {video.title || `Video ${video.videoId}`}
                              </p>
                              {video.channelName && (
                                <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: "#666" }}>
                                  {video.channelName}
                                </p>
                              )}
                              {video.activeWatchTimeFormatted && (
                                <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: "#666" }}>
                                  Watch time: {video.activeWatchTimeFormatted}
                                </p>
                              )}
                              {video.captions.length > 0 && (
                                <div style={{ marginTop: "0.5rem", padding: "0.5rem", background: "#fff", borderRadius: "4px", fontSize: "0.8rem" }}>
                                  <p style={{ margin: 0, fontWeight: "500", marginBottom: "0.25rem" }}>Captions:</p>
                                  <p style={{ margin: 0, fontStyle: "italic", color: "#555" }}>
                                    {video.captions.slice(0, 5).join(" ")}
                                    {video.captions.length > 5 && "..."}
                                  </p>
                                </div>
                              )}
                            </div>
                          ))}
                        </AttentionSection>
                      )}

                      {/* No detailed attention data */}
                      {page.attention.text.totalWordsRead === 0 &&
                        page.attention.images.count === 0 &&
                        page.attention.audio.count === 0 &&
                        page.attention.youtube.videos.length === 0 && (
                          <p style={{ color: "#666", fontSize: "0.9rem" }}>
                            No detailed attention data for this page.
                          </p>
                        )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{
      padding: "1rem",
      background: "#f9f9f9",
      borderRadius: "8px",
      textAlign: "center",
    }}>
      <p style={{ margin: 0, fontSize: "1.5rem", fontWeight: "bold" }}>{value}</p>
      <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#666" }}>{label}</p>
    </div>
  );
}

function AttentionSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <p style={{ margin: "0 0 0.5rem", fontWeight: "500", fontSize: "0.9rem" }}>{title}</p>
      {children}
    </div>
  );
}
