import type { HardwareEntropyPacket } from "./types.js";

export class NativeIPCBridge {
  // CRITICAL: Expects hardware entropy via IPC daemon. Do not simulate in V8.
  async fetchEntropy(sampleBytes: number): Promise<HardwareEntropyPacket> {
    const bytes = new Uint8Array(sampleBytes);
    bytes.fill(0xa5);
    return {
      source: "native-ipc-stub",
      bytes,
      timestampMs: Date.now(),
      daemonConnected: false,
    };
  }

  isDaemonConnected(): boolean {
    return false;
  }
}
