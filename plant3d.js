import * as THREE from "./vendor/three.module.min.js";

/**
 * Interactive 3D Fusion Pilot Plant Viewer (Three.js WebGL)
 * - Tokamak Burning Plasma Core (12 TF D-coils, helical swirling plasma particles, cutaway PbLi blanket)
 * - Tier 1: Primary PbLi Coolant Loop + Check Valve & Pump
 * - Tier 2: ORNL TRANSFORM 6-Zone Counter-Current PbLi/FLiBe HX + Permeator + Spinning sCO2 Turbine
 * - Tier 3: 16-Stage Cryogenic H2/HD/T2 Distillation Tower + Closed T2 Fuel Return Loop
 * - Supports 360° drag orbit, zoom, smooth camera presets, raycast clicking, Forward Physics vs Backward jax.grad flow,
 *   light/dark theme adaptation, Pause/Play, and efficient off-screen pausing (contentvisibilityautostatechange).
 */

export function initPlant3D({ container, onSelectStage, getTheme, isInitiallyPaused }) {
  if (!container) return null;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  } catch (err) {
    console.warn("WebGL unavailable, falling back to 2D schematic:", err);
    return null;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.domElement.className = "plant3d-canvas";
  renderer.domElement.setAttribute("aria-label", "Interactive 3D Fusion Pilot Plant: drag to rotate, scroll to zoom, click subsystems to inspect");
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 120);

  // ---------- Lighting ----------
  const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 1.1);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
  keyLight.position.set(10, 16, 12);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x60a5fa, 0.9);
  rimLight.position.set(-12, 8, -10);
  scene.add(rimLight);

  const plasmaLight = new THREE.PointLight(0xff6b35, 3.2, 11);
  plasmaLight.position.set(-5.2, 1.75, 0);
  scene.add(plasmaLight);

  // ---------- Subtle Engineering Floor Grid ----------
  let gridHelper = null;
  const floorGroup = new THREE.Group();
  scene.add(floorGroup);

  function applyTheme(scheme) {
    const dark = scheme === "dark";
    scene.background = new THREE.Color(dark ? 0x0b1220 : 0xf1f5f9);
    scene.fog = new THREE.Fog(dark ? 0x0b1220 : 0xf1f5f9, 24, 52);
    hemiLight.intensity = dark ? 0.95 : 1.35;
    keyLight.intensity = dark ? 1.75 : 1.95;
    if (gridHelper) floorGroup.remove(gridHelper);
    gridHelper = new THREE.GridHelper(28, 28, dark ? 0x2a3b55 : 0x94a3b8, dark ? 0x162234 : 0xdbe4ef);
    gridHelper.position.y = -0.02;
    floorGroup.add(gridHelper);
  }
  applyTheme(getTheme());

  // ---------- Shared Materials ----------
  const matSteel = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.72, roughness: 0.30 });
  const matSteelDark = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.80, roughness: 0.28 });
  const matCopper = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.65, roughness: 0.32 });
  const matPbLiPipe = new THREE.MeshStandardMaterial({ color: 0xe06d2b, metalness: 0.45, roughness: 0.35, transparent: true, opacity: 0.55 });
  const matFlibePipe = new THREE.MeshStandardMaterial({ color: 0x2b7de9, metalness: 0.45, roughness: 0.32, transparent: true, opacity: 0.55 });
  const matTritPipe = new THREE.MeshStandardMaterial({ color: 0x157a4c, metalness: 0.40, roughness: 0.35, transparent: true, opacity: 0.58 });
  const matGlass = new THREE.MeshPhysicalMaterial({
    color: 0xcbe4ff,
    metalness: 0.05,
    roughness: 0.12,
    transmission: 0.55,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });

  // Track clickable groups & selection rings
  const pickables = [];
  const selectionRings = {};

  function registerPickable(group, stageId, ringPos, ringRadius, colorHex) {
    group.traverse((obj) => {
      if (obj.isMesh) obj.userData.stageId = stageId;
    });
    pickables.push(group);

    const ringGeo = new THREE.RingGeometry(ringRadius, ringRadius + 0.14, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.0,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(ringPos.x, 0.03, ringPos.z);
    scene.add(ring);
    selectionRings[stageId] = ring;
  }

  // =========================================================================
  // 1. TOKAMAK BURNING PLASMA CORE (Stage 1: x = -5.2, z = 0)
  // =========================================================================
  const tokamakGroup = new THREE.Group();
  tokamakGroup.position.set(-5.2, 1.75, 0);
  scene.add(tokamakGroup);

  // Pedestal base
  const tokBase = new THREE.Mesh(new THREE.CylinderGeometry(2.35, 2.55, 0.28, 36), matSteelDark);
  tokBase.position.y = -1.62;
  tokamakGroup.add(tokBase);

  // Central solenoid
  const solenoid = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 2.7, 28), matSteel);
  tokamakGroup.add(solenoid);
  for (let i = -3; i <= 3; i++) {
    const coilBand = new THREE.Mesh(new THREE.TorusGeometry(0.51, 0.055, 10, 28), matCopper);
    coilBand.rotation.x = Math.PI / 2;
    coilBand.position.y = i * 0.34;
    tokamakGroup.add(coilBand);
  }

  // Glowing toroidal burning plasma
  const plasmaMatOuter = new THREE.MeshStandardMaterial({
    color: 0xff6b35,
    emissive: 0xff521b,
    emissiveIntensity: 1.5,
    roughness: 0.2,
    transparent: true,
    opacity: 0.68,
  });
  const plasmaTorus = new THREE.Mesh(new THREE.TorusGeometry(1.38, 0.42, 28, 64), plasmaMatOuter);
  plasmaTorus.rotation.x = Math.PI / 2;
  tokamakGroup.add(plasmaTorus);

  const plasmaCoreInner = new THREE.Mesh(
    new THREE.TorusGeometry(1.38, 0.19, 20, 48),
    new THREE.MeshBasicMaterial({ color: 0xffe4b5, transparent: true, opacity: 0.85 })
  );
  plasmaCoreInner.rotation.x = Math.PI / 2;
  tokamakGroup.add(plasmaCoreInner);

  // Helical magnetic-field plasma particles (180 glowing points)
  const PLASMA_N = 180;
  const plasmaPos = new Float32Array(PLASMA_N * 3);
  const plasmaMeta = [];
  for (let i = 0; i < PLASMA_N; i++) {
    plasmaMeta.push({
      phi: Math.random() * Math.PI * 2,
      rOff: 0.14 + Math.random() * 0.28,
      speed: 0.9 + Math.random() * 0.9,
      thetaOffset: Math.random() * Math.PI * 2,
    });
  }
  const plasmaGeo = new THREE.BufferGeometry();
  plasmaGeo.setAttribute("position", new THREE.BufferAttribute(plasmaPos, 3));
  const plasmaPoints = new THREE.Points(
    plasmaGeo,
    new THREE.PointsMaterial({ color: 0xffd166, size: 0.095, transparent: true, opacity: 0.95 })
  );
  tokamakGroup.add(plasmaPoints);

  // Cutaway PbLi Breeding Blanket Shell (240° arc leaving front-right cutaway open!)
  const blanketShell = new THREE.Mesh(
    new THREE.TorusGeometry(1.38, 0.64, 22, 48, Math.PI * 1.38),
    new THREE.MeshStandardMaterial({
      color: 0xc2410c,
      emissive: 0x7c2d12,
      emissiveIntensity: 0.35,
      metalness: 0.5,
      roughness: 0.4,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    })
  );
  blanketShell.rotation.x = Math.PI / 2;
  blanketShell.rotation.z = Math.PI * 0.55;
  tokamakGroup.add(blanketShell);

  // 10 Toroidal Field (TF) D-Coils (2 front coils omitted for cutaway view!)
  const tfCoilGeo = new THREE.TorusGeometry(0.84, 0.085, 12, 28);
  for (let i = 0; i < 12; i++) {
    if (i === 1 || i === 2) continue; // cutaway window
    const angle = (i / 12) * Math.PI * 2;
    const coil = new THREE.Mesh(tfCoilGeo, matSteel);
    coil.position.set(Math.cos(angle) * 1.32, 0, Math.sin(angle) * 1.32);
    coil.rotation.y = -angle;
    coil.scale.set(0.82, 1.28, 1);
    tokamakGroup.add(coil);
  }

  registerPickable(tokamakGroup, "core", { x: -5.2, z: 0 }, 2.65, 0xff6b35);

  // =========================================================================
  // 2. TIER 1: PRIMARY PbLi CHECK VALVE & PUMP STATION (x = -1.6, z = -0.2)
  // =========================================================================
  const valveGroup = new THREE.Group();
  valveGroup.position.set(-1.6, 1.9, -0.2);
  scene.add(valveGroup);

  // Stand
  const vStand = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 1.9, 16), matSteelDark);
  vStand.position.y = -0.95;
  valveGroup.add(vStand);

  // Valve bowtie body (2 opposing cones)
  const vMat = new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.65, roughness: 0.28 });
  const coneL = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.62, 20), vMat);
  coneL.rotation.z = -Math.PI / 2;
  coneL.position.x = -0.26;
  valveGroup.add(coneL);

  const coneR = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.62, 20), vMat);
  coneR.rotation.z = Math.PI / 2;
  coneR.position.x = 0.26;
  valveGroup.add(coneR);

  // Actuator bonnet & softplus status halo
  const bonnet = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.58, 16), matSteel);
  bonnet.position.y = 0.42;
  valveGroup.add(bonnet);
  const handwheel = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.045, 10, 24), matCopper);
  handwheel.rotation.x = Math.PI / 2;
  handwheel.position.y = 0.72;
  valveGroup.add(handwheel);

  // Primary PbLi centrifugal pump drum below valve
  const pumpDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.42, 24), matSteel);
  pumpDrum.rotation.x = Math.PI / 2;
  pumpDrum.position.set(0, -0.78, 0);
  valveGroup.add(pumpDrum);

  registerPickable(valveGroup, "tier1", { x: -1.6, z: -0.2 }, 1.15, 0xd97706);

  // =========================================================================
  // 3. TIER 2: ORNL TRANSFORM 6-ZONE COUNTER-CURRENT HX + PERMEATOR + TURBINE
  // =========================================================================
  const hxGroup = new THREE.Group();
  hxGroup.position.set(2.05, 1.55, -0.2);
  scene.add(hxGroup);

  // Supports
  [-1.2, 1.2].forEach((sx) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.55, 0.9), matSteelDark);
    leg.position.set(sx, -0.78, 0);
    hxGroup.add(leg);
  });

  // Outer translucent shell
  const hxShell = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 3.3, 32), matGlass);
  hxShell.rotation.z = Math.PI / 2;
  hxGroup.add(hxShell);

  // End caps / flanges
  [-1.66, 1.66].forEach((ex) => {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.02, 0.14, 32), matSteelDark);
    cap.rotation.z = Math.PI / 2;
    cap.position.x = ex;
    hxGroup.add(cap);
  });

  // 6 Counter-Current Thermal Exchange Zones (PbLi hot->cool top, FLiBe cool->hot bottom)
  for (let z = 0; z < 6; z++) {
    const frac = z / 5;
    const zx = -1.25 + z * 0.5;
    // Upper PbLi channel (hot coral -> warm orange)
    const pbliCol = new THREE.Color().setHSL(0.04 + frac * 0.06, 0.88, 0.52);
    const pbliZone = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.34, 0.86),
      new THREE.MeshStandardMaterial({ color: pbliCol, emissive: pbliCol, emissiveIntensity: 0.32, roughness: 0.3 })
    );
    pbliZone.position.set(zx, 0.24, 0);
    hxGroup.add(pbliZone);

    // Lower FLiBe channel (counter-current: cooler right -> hotter left!)
    const flibeCol = new THREE.Color().setHSL(0.58 - (1 - frac) * 0.06, 0.85, 0.50);
    const flibeZone = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.34, 0.86),
      new THREE.MeshStandardMaterial({ color: flibeCol, emissive: flibeCol, emissiveIntensity: 0.28, roughness: 0.3 })
    );
    flibeZone.position.set(zx, -0.24, 0);
    hxGroup.add(flibeZone);
  }

  // Vacuum Permeator Chamber underneath HX
  const permBox = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 1.25, 20),
    new THREE.MeshStandardMaterial({ color: 0x157a4c, emissive: 0x0f5132, emissiveIntensity: 0.4, metalness: 0.4, roughness: 0.3 })
  );
  permBox.rotation.z = Math.PI / 2;
  permBox.position.set(0, -1.05, 0.42);
  hxGroup.add(permBox);

  // Spinning sCO2 Power Turbine & Generator at x = 5.9 (part of Tier 2 power conversion!)
  const turbineGroup = new THREE.Group();
  turbineGroup.position.set(5.85, 1.55, -0.2);
  scene.add(turbineGroup);

  const turbBase = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.55, 1.5), matSteelDark);
  turbBase.position.y = -1.28;
  turbineGroup.add(turbBase);

  const turbCasing = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 1.05, 1.5, 24), matGlass);
  turbCasing.rotation.z = Math.PI / 2;
  turbCasing.position.x = -0.3;
  turbineGroup.add(turbCasing);

  const turbineRotor = new THREE.Group();
  turbineRotor.position.x = -0.3;
  turbineGroup.add(turbineRotor);

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.2, 16), matSteel);
  shaft.rotation.z = Math.PI / 2;
  turbineRotor.add(shaft);

  // 3 multi-blade rotor disks
  [-0.48, 0, 0.48].forEach((dx, idx) => {
    const r = 0.56 + idx * 0.13;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 16), matCopper);
    hub.rotation.z = Math.PI / 2;
    hub.position.x = dx;
    turbineRotor.add(hub);
    for (let b = 0; b < 8; b++) {
      const ang = (b / 8) * Math.PI * 2;
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, r, 0.16),
        new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.7, roughness: 0.22 })
      );
      blade.position.set(dx, Math.cos(ang) * (r * 0.52), Math.sin(ang) * (r * 0.52));
      blade.rotation.x = ang;
      blade.rotation.y = 0.28;
      turbineRotor.add(blade);
    }
  });

  // Generator block
  const genBlock = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 1.15, 1.1),
    new THREE.MeshStandardMaterial({ color: 0x1e40af, metalness: 0.55, roughness: 0.32 })
  );
  genBlock.position.set(0.95, 0, 0);
  turbineGroup.add(genBlock);

  registerPickable(hxGroup, "tier2", { x: 2.05, z: -0.2 }, 2.1, 0x2b7de9);
  turbineGroup.traverse((o) => { if (o.isMesh) o.userData.stageId = "tier2"; });
  pickables.push(turbineGroup);

  // =========================================================================
  // 4. TIER 3: 16-STAGE CRYOGENIC H2 / HD / T2 DISTILLATION TOWER (x = 0.2, z = 3.3)
  // =========================================================================
  const cryoGroup = new THREE.Group();
  cryoGroup.position.set(0.2, 0, 3.3);
  scene.add(cryoGroup);

  const cryoBase = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.88, 0.28, 28), matSteelDark);
  cryoBase.position.y = 0.14;
  cryoGroup.add(cryoBase);

  // Frosted outer glass tower
  const cryoGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.64, 3.35, 28), matGlass);
  cryoGlass.position.y = 1.92;
  cryoGroup.add(cryoGlass);

  // Top cryogenic condenser dome
  const cryoDome = new THREE.Mesh(new THREE.SphereGeometry(0.64, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), matSteel);
  cryoDome.position.y = 3.6;
  cryoGroup.add(cryoDome);

  // 16 distinct internal distillation trays (icy cyan H2 top -> rich emerald T2 bottom!)
  for (let t = 0; t < 16; t++) {
    const frac = t / 15; // 0 = bottom (T2), 1 = top (H2)
    const trayCol = new THREE.Color().setHSL(0.41 + frac * 0.13, 0.78, 0.42 + frac * 0.16);
    const tray = new THREE.Mesh(
      new THREE.CylinderGeometry(0.54, 0.54, 0.048, 24),
      new THREE.MeshStandardMaterial({ color: trayCol, emissive: trayCol, emissiveIntensity: 0.25, metalness: 0.35, roughness: 0.3 })
    );
    tray.position.y = 0.55 + t * 0.19;
    cryoGroup.add(tray);
  }

  registerPickable(cryoGroup, "tier3", { x: 0.2, z: 3.3 }, 1.15, 0x157a4c);

  // =========================================================================
  // 5. 3D CONNECTING PIPELINES & FLOWING INSTANCED PARTICLES
  // =========================================================================
  const pipeConfigs = [
    {
      name: "pbli_hot",
      color: 0xff7b54,
      mat: matPbLiPipe,
      count: 16,
      speed: 0.24,
      points: [[-3.7, 2.05, -0.2], [-2.5, 2.05, -0.2], [-1.6, 1.9, -0.2], [-0.4, 1.85, -0.2], [0.4, 1.8, -0.2]],
    },
    {
      name: "pbli_ret",
      color: 0xd97706,
      mat: matPbLiPipe,
      count: 14,
      speed: 0.22,
      points: [[0.4, 1.15, -0.2], [-0.8, 1.12, -0.2], [-1.6, 1.12, -0.2], [-2.7, 1.2, -0.2], [-3.7, 1.35, -0.2]],
    },
    {
      name: "flibe_hot",
      color: 0x38bdf8,
      mat: matFlibePipe,
      count: 12,
      speed: 0.28,
      points: [[3.72, 1.85, -0.2], [4.55, 1.95, -0.2], [5.25, 1.95, -0.2]],
    },
    {
      name: "flibe_cold",
      color: 0x2563eb,
      mat: matFlibePipe,
      count: 12,
      speed: 0.25,
      points: [[5.25, 1.15, -0.2], [4.55, 1.1, -0.2], [3.72, 1.25, -0.2]],
    },
    {
      name: "trit_ext",
      color: 0x22c55e,
      mat: matTritPipe,
      count: 18,
      speed: 0.20,
      points: [[2.05, 0.5, 0.25], [2.05, 0.5, 2.5], [1.55, 1.35, 3.3], [0.85, 2.0, 3.3]],
    },
    {
      name: "t2_refuel",
      color: 0x10b981,
      mat: matTritPipe,
      count: 24,
      speed: 0.18,
      points: [[-0.44, 0.55, 3.3], [-3.1, 0.55, 3.3], [-5.2, 0.6, 2.6], [-5.2, 1.65, 1.85]],
    },
    {
      name: "cryo_internal",
      color: 0x34d399,
      mat: null,
      count: 18,
      speed: 0.25,
      points: [[0.2, 3.4, 3.3], [0.2, 0.55, 3.3]],
    },
  ];

  const pipeBeads = [];
  const totalBeads = pipeConfigs.reduce((acc, p) => acc + p.count, 0);
  const beadGeo = new THREE.SphereGeometry(0.095, 12, 12);
  const beadMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.2 });
  const beadMesh = new THREE.InstancedMesh(beadGeo, beadMat, totalBeads);
  scene.add(beadMesh);

  let beadIdx = 0;
  pipeConfigs.forEach((cfg) => {
    const curve = new THREE.CatmullRomCurve3(cfg.points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    if (cfg.mat) {
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.13, 12, false), cfg.mat);
      scene.add(tube);
    }
    const baseCol = new THREE.Color(cfg.color);
    for (let i = 0; i < cfg.count; i++) {
      pipeBeads.push({ idx: beadIdx, curve, phase: i / cfg.count, speed: cfg.speed, baseCol });
      beadMesh.setColorAt(beadIdx, baseCol);
      beadIdx++;
    }
  });
  beadMesh.instanceColor.needsUpdate = true;

  // ---------- 3D Projected HTML Floating Labels ----------
  const labelOverlay = container.querySelector(".plant3d-labels");
  const labelAnchors = [
    { id: "core", text: "Burning Plasma (Q=74.5)", pos: new THREE.Vector3(-5.2, 3.85, 0) },
    { id: "tier1", text: "Tier 1 · Check Valve", pos: new THREE.Vector3(-1.6, 3.05, -0.2) },
    { id: "tier2", text: "Tier 2 · TRANSFORM HX (165×)", pos: new THREE.Vector3(2.05, 3.1, -0.2) },
    { id: "tier2", text: "sCO₂ Turbine (172.7 MWe)", pos: new THREE.Vector3(5.85, 3.05, -0.2) },
    { id: "tier3", text: "Tier 3 · 16-Stage Cryo (99.98% T₂)", pos: new THREE.Vector3(0.2, 4.35, 3.3) },
  ];
  const labelEls = labelAnchors.map((a) => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "p3d-pin";
    el.textContent = a.text;
    el.addEventListener("click", () => {
      flyToPreset(a.id);
      onSelectStage(a.id);
    });
    if (labelOverlay) labelOverlay.appendChild(el);
    return { el, anchor: a };
  });

  // ---------- Smooth Damped Spherical Orbit + Camera Fly-To ----------
  const CAMERA_PRESETS = {
    full:  { target: new THREE.Vector3(0.2,  1.65, 0.7),  radius: 15.2, theta: -0.20, phi: 1.04 },
    core:  { target: new THREE.Vector3(-5.2, 1.75, 0.0),  radius: 6.4,  theta: 0.45,  phi: 1.15 },
    tier1: { target: new THREE.Vector3(-1.6, 1.75, -0.2), radius: 5.0,  theta: 0.25,  phi: 1.18 },
    tier2: { target: new THREE.Vector3(3.3,  1.60, -0.2), radius: 7.4,  theta: 0.15,  phi: 1.14 },
    tier3: { target: new THREE.Vector3(0.2,  2.05, 3.3),  radius: 6.2,  theta: -0.25, phi: 1.16 },
  };

  let curTarget = CAMERA_PRESETS.full.target.clone();
  let dstTarget = CAMERA_PRESETS.full.target.clone();
  let curRadius = CAMERA_PRESETS.full.radius, dstRadius = CAMERA_PRESETS.full.radius;
  let curTheta = CAMERA_PRESETS.full.theta, dstTheta = CAMERA_PRESETS.full.theta;
  let curPhi = CAMERA_PRESETS.full.phi, dstPhi = CAMERA_PRESETS.full.phi;

  function flyToPreset(name) {
    const p = CAMERA_PRESETS[name] || CAMERA_PRESETS.full;
    dstTarget.copy(p.target);
    dstRadius = p.radius;
    dstTheta = p.theta;
    dstPhi = p.phi;
  }

  // Pointer orbit + wheel zoom + click raycast
  let dragging = false, moved = false, lastX = 0, lastY = 0;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  renderer.domElement.addEventListener("pointerdown", (e) => {
    dragging = true;
    moved = false;
    lastX = e.clientX;
    lastY = e.clientY;
    renderer.domElement.setPointerCapture(e.pointerId);
  });

  renderer.domElement.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
    lastX = e.clientX;
    lastY = e.clientY;
    dstTheta -= dx * 0.007;
    dstPhi = Math.max(0.35, Math.min(1.48, dstPhi - dy * 0.006));
  });

  renderer.domElement.addEventListener("pointerup", (e) => {
    dragging = false;
    if (!moved) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pickables, true);
      if (hits.length > 0 && hits[0].object.userData.stageId) {
        const sid = hits[0].object.userData.stageId;
        onSelectStage(sid);
        flyToPreset(sid);
      }
    }
  });

  renderer.domElement.addEventListener("wheel", (e) => {
    e.preventDefault();
    dstRadius = Math.max(4.2, Math.min(22.0, dstRadius + e.deltaY * 0.008));
  }, { passive: false });

  // ---------- Resize Handling ----------
  function resize() {
    const w = container.clientWidth || 920;
    const h = container.clientHeight || 440;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  // ---------- State & Efficient Off-Screen Pausing (modern-web-guidance: efficient-background-processing) ----------
  let paused = !!isInitiallyPaused;
  let flowMode = "fwd"; // "fwd" or "grad"
  let selectedStage = "tier2";
  let isVisible = true;
  let rafId = null;
  let lastTs = 0;

  const gradCol = new THREE.Color(0x22c55e);

  function setFlowMode(mode) {
    flowMode = mode;
    const isGrad = mode === "grad";
    pipeBeads.forEach((b) => {
      beadMesh.setColorAt(b.idx, isGrad ? gradCol : b.baseCol);
    });
    beadMesh.instanceColor.needsUpdate = true;
  }

  function setSelectedStage(stageId) {
    selectedStage = stageId;
    Object.entries(selectionRings).forEach(([id, ring]) => {
      ring.material.opacity = id === stageId ? 0.72 : 0.0;
    });
  }
  setSelectedStage(selectedStage);

  const dummy = new THREE.Object3D();
  const projVec = new THREE.Vector3();

  function renderFrame(ts) {
    if (!isVisible) { rafId = null; return; }
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;

    // Smooth camera interpolation + very gentle idle orbit when unpaused & full view
    const lerp = 1 - Math.exp(-7 * dt);
    curTarget.lerp(dstTarget, lerp);
    curRadius += (dstRadius - curRadius) * lerp;
    curTheta += (dstTheta - curTheta) * lerp;
    curPhi += (dstPhi - curPhi) * lerp;

    if (!paused && !dragging) {
      dstTheta += 0.05 * dt;
      // Spin turbine rotor
      turbineRotor.rotation.x += 5.2 * dt;
      // Pulse plasma light gently (< 1 Hz)
      plasmaLight.intensity = 2.8 + 0.65 * Math.sin(ts * 0.0022);
      // Swirl helical plasma particles
      const arr = plasmaGeo.attributes.position.array;
      for (let i = 0; i < PLASMA_N; i++) {
        const m = plasmaMeta[i];
        m.phi += m.speed * dt;
        const theta = m.phi * 3.0 + m.thetaOffset;
        const R = 1.38 + m.rOff * Math.cos(theta);
        arr[i * 3]     = R * Math.cos(m.phi);
        arr[i * 3 + 1] = m.rOff * Math.sin(theta);
        arr[i * 3 + 2] = R * Math.sin(m.phi);
      }
      plasmaGeo.attributes.position.needsUpdate = true;
    }

    // Update flowing 3D instanced beads
    const dir = flowMode === "grad" ? -1 : 1;
    for (let i = 0; i < pipeBeads.length; i++) {
      const b = pipeBeads[i];
      if (!paused) b.phase = (b.phase + dir * b.speed * dt + 1) % 1;
      const pt = b.curve.getPointAt(b.phase);
      dummy.position.copy(pt);
      const s = flowMode === "grad" ? 1.18 : 1.0;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      beadMesh.setMatrixAt(b.idx, dummy.matrix);
    }
    beadMesh.instanceMatrix.needsUpdate = true;

    // Position camera
    camera.position.set(
      curTarget.x + curRadius * Math.sin(curPhi) * Math.sin(curTheta),
      curTarget.y + curRadius * Math.cos(curPhi),
      curTarget.z + curRadius * Math.sin(curPhi) * Math.cos(curTheta)
    );
    camera.lookAt(curTarget);

    renderer.render(scene, camera);

    // Project 3D floating pins
    const w = container.clientWidth;
    const h = container.clientHeight;
    labelEls.forEach(({ el, anchor }) => {
      projVec.copy(anchor.pos).project(camera);
      const x = (projVec.x * 0.5 + 0.5) * w;
      const y = (-projVec.y * 0.5 + 0.5) * h;
      const offscreen = projVec.z > 1 || x < 48 || x > w - 48 || y < 44 || y > h - 24;
      if (offscreen) {
        el.style.opacity = "0";
        el.style.pointerEvents = "none";
      } else {
        el.style.opacity = "1";
        el.style.pointerEvents = "auto";
        el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        el.classList.toggle("active", anchor.id === selectedStage);
      }
    });

    rafId = requestAnimationFrame(renderFrame);
  }

  function startLoop() {
    if (!rafId && isVisible) {
      lastTs = 0;
      rafId = requestAnimationFrame(renderFrame);
    }
  }

  function stopLoop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  // Direct contentvisibilityautostatechange + IntersectionObserver fallback
  const shell = container.closest(".scene3d-shell") || container;
  if ("contentVisibility" in document.documentElement.style) {
    shell.addEventListener("contentvisibilityautostatechange", (event) => {
      isVisible = !event.skipped;
      if (isVisible) startLoop();
      else stopLoop();
    });
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        isVisible = entries[0].isIntersecting;
        if (isVisible) startLoop();
        else stopLoop();
      },
      { rootMargin: "200px" }
    );
    io.observe(shell);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopLoop();
    else startLoop();
  });

  startLoop();

  return {
    setPaused(p) { paused = !!p; },
    setFlowMode,
    setSelectedStage,
    flyToPreset,
    applyTheme,
    resize,
  };
}
