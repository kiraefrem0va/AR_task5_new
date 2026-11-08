// preview.js — режим предпросмотра без AR: светлый фон, пол и текущая модель
import * as THREE from 'three';

const PREVIEW_BG = 0xeef1f5; // совпадает с фоном страницы в style.css

export class PreviewScene {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'Предпросмотр';
    this.model = null;

    // Пол, плавно исчезающий к краям (через alphaMap с радиальным градиентом)
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.6, 64).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({
        color: 0xdde2ea, roughness: 0.95, metalness: 0,
        transparent: true, alphaMap: this._fadeTexture(), depthWrite: false
      })
    );
    floor.renderOrder = -2;
    this.group.add(floor);

    scene.add(this.group);
  }

  // Заменить показанную модель; старую отдаём наружу для освобождения ресурсов
  setModel(obj) {
    const old = this.model;
    if (old) this.group.remove(old);
    this.model = obj;
    if (obj) this.group.add(obj);
    return old;
  }

  setVisible(visible) {
    this.group.visible = visible;
  }

  // Цвет очистки: светлый в предпросмотре, прозрачный в AR (scene.background не используем)
  applyClearColor(renderer, arActive) {
    if (arActive) renderer.setClearColor(0x000000, 0);
    else renderer.setClearColor(PREVIEW_BG, 1);
  }

  _fadeTexture() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, '#fff');
    g.addColorStop(0.55, '#fff');
    g.addColorStop(1, '#000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }
}
