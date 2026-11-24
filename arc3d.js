import * as THREE from "./vendor/three.module.min.js";

/**
 * Interactive 3D DOE INL TMAP8 ARC-Class 505.6 MWf 11-Subsystem Pulsed Fusion Plant (Three.js WebGL)
 * Grounded in Meschini et al. (Nuclear Fusion 63, 2023) & INL `fuel_cycle.i`:
 *   T_01_BZ (FLiBe Liquid Immersion Blanket), T_02_TES (Tritium Extraction), T_03_FW (First Wall),
 *   T_04_DIV (Divertor), T_05_HX (Primary HX — 100 mg cap), T_06_DS (Detritiation),
 *   T_07_vacuum (Divertor Cryopumps + DIR), T_08_FCU (Fuel Clean-Up), T_09_ISS (Cryo ISS),
 *   T_10_storage (Storage & 24h Reserve Vault — 1.00 kg startup cap), T_11_membrane (Permeation Membrane).
 */

export const ARC_SUBSYSTEM_INFO = {
  blanket: {
    vars: "T_01_BZ · T_03_FW · T_04_DIV",
    title: "ARC Compact Tokamak & FLiBe Immersion Blanket",
    plain: "Demountable REBCO magnets surround a 505.6 MWf pulsed plasma inside a single liquid FLiBe immersion tank.",
    physics: "1,800 s burn/dwell cycle · τ_BB ∈ [900, 14400] s · TBR ∈ [1.02, 1.18].",
  },
  tes_hx: {
    vars: "T_02_TES · T_05_HX · T_11_membrane",
    title: "Tritium Extraction (TES) & Primary HX (100 mg Cap)",
    plain: "TES strips tritium from FLiBe before the Primary HX so steam-loop permeation stays ≤ 100 mg.",
    physics: "INL baseline hits 310–537 mg (VETO); higher η₂ + shorter τ_HX clear the cap.",
  },
  exhaust: {
    vars: "T_07_vacuum · T_08_FCU · T_09_ISS · T_06_DS",
    title: "Cryopumps (DIR), Fuel Clean-Up, ISS & Detritiation",
    plain: "Recycles unburned D-T directly to storage (f_DIR) while purifying exhaust impurities.",
    physics: "Total active in-process tritium capped at ≤ 220 g (INL baseline: 463 g).",
  },
  storage: {
    vars: "T_10_storage",
    title: "Tritium Storage Vault & 24h Outage Reserve",
    plain: "Startup tritium is capped at ≤ 1.00 kg ($30M/kg), must stay above 24h reserve, and double in ≤ 1.5 yr.",
    physics: "INL baseline starts at 1.14 kg (VETO) yet still breaches reserve under tbe_drop.",
  },
};

export function initArc3D({ container, onSelectSubsystem, getTheme, isInitiallyPaused }) {
  if (!container) return null;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  } catch (err) {
    console.warn("WebGL unavailable for ARC 3D:", err);
    return null;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.14;
  renderer.domElement.className = "plant3d-canvas";
  renderer.domElement.setAttribute("aria-label", "Interactive 3D DOE INL TMAP8 ARC 11-Subsystem Fusion Plant: drag to orbit, scroll to zoom, click subsystems");
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 120);

  // ---------- Lighting ----------
  const hemi = new THREE.HemisphereLight(0xe0f2fe, 0x0f172a, 1.15);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(11, 16, 11);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x38bdf8, 0.85);
  fill.position.set(-10, 9, -9);
  scene.add(fill);

  const arcPlasmaLight = new THREE.PointLight(0xff7b38, 3.0, 11);
  arcPlasmaLight.position.set(-4.6, 1.9, -0.4);
  scene.add(arcPlasmaLight);

  // ---------- Theme & Floor Grid ----------
  let grid = null;
  const floorGroup = new THREE.Group();
  scene.add(floorGroup);

  function applyTheme(scheme) {
    const dark = scheme === "dark";
    scene.background = new THREE.Color(dark ? 0x0b1220 : 0xf1f5f9);
    scene.fog = new THREE.Fog(dark ? 0x0b1220 : 0xf1f5f9, 25, 55);
    hemi.intensity = dark ? 0.95 : 1.35;
    if (grid) floorGroup.remove(grid);
    grid = new THREE.GridHelper(28, 28, dark ? 0x2a3b55 : 0x94a3b8, dark ? 0x162234 : 0xdbe4ef);
    grid.position.y = -0.02;
    floorGroup.add(grid);
  }
  applyTheme(getTheme());

  // ---------- Shared Materials ----------
  const matMetal = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.72, roughness: 0.28 });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.78, roughness: 0.30 });
  const matRebco = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.75, roughness: 0.22 }); // REBCO demountable copper/HTS coils
  const matFlibeVat = new THREE.MeshPhysicalMaterial({
    color: 0x0ea5e9,
    emissive: 0x0369a1,
    emissiveIntensity: 0.28,
    roughness: 0.16,
    metalness: 0.1,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  const matGlass = new THREE.MeshPhysicalMaterial({
    color: 0xdbeafe,
    roughness: 0.12,
    metalness: 0.05,
    transparent: true,
    opacity: 0.30,
    depthWrite: false,
  });

  // Dynamic status materials (shift to red alarm / overload / healthy green live!)
  const matHxCore = new THREE.MeshStandardMaterial({ color: 0x2b7de9, emissive: 0x1d4ed8, emissiveIntensity: 0.35, roughness: 0.28, metalness: 0.45 });
  const matTesBody = new THREE.MeshStandardMaterial({ color: 0x0d9488, emissive: 0x0f766e, emissiveIntensity: 0.3, roughness: 0.3, metalness: 0.45 });
  const matExhaustBody = new THREE.MeshStandardMaterial({ color: 0x6366f1, emissive: 0x4338ca, emissiveIntensity: 0.25, roughness: 0.32, metalness: 0.5 });
  const matStorageLiquid = new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x059669, emissiveIntensity: 0.45, roughness: 0.25 });

  const pickables = [];
  const rings = {};
  function registerPickable(group, keyId, pos, radius, colorHex) {
    group.traverse((o) => { if (o.isMesh) o.userData.arcKey = keyId; });
    pickables.push(group);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius, radius + 0.13, 48),
      new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 0.0 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.03, pos.z);
    scene.add(ring);
    rings[keyId] = ring;
  }

  // =========================================================================
  // 1. ARC COMPACT TOKAMAK + FLiBe LIQUID IMMERSION BLANKET (T_01_BZ, T_03_FW, T_04_DIV)
  // =========================================================================
  const arcGroup = new THREE.Group();
  arcGroup.position.set(-4.6, 1.9, -0.4);
  scene.add(arcGroup);

  const arcPedestal = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.3, 36), matDark);
  arcPedestal.position.y = -1.75;
  arcGroup.add(arcPedestal);

  // Liquid FLiBe Immersion Tank (cutaway translucent cyan-blue cylindrical vat!)
  const flibeTank = new THREE.Mesh(new THREE.CylinderGeometry(1.88, 1.88, 2.65, 36, 1, false, 0, Math.PI * 1.48), matFlibeVat);
  flibeTank.rotation.y = Math.PI * 0.45;
  flibeTank.position.y = -0.15;
  arcGroup.add(flibeTank);

  // Central solenoid
  const arcSolenoid = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 2.75, 24), matMetal);
  arcGroup.add(arcSolenoid);

  // Pulsed burning D-T plasma torus
  const arcPlasmaMat = new THREE.MeshStandardMaterial({
    color: 0xff6b35,
    emissive: 0xff521b,
    emissiveIntensity: 1.45,
    transparent: true,
    opacity: 0.72,
    roughness: 0.2,
  });
  const arcPlasma = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.34, 24, 56), arcPlasmaMat);
  arcPlasma.rotation.x = Math.PI / 2;
  arcGroup.add(arcPlasma);

  // Divertor ring (T_04_DIV) at bottom of chamber
  const divRing = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.13, 14, 40), matDark);
  divRing.rotation.x = Math.PI / 2;
  divRing.position.y = -0.68;
  arcGroup.add(divRing);

  // 14 Demountable REBCO High-Field TF Coils (3 omitted in front cutaway!)
  const rebcoGeo = new THREE.TorusGeometry(0.92, 0.075, 10, 26);
  for (let i = 0; i < 14; i++) {
    if (i === 1 || i === 2 || i === 3) continue;
    const ang = (i / 14) * Math.PI * 2;
    const c = new THREE.Mesh(rebcoGeo, matRebco);
    c.position.set(Math.cos(ang) * 1.15, 0, Math.sin(ang) * 1.15);
    c.rotation.y = -ang;
    c.scale.set(0.84, 1.32, 1);
    arcGroup.add(c);
  }

  registerPickable(arcGroup, "blanket", { x: -4.6, z: -0.4 }, 2.5, 0x0ea5e9);

  // =========================================================================
  // 2. TES (T_02_TES) + PRIMARY HX (T_05_HX — 100 mg LIMIT!) + MEMBRANE (T_11)
  // =========================================================================
  const tesHxGroup = new THREE.Group();
  tesHxGroup.position.set(0.6, 0, -1.6);
  scene.add(tesHxGroup);

  // T_02_TES Vacuum Disengager Tower
  const tesTower = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 2.75, 24), matTesBody);
  tesTower.position.set(-1.1, 1.4, 0);
  tesHxGroup.add(tesTower);
  const tesCap = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), matMetal);
  tesCap.position.set(-1.1, 2.77, 0);
  tesHxGroup.add(tesCap);

  // T_11_membrane Permeator Skid (front-left of TES)
  const memSkid = new THREE.Mesh(
    new THREE.BoxGeometry(0.82, 0.72, 0.75),
    new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x047857, emissiveIntensity: 0.35, metalness: 0.5, roughness: 0.25 })
  );
  memSkid.position.set(-1.1, 0.55, 1.15);
  tesHxGroup.add(memSkid);

  // T_05_HX Primary Heat Exchanger (critical 100 mg steam barrier!)
  const hxShell = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.74, 2.55, 28), matGlass);
  hxShell.rotation.z = Math.PI / 2;
  hxShell.position.set(1.35, 1.55, 0);
  tesHxGroup.add(hxShell);

  const hxCore = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 2.25, 22), matHxCore);
  hxCore.rotation.z = Math.PI / 2;
  hxCore.position.set(1.35, 1.55, 0);
  tesHxGroup.add(hxCore);

  [-0.05, 2.75].forEach((fx) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.45, 0.9), matDark);
    leg.position.set(fx + 0.3, 0.72, 0);
    tesHxGroup.add(leg);
  });

  registerPickable(tesHxGroup, "tes_hx", { x: 0.8, z: -1.5 }, 2.45, 0x2b7de9);

  // =========================================================================
  // 3. EXHAUST TRAIN: T_07_vacuum + T_08_FCU + T_09_ISS + T_06_DS (x = -0.2, z = 2.6)
  // =========================================================================
  const exhaustGroup = new THREE.Group();
  exhaustGroup.position.set(-0.2, 0, 2.6);
  scene.add(exhaustGroup);

  // Twin T_07_vacuum cryopumps
  [-0.45, 0.45].forEach((cz) => {
    const cryoPump = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 1.25, 18), matExhaustBody);
    cryoPump.position.set(-1.45, 0.68, cz);
    exhaustGroup.add(cryoPump);
  });

  // T_08_FCU Palladium Clean-Up Box
  const fcuBox = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.05, 0.95), matExhaustBody);
  fcuBox.position.set(-0.1, 0.55, 0);
  exhaustGroup.add(fcuBox);

  // T_09_ISS Cryogenic Isotope Separation Tower
  const issGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 3.0, 24), matGlass);
  issGlass.position.set(1.15, 1.6, 0);
  exhaustGroup.add(issGlass);
  for (let i = 0; i < 10; i++) {
    const tr = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.38, 0.05, 20),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.25 })
    );
    tr.position.set(1.15, 0.4 + i * 0.25, 0);
    exhaustGroup.add(tr);
  }

  // T_06_DS Detritiation System Scrubber
  const dsUnit = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.45, 20), matMetal);
  dsUnit.position.set(2.25, 0.78, -0.75);
  exhaustGroup.add(dsUnit);

  registerPickable(exhaustGroup, "exhaust", { x: 0.2, z: 2.5 }, 2.35, 0x6366f1);

  // =========================================================================
  // 4. T_10_storage VAULT WITH LIVE TRITIUM FILL-LEVEL & 1.00 kg / 24h RESERVE RINGS!
  // =========================================================================
  const storageGroup = new THREE.Group();
  storageGroup.position.set(4.85, 0, 1.15);
  scene.add(storageGroup);

  const stoBase = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.25, 0.32, 28), matDark);
  stoBase.position.y = 0.16;
  storageGroup.add(stoBase);

  const stoVault = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 3.1, 28), matGlass);
  stoVault.position.y = 1.85;
  storageGroup.add(stoVault);

  // Live tritium level cylinder (scaled dynamically by I0!)
  const stoFillMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 1.0, 24), matStorageLiquid);
  stoFillMesh.position.y = 0.35;
  storageGroup.add(stoFillMesh);

  // 1.00 kg DOE Startup Cap Ring (red-amber ring at y = 0.35 + (1.0/1.35)*2.7 = 2.35)
  const capRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.99, 0.045, 10, 36),
    new THREE.MeshBasicMaterial({ color: 0xef4444 })
  );
  capRing.rotation.x = Math.PI / 2;
  capRing.position.y = 0.35 + (1.0 / 1.35) * 2.7;
  storageGroup.add(capRing);

  // 24h Outage Reserve Floor Ring (amber ring updated dynamically!)
  const reserveRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.99, 0.045, 10, 36),
    new THREE.MeshBasicMaterial({ color: 0xf59e0b })
  );
  reserveRing.rotation.x = Math.PI / 2;
  reserveRing.position.y = 0.35 + (0.54 / 1.35) * 2.7;
  storageGroup.add(reserveRing);

  registerPickable(storageGroup, "storage", { x: 4.85, z: 1.15 }, 1.45, 0x10b981);

  // =========================================================================
  // 5. 11-SUBSYSTEM CONNECTING PIPES & FLOWING PARTICLES
  // =========================================================================
  const matPipeFlibe = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.48, roughness: 0.3 });
  const matPipeTrit = new THREE.MeshStandardMaterial({ color: 0x10b981, transparent: true, opacity: 0.52, roughness: 0.3 });
  const matPipeExh = new THREE.MeshStandardMaterial({ color: 0x818cf8, transparent: true, opacity: 0.48, roughness: 0.3 });

  const flowSpecs = [
    // BZ -> TES -> HX -> BZ loop
    { color: 0x38bdf8, mat: matPipeFlibe, count: 16, speed: 0.25, pts: [[-3.1, 2.2, -0.9], [-1.9, 2.2, -1.6], [-0.5, 2.2, -1.6]] },
    { color: 0x0284c7, mat: matPipeFlibe, count: 14, speed: 0.24, pts: [[0.1, 1.6, -1.6], [1.0, 1.55, -1.6], [2.8, 1.55, -1.6]] },
    { color: 0x0ea5e9, mat: matPipeFlibe, count: 16, speed: 0.22, pts: [[2.8, 1.1, -1.6], [0.5, 0.8, -2.5], [-2.8, 0.9, -2.1], [-3.6, 1.2, -1.2]] },
    // TES -> Membrane -> Storage (T10)
    { color: 0x10b981, mat: matPipeTrit, count: 18, speed: 0.22, pts: [[-0.5, 0.6, -0.45], [2.2, 0.6, 0.1], [4.0, 1.0, 0.9]] },
    // Divertor -> T_07_vacuum -> FCU -> ISS -> Storage
    { color: 0x818cf8, mat: matPipeExh, count: 18, speed: 0.23, pts: [[-4.0, 1.15, 0.9], [-2.8, 0.95, 2.2], [-1.65, 0.85, 2.6], [-0.3, 0.85, 2.6], [0.95, 1.1, 2.6]] },
    // Direct Internal Recycling (f_DIR): T_07_vacuum -> T_10_storage!
    { color: 0x22c55e, mat: matPipeTrit, count: 18, speed: 0.28, pts: [[-1.4, 1.35, 3.1], [1.6, 1.4, 3.8], [4.3, 1.3, 2.0]] },
    // ISS -> Storage
    { color: 0x34d399, mat: matPipeTrit, count: 12, speed: 0.24, pts: [[1.15, 2.6, 2.6], [2.9, 2.1, 2.0], [4.1, 1.7, 1.35]] },
    // T_10_storage -> Core Pellet Fueling Return
    { color: 0xf59e0b, mat: matPipeTrit, count: 24, speed: 0.19, pts: [[4.85, 3.4, 1.15], [3.5, 4.15, 0.2], [-0.8, 4.25, -0.2], [-4.1, 3.3, -0.4]] },
  ];

  const beads = [];
  const totalBeads = flowSpecs.reduce((s, f) => s + f.count, 0);
  const beadMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.085, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.2 }),
    totalBeads
  );
  scene.add(beadMesh);

  let bi = 0;
  flowSpecs.forEach((fs) => {
    const curve = new THREE.CatmullRomCurve3(fs.pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.10, 10, false), fs.mat));
    const c = new THREE.Color(fs.color);
    for (let i = 0; i < fs.count; i++) {
      beads.push({ idx: bi, curve, phase: i / fs.count, speed: fs.speed });
      beadMesh.setColorAt(bi, c);
      bi++;
    }
  });
  beadMesh.instanceColor.needsUpdate = true;

  // ---------- 3D Floating Pins ----------
  const labelOverlay = container.querySelector(".plant3d-labels");
  const pins = [
    { id: "blanket", text: "ARC FLiBe (T₀₁/T₀₃/T₀₄)", pos: new THREE.Vector3(-4.6, 3.75, -0.4) },
    { id: "tes_hx", text: "TES + HX (T₀₅ ≤100mg)", pos: new THREE.Vector3(1.1, 3.1, -1.6) },
    { id: "exhaust", text: "DIR → FCU → ISS", pos: new THREE.Vector3(0.0, 2.85, 3.2) },
    { id: "storage", text: "Storage T₁₀ (≤1.0kg)", pos: new THREE.Vector3(4.85, 3.7, 1.15) },
  ].map((a) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "p3d-pin";
    btn.textContent = a.text;
    btn.addEventListener("click", () => { flyTo(a.id); onSelectSubsystem(a.id); });
    if (labelOverlay) labelOverlay.appendChild(btn);
    return { el: btn, anchor: a };
  });

  // ---------- Camera Orbit & Presets ----------
  const PRESETS = {
    full:    { target: new THREE.Vector3(0.1, 1.75, 0.4),  radius: 15.6, theta: -0.18, phi: 1.02 },
    blanket: { target: new THREE.Vector3(-4.6, 1.9, -0.4), radius: 6.4,  theta: 0.42,  phi: 1.14 },
    tes_hx:  { target: new THREE.Vector3(0.8, 1.65, -1.5), radius: 6.8,  theta: -0.15, phi: 1.12 },
    exhaust: { target: new THREE.Vector3(0.2, 1.45, 2.5),  radius: 6.8,  theta: 0.18,  phi: 1.10 },
    storage: { target: new THREE.Vector3(4.85, 1.85, 1.15),radius: 5.8,  theta: -0.35, phi: 1.16 },
  };
  let curT = PRESETS.full.target.clone(), dstT = PRESETS.full.target.clone();
  let curR = PRESETS.full.radius, dstR = PRESETS.full.radius;
  let curTh = PRESETS.full.theta, dstTh = PRESETS.full.theta;
  let curPh = PRESETS.full.phi, dstPh = PRESETS.full.phi;

  function flyTo(name) {
    const p = PRESETS[name] || PRESETS.full;
    dstT.copy(p.target); dstR = p.radius; dstTh = p.theta; dstPh = p.phi;
  }

  let dragging = false, moved = false, lx = 0, ly = 0;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  renderer.domElement.addEventListener("pointerdown", (e) => {
    dragging = true; moved = false; lx = e.clientX; ly = e.clientY;
    renderer.domElement.setPointerCapture(e.pointerId);
  });
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lx, dy = e.clientY - ly;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
    lx = e.clientX; ly = e.clientY;
    dstTh -= dx * 0.007;
    dstPh = Math.max(0.35, Math.min(1.48, dstPh - dy * 0.006));
  });
  renderer.domElement.addEventListener("pointerup", (e) => {
    dragging = false;
    if (!moved) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pickables, true);
      if (hits.length && hits[0].object.userData.arcKey) {
        const k = hits[0].object.userData.arcKey;
        onSelectSubsystem(k);
        flyTo(k);
      }
    }
  });
  renderer.domElement.addEventListener("wheel", (e) => {
    e.preventDefault();
    dstR = Math.max(4.4, Math.min(22.5, dstR + e.deltaY * 0.008));
  }, { passive: false });

  function resize() {
    const w = container.clientWidth || 920;
    const h = container.clientHeight || 440;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  new ResizeObserver(resize).observe(container);
  resize();

  // ---------- Live Physics / Safety Visual State Sync ----------
  let paused = !!isInitiallyPaused;
  let selectedKey = "tes_hx";
  let afDuty = 0.79;
  let isVisible = true;
  let rafId = null;
  let lastTs = 0;

  function setSelected(k) {
    selectedKey = k;
    Object.entries(rings).forEach(([id, r]) => { r.material.opacity = id === k ? 0.72 : 0.0; });
  }
  setSelected(selectedKey);

  function updateDesignState({ i0, eta2, af, reserveKg, pNet, presetKey }) {
    afDuty = af;
    // Storage tank fill height (0..1.35 kg mapped to 0.1..2.7 height)
    const hFill = Math.max(0.12, Math.min(2.85, (i0 / 1.35) * 2.7));
    stoFillMesh.scale.y = hFill;
    stoFillMesh.position.y = 0.35 + hFill * 0.5;
    reserveRing.position.y = 0.35 + Math.min(1.3, reserveKg / 1.35) * 2.7;

    const i0Alarm = i0 > 1.00 || i0 < reserveKg;
    matStorageLiquid.color.setHex(i0Alarm ? 0xef4444 : 0x10b981);
    matStorageLiquid.emissive.setHex(i0Alarm ? 0xb91c1c : 0x059669);

    // HX permeation alarm when TES extraction is low (like INL baseline eta2=0.70 -> 310/537 mg!)
    const hxAlarm = presetKey === "inl" || eta2 < 0.86;
    matHxCore.color.setHex(hxAlarm ? 0xef4444 : 0x2b7de9);
    matHxCore.emissive.setHex(hxAlarm ? 0xdc2626 : 0x1d4ed8);
    matHxCore.emissiveIntensity = hxAlarm ? 0.95 : 0.35;

    // Parasitic overload glow on TES + Exhaust when P_net <= 0 (Naive Corner)
    const overload = pNet <= 0;
    matTesBody.color.setHex(overload ? 0xdc2626 : 0x0d9488);
    matExhaustBody.color.setHex(overload ? 0xdc2626 : 0x6366f1);
  }

  const dummy = new THREE.Object3D();
  const proj = new THREE.Vector3();

  function renderFrame(ts) {
    if (!isVisible) { rafId = null; return; }
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;

    const lerp = 1 - Math.exp(-7 * dt);
    curT.lerp(dstT, lerp);
    curR += (dstR - curR) * lerp;
    curTh += (dstTh - curTh) * lerp;
    curPh += (dstPh - curPh) * lerp;

    // Smooth ARC 1800 s pulsed burn/dwell cycle (visualized over a calm 8-second cycle: AF burn / 1-AF dwell)
    const pulsePhase = (ts * 0.000125) % 1.0;
    const inBurn = pulsePhase < afDuty;
    if (!paused) {
      if (!dragging) dstTh += 0.045 * dt;
      const targetIntensity = inBurn ? 1.55 : 0.32;
      arcPlasmaMat.emissiveIntensity += (targetIntensity - arcPlasmaMat.emissiveIntensity) * 4 * dt;
      arcPlasmaLight.intensity = inBurn ? 3.1 : 0.9;
    }

    for (let i = 0; i < beads.length; i++) {
      const b = beads[i];
      if (!paused) b.phase = (b.phase + b.speed * dt) % 1;
      dummy.position.copy(b.curve.getPointAt(b.phase));
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      beadMesh.setMatrixAt(b.idx, dummy.matrix);
    }
    beadMesh.instanceMatrix.needsUpdate = true;

    camera.position.set(
      curT.x + curR * Math.sin(curPh) * Math.sin(curTh),
      curT.y + curR * Math.cos(curPh),
      curT.z + curR * Math.sin(curPh) * Math.cos(curTh)
    );
    camera.lookAt(curT);
    renderer.render(scene, camera);

    const w = container.clientWidth, h = container.clientHeight;
    pins.forEach(({ el, anchor }) => {
      proj.copy(anchor.pos).project(camera);
      const x = (proj.x * 0.5 + 0.5) * w;
      const y = (-proj.y * 0.5 + 0.5) * h;
      const off = proj.z > 1 || x < 48 || x > w - 48 || y < 44 || y > h - 24;
      el.style.opacity = off ? "0" : "1";
      el.style.pointerEvents = off ? "none" : "auto";
      if (!off) {
        el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        el.classList.toggle("active", anchor.id === selectedKey);
      }
    });

    rafId = requestAnimationFrame(renderFrame);
  }

  function startLoop() { if (!rafId && isVisible) { lastTs = 0; rafId = requestAnimationFrame(renderFrame); } }
  function stopLoop() { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }

  const shell = container.closest(".scene3d-shell") || container;
  if ("contentVisibility" in document.documentElement.style) {
    shell.addEventListener("contentvisibilityautostatechange", (e) => {
      isVisible = !e.skipped;
      if (isVisible) startLoop(); else stopLoop();
    });
  } else {
    new IntersectionObserver((es) => {
      isVisible = es[0].isIntersecting;
      if (isVisible) startLoop(); else stopLoop();
    }, { rootMargin: "200px" }).observe(shell);
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopLoop(); else startLoop(); });
  startLoop();

  return {
    setPaused(p) { paused = !!p; },
    setSelected,
    flyTo,
    applyTheme,
    updateDesignState,
    resize,
  };
}
