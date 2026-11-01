// SDK-independent policy; exercised with deferred system permission responses.
export interface AudioPermissionRequest {
  getOrigin(): string;
  getAccessibleResource(): string[];
  grant(resources: string[]): void;
  deny(): void;
}

const pendingAudioGates: Set<AudioPermissionGate> = new Set<AudioPermissionGate>();

export function cancelPendingAudioRequests(): void {
  pendingAudioGates.forEach((gate: AudioPermissionGate) => gate.cancel());
}

export class AudioPermissionGate {
  private pending: AudioPermissionRequest | undefined;
  private generation: number = 0;

  cancel(): void {
    this.generation++;
    const previous = this.pending;
    this.pending = undefined;
    pendingAudioGates.delete(this);
    try { previous?.deny(); } catch (_error) { /* Native request may already be canceled. */ }
  }

  async request(request: AudioPermissionRequest, trustedOrigin: string,
    askMicrophone: () => Promise<boolean>): Promise<void> {
    const audio: string = 'TYPE_AUDIO_CAPTURE';
    if (this.pending || request.getOrigin() !== trustedOrigin ||
      !request.getAccessibleResource().includes(audio)) {
      request.deny();
      return;
    }
    this.pending = request;
    pendingAudioGates.add(this);
    const generation = this.generation;
    try {
      const allowed = await askMicrophone();
      // A late system dialog must not authorize a departed page or a newer request.
      if (generation !== this.generation || this.pending !== request) return;
      if (allowed && request.getOrigin() === trustedOrigin && request.getAccessibleResource().includes(audio)) request.grant([audio]);
      else request.deny();
    } catch (_error) {
      if (generation === this.generation && this.pending === request) request.deny();
    } finally {
      if (generation === this.generation && this.pending === request) {
        this.pending = undefined;pendingAudioGates.delete(this);
      }
    }
  }
}
