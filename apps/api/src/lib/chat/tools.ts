import { z } from "zod";
import { tool } from "ai";
import { db } from "../db.js";
import { getAttentionData, serializeAttentionForLLM, formatDuration } from "../attention.js";
import { getActiveFocuses, getUserFocusHistory } from "../focus/index.js";

/**
 * Helper to get user's locale settings
 */
async function getUserLocaleSettings(userId: string) {
  const settings = await db.userSettings.findUnique({
    where: { userId },
    select: { locale: true, timezone: true },
  });
  return {
    locale: settings?.locale || "en-US",
    timezone: settings?.timezone || "UTC",
  };
}

/**
 * Create chat tools for the agentic chat.
 * These tools allow the LLM to perform actions during conversation.
 */
export function createChatTools(userId: string) {
  return {
    /**
     * Get the current time using user's locale and timezone
     */
    get_current_time: tool({
      description: "Get the current time. Automatically uses the user's locale and timezone. Use this when the user asks about the current time, date, or needs timestamp information.",
      parameters: z.object({
        format: z.enum(["iso", "human", "unix"]).optional().describe(
          "Output format: 'iso' for ISO 8601, 'human' for human-readable in user's locale (default), 'unix' for Unix timestamp"
        ),
      }),
      execute: async ({ format = "human" }) => {
        const { locale, timezone } = await getUserLocaleSettings(userId);
        const now = new Date();

        let timeStr: string | number;
        let formatDesc: string;

        switch (format) {
          case "human":
            try {
              timeStr = now.toLocaleString(locale, {
                timeZone: timezone,
                dateStyle: "full",
                timeStyle: "long",
              });
              formatDesc = `Human readable (${timezone})`;
            } catch {
              timeStr = now.toUTCString();
              formatDesc = "Human readable UTC";
            }
            break;
          case "unix":
            timeStr = Math.floor(now.getTime() / 1000);
            formatDesc = "Unix timestamp (seconds)";
            break;
          default:
            timeStr = now.toISOString();
            formatDesc = "ISO 8601";
        }

        return {
          time: timeStr,
          format: formatDesc,
          locale,
          timezone,
          utcTime: now.toISOString(),
        };
      },
    }),

    /**
     * Get current weather using user's timezone to infer location
     */
    get_current_weather: tool({
      description: "Get the current weather for the user's location. Use this when the user asks about the weather, temperature, or weather conditions. Can also get weather for a specific city.",
      parameters: z.object({
        city: z.string().optional().describe(
          "City name to get weather for (e.g., 'London', 'New York', 'Tokyo'). If not provided, uses user's timezone to infer location."
        ),
      }),
      execute: async ({ city }) => {
        try {
          const { timezone } = await getUserLocaleSettings(userId);

          // If city is provided, geocode it. Otherwise, infer from timezone.
          let lat: number;
          let lon: number;
          let locationName: string;

          if (city) {
            // Use Open-Meteo geocoding API
            const geoResponse = await fetch(
              `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
            );
            const geoData = await geoResponse.json();

            if (!geoData.results || geoData.results.length === 0) {
              return {
                found: false,
                error: `Could not find location: ${city}`,
              };
            }

            lat = geoData.results[0].latitude;
            lon = geoData.results[0].longitude;
            locationName = `${geoData.results[0].name}, ${geoData.results[0].country}`;
          } else {
            // Infer location from timezone (approximate city centers)
            const timezoneLocations: Record<string, { lat: number; lon: number; name: string }> = {
              "America/New_York": { lat: 40.7128, lon: -74.006, name: "New York, US" },
              "America/Los_Angeles": { lat: 34.0522, lon: -118.2437, name: "Los Angeles, US" },
              "America/Chicago": { lat: 41.8781, lon: -87.6298, name: "Chicago, US" },
              "America/Denver": { lat: 39.7392, lon: -104.9903, name: "Denver, US" },
              "America/Toronto": { lat: 43.6532, lon: -79.3832, name: "Toronto, CA" },
              "America/Vancouver": { lat: 49.2827, lon: -123.1207, name: "Vancouver, CA" },
              "Europe/London": { lat: 51.5074, lon: -0.1278, name: "London, UK" },
              "Europe/Paris": { lat: 48.8566, lon: 2.3522, name: "Paris, FR" },
              "Europe/Berlin": { lat: 52.52, lon: 13.405, name: "Berlin, DE" },
              "Europe/Amsterdam": { lat: 52.3676, lon: 4.9041, name: "Amsterdam, NL" },
              "Europe/Madrid": { lat: 40.4168, lon: -3.7038, name: "Madrid, ES" },
              "Europe/Rome": { lat: 41.9028, lon: 12.4964, name: "Rome, IT" },
              "Europe/Moscow": { lat: 55.7558, lon: 37.6173, name: "Moscow, RU" },
              "Asia/Tokyo": { lat: 35.6762, lon: 139.6503, name: "Tokyo, JP" },
              "Asia/Shanghai": { lat: 31.2304, lon: 121.4737, name: "Shanghai, CN" },
              "Asia/Hong_Kong": { lat: 22.3193, lon: 114.1694, name: "Hong Kong" },
              "Asia/Singapore": { lat: 1.3521, lon: 103.8198, name: "Singapore" },
              "Asia/Dubai": { lat: 25.2048, lon: 55.2708, name: "Dubai, AE" },
              "Asia/Kolkata": { lat: 28.6139, lon: 77.209, name: "New Delhi, IN" },
              "Asia/Seoul": { lat: 37.5665, lon: 126.978, name: "Seoul, KR" },
              "Australia/Sydney": { lat: -33.8688, lon: 151.2093, name: "Sydney, AU" },
              "Australia/Melbourne": { lat: -37.8136, lon: 144.9631, name: "Melbourne, AU" },
              "Pacific/Auckland": { lat: -36.8509, lon: 174.7645, name: "Auckland, NZ" },
              "America/Sao_Paulo": { lat: -23.5505, lon: -46.6333, name: "São Paulo, BR" },
              "America/Mexico_City": { lat: 19.4326, lon: -99.1332, name: "Mexico City, MX" },
              "Africa/Johannesburg": { lat: -26.2041, lon: 28.0473, name: "Johannesburg, ZA" },
              "Africa/Cairo": { lat: 30.0444, lon: 31.2357, name: "Cairo, EG" },
            };

            const location = timezoneLocations[timezone] || { lat: 0, lon: 0, name: "Unknown (use city parameter)" };
            lat = location.lat;
            lon = location.lon;
            locationName = location.name;

            if (lat === 0 && lon === 0) {
              return {
                found: false,
                error: `Could not determine location from timezone: ${timezone}. Please specify a city.`,
                timezone,
              };
            }
          }

          // Fetch weather from Open-Meteo
          const weatherResponse = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m&timezone=auto`
          );
          const weather = await weatherResponse.json();

          if (!weather.current) {
            return {
              found: false,
              error: "Could not fetch weather data",
            };
          }

          // Weather code descriptions
          const weatherCodes: Record<number, string> = {
            0: "Clear sky",
            1: "Mainly clear",
            2: "Partly cloudy",
            3: "Overcast",
            45: "Fog",
            48: "Depositing rime fog",
            51: "Light drizzle",
            53: "Moderate drizzle",
            55: "Dense drizzle",
            61: "Slight rain",
            63: "Moderate rain",
            65: "Heavy rain",
            71: "Slight snow",
            73: "Moderate snow",
            75: "Heavy snow",
            77: "Snow grains",
            80: "Slight rain showers",
            81: "Moderate rain showers",
            82: "Violent rain showers",
            85: "Slight snow showers",
            86: "Heavy snow showers",
            95: "Thunderstorm",
            96: "Thunderstorm with slight hail",
            99: "Thunderstorm with heavy hail",
          };

          const current = weather.current;

          return {
            found: true,
            location: locationName,
            coordinates: { lat, lon },
            temperature: {
              celsius: current.temperature_2m,
              fahrenheit: Math.round(current.temperature_2m * 9 / 5 + 32),
            },
            feelsLike: {
              celsius: current.apparent_temperature,
              fahrenheit: Math.round(current.apparent_temperature * 9 / 5 + 32),
            },
            humidity: current.relative_humidity_2m,
            condition: weatherCodes[current.weather_code] || "Unknown",
            cloudCover: current.cloud_cover,
            wind: {
              speed: current.wind_speed_10m,
              unit: "km/h",
              direction: current.wind_direction_10m,
            },
            precipitation: current.precipitation,
            isDay: current.is_day === 1,
            timestamp: current.time,
          };
        } catch (error) {
          return {
            found: false,
            error: error instanceof Error ? error.message : "Failed to fetch weather",
          };
        }
      },
    }),

    /**
     * Get user's locale and context information
     */
    get_user_context: tool({
      description: "Get the user's locale, timezone, and other context information. Use this when you need to understand the user's location context or personalize responses based on their locale.",
      parameters: z.object({}),
      execute: async () => {
        try {
          const settings = await db.userSettings.findUnique({
            where: { userId },
            select: {
              locale: true,
              timezone: true,
              currentActiveUrl: true,
              currentActiveTitle: true,
            },
          });

          const now = new Date();
          let localTime: string | null = null;

          if (settings?.timezone) {
            try {
              localTime = now.toLocaleString(settings.locale || "en-US", {
                timeZone: settings.timezone,
                dateStyle: "full",
                timeStyle: "short",
              });
            } catch {
              localTime = null;
            }
          }

          return {
            locale: settings?.locale || null,
            timezone: settings?.timezone || null,
            localTime,
            currentPage: settings?.currentActiveUrl ? {
              url: settings.currentActiveUrl,
              title: settings.currentActiveTitle,
            } : null,
          };
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : "Failed to get user context",
          };
        }
      },
    }),

    /**
     * Get the currently active website the user is viewing
     */
    get_active_website: tool({
      description: "Get the website the user is currently viewing in their browser. Use this when the user asks 'what am I looking at', 'what site am I on', 'what's my current page', or similar questions about their current browsing context.",
      parameters: z.object({}),
      execute: async () => {
        try {
          const settings = await db.userSettings.findUnique({
            where: { userId },
            select: {
              currentActiveUrl: true,
              currentActiveTitle: true,
              currentActiveAt: true,
            },
          });

          if (!settings?.currentActiveUrl) {
            return {
              found: false,
              message: "No active website detected. The user may not have any browser tabs open or the extension may not be tracking.",
            };
          }

          const domain = (() => {
            try {
              return new URL(settings.currentActiveUrl).hostname;
            } catch {
              return settings.currentActiveUrl;
            }
          })();

          const activeFor = settings.currentActiveAt
            ? formatDuration(Date.now() - settings.currentActiveAt.getTime())
            : null;

          return {
            found: true,
            url: settings.currentActiveUrl,
            title: settings.currentActiveTitle,
            domain,
            activeFor,
            activeSince: settings.currentActiveAt?.toISOString() || null,
          };
        } catch (error) {
          return {
            found: false,
            error: error instanceof Error ? error.message : "Failed to get active website",
          };
        }
      },
    }),

    /**
     * Get the user's current active focus topics
     */
    get_active_focus: tool({
      description: "Get what the user is currently focused on. This returns the semantic topics/themes the user has been concentrating on based on their browsing activity. Use this when the user asks 'what am I working on', 'what's my current focus', 'what have I been doing', or similar questions about their current work context.",
      parameters: z.object({}),
      execute: async () => {
        try {
          const activeFocuses = await getActiveFocuses(userId);

          if (activeFocuses.length === 0) {
            return {
              found: false,
              message: "No active focus detected. The user may not have been browsing recently or their activity hasn't formed a clear focus pattern yet.",
            };
          }

          return {
            found: true,
            count: activeFocuses.length,
            focuses: activeFocuses.map((focus) => ({
              item: focus.item,
              keywords: focus.keywords,
              startedAt: focus.startedAt.toISOString(),
              duration: formatDuration(Date.now() - focus.startedAt.getTime()),
              lastActivity: focus.lastActivityAt.toISOString(),
              lastActivityAgo: formatDuration(Date.now() - focus.lastActivityAt.getTime()),
            })),
          };
        } catch (error) {
          return {
            found: false,
            error: error instanceof Error ? error.message : "Failed to get active focus",
          };
        }
      },
    }),

    /**
     * Get user's recent browsing attention data with flexible time range
     */
    get_attention_data: tool({
      description: "Get the user's browsing activity and attention data for a specific time period. This includes websites visited, text read, images viewed, and videos watched. Use this when the user asks about what they were reading, watching, browsing, or when you need context about their recent online activity. You can specify the time range in minutes.",
      parameters: z.object({
        minutes: z.number().min(1).max(10080).optional().describe(
          "Number of minutes to look back (1-10080, i.e., up to 7 days). Examples: 5 for last 5 minutes, 30 for last 30 minutes, 120 for last 2 hours. Default is 120 (2 hours)."
        ),
        preset: z.enum(["5m", "15m", "30m", "1h", "2h", "6h", "12h", "1d", "3d", "7d"]).optional().describe(
          "Preset time ranges: '5m' (5 min), '15m' (15 min), '30m' (30 min), '1h' (1 hour), '2h' (2 hours), '6h' (6 hours), '12h' (12 hours), '1d' (1 day), '3d' (3 days), '7d' (7 days). If both minutes and preset are provided, minutes takes precedence."
        ),
      }),
      execute: async ({ minutes, preset }) => {
        try {
          // Calculate time range
          const presetMinutes: Record<string, number> = {
            "5m": 5,
            "15m": 15,
            "30m": 30,
            "1h": 60,
            "2h": 120,
            "6h": 360,
            "12h": 720,
            "1d": 1440,
            "3d": 4320,
            "7d": 10080,
          };

          const lookbackMinutes = minutes ?? (preset ? presetMinutes[preset] : 120);
          const now = new Date();
          const from = new Date(now.getTime() - lookbackMinutes * 60 * 1000);

          const attentionData = await getAttentionData(userId, { from, to: now });

          if (attentionData.pages.length === 0) {
            return {
              found: false,
              message: `No browsing activity found in the last ${formatDuration(lookbackMinutes * 60 * 1000)}.`,
              timeRange: formatDuration(lookbackMinutes * 60 * 1000),
            };
          }

          const serialized = serializeAttentionForLLM(attentionData);

          return {
            found: true,
            timeRange: formatDuration(lookbackMinutes * 60 * 1000),
            data: serialized,
            summary: `Found ${attentionData.pages.length} pages visited in the last ${formatDuration(lookbackMinutes * 60 * 1000)}.`,
            stats: attentionData.summary,
          };
        } catch (error) {
          return {
            found: false,
            error: error instanceof Error ? error.message : "Failed to fetch attention data",
          };
        }
      },
    }),

    /**
     * Get the user's focus history
     */
    get_focus_history: tool({
      description: "Get the user's focus history - what topics they've been working on over time. Use this when the user asks about their past work sessions, productivity patterns, or wants to review what they've been focused on previously.",
      parameters: z.object({
        limit: z.number().min(1).max(50).optional().describe(
          "Maximum number of focus sessions to return (1-50). Default is 10."
        ),
        includeActive: z.boolean().optional().describe(
          "Whether to include currently active focuses. Default is true."
        ),
      }),
      execute: async ({ limit = 10, includeActive = true }) => {
        try {
          const focuses = await getUserFocusHistory(userId, { limit, includeActive });

          if (focuses.length === 0) {
            return {
              found: false,
              message: "No focus history found. The user may not have had any detected focus sessions yet.",
            };
          }

          return {
            found: true,
            count: focuses.length,
            focuses: focuses.map((focus) => ({
              item: focus.item,
              keywords: focus.keywords,
              isActive: focus.isActive,
              startedAt: focus.startedAt.toISOString(),
              endedAt: focus.endedAt?.toISOString() || null,
              duration: focus.endedAt
                ? formatDuration(focus.endedAt.getTime() - focus.startedAt.getTime())
                : formatDuration(Date.now() - focus.startedAt.getTime()) + " (ongoing)",
            })),
          };
        } catch (error) {
          return {
            found: false,
            error: error instanceof Error ? error.message : "Failed to fetch focus history",
          };
        }
      },
    }),

    /**
     * Search browsing history by domain or keyword
     */
    search_browsing_history: tool({
      description: "Search the user's browsing history for specific domains or keywords. Use this when the user asks about visits to a specific website, or wants to find pages related to a particular topic.",
      parameters: z.object({
        query: z.string().describe(
          "Search query - can be a domain name (e.g., 'github.com'), partial URL, or keyword to search in page titles."
        ),
        searchIn: z.enum(["url", "title", "both"]).optional().describe(
          "Where to search: 'url' for URLs only, 'title' for page titles only, 'both' for both (default)."
        ),
        minutes: z.number().min(1).max(10080).optional().describe(
          "Number of minutes to look back (1-10080). Default is 1440 (24 hours)."
        ),
        limit: z.number().min(1).max(50).optional().describe(
          "Maximum number of results to return (1-50). Default is 20."
        ),
      }),
      execute: async ({ query, searchIn = "both", minutes = 1440, limit = 20 }) => {
        try {
          const now = new Date();
          const from = new Date(now.getTime() - minutes * 60 * 1000);

          // Build where clause based on search type
          const searchConditions: any[] = [];

          if (searchIn === "url" || searchIn === "both") {
            searchConditions.push({ url: { contains: query, mode: "insensitive" } });
          }
          if (searchIn === "title" || searchIn === "both") {
            searchConditions.push({ title: { contains: query, mode: "insensitive" } });
          }

          const visits = await db.websiteVisit.findMany({
            where: {
              userId,
              openedAt: { gte: from, lte: now },
              OR: searchConditions,
            },
            orderBy: { openedAt: "desc" },
            take: limit,
          });

          if (visits.length === 0) {
            return {
              found: false,
              message: `No pages matching "${query}" found in the last ${formatDuration(minutes * 60 * 1000)}.`,
              query,
              timeRange: formatDuration(minutes * 60 * 1000),
            };
          }

          return {
            found: true,
            count: visits.length,
            query,
            timeRange: formatDuration(minutes * 60 * 1000),
            results: visits.map((visit) => ({
              url: visit.url,
              title: visit.title,
              domain: (() => {
                try {
                  return new URL(visit.url).hostname;
                } catch {
                  return visit.url;
                }
              })(),
              visitedAt: visit.openedAt.toISOString(),
              activeTime: formatDuration(visit.activeTime),
              summary: visit.summary,
            })),
          };
        } catch (error) {
          return {
            found: false,
            error: error instanceof Error ? error.message : "Failed to search browsing history",
          };
        }
      },
    }),

    /**
     * Get YouTube watch history
     */
    get_youtube_history: tool({
      description: "Get the user's YouTube watch history. Use this when the user asks about videos they've watched, YouTube activity, or wants to recall a specific video.",
      parameters: z.object({
        minutes: z.number().min(1).max(10080).optional().describe(
          "Number of minutes to look back (1-10080). Default is 1440 (24 hours)."
        ),
        limit: z.number().min(1).max(50).optional().describe(
          "Maximum number of videos to return (1-50). Default is 20."
        ),
      }),
      execute: async ({ minutes = 1440, limit = 20 }) => {
        try {
          const now = new Date();
          const from = new Date(now.getTime() - minutes * 60 * 1000);

          const youtubeAttentions = await db.youtubeAttention.findMany({
            where: {
              userId,
              timestamp: { gte: from, lte: now },
            },
            orderBy: { timestamp: "desc" },
          });

          // Group by video ID
          const videoMap = new Map<
            string,
            {
              videoId: string | null;
              title: string | null;
              channelName: string | null;
              url: string | null;
              activeWatchTime: number;
              captions: string[];
              firstSeen: Date;
              lastSeen: Date;
            }
          >();

          for (const yt of youtubeAttentions) {
            const key = yt.videoId || yt.url || `unknown-${yt.id}`;
            if (!videoMap.has(key)) {
              videoMap.set(key, {
                videoId: yt.videoId,
                title: yt.title,
                channelName: yt.channelName,
                url: yt.url,
                activeWatchTime: 0,
                captions: [],
                firstSeen: yt.timestamp,
                lastSeen: yt.timestamp,
              });
            }
            const video = videoMap.get(key)!;

            if (yt.event === "active-watch-time-update" && yt.activeWatchTime !== null) {
              video.activeWatchTime = Math.max(video.activeWatchTime, yt.activeWatchTime);
            }
            if (yt.event === "caption" && yt.caption) {
              video.captions.push(yt.caption);
            }
            if (yt.title && !video.title) video.title = yt.title;
            if (yt.channelName && !video.channelName) video.channelName = yt.channelName;
            if (yt.url && !video.url) video.url = yt.url;
            if (yt.timestamp < video.firstSeen) video.firstSeen = yt.timestamp;
            if (yt.timestamp > video.lastSeen) video.lastSeen = yt.timestamp;
          }

          const videos = Array.from(videoMap.values())
            .sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime())
            .slice(0, limit);

          if (videos.length === 0) {
            return {
              found: false,
              message: `No YouTube videos watched in the last ${formatDuration(minutes * 60 * 1000)}.`,
              timeRange: formatDuration(minutes * 60 * 1000),
            };
          }

          return {
            found: true,
            count: videos.length,
            timeRange: formatDuration(minutes * 60 * 1000),
            videos: videos.map((video) => ({
              title: video.title,
              channelName: video.channelName,
              videoId: video.videoId,
              url: video.url || (video.videoId ? `https://www.youtube.com/watch?v=${video.videoId}` : null),
              watchTime: formatDuration(video.activeWatchTime),
              watchedAt: video.lastSeen.toISOString(),
              captionSummary: video.captions.length > 0
                ? video.captions.slice(0, 10).join(" ").slice(0, 500) + (video.captions.length > 10 ? "..." : "")
                : null,
            })),
          };
        } catch (error) {
          return {
            found: false,
            error: error instanceof Error ? error.message : "Failed to fetch YouTube history",
          };
        }
      },
    }),

    /**
     * Get reading activity (text attention)
     */
    get_reading_activity: tool({
      description: "Get what the user has been reading online. This provides text excerpts and reading statistics. Use this when the user asks about articles they've read, text content they've engaged with, or wants to recall something they read.",
      parameters: z.object({
        minutes: z.number().min(1).max(10080).optional().describe(
          "Number of minutes to look back (1-10080). Default is 120 (2 hours)."
        ),
        domain: z.string().optional().describe(
          "Filter to a specific domain (e.g., 'medium.com', 'news.ycombinator.com')."
        ),
        limit: z.number().min(1).max(100).optional().describe(
          "Maximum number of text excerpts to return (1-100). Default is 30."
        ),
      }),
      execute: async ({ minutes = 120, domain, limit = 30 }) => {
        try {
          const now = new Date();
          const from = new Date(now.getTime() - minutes * 60 * 1000);

          const whereClause: any = {
            userId,
            timestamp: { gte: from, lte: now },
          };

          if (domain) {
            whereClause.url = { contains: domain, mode: "insensitive" };
          }

          const textAttentions = await db.textAttention.findMany({
            where: whereClause,
            orderBy: { timestamp: "desc" },
            take: limit,
          });

          if (textAttentions.length === 0) {
            return {
              found: false,
              message: `No reading activity found in the last ${formatDuration(minutes * 60 * 1000)}${domain ? ` on ${domain}` : ""}.`,
              timeRange: formatDuration(minutes * 60 * 1000),
            };
          }

          const totalWordsRead = textAttentions.reduce((sum, t) => sum + t.wordsRead, 0);

          // Group by URL for better organization
          const byUrl = new Map<string, { url: string; domain: string; totalWords: number; excerpts: string[] }>();
          for (const t of textAttentions) {
            const urlDomain = (() => {
              try {
                return new URL(t.url).hostname;
              } catch {
                return t.url;
              }
            })();

            if (!byUrl.has(t.url)) {
              byUrl.set(t.url, { url: t.url, domain: urlDomain, totalWords: 0, excerpts: [] });
            }
            const entry = byUrl.get(t.url)!;
            entry.totalWords += t.wordsRead;
            if (entry.excerpts.length < 3) {
              entry.excerpts.push(t.text.slice(0, 300) + (t.text.length > 300 ? "..." : ""));
            }
          }

          return {
            found: true,
            timeRange: formatDuration(minutes * 60 * 1000),
            totalWordsRead,
            pagesRead: byUrl.size,
            pages: Array.from(byUrl.values()).map((page) => ({
              url: page.url,
              domain: page.domain,
              wordsRead: page.totalWords,
              excerpts: page.excerpts,
            })),
          };
        } catch (error) {
          return {
            found: false,
            error: error instanceof Error ? error.message : "Failed to fetch reading activity",
          };
        }
      },
    }),
  };
}

export type ChatTools = ReturnType<typeof createChatTools>;

/**
 * Format a human-readable message for a tool result.
 * Used to show what data was retrieved by each tool.
 */
export function formatToolResultMessage(toolName: string, result: unknown): string {
  const r = result as Record<string, unknown>;

  // Handle error cases
  if (r.error) {
    return `Error: ${r.error}`;
  }

  switch (toolName) {
    case "get_current_time":
      return `Current time: ${r.time} (${r.timezone})`;

    case "get_current_weather":
      if (!r.found) return r.message as string || "Weather not found";
      const temp = r.temperature as { celsius: number; fahrenheit: number };
      return `Weather in ${r.location}: ${r.condition}, ${temp.celsius}°C / ${temp.fahrenheit}°F`;

    case "get_user_context":
      return `User context: ${r.timezone || "unknown timezone"}, ${r.locale || "unknown locale"}`;

    case "get_active_website":
      if (!r.found) return r.message as string || "No active website";
      return `Active website: ${r.title || r.domain || r.url}`;

    case "get_active_focus":
      if (!r.found) return r.message as string || "No active focus";
      const focuses = r.focuses as Array<{ item: string }>;
      const focusItems = focuses.slice(0, 2).map((f) => f.item).join(", ");
      return `Active focus: ${focusItems}${focuses.length > 2 ? ` (+${focuses.length - 2} more)` : ""}`;

    case "get_attention_data":
      if (!r.found) return r.message as string || "No attention data";
      const stats = r.stats as { totalPages?: number; totalActiveTime?: number };
      return `Browsing activity: ${stats.totalPages || 0} pages in ${r.timeRange}`;

    case "get_focus_history":
      if (!r.found) return r.message as string || "No focus history";
      return `Focus history: ${r.count} sessions retrieved`;

    case "search_browsing_history":
      if (!r.found) return r.message as string || "No results";
      return `Search results: ${r.count} pages matching "${r.query}"`;

    case "get_youtube_history":
      if (!r.found) return r.message as string || "No YouTube history";
      return `YouTube history: ${r.count} videos in ${r.timeRange}`;

    case "get_reading_activity":
      if (!r.found) return r.message as string || "No reading activity";
      return `Reading activity: ${r.totalWordsRead} words across ${r.pagesRead} pages`;

    default:
      return `Tool ${toolName} completed`;
  }
}
