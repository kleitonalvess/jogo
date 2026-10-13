// Camada HTML por cima do 3D: nomes acima das cabeças, balões de fala,
// marcadores de missão e o aviso de interação.

import * as THREE from 'three';

const v = new THREE.Vector3();

export class Overlays {
  constructor(root) {
    this.root = root;
    this.pool = [];
    this.used = 0;
  }

  begin() {
    this.used = 0;
  }

  element() {
    let el = this.pool[this.used];
    if (!el) {
      el = document.createElement('div');
      this.root.appendChild(el);
      this.pool.push(el);
    }
    this.used += 1;
    el.hidden = false;
    return el;
  }

  // Projeta um ponto do mundo na tela. Devolve null se estiver atrás.
  project(camera, x, y, z, width, height) {
    v.set(x, y, z).project(camera);
    if (v.z > 1 || v.z < -1) return null;
    return { x: (v.x * 0.5 + 0.5) * width, y: (-v.y * 0.5 + 0.5) * height };
  }

  place(el, cls, html, sx, sy) {
    if (el.className !== cls) el.className = cls;
    if (el.dataset.html !== html) {
      el.innerHTML = html;
      el.dataset.html = html;
    }
    el.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy)}px) translate(-50%, -100%)`;
  }

  tag(camera, pos, html, cls, width, height, lift = 0) {
    const p = this.project(camera, pos.x, pos.y + lift, pos.z, width, height);
    if (!p || p.x < -100 || p.x > width + 100 || p.y < -60 || p.y > height + 60) return;
    this.place(this.element(), cls, html, p.x, p.y);
  }

  end() {
    for (let i = this.used; i < this.pool.length; i++) this.pool[i].hidden = true;
  }
}
