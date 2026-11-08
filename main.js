// main.js — точка входа: связывает модули (сцена, освещение, модели, AR, UI, предпросмотр)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LightingManager } from './lighting.js';
import { MaterialLibrary, COLORS, PRESETS } from './materials.js';
import { ModelFactory, MODEL_TYPES } from './models.js';
import { ARManager } from './ar.js';
import { UIManager } from './ui.js';
import { PreviewScene } from './preview.js';

const ROTATE_STEP = Math.PI / 4; // шаг поворота — 45°
const HDR_URL = 'room.hdr';

// Плавное «выпрыгивание» нового объекта
function easeOutBack(x) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

class App {
  constructor() {
    // Текущий выбор пользователя
    this.state = { type: 'lamp', color: COLORS[0].hex, preset: 'gloss' };
    this.placed = []; // объекты, поставленные в AR (последний — в конце)
    this.clock = new THREE.Clock();
  }

  init() {
    // --- Рендерер ---
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // не больше 2 — ради производительности
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.xr.enabled = true;
    document.getElementById('scene-container').appendChild(this.renderer.domElement);

    // --- Сцена и камера ---
    this.scene = new THREE.Scene(); // scene.background не задаём: в AR видна камера
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 50);
    this.camera.position.set(0.8, 0.75, 1.15);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.12, 0);
    this.controls.enableDamping = true;
    this.controls.minDistance = 0.4;
    this.controls.maxDistance = 3;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // не опускаться под пол
    this.controls.update();

    // --- Модули ---
    this.lighting = new LightingManager(this.renderer, this.scene);
    this.factory = new ModelFactory(new MaterialLibrary());
    this.preview = new PreviewScene(this.scene);

    this.placedGroup = new THREE.Group(); // контейнер для объектов в AR
    this.placedGroup.visible = false;
    this.scene.add(this.placedGroup);

    this.ui = new UIManager({
      models: MODEL_TYPES,
      colors: COLORS,
      presets: PRESETS,
      initial: this.state,
      handlers: {
        onModel: (type) => this.selectModel(type),
        onColor: (hex) => this.selectColor(hex),
        onPreset: (id) => this.selectPreset(id),
        onRotate: (dir) => this.rotate(dir),
        onResetRotation: () => this.resetRotation(),
        onDelete: () => this.deleteLast(),
        onToggleAR: () => this.toggleAR()
      }
    });

    this.ar = new ARManager(this.renderer, this.scene, document.getElementById('overlay'), {
      onStart: () => this.onARStart(),
      onEnd: () => this.onAREnd(),
      onSelect: (pos) => this.onARSelect(pos),
      onSurface: () => this.updateHint()
    });

    // Модель предпросмотра
    this.showPreviewModel();
    this.preview.applyClearColor(this.renderer, false);
    this.updateHint();

    // Освещение (асинхронно; при ошибке — запасной RoomEnvironment)
    this.lighting.load(HDR_URL).then((info) => {
      if (info.error) this.ui.showError(`Файл ${HDR_URL} не загрузился, включено запасное освещение`, info.error);
    });

    // Проверка поддержки AR
    this.ar.checkSupport().then((res) => this.ui.setARSupport(res));

    window.addEventListener('resize', () => this.onResize());
    // Высота панели меняется (свернуть/развернуть) — пересчитываем кадр предпросмотра
    new ResizeObserver(() => this.onResize()).observe(document.getElementById('panel'));
    this.renderer.setAnimationLoop((t, frame) => this.render(frame));
  }

  // ---------- Действия из UI ----------

  // Объект, к которому применяются цвет/материал/поворот:
  // в AR — последний поставленный, в предпросмотре — модель предпросмотра
  get target() {
    return this.ar.isActive ? this.placed[this.placed.length - 1] ?? null : this.preview.model;
  }

  selectModel(type) {
    this.state.type = type;
    this.showPreviewModel(); // в AR новая модель будет поставлена следующим тапом
    this.updateHint();
  }

  selectColor(hex) {
    this.state.color = hex;
    this.factory.setColor(this.preview.model, hex); // предпросмотр всегда синхронизирован с выбором
    if (this.ar.isActive && this.target) this.factory.setColor(this.target, hex);
  }

  selectPreset(id) {
    this.state.preset = id;
    this.factory.setPreset(this.preview.model, id, this.state.color);
    if (this.ar.isActive && this.target) {
      // у последнего объекта сохраняем ЕГО текущий цвет
      const color = '#' + this.target.userData.mainMaterial.color.getHexString();
      this.factory.setPreset(this.target, id, color);
    }
  }

  rotate(dir) {
    const obj = this.target;
    if (!obj) return this.ui.flashHint('Сначала поставьте объект');

    obj.userData.targetYaw += dir * ROTATE_STEP;
  }

  resetRotation() {
    const obj = this.target;
    if (obj) obj.userData.targetYaw = obj.userData.baseYaw;
  }

  deleteLast() {
    const obj = this.placed.pop();
    if (!obj) return;
    this.placedGroup.remove(obj);
    this.factory.dispose(obj);
    this.updateCounters();
  }

  async toggleAR() {
    if (this.ar.isActive) return this.ar.stop();
    this.ui.setARBusy(true);
    try {
      await this.ar.start();
    } catch (err) {
      this.ui.showError('Не удалось запустить AR', err);
      this.ui.setARBusy(false);
      this.ui.setARActive(false);
    }
  }

  // ---------- AR-события ----------

  onARStart() {
    this.ui.setARBusy(false);
    this.ui.setARActive(true);
    this.preview.setVisible(false); // предпросмотр скрываем
    this.placedGroup.visible = true;
    this.controls.enabled = false;
    this.preview.applyClearColor(this.renderer, true);
    // При входе в AR WebGL-контекст мог быть пересоздан — заново готовим освещение
    this.lighting.rebuild('запуск AR');
    this.updateCounters();
    this.updateHint();
  }

  onAREnd() {
    // Координаты старой сессии в новой не имеют смысла — убираем поставленные объекты
    while (this.placed.length) this.deleteLast();
    this.placedGroup.visible = false;
    this.preview.setVisible(true);
    this.controls.enabled = true;
    this.preview.applyClearColor(this.renderer, false);
    this.ui.setARActive(false);
    this.onResize();
    this.updateCounters();
    this.updateHint();
  }

  // Тап в AR: новый объект выбранного типа с текущими цветом и материалом в точке кольца
  onARSelect(position) {
    if (!position) return this.ui.flashHint('Поверхность не найдена');
    try {
      const obj = this.factory.create(this.state.type, this.state.color, this.state.preset);
      obj.position.copy(position);

      // Поворачиваем объект «лицом» к пользователю
      const cam = this.ar.getViewerPosition();
      const yaw = Math.atan2(cam.x - position.x, cam.z - position.z);
      this.initAnimated(obj, yaw);

      this.placedGroup.add(obj);
      this.placed.push(obj);
      this.updateCounters();
    } catch (err) {
      this.ui.showError('Не удалось поставить объект', err);
    }
  }

  // ---------- Вспомогательное ----------

  showPreviewModel() {
    const obj = this.factory.create(this.state.type, this.state.color, this.state.preset);
    this.initAnimated(obj, 0);
    const old = this.preview.setModel(obj);
    if (old) this.factory.dispose(old);
  }

  // Начальные значения для анимаций поворота и появления
  initAnimated(obj, yaw) {
    obj.rotation.y = yaw;
    obj.userData.baseYaw = yaw;
    obj.userData.targetYaw = yaw;
    obj.userData.spawn = 0;
    obj.scale.setScalar(0.001);
  }

  // Плавный поворот к целевому углу и анимация появления
  animate(obj, dt) {
    const u = obj.userData;
    const d = u.targetYaw - obj.rotation.y;
    if (Math.abs(d) > 1e-4) obj.rotation.y += d * Math.min(1, dt * 10);
    if (u.spawn < 1) {
      u.spawn = Math.min(1, u.spawn + dt * 3.5);
      obj.scale.setScalar(Math.max(0.001, easeOutBack(u.spawn)));
    }
  }

  updateCounters() {
    const n = this.placed.length;
    this.ui.setDeleteEnabled(this.ar.isActive && n > 0);
  }

  updateHint() {
    if (!this.ar.isActive) {
      this.ui.setHint('Предпросмотр');
    } else if (this.ar.surfaceFound) {
      this.ui.setHint('Коснитесь, чтобы поставить', true);
    } else {
      this.ui.setHint('Наведите на пол');
    }
  }

  onResize() {
    if (this.renderer.xr.isPresenting) return; // в AR размер задаёт WebXR
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    // Сдвигаем кадр вверх, чтобы модель была по центру свободного места между подсказкой и панелью
    const panelH = document.getElementById('panel').offsetHeight + 12;
    const topH = 70;
    const shift = Math.max(0, (panelH - topH) / 2);
    this.camera.setViewOffset(w, h, 0, shift, w, h);
    // Чем меньше свободного места, тем сильнее «отъезжаем», чтобы модель влезла целиком
    const freeRatio = Math.max(0, h - panelH - topH) / h;
    this.camera.zoom = THREE.MathUtils.clamp(freeRatio * 1.7, 0.45, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  render(frame) {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    if (frame) {
      this.ar.update(frame, dt);
      for (const obj of this.placed) this.animate(obj, dt);
    } else {
      this.controls.update();
      if (this.preview.model) this.animate(this.preview.model, dt);
    }
    this.renderer.render(this.scene, this.camera);
  }
}

// Запуск с понятным сообщением при ошибке
try {
  const app = new App();
  app.init();
  window.app = app; // для отладки из консоли
} catch (err) {
  console.error('[Ошибка] Не удалось инициализировать приложение:', err);
  const t = document.getElementById('toast');
  t.textContent = `Не удалось запустить приложение: ${err.message}`;
  t.classList.add('show');
}

// Глобальный перехват непойманных ошибок
window.addEventListener('unhandledrejection', (e) => {
  console.error('[Ошибка] Необработанное исключение:', e.reason);
  window.app?.ui?.showError('Непредвиденная ошибка', e.reason);
});
