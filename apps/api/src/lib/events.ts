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
  };
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
}

export const events = new AppEvents();
