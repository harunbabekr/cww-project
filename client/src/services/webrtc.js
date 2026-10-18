/** اتصال WebRTC واحد لكل مكالمة */
export class CallPeer {
  constructor({ iceServers, onRemoteStream, onIceCandidate, onConnectionState }) {
    this.pc = new RTCPeerConnection({ iceServers: iceServers?.length ? iceServers : [{ urls: 'stun:stun.l.google.com:19302' }] });
    this.localStream = null;
    this.pendingIce = [];

    this.pc.ontrack = (e) => onRemoteStream?.(e.streams[0]);
    this.pc.onicecandidate = (e) => e.candidate && onIceCandidate?.(e.candidate);
    this.pc.onconnectionstatechange = () => onConnectionState?.(this.pc.connectionState);
  }

  async start(video) {
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: video ? { facingMode: 'user' } : false,
    });
    this.localStream.getTracks().forEach((t) => this.pc.addTrack(t, this.localStream));
    return this.localStream;
  }

  async createOffer() {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async acceptOffer(offer) {
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    await this.flushIce();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async handleAnswer(answer) {
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    await this.flushIce();
  }

  async addIce(candidate) {
    if (!this.pc.remoteDescription) { this.pendingIce.push(candidate); return; }
    try { await this.pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* مرشح قديم */ }
  }

  async flushIce() {
    for (const c of this.pendingIce.splice(0)) {
      try { await this.pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* تجاهل */ }
    }
  }

  setMuted(muted) { this.localStream?.getAudioTracks().forEach((t) => (t.enabled = !muted)); }
  setCameraOn(on) { this.localStream?.getVideoTracks().forEach((t) => (t.enabled = on)); }

  close() {
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.pc.close();
  }
}
