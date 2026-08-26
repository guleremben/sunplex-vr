import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

// ---------------------------------------------------------------------------
// SUNPLEX Chrome — Chery Tiggo 8 Sanal Sergi (sade surum)
// Masaustu: GERCEK fotograf kareleri, cercevesiz tam ekran, surukleyerek gezinme.
// VR: SABIT on capraz aci — urun aracin uzerinde, cerceve yok, otomatik gecis yok.
// ---------------------------------------------------------------------------

const app = document.getElementById('app');
const loaderEl = document.getElementById('loader');
const loaderFill = document.getElementById('loader-fill');
const loaderStatus = document.getElementById('loader-status');
const hintEl = document.getElementById('hint');
const infoPanel = document.getElementById('info-panel');
const infoTitle = document.getElementById('info-title');
const infoBody = document.getElementById('info-body');

// ---------- Arac fotograf kareleri (180 derece: on -> arka ceyrek) ----------
const CAR_FRAMES = [
  { src: 'assets/car180/0.jpg', label: 'Ön' },
  { src: 'assets/car180/1.jpg', label: 'Ön Çeyrek' },
  { src: 'assets/car180/2.jpg', label: 'Yan Profil' },
  { src: 'assets/car180/3.jpg', label: 'Arka Çeyrek' }
];
const VR_KARE = 1; // VR daima on capraz (On Ceyrek) karesinde sabittir

// ---------- Renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
app.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

// ---------- Sahne ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1626);
scene.fog = new THREE.Fog(0x0d1626, 14, 34);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.05, 120);
camera.position.set(0, 1.6, 0.4);

// ---------- Showroom zemini (VR perdesinin altinda gorunur) ----------
function makeFloor() {
  const group = new THREE.Group();

  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x11192b,
    metalness: 0.55,
    roughness: 0.22,
    envMapIntensity: 0.9
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(17, 96), floorMat);
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  const cv = document.createElement('canvas');
  cv.width = cv.height = 1024;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(512, 512, 120, 512, 512, 512);
  g.addColorStop(0.0, 'rgba(190,205,225,0.55)');
  g.addColorStop(0.35, 'rgba(120,140,170,0.18)');
  g.addColorStop(0.7, 'rgba(60,80,110,0.05)');
  g.addColorStop(1.0, 'rgba(13,22,38,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 1024);
  const glowTex = new THREE.CanvasTexture(cv);
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(7.5, 72),
    new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.002;
  group.add(glow);

  return group;
}
scene.add(makeFloor());

const fillLight = new THREE.HemisphereLight(0x8fa3c4, 0x0b1220, 0.8);
scene.add(fillLight);

// ---------- VR perdesi: cercevesiz, SABIT on capraz fotograf ----------
const texLoader = new THREE.TextureLoader();
const perdeTex = texLoader.load(CAR_FRAMES[VR_KARE].src);
perdeTex.colorSpace = THREE.SRGBColorSpace;
perdeTex.wrapS = THREE.RepeatWrapping;
perdeTex.repeat.x = -1; // silindir ic yuzeyinde ayna duzeltmesi
perdeTex.offset.x = 1;

// 90 derecelik yay; izleyici merkezde, fotograf zemini showroom zeminine oturur
const PERDE_YARICAP = 5.6;
const PERDE_YAY = THREE.MathUtils.degToRad(90);
const PERDE_YUKSEKLIK = (PERDE_YARICAP * PERDE_YAY) * (2 / 3);

const vrPerde = new THREE.Mesh(
  new THREE.CylinderGeometry(
    PERDE_YARICAP, PERDE_YARICAP, PERDE_YUKSEKLIK, 192, 96, true,
    -PERDE_YAY / 2, PERDE_YAY
  ),
  new THREE.MeshBasicMaterial({ map: perdeTex, side: THREE.BackSide, toneMapped: false })
);
vrPerde.position.set(0, PERDE_YUKSEKLIK * 0.28, 0);
vrPerde.rotation.y = Math.PI;
vrPerde.visible = false;
scene.add(vrPerde);

// Derinlik kabartmasi: MiDaS derinlik haritasiyla perde yuzeyi izleyiciye
// dogru kabarir -> gozlukte gercek stereo derinlik + hafif parallax.
// (beyaz = yakin = cok kabarik; fon duz kalir)
const KABARTMA = 1.35; // metre
{
  const im = new Image();
  im.onload = () => {
    const cv = document.createElement('canvas');
    cv.width = im.width;
    cv.height = im.height;
    const ctx = cv.getContext('2d');
    ctx.drawImage(im, 0, 0);
    const px = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const pos = vrPerde.geometry.attributes.position;
    const uv = vrPerde.geometry.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const u = 1 - uv.getX(i); // texture repeat.x=-1 aynalamasiyla hizali
      const v = 1 - uv.getY(i); // gorsel y yukaridan asagi
      const xi = Math.min(cv.width - 1, Math.max(0, Math.round(u * (cv.width - 1))));
      const yi = Math.min(cv.height - 1, Math.max(0, Math.round(v * (cv.height - 1))));
      const d = px[(yi * cv.width + xi) * 4] / 255;
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const r = Math.hypot(x, z) || 1;
      const nr = PERDE_YARICAP - d * KABARTMA;
      pos.setX(i, (x / r) * nr);
      pos.setZ(i, (z / r) * nr);
    }
    pos.needsUpdate = true;
  };
  im.src = 'assets/car180/1_depth.png';
}

// ---------- Arac fotograf gorunumu (DOM, cercevesiz tam ekran) ----------
const carViewer = document.getElementById('car-viewer');
const carStage = document.getElementById('car-stage');
const angleLabel = document.getElementById('car-angle-label');
const dotsWrap = document.getElementById('car-dots');

const frameImgs = CAR_FRAMES.map((f, i) => {
  const img = document.createElement('img');
  img.src = f.src;
  img.alt = f.label;
  img.draggable = false;
  img.style.opacity = i === VR_KARE ? '1' : '0';
  carStage.appendChild(img);
  return img;
});

const dots = CAR_FRAMES.map((f, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'car-dot' + (i === VR_KARE ? ' active' : '');
  b.title = f.label;
  b.addEventListener('click', () => {
    zoom = 1; panX = 0; panY = 0; applyZoom();
    snapTarget = i;
  });
  dotsWrap.appendChild(b);
  return b;
});

let carAngle = VR_KARE;  // kare indeksi cinsinden konum (0..3, kesirli)
let snapTarget = null;
let dragging = false;
let lastX = 0;
let lastY = 0;
let dragVel = 0;

// tekerlekle yakinlastirma (masaustu): zoom > 1 iken surukleme kaydirma yapar
let zoom = 1;
let panX = 0;
let panY = 0;

function applyZoom() {
  const w = carStage.clientWidth || window.innerWidth || 1920;
  const h = carStage.clientHeight || window.innerHeight || 1080;
  const maxPanX = ((zoom - 1) * w) / 2;
  const maxPanY = ((zoom - 1) * h) / 2;
  panX = Math.max(-maxPanX, Math.min(maxPanX, panX));
  panY = Math.max(-maxPanY, Math.min(maxPanY, panY));
  carStage.style.transform = zoom > 1.001
    ? `translate(${panX}px, ${panY}px) scale(${zoom})`
    : '';
}

carStage.addEventListener('wheel', (e) => {
  e.preventDefault();
  const eski = zoom;
  zoom = Math.max(1, Math.min(2.6, zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
  // imlecin altindaki nokta yerinde kalsin (stage tum ekrani kaplar)
  const mx = e.clientX - window.innerWidth / 2;
  const my = e.clientY - window.innerHeight / 2;
  const oran = zoom / eski;
  panX = (panX - mx) * oran + mx;
  panY = (panY - my) * oran + my;
  if (zoom <= 1.001) { panX = 0; panY = 0; }
  applyZoom();
}, { passive: false });

carStage.addEventListener('dblclick', () => {
  zoom = 1; panX = 0; panY = 0;
  applyZoom();
});

function renderCarViewer() {
  const i0 = Math.max(0, Math.min(2, Math.floor(carAngle)));
  const f = carAngle - i0;
  frameImgs.forEach((img, i) => {
    if (i === i0) img.style.opacity = '1';
    else if (i === i0 + 1) img.style.opacity = String(f);
    else img.style.opacity = '0';
  });
  const nearest = Math.round(carAngle);
  dots.forEach((d, i) => d.classList.toggle('active', i === nearest));
  angleLabel.textContent = CAR_FRAMES[nearest].label;
}

carStage.addEventListener('pointerdown', (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  dragVel = 0;
  snapTarget = null;
  try { carStage.setPointerCapture(e.pointerId); } catch { /* sentetik pointer */ }
  carStage.classList.add('grabbing');
});
carStage.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  if (zoom > 1.001) {
    // yakinlasilmisken surukleme fotografi kaydirir
    panX += dx;
    panY += dy;
    applyZoom();
    return;
  }
  const delta = -dx / (carStage.clientWidth * 0.38);
  carAngle = Math.max(0, Math.min(3, carAngle + delta));
  dragVel = delta;
  renderCarViewer();
});
function endDrag() {
  if (!dragging) return;
  dragging = false;
  carStage.classList.remove('grabbing');
  if (zoom > 1.001) return;
  snapTarget = Math.max(0, Math.min(3, Math.round(carAngle + dragVel * 14)));
}
carStage.addEventListener('pointerup', endDrag);
carStage.addEventListener('pointercancel', endDrag);

window.addEventListener('keydown', (e) => {
  if (vrPreview) return;
  if (e.key === 'ArrowRight') snapTarget = Math.min(3, Math.round(carAngle) + 1);
  if (e.key === 'ArrowLeft') snapTarget = Math.max(0, Math.round(carAngle) - 1);
});

// ---------- Yukleme ----------
function setLoader(pct, text) {
  loaderFill.style.width = `${Math.round(pct * 100)}%`;
  if (text) loaderStatus.textContent = text;
}

setLoader(0.2, 'Araç görselleri yükleniyor');
let loadedCount = 0;
CAR_FRAMES.forEach((f) => {
  const im = new Image();
  im.onload = im.onerror = () => {
    loadedCount += 1;
    setLoader(0.2 + 0.8 * (loadedCount / CAR_FRAMES.length), 'Araç görselleri yükleniyor');
    if (loadedCount === CAR_FRAMES.length) {
      setLoader(1, 'Hazır');
      setTimeout(() => loaderEl.classList.add('hidden'), 350);
      setTimeout(() => hintEl.classList.add('hidden'), 6500);
    }
  };
  im.src = f.src;
});

// ---------- Bilgi paneli ----------
infoTitle.textContent = 'Chery Tiggo 8 2023 — Komple Set';
infoBody.textContent = 'SUNPLEX Chrome metal kromlu cam rüzgarlığı seti, Chery Tiggo 8 üzerinde. 4 kapı camına birebir uyum, çift taraflı bant ile montaj. Parlak siyah akrilik gövde ve paslanmaz çelik krom şerit.';
infoPanel.classList.add('open');
document.getElementById('info-close').addEventListener('click', () => infoPanel.classList.remove('open'));

// ---------- VR onizleme (fare ile bakis + WASD ile sinirli yaklasma) ----------
const vrPreviewBtn = document.getElementById('btn-vr-preview');
let vrPreview = false;
const pvState = { yaw: 0, pitch: 0, dragging: false, lastX: 0, lastY: 0, keys: {} };

// perdeye cok yaklasinca fotograf pikselleneceginden hareket alani sinirlidir:
// izleyici merkez cevresinde 2.4 m yaricapli alanda gezer (perdeye daima >= 3.2 m kalir)
function updateVrPreview(dt) {
  const k = pvState.keys;
  const forward = (k['w'] || k['arrowup'] ? 1 : 0) - (k['s'] || k['arrowdown'] ? 1 : 0);
  const strafe = (k['d'] || k['arrowright'] ? 1 : 0) - (k['a'] || k['arrowleft'] ? 1 : 0);
  if (!forward && !strafe) return;
  const speed = dt * 1.6;
  const fwd = new THREE.Vector3(-Math.sin(pvState.yaw), 0, -Math.cos(pvState.yaw));
  const right = new THREE.Vector3(Math.cos(pvState.yaw), 0, -Math.sin(pvState.yaw));
  camera.position.addScaledVector(fwd, forward * speed);
  camera.position.addScaledVector(right, strafe * speed);
  const p = camera.position;
  // yana fazla kayinca perde kenari gorunur: yanal hareket dar tutulur
  p.x = Math.max(-1.1, Math.min(1.1, p.x));
  const r = Math.hypot(p.x, p.z);
  if (r > 2.4) {
    p.x *= 2.4 / r;
    p.z *= 2.4 / r;
  }
  p.y = 1.6;
}

function applyPreviewLook() {
  camera.rotation.order = 'YXZ';
  camera.rotation.set(pvState.pitch, pvState.yaw, 0);
}

function enterVrPreview() {
  vrPreview = true;
  vrPreviewBtn.classList.add('active');
  carViewer.classList.remove('visible');
  vrPerde.visible = true;
  camera.position.set(0, 1.6, 0.4);
  pvState.yaw = 0;
  pvState.pitch = 0;
  applyPreviewLook();
  hintEl.textContent = 'Fare ile bakının · WASD ile yaklaşın · ESC ile çıkın';
  hintEl.classList.remove('hidden');
}

function exitVrPreview() {
  vrPreview = false;
  vrPreviewBtn.classList.remove('active');
  vrPerde.visible = false;
  carViewer.classList.add('visible');
  hintEl.textContent = 'Sürükleyerek döndürün · Tekerlekle yakınlaşın';
  hintEl.classList.add('hidden');
}

vrPreviewBtn.addEventListener('click', () => (vrPreview ? exitVrPreview() : enterVrPreview()));

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (!vrPreview) return;
  pvState.dragging = true;
  pvState.lastX = e.clientX;
  pvState.lastY = e.clientY;
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!vrPreview || !pvState.dragging) return;
  const dx = e.clientX - pvState.lastX;
  const dy = e.clientY - pvState.lastY;
  pvState.lastX = e.clientX;
  pvState.lastY = e.clientY;
  pvState.yaw -= dx * 0.0038;
  pvState.pitch = Math.max(-1.2, Math.min(1.2, pvState.pitch - dy * 0.0038));
  applyPreviewLook();
});
window.addEventListener('pointerup', () => { pvState.dragging = false; });
window.addEventListener('keydown', (e) => {
  if (!vrPreview) return;
  if (e.key === 'Escape') { exitVrPreview(); return; }
  pvState.keys[e.key.toLowerCase()] = true;
});
window.addEventListener('keyup', (e) => {
  pvState.keys[e.key.toLowerCase()] = false;
});

// ---------- VR (gercek gozluk): sabit on capraz perde ----------
const xrRig = new THREE.Group();
scene.add(xrRig);
renderer.xr.addEventListener('sessionstart', () => {
  vrPerde.visible = true;
  xrRig.position.set(0, 0, 0.4);
  xrRig.add(camera);
});
renderer.xr.addEventListener('sessionend', () => {
  xrRig.remove(camera);
  vrPerde.visible = false;
});

// ---------- Dongu ----------
const clock = new THREE.Clock();
function tick() {
  // Not: setAnimationLoop timestamp gecirir; delta daima clock'tan alinir.
  const dt = Math.min(clock.getDelta(), 0.05);

  if (vrPreview && !renderer.xr.isPresenting) updateVrPreview(dt);

  // masaustu fotograf gorunumu: birakinca duraga otur
  if (!vrPreview && !renderer.xr.isPresenting && snapTarget !== null && !dragging) {
    const diff = snapTarget - carAngle;
    if (Math.abs(diff) < 0.002) {
      carAngle = snapTarget;
      snapTarget = null;
    } else {
      carAngle += diff * Math.min(1, dt * 7);
    }
    renderCarViewer();
  }

  renderer.render(scene, camera);
}
renderer.setAnimationLoop(tick);

carViewer.classList.add('visible');
renderCarViewer();

window.__dbg = {
  camera,
  scene,
  vrPerde,
  renderCarViewer,
  enterVrPreview,
  exitVrPreview,
  get carAngle() { return carAngle; },
  set carAngle(v) { carAngle = v; renderCarViewer(); },
  get vrPreview() { return vrPreview; },
  get zoomState() { return { zoom, panX, panY }; }
};

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
