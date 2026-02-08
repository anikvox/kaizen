import { EventEmitter } from "events";

export interface DeviceTokenRevokedEvent {
  token: string;
  userId: string;
}

export interface DeviceListChangedEvent {
  userId: string;
  action: "created" | "deleted";
  deviceId: string;
}

export interface SettingsChangedEvent {
  userId: string;
  settings: {
    cognitiveAttentionDebugMode: boolean;
    cognitiveAttentionShowOverlay: boolean;
    attentionTrackingIgnoreList?: string | null;
    attentionSummarizationEnabled?: boolean;
    attentionSummarizationIntervalMs?: number;
    focusCalculationEnabled?: boolean;
    focusCalculationIntervalMs?: number;
    focusInactivityThresholdMs?: number;
    focusMinDurationMs?: number;
    // LLM settings
    llmProvider?: string | null;
    llmModel?: string | null;
    hasGeminiApiKey?: boolean;
    hasAnthropicApiKey?: boolean;
    hasOpenaiApiKey?: boolean;
  };
}

// Focus Events
export interface FocusData {
  id: string;
  item: string;
  keywords: string[];
  isActive: boolean;
  startedAt: string;
  endedAt: string | null;
  lastActivityAt: string;
}

export interface FocusChangedEvent {
  userId: string;
  focus: FocusData | null;
  changeType: "created" | "updated" | "ended";
}

// Chat Events
export interface ChatSessionEvent {
  userId: string;
  sessionId: string;
  session: {
    id: string;
    title: string | null;
    attentionRange: string;
    createdAt: string;
    updatedAt: string;
  };
}

export interface ChatSessionUpdatedEvent {
  userId: string;
  sessionId: string;
  updates: {
    title?: string | null;
  };
}

export interface ChatSessionDeletedEvent {
  userId: string;
  sessionId: string;
}

export interface ChatMessageEvent {
  userId: string;
  sessionId: string;
  message: {
    id: string;
    role: "user" | "assistant" | "tool";
    content: string;
    status: "sending" | "sent" | "typing" | "streaming" | "finished" | "error";
    errorMessage?: string | null;
    toolCallId?: string | null;
    toolName?: string | null;
    createdAt: string;
    updatedAt: string;
  };
}

export interface ChatMessageUpdatedEvent {
  userId: string;
  sessionId: string;
  messageId: string;
  updates: {
    content?: string;
    status?: "sending" | "sent" | "typing" | "streaming" | "finished" | "error";
    errorMessage?: string | null;
  };
}

// Tool call started event - for UI only, not persisted to DB
export interface ToolCallStartedEvent {
  userId: string;
  sessionId: string;
  toolCallId: string;
  toolName: string;
}

// Active tab changed event - synced from extension
export interface ActiveTabChangedEvent {
  userId: string;
  url: string | null;
  title: string | null;
  timestamp: number;
}

// Pomodoro Events
export type PomodoroState = "idle" | "running" | "paused" | "cooldown";

export interface PomodoroStatusData {
  state: PomodoroState;
  elapsedSeconds: number;
  isPaused: boolean;
  lastActivityAt: string;
}

export interface PomodoroStatusChangedEvent {
  userId: string;
  status: PomodoroStatusData;
}

export interface PomodoroTickEvent {
  userId: string;
  status: PomodoroStatusData;
}

// Job events (pg-boss)
export interface JobCompletedEvent {
  userId: string;
  jobId: string;
  name: string;
  result: unknown;
}

export interface JobFailedEvent {
  userId: string;
  jobId: string;
  name: string;
  error: string;
}

export interface JobCreatedEvent {
  userId: string;
  jobId: string;
  name: string;
}

class AppEvents extends EventEmitter {
  emitDeviceTokenRevoked(data: DeviceTokenRevokedEvent) {
    this.emit("deviceTokenRevoked", data);
  }

  onDeviceTokenRevoked(callback: (data: DeviceTokenRevokedEvent) => void) {
    this.on("deviceTokenRevoked", callback);
    return () => this.off("deviceTokenRevoked", callback);
  }

  emitDeviceListChanged(data: DeviceListChangedEvent) {
    this.emit("deviceListChanged", data);
  }

  onDeviceListChanged(callback: (data: DeviceListChangedEvent) => void) {
    this.on("deviceListChanged", callback);
    return () => this.off("deviceListChanged", callback);
  }

  emitSettingsChanged(data: SettingsChangedEvent) {
    this.emit("settingsChanged", data);
  }

  onSettingsChanged(callback: (data: SettingsChangedEvent) => void) {
    this.on("settingsChanged", callback);
    return () => this.off("settingsChanged", callback);
  }

  // Chat Session Events
  emitChatSessionCreated(data: ChatSessionEvent) {
    this.emit("chatSessionCreated", data);
  }

  onChatSessionCreated(callback: (data: ChatSessionEvent) => void) {
    this.on("chatSessionCreated", callback);
    return () => this.off("chatSessionCreated", callback);
  }

  emitChatSessionUpdated(data: ChatSessionUpdatedEvent) {
    this.emit("chatSessionUpdated", data);
  }

  onChatSessionUpdated(callback: (data: ChatSessionUpdatedEvent) => void) {
    this.on("chatSessionUpdated", callback);
    return () => this.off("chatSessionUpdated", callback);
  }

  emitChatSessionDeleted(data: ChatSessionDeletedEvent) {
    this.emit("chatSessionDeleted", data);
  }

  onChatSessionDeleted(callback: (data: ChatSessionDeletedEvent) => void) {
    this.on("chatSessionDeleted", callback);
    return () => this.off("chatSessionDeleted", callback);
  }

  // Chat Message Events
  emitChatMessageCreated(data: ChatMessageEvent) {
    this.emit("chatMessageCreated", data);
  }

  onChatMessageCreated(callback: (data: ChatMessageEvent) => void) {
    this.on("chatMessageCreated", callback);
    return () => this.off("chatMessageCreated", callback);
  }

  emitChatMessageUpdated(data: ChatMessageUpdatedEvent) {
    this.emit("chatMessageUpdated", data);
  }

  onChatMessageUpdated(callback: (data: ChatMessageUpdatedEvent) => void) {
    this.on("chatMessageUpdated", callback);
    return () => this.off("chatMessageUpdated", callback);
  }

  // Tool Events (UI-only, not persisted)
  emitToolCallStarted(data: ToolCallStartedEvent) {
    this.emit("toolCallStarted", data);
  }

  onToolCallStarted(callback: (data: ToolCallStartedEvent) => void) {
    this.on("toolCallStarted", callback);
    return () => this.off("toolCallStarted", callback);
  }

  // Focus Events
  emitFocusChanged(data: FocusChangedEvent) {
    this.emit("focusChanged", data);
  }

  onFocusChanged(callback: (data: FocusChangedEvent) => void) {
    this.on("focusChanged", callback);
    return () => this.off("focusChanged", callback);
  }

  // Active Tab Events
  emitActiveTabChanged(data: ActiveTabChangedEvent) {
    this.emit("activeTabChanged", data);
  }

  onActiveTabChanged(callback: (data: ActiveTabChangedEvent) => void) {
    this.on("activeTabChanged", callback);
    return () => this.off("activeTabChanged", callback);
  }

  // Job Events (pg-boss)
  emitJobCreated(data: JobCreatedEvent) {
    this.emit("jobCreated", data);
  }

  onJobCreated(callback: (data: JobCreatedEvent) => void) {
    this.on("jobCreated", callback);
    return () => this.off("jobCreated", callback);
  }

  emitJobCompleted(data: JobCompletedEvent) {
    this.emit("jobCompleted", data);
  }

  onJobCompleted(callback: (data: JobCompletedEvent) => void) {
    this.on("jobCompleted", callback);
    return () => this.off("jobCompleted", callback);
  }

  emitJobFailed(data: JobFailedEvent) {
    this.emit("jobFailed", data);
  }

  onJobFailed(callback: (data: JobFailedEvent) => void) {
    this.on("jobFailed", callback);
    return () => this.off("jobFailed", callback);
  }

  // Pomodoro Events
  emitPomodoroStatusChanged(data: PomodoroStatusChangedEvent) {
    this.emit("pomodoroStatusChanged", data);
  }

  onPomodoroStatusChanged(callback: (data: PomodoroStatusChangedEvent) => void) {
    this.on("pomodoroStatusChanged", callback);
    return () => this.off("pomodoroStatusChanged", callback);
  }

  emitPomodoroTick(data: PomodoroTickEvent) {
    this.emit("pomodoroTick", data);
  }

  onPomodoroTick(callback: (data: PomodoroTickEvent) => void) {
    this.on("pomodoroTick", callback);
    return () => this.off("pomodoroTick", callback);
  }
}

export const events = new AppEvents();
