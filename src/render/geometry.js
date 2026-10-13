// Construtor de malhas: junta muitas peças simples (caixas, cilindros,
// esferas) com cor por vértice numa única geometria. Uma sala inteira vira
// uma ou duas chamadas de desenho, o que mantém o jogo leve no celular.

import * as THREE from 'three';

const BASE = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 14),
  cyl8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  cone: new THREE.ConeGeometry(0.5, 1, 10),
  sphere: new THREE.SphereGeometry(0.5, 12, 8),
  sphereLow: new THREE.SphereGeometry(0.5, 8, 6),
  disc: new THREE.CircleGeometry(0.5, 18),
  plane: new THREE.PlaneGeometry(1, 1),
  torus: new THREE.TorusGeometry(0.5, 0.08, 6, 18),
};
for (const key of Object.keys(BASE)) BASE[key] = BASE[key].toNonIndexed();

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3();
const tmpColor = new THREE.Color();

export class MeshBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.colors = [];
  }

  get empty() {
    return this.positions.length === 0;
  }

  // Acrescenta uma geometria não indexada já com a matriz aplicada.
  addGeometry(geometry, matrix, color, shade = null) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    tmpColor.set(color);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      n.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
      this.positions.push(v.x, v.y, v.z);
      this.normals.push(n.x, n.y, n.z);
      // Sombreamento barato: faces de baixo um pouco mais escuras.
      let k = 1;
      if (shade !== false) k = 0.82 + 0.18 * (n.y * 0.5 + 0.5);
      if (typeof shade === 'function') k *= shade(v, n);
      this.colors.push(tmpColor.r * k, tmpColor.g * k, tmpColor.b * k);
    }
    return this;
  }

  add(kind, { x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0 }, color, shade) {
    tmpEuler.set(rx, ry, rz, 'YXZ');
    tmpQuat.setFromEuler(tmpEuler);
    tmpPos.set(x, y, z);
    tmpScale.set(sx, sy, sz);
    tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
    if (this.base) tmpMatrix.premultiply(this.base);
    return this.addGeometry(BASE[kind], tmpMatrix, color, shade);
  }

  // Acrescenta uma geometria qualquer (por exemplo, um tubo) já posicionada.
  addRaw(geometry, color) {
    const m = this.base ? this.base.clone() : new THREE.Matrix4();
    return this.addGeometry(geometry.index ? geometry.toNonIndexed() : geometry, m, color);
  }

  // Caixa apoiada no chão: (x, z) no centro da base, y na base.
  box(x, y, z, w, h, d, color, ry = 0, shade) {
    return this.add('box', { x, y: y + h / 2, z, sx: w, sy: h, sz: d, ry }, color, shade);
  }

  // Caixa centrada.
  boxC(x, y, z, w, h, d, color, ry = 0, rx = 0, rz = 0) {
    return this.add('box', { x, y, z, sx: w, sy: h, sz: d, ry, rx, rz }, color);
  }

  cylinder(x, y, z, r, h, color, segments8 = false, rx = 0, rz = 0, ry = 0) {
    return this.add(segments8 ? 'cyl8' : 'cyl', { x, y: y + (rx || rz ? 0 : h / 2), z, sx: r * 2, sy: h, sz: r * 2, rx, rz, ry }, color);
  }

  sphere(x, y, z, r, color, low = false, sy = 1) {
    return this.add(low ? 'sphereLow' : 'sphere', { x, y, z, sx: r * 2, sy: r * 2 * sy, sz: r * 2 }, color);
  }

  disc(x, y, z, r, color, rx = 0, ry = 0) {
    return this.add('disc', { x, y, z, sx: r * 2, sy: r * 2, sz: 1, rx, ry }, color, false);
  }

  plane(x, y, z, w, h, color, rx = 0, ry = 0) {
    return this.add('plane', { x, y, z, sx: w, sy: h, sz: 1, rx, ry }, color, false);
  }

  torus(x, y, z, r, color, rx = 0, ry = 0) {
    return this.add('torus', { x, y, z, sx: r * 2, sy: r * 2, sz: r * 2, rx, ry }, color);
  }

  // Segmento de anel (parede curva) entre dois ângulos.
  arcWall(radius, a0, a1, y, h, thickness, color, segments = 12) {
    const step = (a1 - a0) / segments;
    for (let i = 0; i < segments; i++) {
      const a = a0 + step * (i + 0.5);
      const len = 2 * radius * Math.sin(Math.abs(step) / 2) + 0.02;
      this.add('box', { x: Math.cos(a) * radius, y: y + h / 2, z: Math.sin(a) * radius, sx: thickness, sy: h, sz: len, ry: -a }, color);
    }
    return this;
  }

  // Coroa circular plana (piso ou teto) entre dois raios. Ângulos na
  // convenção do jogo: atan2(z, x).
  annulus(r0, r1, y, color, a0 = 0, a1 = Math.PI * 2, segments = 48, facingDown = false) {
    const length = a1 - a0;
    // Girar o plano XY em torno de X leva o ângulo θ para −θ (para cima) ou
    // mantém θ (para baixo).
    const start = facingDown ? a0 : -a1;
    const geo = new THREE.RingGeometry(r0, r1, segments, 1, start, length).toNonIndexed();
    const m = new THREE.Matrix4().makeRotationX(facingDown ? Math.PI / 2 : -Math.PI / 2);
    m.premultiply(new THREE.Matrix4().makeTranslation(0, y, 0));
    if (this.base) m.premultiply(this.base);
    return this.addGeometry(geo, m, color, false);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.computeBoundingSphere();
    return g;
  }
}

export const MATERIALS = {
  solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.18, flatShading: true }),
  smooth: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05 }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  double: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.15, flatShading: true, side: THREE.DoubleSide }),
};

// Modo leve: Lambert é bem mais barato que o material físico em celulares.
export function useLightMaterials() {
  MATERIALS.solid = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  MATERIALS.double = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
}

export function meshFrom(builder, material = MATERIALS.solid) {
  if (builder.empty) return null;
  const mesh = new THREE.Mesh(builder.build(), material);
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}

// Textura de texto para placas e letreiros.
export function textTexture(lines, { width = 256, height = 96, bg = '#1a2a30', fg = '#e9b45a', font = 'bold 44px "Saira Stencil One", Impact, sans-serif', border = '#2d5560' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = border;
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, width - 6, height - 6);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const list = Array.isArray(lines) ? lines : [lines];
  list.forEach((line, i) => {
    ctx.font = i === 0 ? font : font.replace(/\d+px/, (m) => `${Math.round(parseInt(m, 10) * 0.55)}px`);
    ctx.fillText(line, width / 2, height / 2 + (i - (list.length - 1) / 2) * (height / (list.length + 0.6)));
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
