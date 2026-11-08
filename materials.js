// materials.js — PBR-материалы: палитра цветов, пресеты поверхности и нейтральные материалы
import * as THREE from 'three';

// Палитра для выбора цвета основной части модели
export const COLORS = [
  { hex: '#ff6b5a', name: 'Коралловый' },
  { hex: '#f2b33d', name: 'Горчичный' },
  { hex: '#3fbf9f', name: 'Мятный' },
  { hex: '#3d7bf2', name: 'Синий' },
  { hex: '#9b7bf2', name: 'Лавандовый' },
  { hex: '#e85d9a', name: 'Розовый' },
  { hex: '#f3eee6', name: 'Молочный' },
  { hex: '#34373f', name: 'Графит' }
];

// Пресеты поверхности. Разница видна за счёт отражений HDRI (scene.environment)
export const PRESETS = [
  { id: 'matte',   label: 'Матовый' },
  { id: 'gloss',   label: 'Глянец' },
  { id: 'metal',   label: 'Металл' },
  { id: 'lacquer', label: 'Стекло/лак' }
];

export class MaterialLibrary {
  constructor() {
    // Нейтральные материалы создаются один раз и общие для всех копий моделей
    this.neutral = {
      darkMetal: new THREE.MeshStandardMaterial({ color: 0x2b2d33, metalness: 0.85, roughness: 0.35 }),
      brass:     new THREE.MeshStandardMaterial({ color: 0xc9a46a, metalness: 1.0,  roughness: 0.28 }),
      wood:      new THREE.MeshStandardMaterial({ color: 0xc89f73, metalness: 0.0,  roughness: 0.62 }),
      soil:      new THREE.MeshStandardMaterial({ color: 0x3b2a20, metalness: 0.0,  roughness: 1.0 }),
      leaf:      new THREE.MeshStandardMaterial({ color: 0x3f9b4f, metalness: 0.0,  roughness: 0.5 }),
      leafDark:  new THREE.MeshStandardMaterial({ color: 0x2d7a3c, metalness: 0.0,  roughness: 0.55 }),
      bulb:      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe2a8, emissiveIntensity: 1.4, roughness: 0.3 })
    };
  }

  // Создаёт НОВЫЙ материал основной части (у каждого объекта свой, чтобы цвет менялся независимо)
  createMain(presetId, colorHex) {
    const color = new THREE.Color(colorHex);
    const common = { color, side: THREE.DoubleSide }; // DoubleSide — чтобы были видны внутренности абажура/вазы

    switch (presetId) {
      case 'matte':
        return new THREE.MeshStandardMaterial({ ...common, roughness: 0.92, metalness: 0.0 });
      case 'gloss':
        return new THREE.MeshStandardMaterial({ ...common, roughness: 0.18, metalness: 0.0 });
      case 'metal':
        return new THREE.MeshStandardMaterial({ ...common, roughness: 0.22, metalness: 1.0 });
      case 'lacquer':
        // Стекло/лак: полупрозрачный материал с прозрачным лаковым слоем (clearcoat)
        return new THREE.MeshPhysicalMaterial({
          ...common,
          roughness: 0.06,
          metalness: 0.0,
          clearcoat: 1.0,
          clearcoatRoughness: 0.02,
          ior: 1.5,
          transparent: true,
          opacity: 0.78
        });
      default:
        throw new Error(`Неизвестный пресет материала: ${presetId}`);
    }
  }
}
