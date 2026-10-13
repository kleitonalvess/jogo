// Som procedural (WebAudio, sem arquivos): zumbido das máquinas, chiado do
// ar, rangidos do casco, sonar distante; lá fora, bolhas e a respiração
// dentro do capacete. Começa no primeiro toque do jogador.

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.zone = 'colony';
    this.timers = { creak: 6, ping: 12, bubble: 1, breath: 0, step: 0 };
  }

  ensure() {
    if (this.ctx || !this.enabled) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      this.ctx = null;
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(c.destination);
    this.noiseBuffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    // Zumbido das máquinas
    this.hum = c.createGain();
    this.hum.gain.value = 0.05;
    this.hum.connect(this.master);
    for (const f of [47, 71.5, 94]) {
      const o = c.createOscillator();
      o.type = f === 94 ? 'triangle' : 'sine';
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.value = f === 94 ? 0.25 : 0.6;
      o.connect(g).connect(this.hum);
      o.start();
    }
    // Chiado do ar nos dutos
    this.air = this.loopNoise(900, 0.6, 0.012);
    // Mar, para o lado de fora
    this.sea = this.loopNoise(180, 0.4, 0);
  }

  loopNoise(freq, q, gain) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(this.master);
    src.start();
    return g;
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.7 : 0, this.ctx.currentTime, 0.2);
    if (on) this.ensure();
  }

  setZone(zone) {
    this.zone = zone;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.hum.gain.setTargetAtTime(zone === 'colony' ? 0.05 : 0.012, t, 0.6);
    this.air.gain.setTargetAtTime(zone === 'colony' ? 0.012 : 0, t, 0.6);
    this.sea.gain.setTargetAtTime(zone === 'exterior' ? 0.05 : 0, t, 0.6);
  }

  burst(freqA, freqB, dur, gain, type = 'bandpass', q = 2) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freqA, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, freqB), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  tone(freq, dur, gain, type = 'sine', glideTo = null, delay = 0) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  ping() {
    this.tone(1180, 1.6, 0.05, 'sine');
    this.tone(1180, 1.4, 0.02, 'sine', null, 0.45);
    this.tone(1180, 1.2, 0.01, 'sine', null, 0.9);
  }

  creak() {
    this.burst(320 + Math.random() * 200, 70, 0.9 + Math.random() * 0.6, 0.09, 'bandpass', 8);
  }

  click() {
    this.tone(880, 0.06, 0.04, 'square');
  }

  pickup() {
    this.tone(660, 0.18, 0.06, 'triangle');
    this.tone(990, 0.25, 0.05, 'triangle', null, 0.09);
  }

  alarm() {
    for (let i = 0; i < 3; i++) this.tone(520, 0.28, 0.07, 'sawtooth', 380, i * 0.36);
  }

  doc() {
    this.tone(110, 2.2, 0.08, 'sine');
    this.tone(165, 2.0, 0.04, 'sine', null, 0.2);
  }

  step(running) {
    this.burst(running ? 500 : 380, 120, 0.12, running ? 0.05 : 0.03, 'lowpass', 1);
  }

  bubble() {
    const f = 300 + Math.random() * 600;
    this.tone(f, 0.12, 0.035, 'sine', f * 1.8);
  }

  breath(inhale) {
    this.burst(inhale ? 900 : 600, inhale ? 1400 : 300, 1.2, 0.035, 'bandpass', 1.2);
  }

  update(dt, { moving = false, running = false } = {}) {
    if (!this.ctx || !this.enabled) return;
    const t = this.timers;
    if (this.zone === 'colony') {
      t.creak -= dt;
      if (t.creak <= 0) {
        this.creak();
        t.creak = 9 + Math.random() * 16;
      }
      t.ping -= dt;
      if (t.ping <= 0) {
        this.ping();
        t.ping = 25 + Math.random() * 25;
      }
    } else {
      t.bubble -= dt;
      if (t.bubble <= 0) {
        this.bubble();
        t.bubble = 0.4 + Math.random() * 1.8;
      }
      t.breath -= dt;
      if (t.breath <= 0) {
        this.breath(true);
        setTimeout(() => this.breath(false), 1500);
        t.breath = 3.6;
      }
    }
    if (moving) {
      t.step -= dt;
      if (t.step <= 0) {
        this.step(running);
        t.step = running ? 0.28 : 0.42;
      }
    }
  }
}
