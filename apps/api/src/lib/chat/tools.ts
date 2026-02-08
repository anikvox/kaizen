import { z } from "zod";
import { tool } from "ai";
import { calc } from "a-calc";
import { db } from "../db.js";
import {
  getAttentionData,
  serializeAttentionForLLM,
  formatDuration,
} from "../attention.js";
import { getActiveFocuses, getUserFocusHistory } from "../focus/index.js";

/**
 * Helper to get user's location settings
 */
async function getUserLocationSettings(userId: string) {
  const settings = await db.userSettings.findUnique({
    where: { userId },
    select: { location: true, timezone: true },
  });
  return {
    location: settings?.location || null,
    timezone: settings?.timezone || null,
  };
}

/**
 * Geocode a city name and get its timezone (with retry)
 */
async function geocodeCity(
  city: string,
  retries = 2,
): Promise<{
  found: boolean;
  lat?: number;
  lon?: number;
  name?: string;
  timezone?: string;
  error?: string;
}> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
  console.log(`[Geocode] Fetching: ${url}`);

  let lastError: string = "Unknown error";

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[Geocode] Retry attempt ${attempt}...`);
        await new Promise((r) => setTimeout(r, 500 * attempt)); // Backoff
      }

      const geoResponse = await fetch(url, {
        headers: {
          "User-Agent": "Kaizen/1.0",
        },
      });

      if (!geoResponse.ok) {
        console.error(
          `[Geocode] HTTP error: ${geoResponse.status} ${geoResponse.statusText}`,
        );
        lastError = `Geocoding API returned ${geoResponse.status}`;
        continue;
      }

      const geoData = await geoResponse.json();
      console.log(`[Geocode] Response:`, JSON.stringify(geoData).slice(0, 200));

      if (!geoData.results || geoData.results.length === 0) {
        return { found: false, error: `Could not find location: ${city}` };
      }

      const result = geoData.results[0];
      return {
        found: true,
        lat: result.latitude,
        lon: result.longitude,
        name: `${result.name}, ${result.country}`,
        timezone: result.timezone,
      };
    } catch (error) {
      console.error(`[Geocode] Fetch error (attempt ${attempt + 1}):`, error);
      lastError = error instanceof Error ? error.message : "Geocoding failed";
    }
  }

  return { found: false, error: lastError };
}

/**
 * Create chat tools for the agentic chat.
 * These tools allow the LLM to perform actions during conversation.
 */
export function createChatTools(userId: string) {
  return {
    /**
     * Get user's preferred translation language
     */
    get_translation_language: tool({
      description:
        "Get the user's preferred language for translations. Use this before translating if you need to check their preference.",
      parameters: z.object({}),
      execute: async () => {
        const settings = await db.userSettings.findUnique({
          where: { userId },
          select: { preferredTranslationLanguage: true },
        });

        if (settings?.preferredTranslationLanguage) {
          return {
            found: true,
            language: settings.preferredTranslationLanguage,
          };
        }

        return {
          found: false,
          message:
            "No preferred translation language set. Ask the user what language they want.",
        };
      },
    }),

    /**
     * Save user's preferred translation language
     */
    set_translation_language: tool({
      description:
        "Save the user's preferred language for translations. Use this when the user tells you what language they want translations in.",
      parameters: z.object({
        language: z
          .string()
          .describe(
            "The language name (e.g., 'Spanish', 'French', 'Japanese', 'German')",
          ),
      }),
      execute: async ({ language }) => {
        await db.userSettings.upsert({
          where: { userId },
          create: {
            userId,
            preferredTranslationLanguage: language,
          },
          update: {
            preferredTranslationLanguage: language,
          },
        });

        return {
          success: true,
          language,
          message: `Saved ${language} as your preferred translation language. Future translations will use this language by default.`,
        };
      },
    }),

    /**
     * Get the current time for a location
     */
    get_current_time: tool({
      description:
        "Get the current time for a city/location. IMPORTANT: If the user mentions a specific city (e.g., 'time in Tokyo'), you MUST pass that city name as the 'city' parameter. Only omit the city parameter if the user doesn't specify one.",
      parameters: z.object({
        city: z
          .string()
          .optional()
          .describe(
            "The city name mentioned by the user. REQUIRED if user specifies a city (e.g., 'Tokyo' from 'time in Tokyo'). Only omit if user doesn't specify a city.",
          ),
      }),
      execute: async ({ city }) => {
        const { location, timezone } = await getUserLocationSettings(userId);
        const now = new Date();

        // Determine which city/timezone to use
        let targetCity = city || location;
        let targetTimezone = timezone;

        // If no city provided and no saved location, ask user
        if (!targetCity) {
          return {
            needsLocation: true,
            message:
              "I don't know your location yet. Please tell me which city you're in so I can give you the correct time.",
          };
        }

        // If city is provided (or using saved location but no timezone), geocode to get timezone
        if (city || !targetTimezone) {
          const geo = await geocodeCity(targetCity);
          if (!geo.found) {
            return { found: false, error: geo.error };
          }
          targetCity = geo.name!;
          targetTimezone = geo.timezone!;
        }

        try {
          const timeStr = now.toLocaleString("en-US", {
            timeZone: targetTimezone,
            dateStyle: "full",
            timeStyle: "long",
          });

          return {
            found: true,
            time: timeStr,
            location: targetCity,
            timezone: targetTimezone,
            utcTime: now.toISOString(),
          };
        } catch {
          return {
            found: false,
            error: `Invalid timezone: ${targetTimezone}`,
          };
        }
      },
    }),

    /**
     * Get current weather for a location
     */
    get_current_weather: tool({
      description:
        "Get the current weather for a city/location. IMPORTANT: If the user mentions a specific city (e.g., 'weather in Delhi'), you MUST pass that city name as the 'city' parameter. Only omit the city parameter if the user doesn't specify one.",
      parameters: z.object({
        city: z
          .string()
          .optional()
          .describe(
            "The city name mentioned by the user. REQUIRED if user specifies a city (e.g., 'Delhi' from 'weather in Delhi'). Only omit if user doesn't specify a city.",
          ),
      }),
      execute: async ({ city }) => {
        try {
          const { location } = await getUserLocationSettings(userId);

          // Determine which city to use
          const targetCity = city || location;

          // If no city provided and no saved location, ask user
          if (!targetCity) {
            return {
              needsLocation: true,
              message:
                "I don't know your location yet. Please tell me which city you're in so I can give you the weather.",
            };
          }

          // Geocode the city
          const geo = await geocodeCity(targetCity);
          if (!geo.found) {
            return { found: false, error: geo.error };
          }

          const lat = geo.lat!;
          const lon = geo.lon!;
          const locationName = geo.name!;

          // Fetch weather from Open-Meteo
          const weatherResponse = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m&timezone=auto`,
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
              fahrenheit: Math.round((current.temperature_2m * 9) / 5 + 32),
            },
            feelsLike: {
              celsius: current.apparent_temperature,
              fahrenheit: Math.round(
                (current.apparent_temperature * 9) / 5 + 32,
              ),
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
            error:
              error instanceof Error
                ? error.message
                : "Failed to fetch weather",
          };
        }
      },
    }),

    /**
     * Save user's location for future time/weather requests
     */
    set_user_location: tool({
      description:
        "Save the user's location (city) for future time and weather requests. Use this after the user tells you their location.",
      parameters: z.object({
        city: z
          .string()
          .optional()
          .describe(
            "The city name to save as the user's location (e.g., 'Tokyo', 'New York', 'London')",
          ),
        location: z
          .string()
          .optional()
          .describe("Alternative parameter for city name"),
      }),
      execute: async ({ city, location }) => {
        // Accept either 'city' or 'location' parameter (Gemini sometimes uses 'location')
        const cityName = city || location;
        if (!cityName) {
          return { success: false, error: "No city provided" };
        }

        // Geocode to validate and get timezone
        const geo = await geocodeCity(cityName);
        if (!geo.found) {
          return { success: false, error: geo.error };
        }

        // Save to user settings
        await db.userSettings.upsert({
          where: { userId },
          create: {
            userId,
            location: geo.name!,
            timezone: geo.timezone!,
          },
          update: {
            location: geo.name!,
            timezone: geo.timezone!,
          },
        });

        // Also return current time since that's often why location is being set
        const now = new Date();
        let currentTime: string | null = null;
        try {
          currentTime = now.toLocaleString("en-US", {
            timeZone: geo.timezone!,
            dateStyle: "full",
            timeStyle: "long",
          });
        } catch {
          // Ignore timezone errors
        }

        return {
          success: true,
          location: geo.name,
          timezone: geo.timezone,
          currentTime,
          message: `Saved your location as ${geo.name}. I'll use this for future time and weather requests.`,
        };
      },
    }),

    /**
     * Get user's location and context information
     */
    get_user_context: tool({
      description:
        "Get the user's saved location, timezone, and other context information. Use this when you need to understand the user's location context.",
      parameters: z.object({}),
      execute: async () => {
        try {
          const settings = await db.userSettings.findUnique({
            where: { userId },
            select: {
              location: true,
              timezone: true,
              currentActiveUrl: true,
              currentActiveTitle: true,
            },
          });

          const now = new Date();
          let localTime: string | null = null;

          if (settings?.timezone) {
            try {
              localTime = now.toLocaleString("en-US", {
                timeZone: settings.timezone,
                dateStyle: "full",
                timeStyle: "short",
              });
            } catch {
              localTime = null;
            }
          }

          return {
            location: settings?.location || null,
            timezone: settings?.timezone || null,
            localTime,
            hasLocation: !!settings?.location,
            currentPage: settings?.currentActiveUrl
              ? {
                  url: settings.currentActiveUrl,
                  title: settings.currentActiveTitle,
                }
              : null,
          };
        } catch (error) {
          return {
            error:
              error instanceof Error
                ? error.message
                : "Failed to get user context",
          };
        }
      },
    }),

    /**
     * Get the currently active website the user is viewing
     */
    get_active_website: tool({
      description:
        "Get the website the user is currently viewing in their browser. Use this when the user asks 'what am I looking at', 'what site am I on', 'what's my current page', or similar questions about their current browsing context.",
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
              message:
                "No active website detected. The user may not have any browser tabs open or the extension may not be tracking.",
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
            error:
              error instanceof Error
                ? error.message
                : "Failed to get active website",
          };
        }
      },
    }),

    /**
     * Get the user's current active focus topics
     */
    get_active_focus: tool({
      description:
        "Get what the user is currently focused on. This returns the semantic topics/themes the user has been concentrating on based on their browsing activity. Use this when the user asks 'what am I working on', 'what's my current focus', 'what have I been doing', or similar questions about their current work context.",
      parameters: z.object({}),
      execute: async () => {
        try {
          const activeFocuses = await getActiveFocuses(userId);

          if (activeFocuses.length === 0) {
            return {
              found: false,
              message:
                "No active focus detected. The user may not have been browsing recently or their activity hasn't formed a clear focus pattern yet.",
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
              lastActivityAgo: formatDuration(
                Date.now() - focus.lastActivityAt.getTime(),
              ),
            })),
          };
        } catch (error) {
          return {
            found: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to get active focus",
          };
        }
      },
    }),

    /**
     * Get user's recent browsing attention data with flexible time range
     */
    get_attention_data: tool({
      description:
        "Get the user's browsing activity and attention data for a specific time period. This includes websites visited, text read, images viewed, and videos watched. Use this when the user asks about what they were reading, watching, browsing, or when you need context about their recent online activity. You can specify the time range in minutes.",
      parameters: z.object({
        minutes: z
          .number()
          .min(1)
          .max(10080)
          .optional()
          .describe(
            "Number of minutes to look back (1-10080, i.e., up to 7 days). Examples: 5 for last 5 minutes, 30 for last 30 minutes, 120 for last 2 hours. Default is 120 (2 hours).",
          ),
        preset: z
          .enum(["5m", "15m", "30m", "1h", "2h", "6h", "12h", "1d", "3d", "7d"])
          .optional()
          .describe(
            "Preset time ranges: '5m' (5 min), '15m' (15 min), '30m' (30 min), '1h' (1 hour), '2h' (2 hours), '6h' (6 hours), '12h' (12 hours), '1d' (1 day), '3d' (3 days), '7d' (7 days). If both minutes and preset are provided, minutes takes precedence.",
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

          // Calculate lookbackMinutes with fallback validation
          let lookbackMinutes: number;
          if (typeof minutes === "number" && !isNaN(minutes) && minutes > 0) {
            lookbackMinutes = minutes;
          } else if (preset && presetMinutes[preset]) {
            lookbackMinutes = presetMinutes[preset];
          } else {
            // Default to 2 hours if invalid input
            lookbackMinutes = 120;
          }

          const now = new Date();
          const from = new Date(now.getTime() - lookbackMinutes * 60 * 1000);

          // Validate the resulting date
          if (isNaN(from.getTime())) {
            return {
              found: false,
              error: "Failed to calculate time range. Please try again.",
            };
          }

          const attentionData = await getAttentionData(userId, {
            from,
            to: now,
          });

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
            error:
              error instanceof Error
                ? error.message
                : "Failed to fetch attention data",
          };
        }
      },
    }),

    /**
     * Get the user's focus history
     */
    get_focus_history: tool({
      description:
        "Get the user's focus history - what topics they've been working on over time. Use this when the user asks about their past work sessions, productivity patterns, or wants to review what they've been focused on previously.",
      parameters: z.object({
        limit: z
          .number()
          .min(1)
          .max(50)
          .optional()
          .describe(
            "Maximum number of focus sessions to return (1-50). Default is 10.",
          ),
        includeActive: z
          .boolean()
          .optional()
          .describe(
            "Whether to include currently active focuses. Default is true.",
          ),
      }),
      execute: async ({ limit = 10, includeActive = true }) => {
        try {
          const focuses = await getUserFocusHistory(userId, {
            limit,
            includeActive,
          });

          if (focuses.length === 0) {
            return {
              found: false,
              message:
                "No focus history found. The user may not have had any detected focus sessions yet.",
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
                ? formatDuration(
                    focus.endedAt.getTime() - focus.startedAt.getTime(),
                  )
                : formatDuration(Date.now() - focus.startedAt.getTime()) +
                  " (ongoing)",
            })),
          };
        } catch (error) {
          return {
            found: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to fetch focus history",
          };
        }
      },
    }),

    /**
     * Search browsing history by domain or keyword
     */
    search_browsing_history: tool({
      description:
        "Search the user's browsing history for specific domains or keywords. Use this when the user asks about visits to a specific website, or wants to find pages related to a particular topic.",
      parameters: z.object({
        query: z
          .string()
          .describe(
            "Search query - can be a domain name (e.g., 'github.com'), partial URL, or keyword to search in page titles.",
          ),
        searchIn: z
          .enum(["url", "title", "both"])
          .optional()
          .describe(
            "Where to search: 'url' for URLs only, 'title' for page titles only, 'both' for both (default).",
          ),
        minutes: z
          .number()
          .min(1)
          .max(10080)
          .optional()
          .describe(
            "Number of minutes to look back (1-10080). Default is 1440 (24 hours).",
          ),
        limit: z
          .number()
          .min(1)
          .max(50)
          .optional()
          .describe(
            "Maximum number of results to return (1-50). Default is 20.",
          ),
      }),
      execute: async ({
        query,
        searchIn = "both",
        minutes = 1440,
        limit = 20,
      }) => {
        try {
          const now = new Date();
          const from = new Date(now.getTime() - minutes * 60 * 1000);

          // Build where clause based on search type
          const searchConditions: any[] = [];

          if (searchIn === "url" || searchIn === "both") {
            searchConditions.push({
              url: { contains: query, mode: "insensitive" },
            });
          }
          if (searchIn === "title" || searchIn === "both") {
            searchConditions.push({
              title: { contains: query, mode: "insensitive" },
            });
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
            error:
              error instanceof Error
                ? error.message
                : "Failed to search browsing history",
          };
        }
      },
    }),

    /**
     * Get YouTube watch history
     */
    get_youtube_history: tool({
      description:
        "Get the user's YouTube watch history. Use this when the user asks about videos they've watched, YouTube activity, or wants to recall a specific video.",
      parameters: z.object({
        minutes: z
          .number()
          .min(1)
          .max(10080)
          .optional()
          .describe(
            "Number of minutes to look back (1-10080). Default is 1440 (24 hours).",
          ),
        limit: z
          .number()
          .min(1)
          .max(50)
          .optional()
          .describe(
            "Maximum number of videos to return (1-50). Default is 20.",
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

            if (
              yt.event === "active-watch-time-update" &&
              yt.activeWatchTime !== null
            ) {
              video.activeWatchTime = Math.max(
                video.activeWatchTime,
                yt.activeWatchTime,
              );
            }
            if (yt.event === "caption" && yt.caption) {
              video.captions.push(yt.caption);
            }
            if (yt.title && !video.title) video.title = yt.title;
            if (yt.channelName && !video.channelName)
              video.channelName = yt.channelName;
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
              url:
                video.url ||
                (video.videoId
                  ? `https://www.youtube.com/watch?v=${video.videoId}`
                  : null),
              watchTime: formatDuration(video.activeWatchTime),
              watchedAt: video.lastSeen.toISOString(),
              captionSummary:
                video.captions.length > 0
                  ? video.captions.slice(0, 10).join(" ").slice(0, 500) +
                    (video.captions.length > 10 ? "..." : "")
                  : null,
            })),
          };
        } catch (error) {
          return {
            found: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to fetch YouTube history",
          };
        }
      },
    }),

    /**
     * Get reading activity (text attention)
     */
    get_reading_activity: tool({
      description:
        "Get what the user has been reading online. This provides text excerpts and reading statistics. Use this when the user asks about articles they've read, text content they've engaged with, or wants to recall something they read.",
      parameters: z.object({
        minutes: z
          .number()
          .min(1)
          .max(10080)
          .optional()
          .describe(
            "Number of minutes to look back (1-10080). Default is 120 (2 hours).",
          ),
        domain: z
          .string()
          .optional()
          .describe(
            "Filter to a specific domain (e.g., 'medium.com', 'news.ycombinator.com').",
          ),
        limit: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .describe(
            "Maximum number of text excerpts to return (1-100). Default is 30.",
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

          const totalWordsRead = textAttentions.reduce(
            (sum, t) => sum + t.wordsRead,
            0,
          );

          // Group by URL for better organization
          const byUrl = new Map<
            string,
            {
              url: string;
              domain: string;
              totalWords: number;
              excerpts: string[];
            }
          >();
          for (const t of textAttentions) {
            const urlDomain = (() => {
              try {
                return new URL(t.url).hostname;
              } catch {
                return t.url;
              }
            })();

            if (!byUrl.has(t.url)) {
              byUrl.set(t.url, {
                url: t.url,
                domain: urlDomain,
                totalWords: 0,
                excerpts: [],
              });
            }
            const entry = byUrl.get(t.url)!;
            entry.totalWords += t.wordsRead;
            if (entry.excerpts.length < 3) {
              entry.excerpts.push(
                t.text.slice(0, 300) + (t.text.length > 300 ? "..." : ""),
              );
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
            error:
              error instanceof Error
                ? error.message
                : "Failed to fetch reading activity",
          };
        }
      },
    }),

    /**
     * Get top domains visited by the user
     */
    get_top_domains: tool({
      description:
        "Get the most visited domains/websites by the user in a time period. Use this when the user asks about their most visited sites, where they spend most time online, or wants to see their browsing habits by domain.",
      parameters: z.object({
        minutes: z
          .number()
          .min(1)
          .max(10080)
          .optional()
          .describe(
            "Number of minutes to look back (1-10080). Default is 1440 (24 hours).",
          ),
        limit: z
          .number()
          .min(1)
          .max(50)
          .optional()
          .describe(
            "Maximum number of domains to return (1-50). Default is 10.",
          ),
        sortBy: z
          .enum(["visits", "time", "words"])
          .optional()
          .describe(
            "Sort by: 'visits' (number of page visits), 'time' (total active time), or 'words' (words read). Default is 'time'.",
          ),
      }),
      execute: async ({ minutes = 1440, limit = 10, sortBy = "time" }) => {
        try {
          const now = new Date();
          const from = new Date(now.getTime() - minutes * 60 * 1000);

          // Fetch website visits
          const visits = await db.websiteVisit.findMany({
            where: {
              userId,
              openedAt: { gte: from, lte: now },
            },
          });

          // Fetch text attention for word counts
          const textAttentions = await db.textAttention.findMany({
            where: {
              userId,
              timestamp: { gte: from, lte: now },
            },
          });

          // Aggregate by domain
          const domainStats = new Map<
            string,
            {
              domain: string;
              visits: number;
              totalTime: number;
              wordsRead: number;
              pages: Set<string>;
            }
          >();

          for (const visit of visits) {
            const domain = (() => {
              try {
                return new URL(visit.url).hostname;
              } catch {
                return visit.url;
              }
            })();

            if (!domainStats.has(domain)) {
              domainStats.set(domain, {
                domain,
                visits: 0,
                totalTime: 0,
                wordsRead: 0,
                pages: new Set(),
              });
            }
            const stats = domainStats.get(domain)!;
            stats.visits++;
            stats.totalTime += visit.activeTime;
            stats.pages.add(visit.url);
          }

          // Add word counts
          for (const text of textAttentions) {
            const domain = (() => {
              try {
                return new URL(text.url).hostname;
              } catch {
                return text.url;
              }
            })();

            if (domainStats.has(domain)) {
              domainStats.get(domain)!.wordsRead += text.wordsRead;
            }
          }

          // Sort and limit
          const sortedDomains = Array.from(domainStats.values())
            .sort((a, b) => {
              if (sortBy === "visits") return b.visits - a.visits;
              if (sortBy === "words") return b.wordsRead - a.wordsRead;
              return b.totalTime - a.totalTime;
            })
            .slice(0, limit);

          if (sortedDomains.length === 0) {
            return {
              found: false,
              message: `No browsing activity found in the last ${formatDuration(minutes * 60 * 1000)}.`,
              timeRange: formatDuration(minutes * 60 * 1000),
            };
          }

          return {
            found: true,
            timeRange: formatDuration(minutes * 60 * 1000),
            sortedBy: sortBy,
            domains: sortedDomains.map((d) => ({
              domain: d.domain,
              visits: d.visits,
              uniquePages: d.pages.size,
              totalTime: formatDuration(d.totalTime),
              totalTimeMs: d.totalTime,
              wordsRead: d.wordsRead,
            })),
          };
        } catch (error) {
          return {
            found: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to fetch top domains",
          };
        }
      },
    }),

    /**
     * Get browsing patterns and habits
     */
    get_browsing_patterns: tool({
      description:
        "Analyze the user's browsing patterns including peak activity hours, session durations, and browsing habits. Use this when the user asks about their browsing habits, when they're most active online, or wants insights into their internet usage patterns.",
      parameters: z.object({
        minutes: z
          .number()
          .min(60)
          .max(10080)
          .optional()
          .describe(
            "Number of minutes to analyze (60-10080). Default is 1440 (24 hours). Minimum 1 hour for meaningful patterns.",
          ),
      }),
      execute: async ({ minutes = 1440 }) => {
        try {
          const now = new Date();
          const from = new Date(now.getTime() - minutes * 60 * 1000);

          const visits = await db.websiteVisit.findMany({
            where: {
              userId,
              openedAt: { gte: from, lte: now },
            },
            orderBy: { openedAt: "asc" },
          });

          if (visits.length === 0) {
            return {
              found: false,
              message: `No browsing activity found in the last ${formatDuration(minutes * 60 * 1000)}.`,
              timeRange: formatDuration(minutes * 60 * 1000),
            };
          }

          // Analyze hourly activity
          const hourlyActivity = new Array(24).fill(0);
          const hourlyTime = new Array(24).fill(0);
          for (const visit of visits) {
            const hour = visit.openedAt.getHours();
            hourlyActivity[hour]++;
            hourlyTime[hour] += visit.activeTime;
          }

          // Find peak hours
          const peakActivityHour = hourlyActivity.indexOf(
            Math.max(...hourlyActivity),
          );
          const peakTimeHour = hourlyTime.indexOf(Math.max(...hourlyTime));

          // Calculate session patterns (gap of 30+ minutes = new session)
          const sessions: { start: Date; end: Date; pages: number }[] = [];
          let currentSession = {
            start: visits[0].openedAt,
            end: visits[0].openedAt,
            pages: 1,
          };

          for (let i = 1; i < visits.length; i++) {
            const gap =
              visits[i].openedAt.getTime() - visits[i - 1].openedAt.getTime();
            if (gap > 30 * 60 * 1000) {
              // 30 minute gap
              sessions.push({ ...currentSession });
              currentSession = {
                start: visits[i].openedAt,
                end: visits[i].openedAt,
                pages: 1,
              };
            } else {
              currentSession.end = visits[i].openedAt;
              currentSession.pages++;
            }
          }
          sessions.push(currentSession);

          // Calculate average session length
          const sessionLengths = sessions.map(
            (s) => s.end.getTime() - s.start.getTime(),
          );
          const avgSessionLength =
            sessionLengths.reduce((a, b) => a + b, 0) / sessions.length;

          // Categorize domains
          const domainCategories = new Map<string, number>();
          for (const visit of visits) {
            const domain = (() => {
              try {
                return new URL(visit.url).hostname;
              } catch {
                return "other";
              }
            })();

            // Simple categorization based on domain
            let category = "other";
            if (
              domain.includes("youtube") ||
              domain.includes("netflix") ||
              domain.includes("twitch")
            )
              category = "video";
            else if (
              domain.includes("twitter") ||
              domain.includes("facebook") ||
              domain.includes("instagram") ||
              domain.includes("reddit") ||
              domain.includes("linkedin")
            )
              category = "social";
            else if (
              domain.includes("github") ||
              domain.includes("stackoverflow") ||
              domain.includes("gitlab")
            )
              category = "development";
            else if (
              domain.includes("docs.") ||
              domain.includes("documentation") ||
              domain.includes("wiki")
            )
              category = "documentation";
            else if (domain.includes("news") || domain.includes("medium"))
              category = "news/articles";
            else if (
              domain.includes("mail") ||
              domain.includes("gmail") ||
              domain.includes("outlook")
            )
              category = "email";
            else if (
              domain.includes("google") ||
              domain.includes("bing") ||
              domain.includes("duckduckgo")
            )
              category = "search";

            domainCategories.set(
              category,
              (domainCategories.get(category) || 0) + 1,
            );
          }

          return {
            found: true,
            timeRange: formatDuration(minutes * 60 * 1000),
            totalPages: visits.length,
            totalActiveTime: formatDuration(
              visits.reduce((sum, v) => sum + v.activeTime, 0),
            ),
            patterns: {
              peakActivityHour: `${peakActivityHour}:00 - ${peakActivityHour + 1}:00`,
              peakTimeSpentHour: `${peakTimeHour}:00 - ${peakTimeHour + 1}:00`,
              totalSessions: sessions.length,
              averageSessionLength: formatDuration(avgSessionLength),
              averagePagesPerSession: Math.round(
                visits.length / sessions.length,
              ),
            },
            categories: Object.fromEntries(domainCategories),
            hourlyBreakdown: hourlyActivity.map((count, hour) => ({
              hour: `${hour}:00`,
              pageVisits: count,
              activeTime: formatDuration(hourlyTime[hour]),
            })),
          };
        } catch (error) {
          return {
            found: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to analyze browsing patterns",
          };
        }
      },
    }),

    /**
     * Get media consumption statistics
     */
    get_media_stats: tool({
      description:
        "Get statistics about the user's media consumption including videos watched, audio listened, and images viewed. Use this when the user asks about their media consumption, video watching habits, or wants to know how much multimedia content they've consumed.",
      parameters: z.object({
        minutes: z
          .number()
          .min(1)
          .max(10080)
          .optional()
          .describe(
            "Number of minutes to look back (1-10080). Default is 1440 (24 hours).",
          ),
      }),
      execute: async ({ minutes = 1440 }) => {
        try {
          const now = new Date();
          const from = new Date(now.getTime() - minutes * 60 * 1000);

          const [imageAttentions, audioAttentions, youtubeAttentions] =
            await Promise.all([
              db.imageAttention.findMany({
                where: {
                  userId,
                  timestamp: { gte: from, lte: now },
                },
              }),
              db.audioAttention.findMany({
                where: {
                  userId,
                  timestamp: { gte: from, lte: now },
                },
              }),
              db.youtubeAttention.findMany({
                where: {
                  userId,
                  timestamp: { gte: from, lte: now },
                },
              }),
            ]);

          // Process YouTube data
          const youtubeVideos = new Map<
            string,
            {
              videoId: string | null;
              title: string | null;
              channelName: string | null;
              watchTime: number;
            }
          >();

          for (const yt of youtubeAttentions) {
            const key = yt.videoId || yt.url || `unknown-${yt.id}`;
            if (!youtubeVideos.has(key)) {
              youtubeVideos.set(key, {
                videoId: yt.videoId,
                title: yt.title,
                channelName: yt.channelName,
                watchTime: 0,
              });
            }
            if (
              yt.event === "active-watch-time-update" &&
              yt.activeWatchTime !== null
            ) {
              const video = youtubeVideos.get(key)!;
              video.watchTime = Math.max(video.watchTime, yt.activeWatchTime);
            }
          }

          const totalYoutubeWatchTime = Array.from(
            youtubeVideos.values(),
          ).reduce((sum, v) => sum + v.watchTime, 0);
          const totalAudioTime = audioAttentions.reduce(
            (sum, a) => sum + a.playbackDuration,
            0,
          );
          const totalImageHoverTime = imageAttentions.reduce(
            (sum, i) => sum + i.hoverDuration,
            0,
          );

          const hasAnyMedia =
            imageAttentions.length > 0 ||
            audioAttentions.length > 0 ||
            youtubeVideos.size > 0;

          if (!hasAnyMedia) {
            return {
              found: false,
              message: `No media consumption found in the last ${formatDuration(minutes * 60 * 1000)}.`,
              timeRange: formatDuration(minutes * 60 * 1000),
            };
          }

          return {
            found: true,
            timeRange: formatDuration(minutes * 60 * 1000),
            summary: {
              totalMediaTime: formatDuration(
                totalYoutubeWatchTime + totalAudioTime,
              ),
            },
            youtube: {
              videosWatched: youtubeVideos.size,
              totalWatchTime: formatDuration(totalYoutubeWatchTime),
              topVideos: Array.from(youtubeVideos.values())
                .sort((a, b) => b.watchTime - a.watchTime)
                .slice(0, 5)
                .map((v) => ({
                  title: v.title,
                  channel: v.channelName,
                  watchTime: formatDuration(v.watchTime),
                })),
            },
            audio: {
              tracksPlayed: audioAttentions.length,
              totalListenTime: formatDuration(totalAudioTime),
              uniqueSources: new Set(audioAttentions.map((a) => a.src)).size,
            },
            images: {
              imagesViewed: imageAttentions.length,
              totalHoverTime: formatDuration(totalImageHoverTime),
              uniqueImages: new Set(imageAttentions.map((i) => i.src)).size,
            },
          };
        } catch (error) {
          return {
            found: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to fetch media stats",
          };
        }
      },
    }),

    /**
     * Compare browsing activity between two time periods
     */
    compare_activity: tool({
      description:
        "Compare the user's browsing activity between two time periods. Use this when the user wants to compare their activity between different times, like 'today vs yesterday' or 'this hour vs last hour'.",
      parameters: z.object({
        period1Start: z
          .number()
          .describe(
            "Start of first period in minutes ago from now (e.g., 120 for 2 hours ago)",
          ),
        period1End: z
          .number()
          .describe(
            "End of first period in minutes ago from now (e.g., 60 for 1 hour ago)",
          ),
        period2Start: z
          .number()
          .describe(
            "Start of second period in minutes ago from now (e.g., 60 for 1 hour ago)",
          ),
        period2End: z
          .number()
          .describe("End of second period in minutes ago from now (e.g., 0 for now)"),
      }),
      execute: async ({ period1Start, period1End, period2Start, period2End }) => {
        try {
          const now = new Date();
          const p1From = new Date(now.getTime() - period1Start * 60 * 1000);
          const p1To = new Date(now.getTime() - period1End * 60 * 1000);
          const p2From = new Date(now.getTime() - period2Start * 60 * 1000);
          const p2To = new Date(now.getTime() - period2End * 60 * 1000);

          const [visits1, visits2, text1, text2] = await Promise.all([
            db.websiteVisit.findMany({
              where: {
                userId,
                openedAt: { gte: p1From, lte: p1To },
              },
            }),
            db.websiteVisit.findMany({
              where: {
                userId,
                openedAt: { gte: p2From, lte: p2To },
              },
            }),
            db.textAttention.findMany({
              where: {
                userId,
                timestamp: { gte: p1From, lte: p1To },
              },
            }),
            db.textAttention.findMany({
              where: {
                userId,
                timestamp: { gte: p2From, lte: p2To },
              },
            }),
          ]);

          const stats1 = {
            pages: visits1.length,
            activeTime: visits1.reduce((sum, v) => sum + v.activeTime, 0),
            wordsRead: text1.reduce((sum, t) => sum + t.wordsRead, 0),
            domains: new Set(
              visits1.map((v) => {
                try {
                  return new URL(v.url).hostname;
                } catch {
                  return v.url;
                }
              }),
            ).size,
          };

          const stats2 = {
            pages: visits2.length,
            activeTime: visits2.reduce((sum, v) => sum + v.activeTime, 0),
            wordsRead: text2.reduce((sum, t) => sum + t.wordsRead, 0),
            domains: new Set(
              visits2.map((v) => {
                try {
                  return new URL(v.url).hostname;
                } catch {
                  return v.url;
                }
              }),
            ).size,
          };

          const calculateChange = (old: number, current: number) => {
            if (old === 0) return current > 0 ? "+100%" : "0%";
            const change = ((current - old) / old) * 100;
            return `${change > 0 ? "+" : ""}${change.toFixed(0)}%`;
          };

          return {
            found: true,
            period1: {
              label: `${formatDuration(period1Start * 60 * 1000)} ago to ${formatDuration(period1End * 60 * 1000)} ago`,
              pages: stats1.pages,
              activeTime: formatDuration(stats1.activeTime),
              wordsRead: stats1.wordsRead,
              uniqueDomains: stats1.domains,
            },
            period2: {
              label: `${formatDuration(period2Start * 60 * 1000)} ago to ${period2End === 0 ? "now" : formatDuration(period2End * 60 * 1000) + " ago"}`,
              pages: stats2.pages,
              activeTime: formatDuration(stats2.activeTime),
              wordsRead: stats2.wordsRead,
              uniqueDomains: stats2.domains,
            },
            comparison: {
              pagesChange: calculateChange(stats1.pages, stats2.pages),
              activeTimeChange: calculateChange(
                stats1.activeTime,
                stats2.activeTime,
              ),
              wordsReadChange: calculateChange(stats1.wordsRead, stats2.wordsRead),
              domainsChange: calculateChange(stats1.domains, stats2.domains),
            },
          };
        } catch (error) {
          return {
            found: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to compare activity",
          };
        }
      },
    }),

    /**
     * Open and view a website's content
     */
    open_website: tool({
      description:
        "Fetch and view a website's content. Use this when the user asks you to visit a URL, check a webpage, read content from a specific site, or when you need to see what's on a webpage. Returns the HTML content converted to readable text.",
      parameters: z.object({
        url: z
          .string()
          .url()
          .describe("The full URL of the website to fetch (must include https:// or http://)"),
        extractText: z
          .boolean()
          .optional()
          .describe(
            "If true, extract only text content. If false, return raw HTML. Default is true.",
          ),
        maxLength: z
          .number()
          .min(1000)
          .max(50000)
          .optional()
          .describe(
            "Maximum characters to return (1000-50000). Default is 15000.",
          ),
      }),
      execute: async ({ url, extractText = true, maxLength = 15000 }) => {
        try {
          const response = await fetch(url, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (compatible; KaizenBot/1.0; +https://kaizen.app)",
              Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
            redirect: "follow",
          });

          if (!response.ok) {
            return {
              success: false,
              error: `Failed to fetch URL: ${response.status} ${response.statusText}`,
              url,
            };
          }

          const contentType = response.headers.get("content-type") || "";
          if (
            !contentType.includes("text/html") &&
            !contentType.includes("text/plain") &&
            !contentType.includes("application/xhtml")
          ) {
            return {
              success: false,
              error: `Cannot read content type: ${contentType}. This tool only supports HTML and text pages.`,
              url,
            };
          }

          let html = await response.text();

          if (extractText) {
            // Remove script and style elements
            html = html.replace(
              /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
              "",
            );
            html = html.replace(
              /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,
              "",
            );
            // Remove HTML comments
            html = html.replace(/<!--[\s\S]*?-->/g, "");
            // Remove all HTML tags but keep content
            html = html.replace(/<[^>]+>/g, " ");
            // Decode HTML entities
            html = html
              .replace(/&nbsp;/g, " ")
              .replace(/&amp;/g, "&")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'");
            // Collapse whitespace
            html = html.replace(/\s+/g, " ").trim();
          }

          // Truncate if necessary
          const truncated = html.length > maxLength;
          const content = truncated ? html.slice(0, maxLength) + "..." : html;

          // Extract title if possible
          const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
          const title = titleMatch ? titleMatch[1].trim() : null;

          return {
            success: true,
            url,
            title,
            contentType: extractText ? "text" : "html",
            characterCount: content.length,
            truncated,
            content,
          };
        } catch (error) {
          return {
            success: false,
            error:
              error instanceof Error ? error.message : "Failed to fetch website",
            url,
          };
        }
      },
    }),

    /**
     * Search for content across all attention data
     */
    search_content: tool({
      description:
        "Search for specific content across all of the user's browsing activity including text read, image descriptions, and video captions. Use this when the user is trying to find something specific they saw or read online.",
      parameters: z.object({
        query: z
          .string()
          .describe("The search query to find in the user's browsing content"),
        minutes: z
          .number()
          .min(1)
          .max(10080)
          .optional()
          .describe(
            "Number of minutes to search back (1-10080). Default is 1440 (24 hours).",
          ),
        contentType: z
          .enum(["all", "text", "images", "videos"])
          .optional()
          .describe(
            "Filter by content type: 'all', 'text', 'images', or 'videos'. Default is 'all'.",
          ),
        limit: z
          .number()
          .min(1)
          .max(50)
          .optional()
          .describe("Maximum number of results to return (1-50). Default is 20."),
      }),
      execute: async ({
        query,
        minutes = 1440,
        contentType = "all",
        limit = 20,
      }) => {
        try {
          const now = new Date();
          const from = new Date(now.getTime() - minutes * 60 * 1000);
          const queryLower = query.toLowerCase();

          const results: Array<{
            type: string;
            url: string;
            matchedContent: string;
            timestamp: string;
          }> = [];

          // Search text content
          if (contentType === "all" || contentType === "text") {
            const textAttentions = await db.textAttention.findMany({
              where: {
                userId,
                timestamp: { gte: from, lte: now },
                text: { contains: query, mode: "insensitive" },
              },
              take: limit,
              orderBy: { timestamp: "desc" },
            });

            for (const t of textAttentions) {
              // Extract context around the match
              const lowerText = t.text.toLowerCase();
              const matchIndex = lowerText.indexOf(queryLower);
              const start = Math.max(0, matchIndex - 100);
              const end = Math.min(t.text.length, matchIndex + query.length + 100);
              const excerpt = (start > 0 ? "..." : "") + t.text.slice(start, end) + (end < t.text.length ? "..." : "");

              results.push({
                type: "text",
                url: t.url,
                matchedContent: excerpt,
                timestamp: t.timestamp.toISOString(),
              });
            }
          }

          // Search image descriptions/alt text
          if (contentType === "all" || contentType === "images") {
            const imageAttentions = await db.imageAttention.findMany({
              where: {
                userId,
                timestamp: { gte: from, lte: now },
                OR: [
                  { alt: { contains: query, mode: "insensitive" } },
                  { title: { contains: query, mode: "insensitive" } },
                  { summary: { contains: query, mode: "insensitive" } },
                ],
              },
              take: limit,
              orderBy: { timestamp: "desc" },
            });

            for (const i of imageAttentions) {
              results.push({
                type: "image",
                url: i.url,
                matchedContent:
                  i.summary || i.alt || i.title || "Image without description",
                timestamp: i.timestamp.toISOString(),
              });
            }
          }

          // Search video titles and captions
          if (contentType === "all" || contentType === "videos") {
            const youtubeAttentions = await db.youtubeAttention.findMany({
              where: {
                userId,
                timestamp: { gte: from, lte: now },
                OR: [
                  { title: { contains: query, mode: "insensitive" } },
                  { caption: { contains: query, mode: "insensitive" } },
                  { channelName: { contains: query, mode: "insensitive" } },
                ],
              },
              take: limit,
              orderBy: { timestamp: "desc" },
            });

            // Deduplicate by video
            const seenVideos = new Set<string>();
            for (const yt of youtubeAttentions) {
              const key = yt.videoId || yt.url || `${yt.id}`;
              if (seenVideos.has(key)) continue;
              seenVideos.add(key);

              results.push({
                type: "video",
                url:
                  yt.url ||
                  (yt.videoId
                    ? `https://www.youtube.com/watch?v=${yt.videoId}`
                    : "unknown"),
                matchedContent: `${yt.title || "Unknown video"} by ${yt.channelName || "Unknown channel"}${yt.caption ? ` - "${yt.caption}"` : ""}`,
                timestamp: yt.timestamp.toISOString(),
              });
            }
          }

          // Sort by timestamp and limit
          results.sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
          );
          const limitedResults = results.slice(0, limit);

          if (limitedResults.length === 0) {
            return {
              found: false,
              message: `No content matching "${query}" found in the last ${formatDuration(minutes * 60 * 1000)}.`,
              query,
              timeRange: formatDuration(minutes * 60 * 1000),
            };
          }

          return {
            found: true,
            query,
            timeRange: formatDuration(minutes * 60 * 1000),
            resultCount: limitedResults.length,
            results: limitedResults,
          };
        } catch (error) {
          return {
            found: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to search content",
          };
        }
      },
    }),

    /**
     * Calculate mathematical expressions with high precision
     */
    calculate: tool({
      description:
        "Calculate mathematical expressions with high precision. Supports basic arithmetic (+, -, *, /), parentheses, percentages, and comparisons. Use this for any math calculations to ensure accuracy. Examples: '2 + 3 * 4', '(100 - 20) / 4', '15% of 200', '1.1 + 2.2'.",
      parameters: z.object({
        expression: z
          .string()
          .describe(
            "The mathematical expression to calculate. Use standard math notation.",
          ),
      }),
      execute: async ({ expression }) => {
        try {
          // Use a-calc for precise calculation
          const result = calc(expression);

          // Check if result is valid
          if (
            result === null ||
            result === undefined ||
            (typeof result === "number" && isNaN(result))
          ) {
            return {
              success: false,
              error: `Could not evaluate expression: ${expression}`,
            };
          }

          return {
            success: true,
            expression,
            result: String(result),
          };
        } catch (error) {
          return {
            success: false,
            expression,
            error:
              error instanceof Error ? error.message : "Calculation failed",
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
export function formatToolResultMessage(
  toolName: string,
  result: unknown,
): string {
  const r = result as Record<string, unknown>;

  // Handle error cases
  if (r.error) {
    return `Error: ${r.error}`;
  }

  switch (toolName) {
    case "get_current_time":
      if (r.needsLocation) return "Needs location to get time";
      if (!r.found) return (r.error as string) || "Time not found";
      return `Time in ${r.location}: ${r.time}`;

    case "get_current_weather":
      if (r.needsLocation) return "Needs location to get weather";
      if (!r.found) return (r.error as string) || "Weather not found";
      const temp = r.temperature as { celsius: number; fahrenheit: number };
      return `Weather in ${r.location}: ${r.condition}, ${temp.celsius}°C / ${temp.fahrenheit}°F`;

    case "set_user_location":
      if (!r.success) return `Failed to save location: ${r.error}`;
      if (r.currentTime)
        return `Saved location: ${r.location} (${r.currentTime})`;
      return `Saved location: ${r.location}`;

    case "get_user_context":
      if (r.hasLocation) return `User context: ${r.location}`;
      return "User context: no location saved";

    case "get_active_website":
      if (!r.found) return (r.message as string) || "No active website";
      return `Active website: ${r.title || r.domain || r.url}`;

    case "get_active_focus":
      if (!r.found) return (r.message as string) || "No active focus";
      const focuses = r.focuses as Array<{ item: string }>;
      const focusItems = focuses
        .slice(0, 2)
        .map((f) => f.item)
        .join(", ");
      return `Active focus: ${focusItems}${focuses.length > 2 ? ` (+${focuses.length - 2} more)` : ""}`;

    case "get_attention_data":
      if (!r.found) return (r.message as string) || "No attention data";
      const stats = r.stats as {
        totalPages?: number;
        totalActiveTime?: number;
      };
      return `Browsing activity: ${stats.totalPages || 0} pages in ${r.timeRange}`;

    case "get_focus_history":
      if (!r.found) return (r.message as string) || "No focus history";
      return `Focus history: ${r.count} sessions retrieved`;

    case "search_browsing_history":
      if (!r.found) return (r.message as string) || "No results";
      return `Search results: ${r.count} pages matching "${r.query}"`;

    case "get_youtube_history":
      if (!r.found) return (r.message as string) || "No YouTube history";
      return `YouTube history: ${r.count} videos in ${r.timeRange}`;

    case "get_reading_activity":
      if (!r.found) return (r.message as string) || "No reading activity";
      return `Reading activity: ${r.totalWordsRead} words across ${r.pagesRead} pages`;

    case "get_translation_language":
      if (!r.found) return `No preferred translation language set`;
      return `Preferred translation language: ${r.language}`;

    case "set_translation_language":
      if (!r.success) return `Failed to save language preference`;
      return `Saved ${r.language} as preferred translation language`;

    case "calculate":
      if (!r.success) return `Calculation failed: ${r.error}`;
      return `${r.expression} = ${r.result}`;

    case "get_top_domains":
      if (!r.found) return (r.message as string) || "No domains found";
      const domains = r.domains as Array<{ domain: string }>;
      return `Top domains: ${domains.slice(0, 3).map((d) => d.domain).join(", ")}${domains.length > 3 ? ` (+${domains.length - 3} more)` : ""}`;

    case "get_browsing_patterns":
      if (!r.found) return (r.message as string) || "No patterns found";
      const patterns = r.patterns as { peakActivityHour: string; totalSessions: number };
      return `Browsing patterns: ${patterns.totalSessions} sessions, peak at ${patterns.peakActivityHour}`;

    case "get_media_stats":
      if (!r.found) return (r.message as string) || "No media stats found";
      const yt = r.youtube as { videosWatched: number } | undefined;
      const summary = r.summary as { totalMediaTime: string };
      return `Media stats: ${yt?.videosWatched || 0} videos, ${summary.totalMediaTime} total`;

    case "compare_activity":
      if (!r.found) return (r.message as string) || "Could not compare";
      const comparison = r.comparison as { pagesChange: string; activeTimeChange: string };
      return `Activity comparison: pages ${comparison.pagesChange}, time ${comparison.activeTimeChange}`;

    case "open_website":
      if (!r.success) return (r.error as string) || "Failed to open website";
      return `Fetched ${r.title || r.url} (${r.characterCount} chars)`;

    case "search_content":
      if (!r.found) return (r.message as string) || "No content found";
      return `Found ${r.resultCount} results for "${r.query}"`;

    default:
      return `Tool ${toolName} completed`;
  }
}
