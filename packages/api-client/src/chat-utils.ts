/**
 * Chat utilities for formatting tool results and display messages.
 * Shared between web UI and extension sidepanel.
 */

/**
 * Tool info for display purposes
 */
export interface ToolDisplayInfo {
  label: string;
  loadingText: string;
}

/**
 * Get human-readable tool display info
 */
export function getToolDisplayInfo(
  toolName: string | null | undefined,
): ToolDisplayInfo {
  const info: Record<string, ToolDisplayInfo> = {
    get_current_time: {
      label: "Current time",
      loadingText: "Looking up current time",
    },
    get_current_weather: {
      label: "Weather",
      loadingText: "Looking up weather",
    },
    set_user_location: {
      label: "Save location",
      loadingText: "Saving your location",
    },
    get_user_context: {
      label: "User context",
      loadingText: "Looking up user context",
    },
    get_active_website: {
      label: "Active website",
      loadingText: "Looking up active website",
    },
    get_active_focus: {
      label: "Active focus",
      loadingText: "Looking up active focus",
    },
    get_attention_data: {
      label: "Browsing activity",
      loadingText: "Looking up browsing activity",
    },
    get_focus_history: {
      label: "Focus history",
      loadingText: "Looking up focus history",
    },
    search_browsing_history: {
      label: "Search history",
      loadingText: "Searching browsing history",
    },
    get_youtube_history: {
      label: "YouTube history",
      loadingText: "Looking up YouTube history",
    },
    get_reading_activity: {
      label: "Reading activity",
      loadingText: "Looking up reading activity",
    },
    get_translation_language: {
      label: "Translation preference",
      loadingText: "Looking up translation preference",
    },
    set_translation_language: {
      label: "Translation preference",
      loadingText: "Saving translation language",
    },
    calculate: { label: "Calculator", loadingText: "Calculating" },
  };
  return (
    info[toolName || ""] || {
      label: toolName || "Tool",
      loadingText: "Running tool",
    }
  );
}

/**
 * Format tool result for display with "Used " prefix.
 * Shows a human-readable summary of what the tool returned.
 */
export function formatToolResultMessage(
  toolName: string | null | undefined,
  content: string,
): string {
  try {
    const r = JSON.parse(content);

    // Handle error cases
    if (r.error) {
      return `Error: ${r.error}`;
    }

    switch (toolName) {
      case "get_current_time":
        if (r.needsLocation) return `Needs location to get time`;
        if (!r.found) return `Looked up time: ${r.error || "not found"}`;
        return `Looked up time in ${r.location}: ${r.time}`;

      case "get_current_weather":
        if (r.needsLocation) return `Needs location to get weather`;
        if (!r.found) return `Looked up weather: ${r.error || "not found"}`;
        return `Looked up weather in ${r.location}: ${r.condition}, ${r.temperature?.celsius}°C`;

      case "set_user_location":
        if (!r.success) return `Failed to save location: ${r.error}`;
        return `Saved location: ${r.location}`;

      case "get_user_context":
        if (r.hasLocation) return `Looked up user context: ${r.location}`;
        return `Looked up user context: no location saved`;

      case "get_active_website":
        if (!r.found) return `Looked up active website: none detected`;
        return `Looked up active website: ${r.title || r.domain || r.url}`;

      case "get_active_focus":
        if (!r.found) return `Looked up active focus: none detected`;
        const focuses = r.focuses as Array<{ item: string }>;
        return `Looked up ${focuses?.length || 0} active focus${focuses?.length !== 1 ? "es" : ""}`;

      case "get_attention_data":
        if (!r.found)
          return `Looked up browsing activity: ${r.message || "none found"}`;
        const stats = r.stats as { totalPages?: number };
        return `Looked up browsing activity: ${stats?.totalPages || 0} pages from ${r.timeRange}`;

      case "get_focus_history":
        if (!r.found) return `Looked up focus history: none found`;
        return `Looked up focus history: ${r.count} session${r.count !== 1 ? "s" : ""}`;

      case "search_browsing_history":
        if (!r.found)
          return `Searched browsing history: no results for "${r.query}"`;
        return `Searched browsing history: ${r.count} page${r.count !== 1 ? "s" : ""} matching "${r.query}"`;

      case "get_youtube_history":
        if (!r.found) return `Looked up YouTube history: none found`;
        return `Looked up YouTube history: ${r.count} video${r.count !== 1 ? "s" : ""} from ${r.timeRange}`;

      case "get_reading_activity":
        if (!r.found)
          return `Looked up reading activity: ${r.message || "none found"}`;
        return `Looked up reading activity: ${r.totalWordsRead} words from ${r.pagesRead} page${r.pagesRead !== 1 ? "s" : ""}`;

      case "get_translation_language":
        if (!r.found) return `No preferred translation language set`;
        return `Preferred translation language: ${r.language}`;

      case "set_translation_language":
        if (!r.success) return `Failed to save translation language`;
        return `Saved ${r.language} as preferred translation language`;

      case "calculate":
        if (!r.success) return `Calculation failed: ${r.error}`;
        return `Calculated: ${r.expression} = ${r.result}`;

      default:
        return `Completed tool call`;
    }
  } catch {
    return `Completed tool call`;
  }
}
