export interface ApiClientOptions {
  baseUrl: string;
  getToken?: () => Promise<string | null>;
}

export interface HealthResponse {
  status: string;
  db: "connected" | "disconnected";
}

export interface MessageResponse {
  message: string;
}

export interface User {
  id: string;
  clerkId: string;
  email: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SSETickData {
  time: string;
}

export interface SSEDeviceTokenRevokedData {
  token: string;
}

export interface SSEDeviceTokenConnectedData {
  connected: true;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}

export interface SSEDeviceListChangedData {
  action: "created" | "deleted";
  deviceId: string;
}

export interface ApiError {
  error: string;
}

export interface DeviceToken {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface DeviceTokenCreated {
  id: string;
  token: string;
  name: string;
  createdAt: string;
}


// Website Visit Types
export interface WebsiteVisit {
  id: string;
  url: string;
  title: string;
  metadata: Record<string, string>;
  openedAt: string;
  closedAt: string | null;
  activeTime: number;
  referrer: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebsiteVisitOpenedRequest {
  url: string;
  title: string;
  metadata: Record<string, string>;
  referrer: string | null;
  timestamp: number;
}

export interface WebsiteVisitActiveTimeRequest {
  url: string;
  activeTime: number;
  timestamp: number;
}

export interface WebsiteVisitClosedRequest {
  url: string;
  activeTime: number;
  timestamp: number;
}

// Text Attention Types
export interface TextAttention {
  id: string;
  url: string;
  text: string;
  wordsRead: number;
  timestamp: string;
  createdAt: string;
}

export interface TextAttentionRequest {
  url: string;
  text: string;
  wordsRead: number;
  timestamp: number;
}

// Image Attention Types
export interface ImageAttention {
  id: string;
  url: string;
  src: string;
  alt: string;
  title: string;
  width: number;
  height: number;
  hoverDuration: number;
  confidence: number;
  timestamp: string;
  createdAt: string;
}

export interface ImageAttentionRequest {
  url: string;
  src: string;
  alt: string;
  title: string;
  width: number;
  height: number;
  hoverDuration: number;
  confidence: number;
  timestamp: number;
}

// Audio Attention Types
export interface AudioAttention {
  id: string;
  url: string;
  src: string;
  title: string;
  duration: number;
  playbackDuration: number;
  currentTime: number;
  confidence: number;
  timestamp: string;
  createdAt: string;
}

export interface AudioAttentionRequest {
  url: string;
  src: string;
  title: string;
  duration: number;
  playbackDuration: number;
  currentTime: number;
  confidence: number;
  timestamp: number;
}

// YouTube Attention Types
export interface YoutubeAttention {
  id: string;
  videoId: string;
  event: "opened" | "caption" | "active-watch-time-update";
  title: string | null;
  channelName: string | null;
  url: string | null;
  caption: string | null;
  activeWatchTime: number | null;
  timestamp: string;
  createdAt: string;
}

export interface YoutubeAttentionRequest {
  event: "opened" | "caption" | "active-watch-time-update";
  videoId: string | null;
  title?: string;
  channelName?: string;
  url?: string;
  caption?: string;
  activeWatchTime?: number;
  timestamp: number;
}

// Adapter Types - Clean, LLM-friendly data structures

export interface TimeRange {
  from: string;
  to: string;
}

// Website Activity Adapter Types
export interface WebsiteActivityPage {
  url: string;
  title: string;
  visitCount: number;
  totalActiveTime: number;
  totalActiveTimeFormatted: string;
  firstVisit: string;
  lastVisit: string;
}

export interface WebsiteActivitySummary {
  domain: string;
  totalVisits: number;
  totalActiveTime: number;
  totalActiveTimeFormatted: string;
  pages: WebsiteActivityPage[];
}

export interface WebsiteActivityResponse {
  timeRange: TimeRange;
  summary: {
    totalWebsites: number;
    totalVisits: number;
    totalActiveTime: number;
    totalActiveTimeFormatted: string;
  };
  websites: WebsiteActivitySummary[];
}

// Attention Adapter Types
export interface TextAttentionExcerpt {
  text: string;
  wordsRead: number;
  timestamp: string;
}

export interface ImageAttentionItem {
  src: string;
  alt: string;
  hoverDuration: number;
  hoverDurationFormatted: string;
  timestamp: string;
}

export interface AudioAttentionItem {
  src: string;
  title: string;
  playbackDuration: number;
  playbackDurationFormatted: string;
  timestamp: string;
}

export interface YoutubeVideoAttention {
  videoId: string | null;
  title: string | null;
  channelName: string | null;
  activeWatchTime: number | null;
  activeWatchTimeFormatted: string | null;
  captions: string[];
  timestamp: string;
}

export interface PageAttention {
  text: {
    totalWordsRead: number;
    excerpts: TextAttentionExcerpt[];
  };
  images: {
    count: number;
    items: ImageAttentionItem[];
  };
  audio: {
    count: number;
    items: AudioAttentionItem[];
  };
  youtube: {
    videos: YoutubeVideoAttention[];
  };
}

export interface AttentionPageSummary {
  url: string;
  domain: string;
  title: string | null;
  visitedAt: string;
  activeTime: number;
  activeTimeFormatted: string;
  attention: PageAttention;
}

export interface AttentionResponse {
  timeRange: TimeRange;
  summary: {
    totalPages: number;
    totalActiveTime: number;
    totalActiveTimeFormatted: string;
    totalWordsRead: number;
    totalImagesViewed: number;
    totalAudioListened: number;
    totalYoutubeVideos: number;
  };
  pages: AttentionPageSummary[];
}
