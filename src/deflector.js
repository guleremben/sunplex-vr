import * as THREE from 'three';

// ---------------------------------------------------------------------------
// SUNPLEX Chrome cam ruzgarligi — prosedurel model
// Referans: CHERY TIGGO 8 SOL ON / SOL ARKA studyo cekimleri.
// Form: pencere ust kenarini takip eden yay seklinde visor.
// Ust kenarda parlak paslanmaz krom serit, govde parlak siyah akrilik.
// ---------------------------------------------------------------------------

export const MATERIALS = {
  acrylic: null,
  chrome: null
};

export function initDeflectorMaterials() {
  if (MATERIALS.acrylic) return MATERIALS;
  MATERIALS.acrylic = new THREE.MeshPhysicalMaterial({
    color: 0x0a0a0c,
    metalness: 0.0,
    roughness: 0.22,
    clearcoat: 0.9,
    clearcoatRoughness: 0.16,
    envMapIntensity: 0.55,
    side: THREE.DoubleSide
  });
  MATERIALS.chrome = new THREE.MeshStandardMaterial({
    color: 0xf5f7fa,
    metalness: 1.0,
    roughness: 0.06,
    envMapIntensity: 1.35,
    side: THREE.DoubleSide
  });
  return MATERIALS;
}

/**
 * Bir omurga egrisi + yukseklik profili uzerinden visor kabugu uretir.
 * spinePts  : THREE.Vector3[] — ust (krom) kenarin gectigi hat
 * heightFn  : t(0..1) -> metre cinsinden visor yuksekligi
 * options   : { chromeRatio, thickness, flare, curl }
 *   flare : alt kenarin disari acilma miktari (m)
 *   curl  : kesitin bombeleme miktari (m)
 */
export function buildDeflector(spinePts, heightFn, options = {}) {
  const {
    chromeRatio = 0.17,
    thickness = 0.0032,
    flare = 0.028,
    curl = 0.010,
    segments = 96,
    outward = new THREE.Vector3(0, 0, 1) // disari yonu (yerel uzayda +Z)
  } = options;

  initDeflectorMaterials();

  const curve = new THREE.CatmullRomCurve3(spinePts, false, 'catmullrom', 0.5);
  const rows = segments + 1;
  const COLS = 7; // kesit cozunurlugu (ust -> alt)

  // Kesit: s=0 ust kenar, s=1 alt uc. Disari acilim + bombe.
  const sectionOffset = (s) => {
    const drop = s;                       // asagi
    const out = Math.sin(s * Math.PI * 0.5) * flare + Math.sin(s * Math.PI) * curl;
    return { drop, out };
  };

  const outerPos = [];
  const frames = [];
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < rows; i++) {
    const t = i / segments;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t).normalize();
    // yerel "disari": omurga tanjantina dik, verilen outward'a yakin
    const side = new THREE.Vector3().crossVectors(tan, up).normalize();
    if (side.dot(outward) < 0) side.negate();
    const down = new THREE.Vector3().crossVectors(side, tan).normalize();
    if (down.y > 0) down.negate();
    frames.push({ p, tan, side, down });
  }

  const h = (t) => Math.max(0.004, heightFn(t));

  // Vertex gridleri: dis yuzey ve ic yuzey
  const vertsOuter = [];
  const vertsInner = [];
  for (let i = 0; i < rows; i++) {
    const t = i / segments;
    const { p, side, down } = frames[i];
    const H = h(t);
    for (let j = 0; j < COLS; j++) {
      const s = j / (COLS - 1);
      const { drop, out } = sectionOffset(s);
      const base = new THREE.Vector3()
        .copy(p)
        .addScaledVector(down, drop * H)
        .addScaledVector(side, out);
      vertsOuter.push(base.clone().addScaledVector(side, thickness * 0.5));
      vertsInner.push(base.clone().addScaledVector(side, -thickness * 0.5));
    }
  }

  const positions = [];
  const indices = [];
  const pushQuad = (a, b, c, d) => { indices.push(a, b, d, b, c, d); };

  // once tum vertexler: outer grid, sonra inner grid
  const O = 0;
  const I = rows * COLS;
  for (const v of vertsOuter) positions.push(v.x, v.y, v.z);
  for (const v of vertsInner) positions.push(v.x, v.y, v.z);

  const idx = (grid, i, j) => grid + i * COLS + j;

  // dis yuzey (disari bakar)
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < COLS - 1; j++) {
      pushQuad(idx(O, i, j), idx(O, i + 1, j), idx(O, i + 1, j + 1), idx(O, i, j + 1));
    }
  }
  // ic yuzey (ters sarim)
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < COLS - 1; j++) {
      pushQuad(idx(I, i, j + 1), idx(I, i + 1, j + 1), idx(I, i + 1, j), idx(I, i, j));
    }
  }
  // ust kenar seridi (outer<->inner)
  for (let i = 0; i < rows - 1; i++) {
    pushQuad(idx(I, i, 0), idx(I, i + 1, 0), idx(O, i + 1, 0), idx(O, i, 0));
  }
  // alt kenar
  for (let i = 0; i < rows - 1; i++) {
    pushQuad(idx(O, i, COLS - 1), idx(O, i + 1, COLS - 1), idx(I, i + 1, COLS - 1), idx(I, i, COLS - 1));
  }
  // uclar
  for (let j = 0; j < COLS - 1; j++) {
    pushQuad(idx(O, 0, j), idx(O, 0, j + 1), idx(I, 0, j + 1), idx(I, 0, j));
    const last = rows - 1;
    pushQuad(idx(I, last, j), idx(I, last, j + 1), idx(O, last, j + 1), idx(O, last, j));
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);

  // Malzeme gruplari: krom bant (j < chromeCols) ve akrilik kalani.
  // Grup ayirimi kolonlara gore olmadigi icin pratik cozum: iki ayri cizim grubu
  // yerine kromu ayri ince mesh olarak uretiyoruz.
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, MATERIALS.acrylic);
  body.castShadow = true;

  // ---- Krom serit: ust kenar boyunca dar bir bant ----
  const chromePositions = [];
  const chromeIndices = [];
  const cRows = rows;
  const chromeDepth = chromeRatio; // ust kenarin yuzdesi
  const CC = 3; // kesit noktasi
  const cVertsOut = [];
  const cVertsIn = [];
  for (let i = 0; i < cRows; i++) {
    const t = i / segments;
    const { p, side, down } = frames[i];
    const H = h(t);
    for (let j = 0; j < CC; j++) {
      const s = (j / (CC - 1)) * chromeDepth;
      const { drop, out } = sectionOffset(s);
      const base = new THREE.Vector3()
        .copy(p)
        .addScaledVector(down, drop * H)
        .addScaledVector(side, out);
      cVertsOut.push(base.clone().addScaledVector(side, thickness * 0.5 + 0.0012));
      cVertsIn.push(base.clone().addScaledVector(side, thickness * 0.5 + 0.0002));
    }
  }
  const CO = 0;
  const CI = cRows * CC;
  for (const v of cVertsOut) chromePositions.push(v.x, v.y, v.z);
  for (const v of cVertsIn) chromePositions.push(v.x, v.y, v.z);
  const cidx = (g, i, j) => g + i * CC + j;
  const cQuad = (a, b, c, d) => { chromeIndices.push(a, b, d, b, c, d); };
  for (let i = 0; i < cRows - 1; i++) {
    for (let j = 0; j < CC - 1; j++) {
      cQuad(cidx(CO, i, j), cidx(CO, i + 1, j), cidx(CO, i + 1, j + 1), cidx(CO, i, j + 1));
    }
    // bant kenarlari
    cQuad(cidx(CI, i, 0), cidx(CI, i + 1, 0), cidx(CO, i + 1, 0), cidx(CO, i, 0));
    cQuad(cidx(CO, i, CC - 1), cidx(CO, i + 1, CC - 1), cidx(CI, i + 1, CC - 1), cidx(CI, i, CC - 1));
  }
  const cgeo = new THREE.BufferGeometry();
  cgeo.setAttribute('position', new THREE.Float32BufferAttribute(chromePositions, 3));
  cgeo.setIndex(chromeIndices);
  cgeo.computeVertexNormals();
  const chrome = new THREE.Mesh(cgeo, MATERIALS.chrome);
  chrome.castShadow = true;

  const group = new THREE.Group();
  group.add(body);
  group.add(chrome);
  return group;
}

/**
 * ON KAPI ruzgarligi — SOL ON referansi:
 * sol ucta sivri, asagi kivrilan kuyruk (ayna ucgeni tarafi),
 * saga dogru yukselen genis yay.
 */
export function createFrontDeflector() {
  const spine = [
    new THREE.Vector3(-0.52, -0.115, 0.010),
    new THREE.Vector3(-0.44, -0.070, 0.004),
    new THREE.Vector3(-0.28, -0.014, 0.000),
    new THREE.Vector3(-0.05, 0.030, -0.004),
    new THREE.Vector3(0.22, 0.052, -0.006),
    new THREE.Vector3(0.47, 0.048, -0.004),
    new THREE.Vector3(0.55, 0.040, -0.002)
  ];
  const heightFn = (t) => {
    // sivri kuyruk -> genis orta -> hafif daralan sag uc
    if (t < 0.16) return THREE.MathUtils.lerp(0.006, 0.062, t / 0.16);
    if (t < 0.55) return THREE.MathUtils.lerp(0.062, 0.092, (t - 0.16) / 0.39);
    return THREE.MathUtils.lerp(0.092, 0.078, (t - 0.55) / 0.45);
  };
  return buildDeflector(spine, heightFn, { flare: 0.030, curl: 0.012 });
}

/**
 * ARKA KAPI ruzgarligi — SOL ARKA referansi:
 * daha kisa, daha duz, iki ucu hafif pahli bant.
 */
export function createRearDeflector() {
  const spine = [
    new THREE.Vector3(-0.42, -0.012, 0.006),
    new THREE.Vector3(-0.25, 0.006, 0.001),
    new THREE.Vector3(0.0, 0.018, -0.002),
    new THREE.Vector3(0.24, 0.014, -0.001),
    new THREE.Vector3(0.42, -0.004, 0.004)
  ];
  const heightFn = (t) => {
    if (t < 0.08) return THREE.MathUtils.lerp(0.030, 0.070, t / 0.08);
    if (t > 0.94) return THREE.MathUtils.lerp(0.072, 0.040, (t - 0.94) / 0.06);
    return THREE.MathUtils.lerp(0.070, 0.074, Math.sin(t * Math.PI));
  };
  return buildDeflector(spine, heightFn, { flare: 0.024, curl: 0.009 });
}
