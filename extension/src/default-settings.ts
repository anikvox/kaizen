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

// Server configuration
export const SERVER_URL = process.env.PLASMO_PUBLIC_SERVER_URL || "https://api.kaizen.apps.sandipan.dev/api"
