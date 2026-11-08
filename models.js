// models.js — создание моделей из геометрий Three.js (без загрузки файлов)
// Каждая модель: низ на y = 0, центр по X/Z в точке (0, 0), размеры в метрах.
// Части с userData.isMain = true — «основная» часть, её перекрашивает выбор цвета.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Список моделей для UI
export const MODEL_TYPES = [
  { id: 'lamp',  label: 'Лампа' },
  { id: 'vase',  label: 'Ваза' },
  { id: 'chair', label: 'Стул' },
  { id: 'plant', label: 'Растение' }
];

export class ModelFactory {
  constructor(materials) {
    this.materials = materials;
    this.shadowTexture = this._makeShadowTexture();
    this.shadowMaterial = new THREE.MeshBasicMaterial({
      map: this.shadowTexture, transparent: true, depthWrite: false, color: 0x000000
    });

    // Прототипы строятся ОДИН раз, дальше только клонируются
    this.prototypes = {
      lamp:  this._buildLamp(),
      vase:  this._buildVase(),
      chair: this._buildChair(),
      plant: this._buildPlant()
    };
  }

  // Новый экземпляр модели: клон прототипа (геометрии общие) + свой материал основной части
  create(type, colorHex, presetId) {
    const proto = this.prototypes[type];
    if (!proto) throw new Error(`Неизвестный тип модели: ${type}`);
    const obj = proto.clone(true);
    obj.userData.type = type;
    this.setPreset(obj, presetId, colorHex);
    return obj;
  }

  // Смена пресета материала: создаём новый материал, старый освобождаем
  setPreset(obj, presetId, colorHex) {
    const old = obj.userData.mainMaterial;
    const mat = this.materials.createMain(presetId, colorHex);
    obj.traverse((child) => {
      if (child.isMesh && child.userData.isMain) child.material = mat;
    });
    obj.userData.mainMaterial = mat;
    obj.userData.preset = presetId;
    if (old) old.dispose();
  }

  // Смена цвета: просто меняем цвет у уже существующего материала (без пересоздания)
  setColor(obj, colorHex) {
    obj.userData.mainMaterial?.color.set(colorHex);
  }

  // Освобождаем только собственный материал объекта (геометрии общие с прототипом)
  dispose(obj) {
    obj.userData.mainMaterial?.dispose();
    obj.userData.mainMaterial = null;
  }

  // ---------- Вспомогательное ----------

  // Мягкая «контактная» тень под объектом: радиальный градиент на canvas
  _makeShadowTexture() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.25)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  _shadow(radius) {
    const geo = new THREE.PlaneGeometry(radius * 2, radius * 2).rotateX(-Math.PI / 2);
    // Белые пиксели текстуры × чёрный цвет = тень; прозрачность берётся из альфы текстуры
    const mesh = new THREE.Mesh(geo, this.shadowMaterial);
    mesh.position.y = 0.001; // чуть выше пола, чтобы не мерцало
    mesh.renderOrder = -1;
    return mesh;
  }

  _mesh(geometry, material, isMain = false) {
    const m = new THREE.Mesh(geometry, material);
    if (isMain) m.userData.isMain = true;
    return m;
  }

  // ---------- Модели ----------

  // Настольная лампа ~44 см: основание, ножка, лампочка, абажур (основная часть)
  _buildLamp() {
    const n = this.materials.neutral;
    const g = new THREE.Group();
    g.name = 'Лампа';

    const base = this._mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.022, 32), n.darkMetal);
    base.position.y = 0.011;

    const stem = this._mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.3, 12), n.brass);
    stem.position.y = 0.022 + 0.15;

    const holder = this._mesh(new THREE.CylinderGeometry(0.018, 0.014, 0.03, 16), n.brass);
    holder.position.y = 0.315;

    const bulb = this._mesh(new THREE.SphereGeometry(0.03, 16, 12), n.bulb);
    bulb.position.y = 0.35;

    // Абажур: усечённый конус с лёгким изгибом через LatheGeometry
    const shadePts = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      shadePts.push(new THREE.Vector2(0.125 - 0.05 * t - 0.008 * Math.sin(Math.PI * t), 0.17 * t));
    }
    const shade = this._mesh(new THREE.LatheGeometry(shadePts, 40), null, true);
    shade.position.y = 0.27;

    // Латунные ободки по краям абажура
    const rimBottom = this._mesh(new THREE.TorusGeometry(0.125, 0.003, 6, 48).rotateX(Math.PI / 2), n.brass);
    rimBottom.position.y = 0.27;
    const rimTop = this._mesh(new THREE.TorusGeometry(0.075, 0.003, 6, 40).rotateX(Math.PI / 2), n.brass);
    rimTop.position.y = 0.44;

    g.add(base, stem, holder, bulb, shade, rimBottom, rimTop, this._shadow(0.15));
    return g;
  }

  // Ваза ~36 см: корпус через LatheGeometry по плавному профилю (основная часть) + золотой ободок
  _buildVase() {
    const n = this.materials.neutral;
    const g = new THREE.Group();
    g.name = 'Ваза';

    const curve = new THREE.SplineCurve([
      new THREE.Vector2(0.055, 0.0),
      new THREE.Vector2(0.095, 0.05),
      new THREE.Vector2(0.115, 0.12),
      new THREE.Vector2(0.085, 0.22),
      new THREE.Vector2(0.048, 0.29),
      new THREE.Vector2(0.052, 0.33),
      new THREE.Vector2(0.066, 0.355)
    ]);
    const pts = curve.getPoints(28);
    pts.unshift(new THREE.Vector2(0, 0)); // закрытое дно
    const body = this._mesh(new THREE.LatheGeometry(pts, 40), null, true);

    const lip = this._mesh(new THREE.TorusGeometry(0.066, 0.004, 6, 40).rotateX(Math.PI / 2), n.brass);
    lip.position.y = 0.355;

    g.add(body, lip, this._shadow(0.16));
    return g;
  }

  // Стул ~58 см (детский размер): деревянные ножки, сиденье и спинка (основная часть)
  _buildChair() {
    const n = this.materials.neutral;
    const g = new THREE.Group();
    g.name = 'Стул';

    const seatH = 0.3; // высота ножек
    const legGeo = new THREE.CylinderGeometry(0.012, 0.016, seatH, 10);
    for (const [x, z] of [[0.14, 0.13], [-0.14, 0.13], [0.14, -0.13], [-0.14, -0.13]]) {
      const leg = this._mesh(legGeo, n.wood);
      leg.position.set(x, seatH / 2, z);
      g.add(leg);
    }

    const seat = this._mesh(new RoundedBoxGeometry(0.34, 0.04, 0.32, 3, 0.012), null, true);
    seat.position.y = seatH + 0.02;

    // Стойки спинки (спинка сзади, «лицом» стул смотрит в +Z)
    const postGeo = new THREE.CylinderGeometry(0.011, 0.012, 0.26, 10);
    for (const x of [0.14, -0.14]) {
      const post = this._mesh(postGeo, n.wood);
      post.position.set(x, seatH + 0.04 + 0.13, -0.135);
      g.add(post);
    }

    const back = this._mesh(new RoundedBoxGeometry(0.34, 0.13, 0.025, 3, 0.01), null, true);
    back.position.set(0, 0.52, -0.14);
    back.rotation.x = -0.08;

    g.add(seat, back, this._shadow(0.27));
    return g;
  }

  // Растение в горшке ~35 см: горшок (основная часть), земля, листья
  _buildPlant() {
    const n = this.materials.neutral;
    const g = new THREE.Group();
    g.name = 'Растение';

    // Профиль горшка с бортиком
    const potPts = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.065, 0),
      new THREE.Vector2(0.07, 0.01),
      new THREE.Vector2(0.09, 0.125),
      new THREE.Vector2(0.1, 0.13),
      new THREE.Vector2(0.1, 0.15),
      new THREE.Vector2(0.088, 0.15),
      new THREE.Vector2(0.086, 0.13)
    ];
    const pot = this._mesh(new THREE.LatheGeometry(potPts, 36), null, true);

    const soil = this._mesh(new THREE.CircleGeometry(0.087, 24).rotateX(-Math.PI / 2), n.soil);
    soil.position.y = 0.135;

    // Лист — сплюснутый эллипсоид, основание в начале координат
    const leafGeo = new THREE.SphereGeometry(0.5, 10, 8);
    leafGeo.scale(0.055, 0.2, 0.012).translate(0, 0.1, 0);

    // Параметры листьев: [угол вокруг оси, наклон, масштаб]
    const leaves = [
      [0.0, 0.35, 1.1], [0.7, 0.6, 0.95], [1.4, 0.3, 1.05], [2.1, 0.65, 0.9],
      [2.8, 0.4, 1.15], [3.5, 0.7, 0.85], [4.2, 0.35, 1.0], [4.9, 0.6, 0.95], [5.6, 0.45, 1.05]
    ];
    leaves.forEach(([yaw, tilt, s], i) => {
      const pivot = new THREE.Group();
      pivot.position.y = 0.135;
      pivot.rotation.y = yaw;
      const leaf = this._mesh(leafGeo, i % 2 ? n.leafDark : n.leaf);
      leaf.rotation.x = tilt;
      leaf.scale.setScalar(s);
      pivot.add(leaf);
      g.add(pivot);
    });

    g.add(pot, soil, this._shadow(0.17));
    return g;
  }
}
