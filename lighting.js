// lighting.js — освещение через HDRI / environment map (scene.environment)
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export class LightingManager {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.type = null; // 'hdri' или 'room'
    this.hdr = null;  // исходная HDR-текстура храним, чтобы можно было пересобрать освещение

    // Тональная коррекция для корректного вида HDR-освещения
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // При входе в AR браузер может пересоздать WebGL-контекст — карта окружения
    // при этом пустеет и объекты становятся чёрными. После восстановления пересобираем её.
    renderer.domElement.addEventListener('webglcontextrestored', () => {
      this.rebuild('WebGL-контекст восстановлен');
    });
  }

  // Загружает HDRI; при ошибке включает запасной RoomEnvironment.
  // scene.background НЕ трогаем — в AR должна быть видна камера.
  async load(url) {
    try {
      this.hdr = await new RGBELoader().loadAsync(url);
      this.type = 'hdri';
      this.rebuild();
      console.log(`[Освещение] Включено HDRI-освещение из файла «${url}»`);
      return { type: 'hdri', label: `HDRI: ${url}` };
    } catch (err) {
      console.warn(`[Освещение] Не удалось загрузить «${url}»:`, err);
      this.type = 'room';
      this.rebuild();
      console.log('[Освещение] Включено запасное освещение RoomEnvironment');
      return { type: 'room', label: 'Запасное: RoomEnvironment', error: err };
    }
  }

  // (Пере)создаёт карту окружения через PMREMGenerator и записывает её в scene.environment
  rebuild(reason) {
    if (!this.type) return; // освещение ещё не загружено
    const r = this.renderer;
    // Во время AR рендер идёт через XR-камеру; для подготовки карты XR временно выключаем
    const xrEnabled = r.xr.enabled;
    r.xr.enabled = false;
    const pmrem = new THREE.PMREMGenerator(r);
    try {
      const envMap = this.type === 'hdri'
        ? pmrem.fromEquirectangular(this.hdr).texture
        : pmrem.fromScene(new RoomEnvironment(r), 0.04).texture;
      const old = this.scene.environment;
      this.scene.environment = envMap;
      if (old && old !== envMap) old.dispose();
      if (reason) console.log(`[Освещение] Карта окружения пересобрана (${reason})`);
    } catch (err) {
      console.error('[Освещение] Не удалось подготовить карту окружения:', err);
    } finally {
      pmrem.dispose();
      r.xr.enabled = xrEnabled;
    }
  }
}
