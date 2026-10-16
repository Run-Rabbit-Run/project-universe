import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SketchShader } from './sketchPass.js';
import { createBackground } from './background.js';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Выше 1,5 разница на глаз почти незаметна, а пикселей на HiDPI-экране становится вчетверо больше
const MAX_PIXEL_RATIO = 1.5;

export class Viewer {
  constructor(canvas) {
    this.canvas = canvas;
    // Без 'high-performance': ноутбук не будит дискретную видеокарту ради страницы, которая чаще всего стоит на месте
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setClearColor(0x020308, 1);
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 0.85;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.02, 6000);
    this.camera.position.set(0, 300, 300);

    this.shared = {
      uBand: { value: new THREE.Vector4(1, 0, 0, 0) },
      uPixelRatio: { value: 1 },
      uScale: { value: 1 },
      uCamPos: { value: this.camera.position },
      uDetail: { value: 0 },
    };

    this.controls = new OrbitControls(this.camera, canvas);
    Object.assign(this.controls, {
      enableDamping: true,
      dampingFactor: 0.07,
      rotateSpeed: 0.55,
      zoomSpeed: 0.9,
      panSpeed: 0.6,
      minDistance: 1.2,
      maxDistance: 520,
      screenSpacePanning: true,
      autoRotateSpeed: -0.35,
    });
    this.controls.addEventListener('start', () => {
      if (this.flight && !this.flight.locked) this.flight = null;
      this.onUserInteract?.();
    });
    // Кадр перерисовывается только когда что-то изменилось
    this.dirty = true;
    this.controls.addEventListener('change', () => this.invalidate());

    this.background = createBackground(this.shared);
    this.scene.add(this.background);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.5, 0.38);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.sketch = new ShaderPass(SketchShader);
    this.sketch.uniforms.uRes.value = new THREE.Vector2(1, 1);
    this.sketch.enabled = false;
    this.composer.addPass(this.sketch);

    this.bandFrom = new THREE.Vector4(1, 0, 0, 0);
    this.bandTo = new THREE.Vector4(1, 0, 0, 0);
    this.sketchFrom = 0;
    this.sketchTo = 0;
    this.bandT = 1;

    // Сдвиг кадра, когда справа открыта панель: галактика остаётся в видимой части экрана
    this.inset = 0;
    this.insetTarget = 0;

    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this.listeners = new Set();
    this.width = 1;
    this.height = 1;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  invalidate() {
    this.dirty = true;
  }

  // Пределы приближения: у каждой галактики свои масштабы (MPG-CR3 — сотни св. лет, Хог — сотни тысяч)
  setDistanceLimits(min, max) {
    this.controls.minDistance = min;
    this.controls.maxDistance = max;
  }

  setRightInset(px) {
    this.insetTarget = px;
  }

  // Возвращает true, пока сдвиг кадра ещё анимируется
  applyInset(dt) {
    if (Math.abs(this.insetTarget - this.inset) < 0.5) {
      if (this.inset === this.insetTarget) return false;
      this.inset = this.insetTarget;
    } else {
      this.inset += (this.insetTarget - this.inset) * Math.min(1, dt * 7);
    }
    if (this.inset > 0) {
      this.camera.setViewOffset(this.width, this.height, this.inset / 2, 0, this.width, this.height);
    } else {
      this.camera.clearViewOffset();
    }
    return true;
  }

  add(object) {
    this.scene.add(object);
  }

  onFrame(fn) {
    this.listeners.add(fn);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    // Свёрнутое окно или скрытая вкладка дают нулевой размер: пропорции кадра стали бы NaN,
    // и камера улетела бы «в никуда». Ждём следующего resize с настоящим размером.
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    if (this.inset > 0) this.camera.setViewOffset(w, h, this.inset / 2, 0, w, h);
    this.camera.updateProjectionMatrix();
    this.shared.uPixelRatio.value = dpr;
    this.shared.uScale.value = (h * dpr) / 2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    this.sketch.uniforms.uRes.value.set(w * dpr, h * dpr);
    this.sketch.uniforms.uDpr.value = dpr;
    this.width = w;
    this.height = h;
    this.invalidate();
  }

  // Расстояние, на котором объект с полувысотой rv и полушириной rh целиком помещается в кадр.
  fitDistance(rv, rh = rv, margin = 1.08) {
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    return margin * Math.max(rv / Math.sin(vfov / 2), rh / Math.sin(hfov / 2));
  }

  currentView() {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const s = new THREE.Spherical().setFromVector3(offset);
    return { target: this.controls.target.clone(), radius: s.radius, phi: s.phi, theta: s.theta };
  }

  setView(view) {
    this.flight = null;
    this.controls.target.copy(view.target);
    this.camera.position.setFromSpherical(new THREE.Spherical(view.radius, view.phi, view.theta)).add(view.target);
    this.controls.update();
    this.invalidate();
  }

  // Плавный перелёт: цель — линейно, радиус — логарифмически, углы — по кратчайшей дуге.
  flyTo(view, { duration = 1.8, locked = false } = {}) {
    const from = this.currentView();
    const to = { ...view, target: view.target.clone() };
    let dTheta = to.theta - from.theta;
    dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));
    to.theta = from.theta + dTheta;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) duration = 0.01;
    this.stopInertia();
    this.flight = { from, to, t0: performance.now(), duration: duration * 1000, locked };
    return new Promise((resolve) => (this.flight.resolve = resolve));
  }

  // Гасим остаточное вращение после жеста мышью, иначе после перелёта вид «доезжает» сам.
  // У OrbitControls нет публичного метода для этого, поэтому обнуляем его внутренние накопители.
  stopInertia() {
    const c = this.controls;
    c._sphericalDelta?.set(0, 0, 0);
    c._panOffset?.set(0, 0, 0);
    if ('_scale' in c) c._scale = 1;
  }

  stepFlight(now) {
    const f = this.flight;
    if (!f) return;
    const k = Math.min(1, (now - f.t0) / f.duration);
    const e = ease(k);
    const target = f.from.target.clone().lerp(f.to.target, e);
    const radius = Math.exp(THREE.MathUtils.lerp(Math.log(f.from.radius), Math.log(f.to.radius), e));
    const phi = THREE.MathUtils.lerp(f.from.phi, f.to.phi, e);
    const theta = THREE.MathUtils.lerp(f.from.theta, f.to.theta, e);
    this.controls.target.copy(target);
    this.camera.position.setFromSpherical(new THREE.Spherical(radius, phi, theta)).add(target);
    // Камера всё время смотрит на цель, поэтому галактика остаётся в центре кадра
    this.camera.lookAt(target);
    if (k >= 1) {
      this.flight = null;
      this.stopInertia();
      f.resolve?.();
    }
  }

  setBand(band, { instant = false } = {}) {
    this.bandFrom.copy(this.shared.uBand.value);
    this.bandTo.set(...band.weights);
    this.sketchFrom = this.sketch.uniforms.uAmount.value;
    this.sketchTo = band.sketch;
    if (band.sketch) this.sketch.uniforms.uStyle.value = band.style ?? 0;
    this.bandT = instant ? 1 : 0;
    if (instant) this.applyBand(1);
    this.invalidate();
  }

  applyBand(e) {
    this.shared.uBand.value.lerpVectors(this.bandFrom, this.bandTo, e);
    const s = THREE.MathUtils.lerp(this.sketchFrom, this.sketchTo, e);
    this.sketch.uniforms.uAmount.value = s;
    this.sketch.enabled = s > 0.001;
  }

  start() {
    const loop = () => {
      requestAnimationFrame(loop);
      this.timer.update();
      const dt = Math.min(this.timer.getDelta(), 0.1);
      const now = performance.now();
      let changed = this.dirty;
      if (this.bandT < 1) {
        this.bandT = Math.min(1, this.bandT + dt / 0.9);
        this.applyBand(ease(this.bandT));
        changed = true;
      }
      if (this.flight) {
        this.stepFlight(now);
        changed = true;
      } else if (this.controls.update(dt)) {
        // true, пока камера движется: жест, инерция, автовращение
        changed = true;
      }
      if (this.applyInset(dt)) changed = true;
      // Ничего не изменилось — видеокарта отдыхает
      if (!changed) return;
      this.dirty = false;
      this.background.position.copy(this.camera.position);
      this.camera.updateMatrixWorld();
      const dist = this.camera.position.distanceTo(this.controls.target);
      this.shared.uDetail.value = 1 - THREE.MathUtils.smoothstep(dist, 8, 45);
      for (const fn of this.listeners) fn(dt);
      this.composer.render(dt);
    };
    loop();
  }
}
