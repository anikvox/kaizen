import { EventEmitter } from "events";

export interface DeviceTokenRevokedEvent {
  token: string;
  userId: string;
}

class AppEvents extends EventEmitter {
  emitDeviceTokenRevoked(data: DeviceTokenRevokedEvent) {
    this.emit("deviceTokenRevoked", data);
  }

  onDeviceTokenRevoked(callback: (data: DeviceTokenRevokedEvent) => void) {
    this.on("deviceTokenRevoked", callback);
    return () => this.off("deviceTokenRevoked", callback);
  }
}

export const events = new AppEvents();
