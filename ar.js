// ar.js — AR-сессия WebXR: immersive-ar, hit-test, кольцо-маркер и обработка тапа (select)
import * as THREE from 'three';

export class ARManager {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   * @param {HTMLElement} overlayRoot — корень DOM Overlay
   * @param {object} callbacks — onStart, onEnd, onSelect(position), onSurface(found)
   */
  constructor(renderer, scene, overlayRoot, callbacks) {
    this.renderer = renderer;
    this.overlayRoot = overlayRoot;
    this.cb = callbacks;

    this.session = null;
    this.hitTestSource = null;
    this.surfaceFound = false;

    this.reticle = this._createReticle();
    scene.add(this.reticle);

    // Переиспользуемые векторы, чтобы не создавать объекты каждый кадр
    this._pos = new THREE.Vector3();
    this._camPos = new THREE.Vector3();
    this._time = 0;

    this._onSelect = this._onSelect.bind(this);
    this._onEnd = this._onEnd.bind(this);
  }

  get isActive() {
    return this.session !== null;
  }

  // Проверка поддержки immersive-ar
  async checkSupport() {
    if (!window.isSecureContext) return { supported: false, reason: 'Для AR нужен HTTPS или localhost' };
    if (!('xr' in navigator)) return { supported: false, reason: 'WebXR недоступен в этом браузере' };
    try {
      const ok = await navigator.xr.isSessionSupported('immersive-ar');
      return ok ? { supported: true } : { supported: false, reason: 'Устройство не поддерживает immersive-ar' };
    } catch (err) {
      console.error('[AR] Ошибка проверки поддержки:', err);
      return { supported: false, reason: 'Не удалось проверить поддержку AR' };
    }
  }

  // Запуск AR-сессии
  async start() {
    if (this.session) return;
    const session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: this.overlayRoot }
    });

    try {
      this.renderer.xr.setReferenceSpaceType('local');
      await this.renderer.xr.setSession(session);

      // Источник hit-test: луч из центра «взгляда» устройства (viewer)
      const viewerSpace = await session.requestReferenceSpace('viewer');
      this.hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
    } catch (err) {
      session.end().catch(() => {});
      throw err;
    }

    this.session = session;
    // Тап обрабатываем через событие сессии 'select' (работает и для экрана телефона,
    // и для обоих контроллеров в Immersive Web Emulator)
    session.addEventListener('select', this._onSelect);
    session.addEventListener('end', this._onEnd);

    const overlay = session.domOverlayState ? session.domOverlayState.type : 'не поддерживается';
    console.log(`[AR] Сессия запущена. DOM Overlay: ${overlay}`);
    this.cb.onStart?.();
  }

  stop() {
    this.session?.end().catch((err) => console.error('[AR] Ошибка завершения сессии:', err));
  }

  // Вызывается каждый XR-кадр: обновляем положение кольца по результатам hit-test
  update(frame, dt) {
    if (!this.hitTestSource) return;
    const refSpace = this.renderer.xr.getReferenceSpace();
    const results = frame.getHitTestResults(this.hitTestSource);

    let found = false;
    if (results.length > 0) {
      const pose = results[0].getPose(refSpace);
      if (pose) {
        this.reticle.matrix.fromArray(pose.transform.matrix);
        found = true;
      }
    }
    this.reticle.visible = found;

    // Лёгкая «пульсация» внутреннего кольца
    if (found) {
      this._time += dt;
      const s = 1 + 0.08 * Math.sin(this._time * 4);
      this.reticle.userData.inner.scale.set(s, 1, s);
    }

    // Сообщаем наружу только при изменении состояния (без лишней работы каждый кадр)
    if (found !== this.surfaceFound) {
      this.surfaceFound = found;
      this.cb.onSurface?.(found);
    }
  }

  // Позиция камеры (головы/телефона) в мире — чтобы развернуть объект «лицом» к пользователю
  getViewerPosition() {
    const cam = this.renderer.xr.getCamera();
    return this._camPos.setFromMatrixPosition(cam.matrixWorld);
  }

  _onSelect() {
    if (!this.reticle.visible) {
      this.cb.onSelect?.(null); // поверхность ещё не найдена
      return;
    }
    // Берём позицию из матрицы кольца — объект ставится ровно в точку маркера
    this._pos.setFromMatrixPosition(this.reticle.matrix);
    this.cb.onSelect?.(this._pos.clone());
  }

  _onEnd() {
    this.session.removeEventListener('select', this._onSelect);
    this.session.removeEventListener('end', this._onEnd);
    this.hitTestSource?.cancel();
    this.hitTestSource = null;
    this.session = null;
    this.reticle.visible = false;
    this.surfaceFound = false;
    console.log('[AR] Сессия завершена');
    this.cb.onEnd?.();
  }

  // Кольцо-маркер: внешнее кольцо + пульсирующее внутреннее
  _createReticle() {
    const group = new THREE.Group();
    group.matrixAutoUpdate = false; // матрицу задаём сами из hit-test
    group.visible = false;

    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false });
    const outer = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.105, 40).rotateX(-Math.PI / 2), mat);
    const innerMat = mat.clone();
    innerMat.color.set(0x7c9cff);
    const inner = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.05, 32).rotateX(-Math.PI / 2), innerMat);
    outer.renderOrder = inner.renderOrder = 10;

    group.add(outer, inner);
    group.userData.inner = inner;
    return group;
  }
}
