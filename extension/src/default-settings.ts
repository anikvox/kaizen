export const COGNITIVE_ATTENTION_SUSTAINED_TIME = {
  key: "setting-cognitive-attention-sustained-time",
  defaultValue: 3000
}
export const COGNITIVE_ATTENTION_IDLE_THRESHOLD_TIME = {
  key: "setting-cognitive-attention-idle-threshold-time",
  defaultValue: 30000
}
export const COGNITIVE_ATTENTION_WORDS_PER_MINUTE = {
  key: "setting-cognitive-attention-words-per-minute",
  defaultValue: 150
}
export const COGNITIVE_ATTENTION_DEBUG_MODE = {
  key: "setting-cognitive-attention-debug-mode",
  defaultValue: false
}
export const COGNITIVE_ATTENTION_SHOW_OVERLAY = {
  key: "setting-cognitive-attention-show-overlay",
  defaultValue: false
}

export const DOOMSCROLLING_ATTENTION_ITEMS_THRESHOLD = {
  key: "setting-doomscrolling-attention-items-threshold",
  defaultValue: 5
}
export const DOOMSCROLLING_TIME_WINDOW = {
  key: "setting-doomscrolling-time-window",
  defaultValue: 300000
}

export const GARBAGE_COLLECTION_INTERVAL = {
  key: "setting-garbage-collection-interval",
  defaultValue: 2 * 24 * 60 * 60 * 1000
}

export const FOCUS_INACTIVITY_THRESHOLD = {
  key: "setting-focus-inactivity-threshold",
  defaultValue: 5 * 60 * 1000
}

export const SERVER_URL = process.env.PLASMO_PUBLIC_SERVER_URL || "http://localhost:60092"

export const INTENT_QUEUE_NOTIFY = {
  key: "setting-intent-queue-notify",
  defaultValue: true
}

export const NOTIFICATION_STORAGE_KEY = "notification-storage-key"
export enum NotificationMessageType {
  DOOMSCROLLING_DETECTED = "DOOMSCROLLING_DETECTED",
  FOCUS_DRIFT_DETECTED = "FOCUS_DRIFT_DETECTED",
  FOCUS_INACTIVITY_DETECTED = "FOCUS_INACTIVITY_DETECTED"
}
