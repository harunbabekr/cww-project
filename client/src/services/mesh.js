/** مكالمة جماعية Mesh: اتصال WebRTC مباشر بين كل مشاركَين. الإشارات تمرّ عبر السوكت. */
export class MeshRoom {
  constructor({ iceServers, onStream, onSignal, onState }) {
    this.iceServers = iceServers;
    this.onStream = onStream;
    this.onSignal = onSignal;
    this.onState = onState;
    this.peers = new Map();
    this.local = null;
    this.queue = Promise.resolve();
  }

  async start(video) {
    this.local = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      // دقة وإطارات منخفضة: نطاق ترددي أقل (مهم مع الإنترنت الضعيف)، ومشاركون متعددون
      video: video ? { width: { ideal: 480 }, height: { ideal: 360 }, frameRate: { ideal: 18, max: 24 }, facingMode: 'user' } : false,
    });
    return this.local;
  }

  _make(id) {
    this.peers.get(id)?.pc.close();
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const entry = { pc, pending: [] };
    this.local?.getTracks().forEach((t) => pc.addTrack(t, this.local));
    pc.ontrack = (e) => this.onStream(id, e.streams[0]);
    pc.onicecandidate = (e) => e.candidate && this.onSignal(id, { type: 'candidate', data: e.candidate });
    pc.onconnectionstatechange = () => this.onState?.(id, pc.connectionState);
    this.peers.set(id, entry);
    return entry;
  }

  /** نحن المنضمّون حديثاً: نرسل عرضاً لمشارك سابق */
  call(id) {
    return this._run(async () => {
      const { pc } = this._make(id);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.onSignal(id, { type: 'offer', data: pc.localDescription });
    });
  }

  handle(id, signal) {
    return this._run(async () => {
      const { type, data } = signal;
      if (type === 'offer') {
        const e = this._make(id);
        await e.pc.setRemoteDescription(data);
        for (const c of e.pending.splice(0)) await e.pc.addIceCandidate(c).catch(() => {});
        const answer = await e.pc.createAnswer();
        await e.pc.setLocalDescription(answer);
        this.onSignal(id, { type: 'answer', data: e.pc.localDescription });
      } else if (type === 'answer') {
        const e = this.peers.get(id);
        if (!e) return;
        await e.pc.setRemoteDescription(data);
        for (const c of e.pending.splice(0)) await e.pc.addIceCandidate(c).catch(() => {});
      } else if (type === 'candidate') {
        const e = this.peers.get(id);
        if (!e) return;
        if (e.pc.remoteDescription) await e.pc.addIceCandidate(data).catch(() => {});
        else e.pending.push(data);
      }
    });
  }

  _run(fn) { // تسلسل المعالجة لتفادي تداخل عمليات الـ SDP
    this.queue = this.queue.then(fn).catch(() => {});
    return this.queue;
  }

  remove(id) {
    const e = this.peers.get(id);
    if (e) { e.pc.close(); this.peers.delete(id); }
  }

  setMuted(m) { this.local?.getAudioTracks().forEach((t) => { t.enabled = !m; }); }
  setCameraOn(on) { this.local?.getVideoTracks().forEach((t) => { t.enabled = on; }); }

  close() {
    for (const { pc } of this.peers.values()) pc.close();
    this.peers.clear();
    this.local?.getTracks().forEach((t) => t.stop());
    this.local = null;
  }
}
