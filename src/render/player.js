// O jogador em terceira pessoa: anda pelos corredores, sobe e desce a
// escada espiral, veste o escafandro lá fora. A câmera orbita atrás e não
// atravessa paredes.

import * as THREE from 'three';

import { animateCharacter, createCharacter, disposeCharacter } from './character.js';
import { LANDING_WINDOW, LEVEL_H, RING_IN, STAIR_IN, STAIR_OUT, angleOf, floorY, regionAt, walkable } from './layout.js';

const WALK = 3.0;
const RUN = 5.4;
const CEIL = LEVEL_H - 0.35;

export class Player {
  constructor(scene, appearance) {
    this.scene = scene;
    this.appearance = appearance;
    this.suit = false;
    this.ch = createCharacter(appearance, 'player', { seed: 7 });
    scene.add(this.ch.root);
    this.position = this.ch.root.position;
    this.level = 0;
    this.onStair = false;
    this.s = 0;
    this.yaw = Math.PI;
    this.pitch = 0.32;
    this.dist = 4.2;
    this.velocityY = 0;
    this.anim = 'idle';
    this.camTarget = new THREE.Vector3();
    this.camPos = new THREE.Vector3();
  }

  setSuit(on, scene) {
    if (this.suit === on) return;
    this.suit = on;
    const old = this.ch.root;
    const fresh = createCharacter(this.appearance, 'player', { seed: 7, suit: on });
    fresh.root.position.copy(old.position);
    fresh.root.rotation.y = old.rotation.y;
    this.scene.remove(old);
    disposeCharacter(this.ch);
    this.ch = fresh;
    this.position = fresh.root.position;
    (scene || this.scene).add(fresh.root);
    this.scene = scene || this.scene;
  }

  moveTo(scene) {
    this.scene.remove(this.ch.root);
    scene.add(this.ch.root);
    this.scene = scene;
  }

  placeAt(x, y, z, level, facing = 0) {
    this.position.set(x, y, z);
    this.level = level;
    this.onStair = false;
    this.ch.root.rotation.y = facing;
    this.yaw = facing + Math.PI;
  }

  // Direção de movimento no mundo a partir do eixo pedido e da câmera.
  desired(input) {
    const a = input.axis();
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const dir = forward.multiplyScalar(a.y).add(right.multiplyScalar(a.x));
    return { dir, amount: Math.min(1, Math.hypot(a.x, a.y)) };
  }

  updateColony(dt, input, index, deepest) {
    const { dir, amount } = this.desired(input);
    const speed = (input.running() ? RUN : WALK) * amount;
    const step = dir.clone().multiplyScalar(speed * dt);
    const pos = this.position;
    if (this.onStair) {
      this.updateStair(step, deepest, index);
    } else if (amount > 0.01) {
      const nx = pos.x + step.x;
      const nz = pos.z + step.z;
      const r = Math.hypot(nx, nz);
      // Entrar na escada: só pelo patamar.
      if (r < RING_IN + 0.05 && Math.abs(angleOf(nx, nz)) <= LANDING_WINDOW) {
        this.onStair = true;
        this.s = this.level;
        this.updateStair(step, deepest, index);
      } else {
        if (walkable(index, this.level, nx, pos.z)) pos.x = nx;
        if (walkable(index, this.level, pos.x, nz)) pos.z = nz;
      }
    }
    this.face(dir, amount, dt);
    this.anim = amount > 0.05 ? (input.running() ? 'run' : 'walk') : 'idle';
  }

  updateStair(step, deepest, index) {
    const pos = this.position;
    let nx = pos.x + step.x;
    let nz = pos.z + step.z;
    let r = Math.hypot(nx, nz);
    const a0 = angleOf(pos.x, pos.z);
    const leaving = r > STAIR_OUT - 0.18;
    const nearInt = Math.abs(this.s - Math.round(this.s)) < 0.08;
    if (leaving && nearInt && Math.abs(angleOf(nx, nz)) <= LANDING_WINDOW && Math.round(this.s) <= deepest) {
      this.onStair = false;
      this.level = Math.round(this.s);
      const a = angleOf(nx, nz);
      pos.set(Math.cos(a) * (RING_IN + 0.2), floorY(this.level), Math.sin(a) * (RING_IN + 0.2));
      return;
    }
    // Fica dentro da coroa da escada.
    const rClamped = Math.min(STAIR_OUT - 0.2, Math.max(STAIR_IN + 0.25, r));
    if (r > 0.001) {
      nx = (nx / r) * rClamped;
      nz = (nz / r) * rClamped;
      r = rClamped;
    }
    const a1 = angleOf(nx, nz);
    let da = a1 - a0;
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    const s = this.s + da / (Math.PI * 2);
    if (s < -0.001 || s > deepest + 0.001) return;
    this.s = Math.max(0, Math.min(deepest, s));
    pos.set(nx, -this.s * LEVEL_H, nz);
    this.level = Math.round(this.s);
    void index;
  }

  updateExterior(dt, input, ground, obstacles, bounds, buoyancy) {
    const { dir, amount } = this.desired(input);
    const speed = (input.running() ? 3.4 : 2.1) * amount;
    const pos = this.position;
    const nx = pos.x + dir.x * speed * dt;
    const nz = pos.z + dir.z * speed * dt;
    const blocked = (x, z) => obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + 0.4 && pos.y < o.top);
    if (Math.hypot(nx, pos.z) < bounds && !blocked(nx, pos.z)) pos.x = nx;
    if (Math.hypot(pos.x, nz) < bounds && !blocked(pos.x, nz)) pos.z = nz;
    const floor = ground(pos.x, pos.z);
    if (input.keys.has(' ') || input.keys.has('jump')) this.velocityY += 6 * dt * buoyancy;
    this.velocityY -= 3.2 * dt;
    this.velocityY = Math.max(-2.2, Math.min(2.4, this.velocityY));
    pos.y += this.velocityY * dt;
    if (pos.y < floor) {
      pos.y = floor;
      this.velocityY = 0;
    }
    if (pos.y > floor + 8) {
      pos.y = floor + 8;
      this.velocityY = Math.min(0, this.velocityY);
    }
    this.face(dir, amount, dt);
    const airborne = pos.y > floor + 0.25;
    this.anim = airborne ? 'swim' : amount > 0.05 ? (input.running() ? 'run' : 'walk') : 'idle';
  }

  face(dir, amount, dt) {
    if (amount < 0.05) return;
    const target = Math.atan2(dir.x, dir.z);
    let d = target - this.ch.root.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.ch.root.rotation.y += d * Math.min(1, dt * 12);
  }

  animate(dt, override = null) {
    animateCharacter(this.ch, dt, override || this.anim);
  }

  // Câmera em órbita. inside(x, y, z) diz se um ponto é espaço livre.
  updateCamera(camera, input, dt, inside) {
    const look = input.consumeLook();
    this.yaw -= look.dx * 0.0055;
    this.pitch = Math.min(1.1, Math.max(-0.35, this.pitch + look.dy * 0.004));
    const zoom = input.consumeZoom();
    if (zoom) this.dist = Math.min(8, Math.max(1.8, this.dist + zoom * 0.5));
    if (input.keys.has('q')) this.yaw += dt * 2.2;
    const head = this.camTarget.set(this.position.x, this.position.y + (this.suit ? 1.65 : 1.55), this.position.z);
    // Em lugares apertados a câmera sobe por cima do ombro em vez de
    // colar na nuca.
    let best = null;
    for (const pitch of [this.pitch, Math.max(this.pitch, 0.55), Math.max(this.pitch, 0.85), 1.15]) {
      const back = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(this.yaw) * Math.cos(pitch));
      let dist = this.dist;
      const samples = 14;
      for (let i = 1; i <= samples; i++) {
        const d = (this.dist * i) / samples;
        const p = head.clone().addScaledVector(back, d);
        if (!inside(p.x, p.y, p.z)) {
          dist = Math.max(0.5, (this.dist * (i - 1.3)) / samples);
          break;
        }
      }
      if (!best || dist > best.dist + 0.3) best = { back, dist };
      if (dist >= Math.min(2.2, this.dist * 0.7)) break;
    }
    const desired = head.clone().addScaledVector(best.back, best.dist);
    if (this.camPos.lengthSq() === 0) this.camPos.copy(desired);
    this.camPos.lerp(desired, Math.min(1, dt * 12));
    camera.position.copy(this.camPos);
    camera.lookAt(head);
  }
}

// Espaço livre para a câmera dentro da colônia. Móveis só bloqueiam a
// câmera abaixo da altura deles.
export function colonyInside(index, deepest) {
  return (x, y, z) => {
    const r = Math.hypot(x, z);
    if (r < STAIR_OUT && r > 0.85) return y < CEIL && y > floorY(deepest) + 0.2;
    const lv = Math.max(0, Math.min(deepest, Math.round(-y / LEVEL_H + 0.45)));
    const fl = floorY(lv);
    if (y < fl + 0.25 || y > fl + CEIL - 0.25) return false;
    const region = regionAt(index, lv, x, z, 0.12);
    if (!region) return false;
    if (region.kind === 'blocked') return y > fl + region.prop.h + 0.2;
    return true;
  };
}
