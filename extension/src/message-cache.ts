// Shared cache for message metadata (image previews, audio files)
// This allows image previews to persist across sessions and be shared between dashboard and extension

const MESSAGE_CACHE_KEY = 'kaizen_message_cache';

export interface MessageCacheData {
  imagePreview?: string;
  audioName?: string;
  imageFileName?: string;
  audioFileName?: string;
}

class MessageCacheManager {
  private cache: Map<string, MessageCacheData>;

  constructor() {
    this.cache = new Map();
    this.loadFromStorage();
  }

  private async loadFromStorage() {
    try {
      // Use chrome.storage.local for extension
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const result = await chrome.storage.local.get(MESSAGE_CACHE_KEY);
        if (result[MESSAGE_CACHE_KEY]) {
          const data = result[MESSAGE_CACHE_KEY];
          this.cache = new Map(Object.entries(data));
        }
      } else if (typeof localStorage !== 'undefined') {
        // Fallback to localStorage
        const stored = localStorage.getItem(MESSAGE_CACHE_KEY);
        if (stored) {
          const data = JSON.parse(stored);
          this.cache = new Map(Object.entries(data));
        }
      }
    } catch (error) {
      console.error('Failed to load message cache:', error);
    }
  }

  private async saveToStorage() {
    try {
      const data = Object.fromEntries(this.cache);
      
      // Use chrome.storage.local for extension
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({ [MESSAGE_CACHE_KEY]: data });
      } else if (typeof localStorage !== 'undefined') {
        // Fallback to localStorage
        localStorage.setItem(MESSAGE_CACHE_KEY, JSON.stringify(data));
      }
    } catch (error) {
      console.error('Failed to save message cache:', error);
    }
  }

  set(messageId: string, data: MessageCacheData) {
    this.cache.set(messageId, data);
    this.saveToStorage();
  }

  get(messageId: string): MessageCacheData | undefined {
    return this.cache.get(messageId);
  }

  has(messageId: string): boolean {
    return this.cache.has(messageId);
  }

  delete(messageId: string) {
    this.cache.delete(messageId);
    this.saveToStorage();
  }

  clear() {
    this.cache.clear();
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.remove(MESSAGE_CACHE_KEY);
    } else if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(MESSAGE_CACHE_KEY);
    }
  }

  // Clean up old entries (older than 7 days)
  cleanup() {
    // Since we don't have timestamps, we'll just limit the cache size
    if (this.cache.size > 1000) {
      const entries = Array.from(this.cache.entries());
      // Keep only the last 500 entries
      this.cache = new Map(entries.slice(-500));
      this.saveToStorage();
    }
  }
}

export const messageCache = new MessageCacheManager();
