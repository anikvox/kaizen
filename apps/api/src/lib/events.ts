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
}

export const events = new AppEvents();
