// ui.js — панель управления (DOM): модель, цвет, материал, поворот, удаление, кнопка AR
export class UIManager {
  /**
   * @param {object} opts
   *   models, colors, presets — списки вариантов
   *   initial — { type, color, preset }
   *   handlers — onModel, onColor, onPreset, onRotate(dir), onResetRotation, onDelete, onToggleAR
   */
  constructor({ models, colors, presets, initial, handlers }) {
    this.h = handlers;
    this.panel = document.getElementById('panel');
    this.hintEl = document.getElementById('hint');
    this.toastEl = document.getElementById('toast');
    this._toastTimer = 0;

    this._build(models, colors, presets);
    this.setActive('model', initial.type);
    this.setActive('color', initial.color);
    this.setActive('preset', initial.preset);

    // Нажатия по панели НЕ должны ставить объект в AR:
    // beforexrselect + preventDefault отменяет XR-событие select для этого касания
    document.querySelectorAll('.xr-block').forEach((el) => {
      el.addEventListener('beforexrselect', (e) => e.preventDefault());
    });
  }

  // ---------- Построение панели ----------
  _build(models, colors, presets) {
    this.panel.innerHTML = `
      <div class="panel-head">
        <div class="panel-title"><b>Управление объектом</b></div>
        <button id="ar-btn" class="ar-btn" disabled>Проверка AR…</button>
        <button id="collapse-btn" class="chip">Свернуть</button>
      </div>
      <div class="groups">
        <div>
          <div class="group-label">Модель</div>
          <div class="row" data-group="model">
            ${models.map((m) => `<button class="chip" data-value="${m.id}">${m.label}</button>`).join('')}
          </div>
        </div>
        <div>
          <div class="group-label">Цвет</div>
          <div class="row" data-group="color">
            ${colors.map((c) => `<button class="swatch" data-value="${c.hex}" title="${c.name}" aria-label="${c.name}" style="background:${c.hex}"></button>`).join('')}
          </div>
        </div>
        <div>
          <div class="group-label">Материал</div>
          <div class="row" data-group="preset">
            ${presets.map((p) => `<button class="chip" data-value="${p.id}">${p.label}</button>`).join('')}
          </div>
        </div>
        <div>
          <div class="group-label">Поворот</div>
          <div class="row">
            <button class="chip" data-action="rot-left">Влево 45°</button>
            <button class="chip" data-action="rot-right">Вправо 45°</button>
            <button class="chip" data-action="rot-reset">Сброс</button>
            <button class="chip danger" data-action="delete" disabled>Удалить последний</button>
          </div>
        </div>
      </div>`;

    this.arBtn = this.panel.querySelector('#ar-btn');
    this.collapseBtn = this.panel.querySelector('#collapse-btn');
    this.deleteBtn = this.panel.querySelector('[data-action="delete"]');

    // Один обработчик на всю панель (делегирование событий)
    this.panel.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn || btn.disabled) return;
      try {
        this._onClick(btn);
      } catch (err) {
        this.showError('Ошибка в обработчике кнопки', err);
      }
    });
  }

  _onClick(btn) {
    if (btn.id === 'ar-btn') return this.h.onToggleAR();
    if (btn.id === 'collapse-btn') {
      const collapsed = this.panel.classList.toggle('collapsed');
      this.collapseBtn.textContent = collapsed ? 'Развернуть' : 'Свернуть';
      return;
    }

    const group = btn.parentElement.dataset.group;
    const value = btn.dataset.value;
    if (group === 'model')  { this.setActive('model', value);  return this.h.onModel(value); }
    if (group === 'color')  { this.setActive('color', value);  return this.h.onColor(value); }
    if (group === 'preset') { this.setActive('preset', value); return this.h.onPreset(value); }

    switch (btn.dataset.action) {
      case 'rot-left':  return this.h.onRotate(+1);
      case 'rot-right': return this.h.onRotate(-1);
      case 'rot-reset': return this.h.onResetRotation();
      case 'delete':    return this.h.onDelete();
    }
  }

  // Подсветка выбранного варианта в группе
  setActive(group, value) {
    this.panel.querySelectorAll(`[data-group="${group}"] button`).forEach((b) => {
      b.classList.toggle('active', b.dataset.value === value);
    });
  }

  // ---------- Состояния ----------
  setHint(text, ok = false) {
    this.hintEl.textContent = text;
    this.hintEl.classList.toggle('ok', ok);
  }

  // Короткое «подмигивание» подсказки (например, тап без найденной поверхности)
  flashHint(text) {
    this.setHint(text);
    this.hintEl.classList.add('flash');
    setTimeout(() => this.hintEl.classList.remove('flash'), 250);
  }

  setARSupport({ supported, reason }) {
    if (supported) {
      this.arBtn.disabled = false;
      this.arBtn.textContent = 'Запустить AR';
    } else {
      this.arBtn.disabled = true;
      this.arBtn.textContent = 'AR не поддерживается';
      this.arBtn.title = reason; // причина — во всплывающей подсказке и в консоли
      console.log(`[AR] ${reason}. Работает режим предпросмотра.`);
    }
  }

  setARActive(active) {
    document.body.classList.toggle('ar-active', active);
    this.arBtn.textContent = active ? 'Выйти из AR' : 'Запустить AR';
    this.arBtn.classList.toggle('exit', active);
  }

  setARBusy(busy) {
    this.arBtn.disabled = busy;
    if (busy) this.arBtn.textContent = 'Запуск…';
  }

  setDeleteEnabled(enabled) {
    this.deleteBtn.disabled = !enabled;
  }

  // Ошибка: на экране (всплывающая плашка) и в консоли
  showError(message, err) {
    console.error(`[Ошибка] ${message}`, err ?? '');
    const details = err && err.message ? `: ${err.message}` : '';
    this.toastEl.textContent = `${message}${details}`;
    this.toastEl.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 6000);
  }
}
