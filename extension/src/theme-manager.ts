/**
 * Shared theme manager for syncing theme state between extension and frontend
 * 
 * Flow:
 * 1. User toggles theme on frontend (landing page or dashboard)
 * 2. Theme stored in chrome.storage.local (accessible by extension)
 * 3. Extension sidepanel listens to chrome.storage changes
 * 4. Extension applies theme: light (emerald sky) or dark (dusk/evening with subtle stars)
 * 5. Tree animation remains unchanged in both themes
 */

export type Theme = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "kaizen_theme_preference";

export class ThemeManager {
  private static instance: ThemeManager;
  private listeners: Set<(theme: Theme) => void> = new Set();

  private constructor() {
    // Listen for storage changes from other contexts
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        console.log("[ThemeManager] Storage changed:", { changes, areaName })
        if (areaName === "local" && changes[THEME_STORAGE_KEY]) {
          const newTheme = changes[THEME_STORAGE_KEY].newValue as Theme;
          console.log("[ThemeManager] Theme changed to:", newTheme)
          this.notifyListeners(newTheme);
        }
      });
    }
  }

  static getInstance(): ThemeManager {
    if (!ThemeManager.instance) {
      ThemeManager.instance = new ThemeManager();
    }
    return ThemeManager.instance;
  }

  /**
   * Get current theme from storage
   */
  async getTheme(): Promise<Theme> {
    try {
      if (typeof chrome !== "undefined" && chrome.storage) {
        const result = await chrome.storage.local.get(THEME_STORAGE_KEY);
        return (result[THEME_STORAGE_KEY] as Theme) || "system";
      }
    } catch (error) {
      console.error("Error getting theme:", error);
    }
    return "system";
  }

  /**
   * Set theme and sync across all contexts
   */
  async setTheme(theme: Theme): Promise<void> {
    try {
      console.log("[ThemeManager] Setting theme to:", theme)
      if (typeof chrome !== "undefined" && chrome.storage) {
        await chrome.storage.local.set({ [THEME_STORAGE_KEY]: theme });
        console.log("[ThemeManager] Theme saved to chrome.storage")
        this.notifyListeners(theme);
      }
    } catch (error) {
      console.error("Error setting theme:", error);
    }
  }

  /**
   * Get resolved theme (handles "system" preference)
   */
  getResolvedTheme(theme: Theme): "light" | "dark" {
    if (theme === "system") {
      if (typeof window !== "undefined" && window.matchMedia) {
        return window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
      }
      return "light";
    }
    return theme;
  }

  /**
   * Subscribe to theme changes
   */
  subscribe(callback: (theme: Theme) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners(theme: Theme): void {
    this.listeners.forEach((callback) => callback(theme));
  }
}

export const themeManager = ThemeManager.getInstance();
