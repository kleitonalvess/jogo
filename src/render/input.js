// Entrada do jogador: teclado e mouse no computador; joystick virtual,
// arrasto para girar a câmera e botões na tela do celular.

export class Input {
  constructor(canvas, touchRoot) {
    this.canvas = canvas;
    this.keys = new Set();
    this.move = { x: 0, y: 0 };
    this.look = { dx: 0, dy: 0 };
    this.zoom = 0;
    this.pressed = new Set();
    this.run = false;
    this.enabled = true;
    this.touch = { stick: null, look: null };
    this.isTouch = matchMedia('(pointer: coarse)').matches;
    this.bindKeyboard();
    this.bindPointer();
    if (touchRoot) this.bindTouch(touchRoot);
  }

  bindKeyboard() {
    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k) && this.enabled) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
  }

  bindPointer() {
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      if (document.pointerLockElement === this.canvas) {
        this.look.dx += e.movementX;
        this.look.dy += e.movementY;
        return;
      }
      if (!dragging) return;
      this.look.dx += e.clientX - lastX;
      this.look.dy += e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    const stop = () => {
      dragging = false;
    };
    this.canvas.addEventListener('pointerup', stop);
    this.canvas.addEventListener('pointercancel', stop);
    this.canvas.addEventListener(
      'wheel',
      (e) => {
        this.zoom += Math.sign(e.deltaY);
        e.preventDefault();
      },
      { passive: false },
    );
  }

  bindTouch(root) {
    const stick = root.querySelector('[data-stick]');
    const knob = root.querySelector('[data-knob]');
    const lookArea = root.querySelector('[data-look]');
    const radius = 46;
    if (stick) {
      stick.addEventListener('pointerdown', (e) => {
        this.touch.stick = { id: e.pointerId, x: e.clientX, y: e.clientY };
        stick.setPointerCapture(e.pointerId);
      });
      stick.addEventListener('pointermove', (e) => {
        const s = this.touch.stick;
        if (!s || s.id !== e.pointerId) return;
        let dx = e.clientX - s.x;
        let dy = e.clientY - s.y;
        const len = Math.hypot(dx, dy);
        if (len > radius) {
          dx = (dx / len) * radius;
          dy = (dy / len) * radius;
        }
        this.move.x = dx / radius;
        this.move.y = -dy / radius;
        this.run = len > radius * 0.95;
        if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
      });
      const end = () => {
        this.touch.stick = null;
        this.move.x = 0;
        this.move.y = 0;
        this.run = false;
        if (knob) knob.style.transform = '';
      };
      stick.addEventListener('pointerup', end);
      stick.addEventListener('pointercancel', end);
    }
    if (lookArea) {
      lookArea.addEventListener('pointerdown', (e) => {
        this.touch.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
        lookArea.setPointerCapture(e.pointerId);
      });
      lookArea.addEventListener('pointermove', (e) => {
        const l = this.touch.look;
        if (!l || l.id !== e.pointerId) return;
        this.look.dx += (e.clientX - l.x) * 1.4;
        this.look.dy += (e.clientY - l.y) * 1.4;
        l.x = e.clientX;
        l.y = e.clientY;
      });
      const end = () => {
        this.touch.look = null;
      };
      lookArea.addEventListener('pointerup', end);
      lookArea.addEventListener('pointercancel', end);
    }
    for (const btn of root.querySelectorAll('[data-press]')) {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.pressed.add(btn.dataset.press);
        this.keys.add(btn.dataset.press);
      });
      const up = () => this.keys.delete(btn.dataset.press);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
    }
  }

  // Direção pedida, em coordenadas da câmera (x lateral, y para frente).
  axis() {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = this.move.x;
    let y = this.move.y;
    if (this.keys.has('w') || this.keys.has('arrowup')) y += 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) y -= 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  running() {
    return this.enabled && (this.run || this.keys.has('shift'));
  }

  // Tecla apertada neste quadro (consome o evento).
  take(key) {
    if (!this.enabled) {
      this.pressed.delete(key);
      return false;
    }
    if (this.pressed.has(key)) {
      this.pressed.delete(key);
      return true;
    }
    return false;
  }

  consumeLook() {
    const out = { ...this.look };
    this.look.dx = 0;
    this.look.dy = 0;
    return out;
  }

  consumeZoom() {
    const z = this.zoom;
    this.zoom = 0;
    return z;
  }

  endFrame() {
    this.pressed.clear();
  }
}
