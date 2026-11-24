(() => {
  const DATA = window.RESEARCH_DATA;

  // ---------- Utility: Theme colors for Canvas (Canvas 2D does not parse CSS light-dark()) ----------
  function getSystemScheme() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function getRenderedScheme() {
    const meta = document.querySelector('meta[name="color-scheme"]');
    const c = meta ? meta.content : "light dark";
    return c === "dark" || c === "light" ? c : getSystemScheme();
  }

  function themeColors() {
    if (getRenderedScheme() === "dark") {
      return {
        bg: "#0d1117",
        surface: "#151b23",
        ink: "#e6edf3",
        muted: "#9aa7b8",
        border: "#2a3444",
        accent: "#58a6ff",
        plasma: "#ff7b54",
        emerald: "#3fb97c",
        amber: "#e3a73b",
        danger: "#f87171",
      };
    }
    return {
      bg: "#faf9f6",
      surface: "#ffffff",
      ink: "#17202a",
      muted: "#4a5568",
      border: "#dce2ea",
      accent: "#1a5fb4",
      plasma: "#d94826",
      emerald: "#157a4c",
      amber: "#a15c07",
      danger: "#b42318",
    };
  }

  function setupHiDPI(canvas, logicalW, logicalH) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(logicalW * dpr);
    canvas.height = Math.round(logicalH * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  // ---------- 1. Dark Mode Toggle (modern-web-guidance: dark-mode-toggle) ----------
  const metaScheme = document.querySelector('meta[name="color-scheme"]');
  const themeToggle = document.getElementById("theme-toggle");

  themeToggle.addEventListener("click", () => {
    const target = getRenderedScheme() === "dark" ? "light" : "dark";
    const sys = getSystemScheme();
    try {
      if (target === sys) {
        localStorage.removeItem("color-scheme");
        metaScheme.content = "light dark";
      } else {
        localStorage.setItem("color-scheme", target);
        metaScheme.content = target;
      }
    } catch (_) {
      metaScheme.content = target === sys ? "light dark" : target;
    }
    redrawAllCanvases();
  });

  window.addEventListener("storage", (e) => {
    if (e.key === "color-scheme") {
      metaScheme.content = e.newValue ?? "light dark";
      redrawAllCanvases();
    }
  });

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    redrawAllCanvases();
  });

  // Fallback --progress CSS var for range sliders if accent-color is unsupported
  if (!CSS.supports("accent-color", "auto")) {
    document.querySelectorAll('input[type="range"]').forEach((el) => {
      const update = () => {
        const pct = ((el.value - el.min) / (el.max - el.min)) * 100;
        el.style.setProperty("--progress", `${pct}%`);
      };
      update();
      el.addEventListener("input", update);
    });
  }

  // ---------- 2. Interactive Fusion Plant Diagram ----------
  const plantFlow = document.getElementById("plant-flow");
  let activeStageId = "tier2";

  function renderPlantStage(id) {
    activeStageId = id;
    const stage = DATA.plantStages.find((s) => s.id === id);
    plantFlow.querySelectorAll(".stage-btn").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.id === id));
    });
    document.querySelectorAll("#plant-svg [data-plant-node]").forEach((g) => {
      g.classList.toggle("is-selected", g.dataset.plantNode === id);
    });
    if (typeof plant3dCtrl !== "undefined" && plant3dCtrl) {
      plant3dCtrl.setSelectedStage(id);
    }
    document.getElementById("stage-eyebrow").textContent = stage.step;
    document.getElementById("stage-eyebrow").style.color = stage.color;
    document.getElementById("stage-title").textContent = `${stage.title} — ${stage.subtitle}`;
    document.getElementById("stage-analogy").textContent = stage.analogy;
    document.getElementById("stage-eng").textContent = stage.engineering;
    document.getElementById("stage-challenge").textContent = stage.challenge;
    const metricsEl = document.getElementById("stage-metrics");
    metricsEl.innerHTML = stage.metrics
      .map(
        (m) => `
        <div class="mini-metric" style="border-inline-start-color:${stage.color}">
          <div class="mini-metric-label">${m.label}</div>
          <div class="mini-metric-val">${m.value}</div>
        </div>`
      )
      .join("");
  }

  document.querySelectorAll("#plant-svg [data-plant-node]").forEach((g) => {
    g.addEventListener("click", () => renderPlantStage(g.dataset.plantNode));
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        renderPlantStage(g.dataset.plantNode);
      }
    });
  });

  // Animated Plant Flow Particles (Forward Physics vs Backward jax.grad)
  const plantStageEl = document.getElementById("plant-arch-stage");
  const plantParticlesLayer = document.getElementById("plant-particles");
  const plantModeFwdBtn = document.getElementById("plant-mode-fwd");
  const plantModeGradBtn = document.getElementById("plant-mode-grad");
  const plantPauseBtn = document.getElementById("plant-pause-btn");
  const plantModeBanner = document.getElementById("plant-mode-banner");
  const legendGradNote = document.getElementById("legend-grad-note");

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let plantPaused = prefersReduced;
  let plantMode = "fwd"; // "fwd" or "grad"

  const plantPathSpecs = [
    { id: "path-neutrons", color: "#ff7b54", count: 2, speed: 0.42 },
    { id: "path-pbli-hot", color: "#e06d2b", count: 2, speed: 0.48 },
    { id: "path-pbli-ret", color: "#c27834", count: 2, speed: 0.40 },
    { id: "path-flibe-hot", color: "#2b7de9", count: 2, speed: 0.48 },
    { id: "path-flibe-cold", color: "#58a6ff", count: 2, speed: 0.40 },
    { id: "path-trit-ext", color: "#157a4c", count: 3, speed: 0.28 },
    { id: "path-t2-fuel", color: "#22c55e", count: 4, speed: 0.24 },
  ];

  const plantBeads = [];
  plantPathSpecs.forEach((spec) => {
    const pathEl = document.getElementById(spec.id);
    if (!pathEl) return;
    const len = pathEl.getTotalLength();
    for (let i = 0; i < spec.count; i++) {
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("r", "4");
      c.setAttribute("fill", spec.color);
      c.setAttribute("stroke", "#ffffff");
      c.setAttribute("stroke-width", "1.2");
      plantParticlesLayer.appendChild(c);
      plantBeads.push({ el: c, path: pathEl, len, spec, phase: i / spec.count });
    }
  });

  function updatePlantModeUI() {
    const isGrad = plantMode === "grad";
    plantModeFwdBtn.setAttribute("aria-pressed", String(!isGrad));
    plantModeGradBtn.setAttribute("aria-pressed", String(isGrad));
    plantModeBanner.textContent = isGrad
      ? "Mode: Backward jax.grad Sensitivity Flow (∂MWe / ∂θ)"
      : "Mode: Forward Physics Simulation";
    plantModeBanner.setAttribute("fill", isGrad ? "#157a4c" : "var(--ink-muted)");
    legendGradNote.style.display = isGrad ? "inline" : "none";

    document.querySelectorAll("#plant-svg .flow-line").forEach((p) => {
      p.classList.toggle("flow-fwd", !isGrad);
      p.classList.toggle("flow-rev", isGrad);
      if (isGrad) {
        p.dataset.origStroke = p.dataset.origStroke || p.getAttribute("stroke");
        p.setAttribute("stroke", "#22c55e");
        p.setAttribute("marker-start", "url(#arr-grad)");
        p.removeAttribute("marker-end");
      } else {
        if (p.dataset.origStroke) p.setAttribute("stroke", p.dataset.origStroke);
        p.removeAttribute("marker-start");
        const mid = p.id.includes("flibe") ? "url(#arr-flibe)" : p.id.includes("trit") || p.id.includes("t2") ? "url(#arr-trit)" : "url(#arr-pbli)";
        p.setAttribute("marker-end", mid);
      }
    });
    plantBeads.forEach((b) => {
      b.el.setAttribute("fill", isGrad ? "#22c55e" : b.spec.color);
    });
  }

  function setPlantPaused(paused) {
    plantPaused = paused;
    plantStageEl.classList.toggle("is-paused", paused);
    plantPauseBtn.textContent = paused ? "Play" : "Pause";
    if (plant3dCtrl) plant3dCtrl.setPaused(paused);
  }

  let plant3dCtrl = null;
  const plant3dShell = document.getElementById("plant3d-shell");
  const plant2dFrame = document.getElementById("plant2d-frame");
  const plantView3dBtn = document.getElementById("plant-view-3d");
  const plantView2dBtn = document.getElementById("plant-view-2d");
  const camButtons = Array.from(document.querySelectorAll(".cam-pill[data-cam]"));

  function setPlantView(view) {
    const is3d = view === "3d" && !!plant3dCtrl;
    plantView3dBtn.setAttribute("aria-pressed", String(is3d));
    plantView2dBtn.setAttribute("aria-pressed", String(!is3d));
    plant3dShell.hidden = !is3d;
    plant2dFrame.hidden = is3d;
    if (is3d && plant3dCtrl) plant3dCtrl.resize();
  }

  function highlightCamBtn(camKey) {
    camButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cam === camKey)));
  }

  camButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const k = btn.dataset.cam;
      highlightCamBtn(k);
      if (plant3dCtrl) plant3dCtrl.flyToPreset(k);
      if (k !== "full") renderPlantStage(k);
    });
  });

  plantView3dBtn.addEventListener("click", () => setPlantView("3d"));
  plantView2dBtn.addEventListener("click", () => setPlantView("2d"));

  // Dynamically load modular Three.js 3D Fusion Plant scene; fall back cleanly to 2D SVG if WebGL unavailable
  import("./plant3d.js")
    .then(({ initPlant3D }) => {
      plant3dCtrl = initPlant3D({
        container: document.getElementById("plant3d-viewport"),
        onSelectStage: (id) => {
          renderPlantStage(id);
          highlightCamBtn(id);
        },
        getTheme: getRenderedScheme,
        isInitiallyPaused: plantPaused,
      });
      if (!plant3dCtrl) {
        plantView3dBtn.disabled = true;
        setPlantView("2d");
      } else {
        plant3dCtrl.setSelectedStage(activeStageId);
        plant3dCtrl.setFlowMode(plantMode);
      }
    })
    .catch((err) => {
      console.warn("3D module load failed, using 2D schematic:", err);
      plantView3dBtn.disabled = true;
      setPlantView("2d");
    });

  setPlantPaused(plantPaused);

  plantModeFwdBtn.addEventListener("click", () => {
    plantMode = "fwd";
    updatePlantModeUI();
    if (plant3dCtrl) plant3dCtrl.setFlowMode("fwd");
  });
  plantModeGradBtn.addEventListener("click", () => {
    plantMode = "grad";
    updatePlantModeUI();
    if (plant3dCtrl) plant3dCtrl.setFlowMode("grad");
  });
  plantPauseBtn.addEventListener("click", () => setPlantPaused(!plantPaused));

  let lastPlantTs = 0;
  function tickPlantParticles(ts) {
    if (!lastPlantTs) lastPlantTs = ts;
    const dt = Math.min(0.05, (ts - lastPlantTs) / 1000);
    lastPlantTs = ts;
    const dir = plantMode === "grad" ? -1 : 1;
    plantBeads.forEach((b) => {
      if (!plantPaused) {
        b.phase = (b.phase + dir * b.spec.speed * dt + 1) % 1;
      }
      const pt = b.path.getPointAtLength(b.phase * b.len);
      b.el.setAttribute("cx", pt.x.toFixed(1));
      b.el.setAttribute("cy", pt.y.toFixed(1));
    });
    requestAnimationFrame(tickPlantParticles);
  }
  requestAnimationFrame(tickPlantParticles);

  // ---------- 2B. Animated meshswarm + meshevolve Pipeline Simulator ----------
  const PIPE_STORIES = {
    t2: {
      outScore: "10.0 / 10",
      outSub: "7.8 ms / 1k runs",
      steps: [
        { tag: "STEP 1 / 6 · MODELICA INPUT & ORACLE", text: "ORNL TRANSFORM PbLi/FLiBe Heat Exchanger (.mo) enters the stack. OpenModelica (omc) flattens exact package equations and generates 8 hidden DASSL (tol 1e-10) test trajectories.", path: "wpath-in-rum", activeNode: "wnode-input", gates: ["idle","idle","idle","idle","idle"], tone: "" },
        { tag: "STEP 2 / 6 · RUMOCA FRONT-END PROBE", text: "Rumoca 0.10.4 attempts direct deterministic compilation. Because TRANSFORM uses external package records & implicit Sieverts loops (0/9 UnitTests), the workflow routes cleanly into meshswarm.", path: "wpath-rum-swarm", activeNode: "wnode-rumoca", gates: ["idle","idle","idle","idle","idle"], tone: "amber" },
        { tag: "STEP 3 / 6 · 3-AGENT PEER REFACTORING", text: "Inside meshswarm, Unpacker extracts exact cv ≠ cp & counter-current (5 − i) semantics via omc instantiateModel; GPU Kernel builds a 100-step vmap(lax.scan) RK4 kernel; Adjoint Reviewer adds 8-iter Newton + @jax.custom_jvp.", path: "wpath-swarm-grade", activeNode: "wnode-swarm", gates: ["idle","idle","idle","idle","idle"], tone: "" },
        { tag: "STEP 4 / 6 · 5-GATE ISOLATED GPU VERIFICATION", text: "In a --network none NVIDIA A100 container, the candidate passes AST checks, 8 unseen omc cases (1.63e-7 rel err), molar drift (1.63e-15 < 1e-11), JVP=VJP + macro FD adjoints, and hits 25.3 ms combined (10.0/10)!", path: "wpath-swarm-grade", activeNode: "wnode-grader", gates: ["pass","pass","pass","pass","pass"], tone: "emerald" },
        { tag: "STEP 5 / 6 · MESHEVOLVE LESSON DISTILLATION", text: "meshevolve extracts the winning eigenvalue-profiling & custom_jvp patterns into cross-task lesson memory, boosting future generations and downstream tiers.", path: "wpath-grade-evo", activeNode: "wnode-evolve", gates: ["pass","pass","pass","pass","pass"], tone: "amber" },
        { tag: "STEP 6 / 6 · VERIFIED GPU OPERATOR → PHASE 4", text: "The verified 10.0/10 operator (165× faster than our hand-written 4.18 s JAX reference) powers 1,024,000 GPU RL episodes in 6.75 s, < 18 µs CPU MLP distillation, and 3-solver whole-plant co-design.", path: "wpath-grade-out", activeNode: "wnode-output", gates: ["pass","pass","pass","pass","pass"], tone: "emerald" }
      ]
    },
    t3: {
      outScore: "8.0 / 10",
      outSub: "42.8 ms / 1k runs",
      steps: [
        { tag: "STEP 1 / 5 · GEN 1 STIFF 16-STAGE COLUMN", text: "CryoHDTColumn16 (32 stiff ODE + 32 algebraic tray equilibria) enters meshswarm after Rumoca fails on residual equations and dense O(N³) Jacobians spill GPU registers.", path: "wpath-rum-swarm", activeNode: "wnode-swarm", gates: ["idle","idle","idle","idle","idle"], tone: "" },
        { tag: "STEP 2 / 5 · GEN 1 FAILURE AT GATE 4 (0/3)", text: "Gen 1 control uses @jax.custom_vjp, which crashes forward-mode jacfwd inside the grader's JVP=VJP check (Score = 0.0); lesson swarms leave prototypes unmerged in scratch/.", path: "wpath-swarm-grade", activeNode: "wnode-grader", gates: ["pass","pass","pass","fail","fail"], tone: "danger" },
        { tag: "STEP 3 / 5 · REVIEWER DISTILLS FAILURE LESSONS", text: "meshevolve inspects Gen 1 transcripts and distills two sharp lessons: (1) always use @jax.custom_jvp for implicit solves, and (2) 'Deliverable first: ugly and green in 10–15 min beats elegant and absent.'", path: "wpath-grade-evo", activeNode: "wnode-evolve", gates: ["pass","pass","pass","fail","fail"], tone: "amber" },
        { tag: "STEP 4 / 5 · GEN 2 LESSON INJECTION", text: "Distilled lessons flow into Gen 2's peer swarms. All 3 swarms ship merged structure-aware banded/tridiagonal scan kernels with exact @jax.custom_jvp derivatives.", path: "wpath-evo-swarm", activeNode: "wnode-swarm", gates: ["idle","idle","idle","idle","idle"], tone: "" },
        { tag: "STEP 5 / 5 · 3/3 PASSING (PEAK 8.0/10 · 42.8 ms)", text: "Gen 2 jumps from 0/3 to 3/3 complete gate-passing deliverables (omc parity 1.5e-10..5.2e-10, tritium drift ≤ 3.9e-15), peaking at 42.8 ms forward / 174.9 ms combined.", path: "wpath-grade-out", activeNode: "wnode-output", gates: ["pass","pass","pass","pass","pass"], tone: "emerald" }
      ]
    },
    cheat: {
      outScore: "0.0 / 10",
      outSub: "BLOCKED BY GRADER",
      steps: [
        { tag: "STEP 1 / 4 · REWARD-HACKING CANDIDATE SUBMITTED", text: "Suppose an aggressive agent tries to game GPU speed by leaking 1e-6 tritium mass or detaching reverse gradients (returning zero/fake gradients via lax.stop_gradient).", path: "wpath-swarm-grade", activeNode: "wnode-swarm", gates: ["idle","idle","idle","idle","idle"], tone: "amber" },
        { tag: "STEP 2 / 4 · PASSES BASIC COMPILE & TRAJECTORY", text: "The candidate passes Gate 1 (valid Python AST, runs fast in sandbox) and even fools Gate 2 (8 held-out trajectories look close enough visually).", path: "wpath-swarm-grade", activeNode: "wnode-grader", gates: ["pass","pass","idle","idle","idle"], tone: "" },
        { tag: "STEP 3 / 4 · CAUGHT AT GATE 3 & GATE 4 (MULTIPLICATIVE 0.0)", text: "Gate 3 catches the 1e-6 molar conservation leak (> 1e-11 ceiling), and Gate 4's dual JVP=VJP + fresh-macro finite-difference probe immediately flags the detached gradient. Multiplicative Score collapses to 0.0!", path: "wpath-grade-evo", activeNode: "wnode-grader", gates: ["pass","pass","fail","fail","fail"], tone: "danger" },
        { tag: "STEP 4 / 4 · REJECTED & DIAGNOSED", text: "Zero speed points are awarded regardless of wall time. Failure diagnostics feed back to meshevolve so swarms only win by preserving true physics and exact derivatives.", path: "wpath-evo-swarm", activeNode: "wnode-evolve", gates: ["pass","pass","fail","fail","fail"], tone: "danger" }
      ]
    }
  };

  const pipeStageEl = document.getElementById("pipeline-arch-stage");
  const pipePacket = document.getElementById("pipe-packet");
  const pipeNarrator = document.getElementById("pipe-narrator");
  const pipeStepTag = document.getElementById("pipe-step-tag");
  const pipeStepText = document.getElementById("pipe-step-text");
  const pipeStepDots = document.getElementById("pipe-step-dots");
  const pipePauseBtn = document.getElementById("pipe-pause-btn");

  let activePipeStory = "t2";
  let activePipeStep = 0;
  let pipePaused = prefersReduced;
  let pipePacketProgress = 0;
  let pipeStepElapsed = 0;

  function applyPipeStep() {
    const story = PIPE_STORIES[activePipeStory];
    const step = story.steps[activePipeStep];
    pipeStepTag.textContent = step.tag;
    pipeStepText.textContent = step.text;
    pipeNarrator.className = `pipe-narrator${step.tone ? " tone-" + step.tone : ""}`;

    document.getElementById("pipe-out-score").textContent = story.outScore;
    document.getElementById("pipe-out-sub").textContent = story.outSub;
    document.getElementById("pipe-out-score").setAttribute("fill", activePipeStory === "cheat" ? "#b42318" : "#157a4c");

    // Highlight active SVG node
    ["wnode-input", "wnode-rumoca", "wnode-swarm", "wnode-grader", "wnode-evolve", "wnode-output"].forEach((id) => {
      const g = document.getElementById(id);
      if (g) g.style.opacity = id === step.activeNode ? "1" : "0.78";
    });

    // Color 5 grader gate pills
    const C = themeColors();
    step.gates.forEach((st, i) => {
      const g = document.getElementById(`pipe-g${i + 1}`);
      if (!g) return;
      const r = g.querySelector("rect");
      const t = g.querySelector("text");
      if (st === "pass") {
        r.setAttribute("fill", getRenderedScheme() === "dark" ? "#122a1e" : "#eaf7f0");
        r.setAttribute("stroke", C.emerald);
        t.setAttribute("fill", C.emerald);
      } else if (st === "fail") {
        r.setAttribute("fill", getRenderedScheme() === "dark" ? "#321618" : "#fef2f2");
        r.setAttribute("stroke", C.danger);
        t.setAttribute("fill", C.danger);
      } else {
        r.setAttribute("fill", "var(--surface-alt)");
        r.setAttribute("stroke", "var(--border)");
        t.setAttribute("fill", "var(--ink)");
      }
    });

    // Step indicator dots
    pipeStepDots.innerHTML = story.steps
      .map((_, i) => `<button type="button" class="pipe-dot" aria-label="Step ${i + 1}" ${i === activePipeStep ? 'aria-current="step"' : ""}></button>`)
      .join("");
    pipeStepDots.querySelectorAll(".pipe-dot").forEach((dot, i) => {
      dot.addEventListener("click", () => { activePipeStep = i; pipePacketProgress = 0; pipeStepElapsed = 0; applyPipeStep(); });
    });
    pipePacketProgress = 0;
  }

  function selectPipeStory(key) {
    activePipeStory = key;
    activePipeStep = 0;
    pipeStepElapsed = 0;
    [["t2", "pipe-story-t2"], ["t3", "pipe-story-t3"], ["cheat", "pipe-story-cheat"]].forEach(([k, id]) => {
      document.getElementById(id).setAttribute("aria-pressed", String(k === key));
    });
    applyPipeStep();
  }

  function setPipePaused(p) {
    pipePaused = p;
    pipeStageEl.classList.toggle("is-paused", p);
    pipePauseBtn.textContent = p ? "Play" : "Pause";
  }
  setPipePaused(pipePaused);

  document.getElementById("pipe-story-t2").addEventListener("click", () => selectPipeStory("t2"));
  document.getElementById("pipe-story-t3").addEventListener("click", () => selectPipeStory("t3"));
  document.getElementById("pipe-story-cheat").addEventListener("click", () => selectPipeStory("cheat"));
  pipePauseBtn.addEventListener("click", () => setPipePaused(!pipePaused));
  document.getElementById("pipe-prev-btn").addEventListener("click", () => {
    const n = PIPE_STORIES[activePipeStory].steps.length;
    activePipeStep = (activePipeStep - 1 + n) % n;
    pipeStepElapsed = 0;
    applyPipeStep();
  });
  document.getElementById("pipe-next-btn").addEventListener("click", () => {
    const n = PIPE_STORIES[activePipeStory].steps.length;
    activePipeStep = (activePipeStep + 1) % n;
    pipeStepElapsed = 0;
    applyPipeStep();
  });
  applyPipeStep();

  let lastPipeTs = 0;
  function tickPipeline(ts) {
    if (!lastPipeTs) lastPipeTs = ts;
    const dt = Math.min(0.05, (ts - lastPipeTs) / 1000);
    lastPipeTs = ts;
    const story = PIPE_STORIES[activePipeStory];
    const step = story.steps[activePipeStep];
    const pathEl = document.getElementById(step.path);
    if (pathEl) {
      if (!pipePaused) {
        pipePacketProgress = (pipePacketProgress + 0.55 * dt) % 1;
      }
      const pt = pathEl.getPointAtLength(pipePacketProgress * pathEl.getTotalLength());
      pipePacket.setAttribute("transform", `translate(${pt.x.toFixed(1)}, ${pt.y.toFixed(1)})`);
      pipePacket.setAttribute("opacity", "1");
    }
    requestAnimationFrame(tickPipeline);
  }
  requestAnimationFrame(tickPipeline);

  DATA.plantStages.forEach((s) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "stage-btn";
    btn.dataset.id = s.id;
    btn.style.setProperty("--stage-color", s.color);
    btn.setAttribute("aria-pressed", String(s.id === activeStageId));
    btn.innerHTML = `
      <div class="stage-step">${s.step}</div>
      <div class="stage-name">${s.title}</div>
      <div class="stage-sub">${s.subtitle}</div>`;
    btn.addEventListener("click", () => renderPlantStage(s.id));
    plantFlow.appendChild(btn);
  });
  renderPlantStage(activeStageId);

  // ---------- 3. Rumoca 4-Layer Stack ----------
  const stackGrid = document.getElementById("stack-grid");
  DATA.stackLayers.forEach((L) => {
    const card = document.createElement("article");
    card.className = `stack-card${L.id === "swarm" ? " highlight" : ""}`;
    card.innerHTML = `
      <span class="stack-badge ${L.tone}">${L.layer} · ${L.badge}</span>
      <h3 style="margin:0; font-size:0.98rem;">${L.name}</h3>
      <div style="font-size:0.8rem; font-weight:650; color:var(--accent);">${L.role}</div>
      <p style="margin:0.15rem 0 0; font-size:0.84rem; color:var(--ink-muted);">${L.what}</p>
      <p style="margin:0.35rem 0 0; font-size:0.81rem; color:var(--ink); border-block-start:1px dashed var(--border); padding-block-start:0.4rem;">${L.whyNotAlone}</p>`;
    stackGrid.appendChild(card);
  });

  // ---------- 4. Interactive Lab 1: Check-Valve Smoothing & GPU Warp Divergence ----------
  const valveEpsInput = document.getElementById("valve-eps");
  const valveSpreadInput = document.getElementById("valve-spread");
  const valveCanvas = document.getElementById("valve-canvas");
  const warpGrid = document.getElementById("warp-grid");
  const presetNaive = document.getElementById("preset-naive");
  const presetSmooth = document.getElementById("preset-smooth");

  function softplus(x, eps) {
    if (eps <= 1e-6) return Math.max(0, x);
    const z = x / eps;
    if (z > 30) return x;
    if (z < -30) return 0;
    return eps * Math.log(1 + Math.exp(z));
  }
  function sigmoid(x, eps) {
    if (eps <= 1e-6) return x > 0 ? 1 : 0;
    const z = x / eps;
    if (z > 30) return 1;
    if (z < -30) return 0;
    return 1 / (1 + Math.exp(-z));
  }

  function renderValveLab() {
    const eps = parseFloat(valveEpsInput.value);
    const spread = parseFloat(valveSpreadInput.value);
    const isHard = eps < 0.005;

    document.getElementById("valve-eps-out").textContent = isHard
      ? "0.000 (Hard if/else)"
      : `${eps.toFixed(3)} (Smooth C∞)`;
    document.getElementById("valve-spread-out").textContent = `±${spread.toFixed(2)} bar`;

    presetNaive.setAttribute("aria-pressed", String(isHard));
    presetSmooth.setAttribute("aria-pressed", String(Math.abs(eps - 0.08) < 0.01));

    // Plot flow q(dP) and derivative dq/dP
    const W = 640, H = 300;
    const ctx = setupHiDPI(valveCanvas, W, H);
    const C = themeColors();

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    const pad = { l: 54, r: 52, t: 30, b: 40 };
    const pw = W - pad.l - pad.r;
    const ph = H - pad.t - pad.b;

    const xToPx = (dp) => pad.l + ((dp + 1.5) / 3.0) * pw;
    const yFlowPx = (q) => pad.t + ph - (q / 1.65) * ph;
    const yGradPx = (g) => pad.t + ph - (g / 1.15) * ph;

    // Grid
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (ph * i) / 4;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
    }
    // Zero vertical axis (dP = 0)
    const x0 = xToPx(0);
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = C.muted;
    ctx.beginPath(); ctx.moveTo(x0, pad.t); ctx.lineTo(x0, pad.t + ph); ctx.stroke();
    ctx.restore();

    // Exact if/else reference (faint)
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xToPx(-1.5), yFlowPx(0));
    ctx.lineTo(x0, yFlowPx(0));
    ctx.lineTo(xToPx(1.5), yFlowPx(1.5));
    ctx.stroke();

    // Flow curve q(dP)
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 240; i++) {
      const dp = -1.5 + (3.0 * i) / 240;
      const q = softplus(dp, eps);
      const px = xToPx(dp), py = yFlowPx(q);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Derivative dq/dP
    ctx.strokeStyle = isHard ? C.danger : C.emerald;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    if (isHard) {
      ctx.moveTo(xToPx(-1.5), yGradPx(0));
      ctx.lineTo(x0, yGradPx(0));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x0, yGradPx(1));
      ctx.lineTo(xToPx(1.5), yGradPx(1));
      ctx.stroke();
      // Discontinuity ring
      ctx.fillStyle = C.danger;
      ctx.beginPath(); ctx.arc(x0, yGradPx(0.5), 6, 0, Math.PI * 2); ctx.fill();
      ctx.font = "700 11px Inter, sans-serif";
      ctx.fillText("Jump / NaN kink!", x0 + 9, yGradPx(0.5) + 4);
    } else {
      for (let i = 0; i <= 240; i++) {
        const dp = -1.5 + (3.0 * i) / 240;
        const g = sigmoid(dp, eps);
        const px = xToPx(dp), py = yGradPx(g);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // Labels & legend
    ctx.fillStyle = C.ink;
    ctx.font = "600 12px Inter, sans-serif";
    ctx.fillText("Pressure Drop ΔP (bar)", pad.l + pw / 2 - 60, H - 10);
    ctx.fillStyle = C.accent;
    ctx.fillText("— Valve Flow q(ΔP)", pad.l, 18);
    ctx.fillStyle = isHard ? C.danger : C.emerald;
    ctx.fillText(isHard ? "— Derivative dq/dΔP (Discontinuous)" : "— Smooth Derivative dq/dΔP (Adjoint-Safe)", pad.l + 150, 18);

    ctx.fillStyle = C.muted;
    ctx.font = "500 11px JetBrains Mono, monospace";
    [-1.5, -0.75, 0, 0.75, 1.5].forEach((v) => {
      ctx.fillText(v.toFixed(2), xToPx(v) - 14, pad.t + ph + 16);
    });

    // Update 32-thread GPU warp grid
    let openCount = 0;
    const lanes = [];
    for (let t = 0; t < 32; t++) {
      // Deterministic pseudo-spread of ensemble pressures around 0
      const u = (t + 0.5) / 32 - 0.5;
      const dp = u * 2 * spread + 0.08 * Math.sin(t * 2.1);
      const open = dp >= 0;
      if (open) openCount++;
      lanes.push({ id: t, dp, open });
    }

    const divergent = isHard && openCount > 0 && openCount < 32;
    warpGrid.innerHTML = lanes
      .map((L) => {
        if (!isHard) {
          return `<div class="warp-lane active" title="Thread ${L.id}: ΔP=${L.dp.toFixed(2)} bar">T${L.id}</div>`;
        }
        return L.open
          ? `<div class="warp-lane branch-a" title="Thread ${L.id}: Open branch (ΔP=${L.dp.toFixed(2)})">T${L.id}</div>`
          : `<div class="warp-lane masked" title="Thread ${L.id}: Masked/Stalled (ΔP=${L.dp.toFixed(2)})">×${L.id}</div>`;
      })
      .join("");

    const util = isHard ? (divergent ? Math.round((Math.max(openCount, 32 - openCount) / 32) * 100 * 0.5 + 25) : 100) : 100;
    const eff = isHard ? (divergent ? "50% (2-Pass Stall)" : "100%") : "100% Fused SIMT";
    document.getElementById("warp-util-val").textContent = eff;
    document.getElementById("warp-util-card").style.borderInlineStartColor = isHard && divergent ? C.danger : C.emerald;

    const gradStatus = isHard
      ? "BROKEN (9.1e-4 FD err)"
      : eps <= 0.14
      ? "EXACT (< 1e-10 JVP=VJP)"
      : "SMOOTH (slight bias)";
    document.getElementById("valve-grad-val").textContent = gradStatus;
    document.getElementById("valve-grad-card").style.borderInlineStartColor = isHard ? C.danger : eps <= 0.14 ? C.emerald : C.amber;
    void util;
  }

  valveEpsInput.addEventListener("input", renderValveLab);
  valveSpreadInput.addEventListener("input", renderValveLab);
  presetNaive.addEventListener("click", () => { valveEpsInput.value = "0"; renderValveLab(); });
  presetSmooth.addEventListener("click", () => { valveEpsInput.value = "0.08"; renderValveLab(); });
  renderValveLab();

  // ---------- 5. Interactive 5-Gate Formula ----------
  const gateStrip = document.getElementById("gate-strip");
  const gateDetail = document.getElementById("gate-detail");
  let activeGate = 3; // highlight adjoint gate by default

  function renderGate(idx) {
    activeGate = idx;
    const g = DATA.gates[idx];
    gateStrip.querySelectorAll(".gate-chip").forEach((c, i) => {
      c.setAttribute("aria-pressed", String(i === idx));
    });
    gateDetail.innerHTML = `<strong>${g.symbol} — ${g.name}</strong> (<code>${g.criterion}</code>): ${g.detail}`;
  }

  DATA.gates.forEach((g, i) => {
    if (i > 0) {
      const sep = document.createElement("span");
      sep.textContent = "·";
      sep.setAttribute("aria-hidden", "true");
      gateStrip.appendChild(sep);
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gate-chip";
    btn.textContent = g.symbol;
    btn.addEventListener("click", () => renderGate(i));
    gateStrip.appendChild(btn);
  });
  renderGate(activeGate);

  // ---------- 6. Phase 3 Accessible Tabs & Evolution Charts ----------
  const tablist = document.querySelector("#p3-tabs .tablist");
  const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
  const panels = Array.from(document.querySelectorAll('#p3-tabs [role="tabpanel"]'));
  let p3Mode = "score"; // "score" or "time"

  function selectTab(tab, focusTab = false) {
    const targetTier = tab.dataset.tier;
    tabs.forEach((t) => {
      const sel = t === tab;
      t.setAttribute("aria-selected", String(sel));
      t.toggleAttribute("focusgroupstart", sel);
      if (!("focusGroup" in HTMLElement.prototype)) {
        t.tabIndex = sel ? 0 : -1;
      }
    });
    panels.forEach((p) => {
      const match = p.dataset.panel === targetTier;
      if (match) {
        p.removeAttribute("hidden");
      } else {
        p.setAttribute("hidden", "until-found");
      }
    });
    if (focusTab) tab.focus();
    tab.scrollIntoView({ block: "nearest", inline: "nearest", container: "nearest" });
    if (targetTier !== "all") drawPhase3Chart(targetTier);
  }

  tabs.forEach((t, idx) => {
    if (!("focusGroup" in HTMLElement.prototype)) {
      t.tabIndex = idx === 0 ? 0 : -1;
    }
    t.addEventListener("click", () => selectTab(t));
    // Fallback keyboard navigation when native focusgroup is unavailable
    t.addEventListener("keydown", (e) => {
      if ("focusGroup" in HTMLElement.prototype) return;
      let next = null;
      if (e.key === "ArrowRight") next = tabs[(idx + 1) % tabs.length];
      else if (e.key === "ArrowLeft") next = tabs[(idx - 1 + tabs.length) % tabs.length];
      else if (e.key === "Home") next = tabs[0];
      else if (e.key === "End") next = tabs[tabs.length - 1];
      if (next) {
        e.preventDefault();
        selectTab(next, true);
      }
    });
  });

  // Sync tab selection if browser find-in-page reveals a hidden="until-found" panel
  panels.forEach((p) => {
    p.addEventListener("beforematch", () => {
      const matchingTab = tabs.find((t) => t.dataset.tier === p.dataset.panel);
      if (matchingTab) selectTab(matchingTab);
    });
  });

  const btnScore = document.getElementById("p3-mode-score");
  const btnTime = document.getElementById("p3-mode-time");
  btnScore.addEventListener("click", () => {
    p3Mode = "score";
    btnScore.setAttribute("aria-pressed", "true");
    btnTime.setAttribute("aria-pressed", "false");
    drawAllPhase3Charts();
  });
  btnTime.addEventListener("click", () => {
    p3Mode = "time";
    btnScore.setAttribute("aria-pressed", "false");
    btnTime.setAttribute("aria-pressed", "true");
    drawAllPhase3Charts();
  });

  function drawPhase3Chart(tierKey) {
    const info = DATA.phase3.tiers[tierKey];
    const canvas = document.getElementById(`p3-canvas-${tierKey}`);
    if (!canvas) return;
    document.getElementById(`p3-note-${tierKey}`).innerHTML = `<strong>${info.name}:</strong> ${info.takeaway}`;

    const W = 960, H = 320;
    const ctx = setupHiDPI(canvas, W, H);
    const C = themeColors();
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    const pad = { l: 64, r: 28, t: 42, b: 56 };
    const pw = W - pad.l - pad.r;
    const ph = H - pad.t - pad.b;

    // Horizontal grid & Y axis
    ctx.strokeStyle = C.border;
    ctx.fillStyle = C.muted;
    ctx.font = "500 11px JetBrains Mono, monospace";

    const toY = (val) => {
      if (p3Mode === "score") {
        return pad.t + ph - (Math.max(0, Math.min(10, val)) / 10) * ph;
      }
      // Log scale: 10 ms to 20,000 ms (lower is faster/better, plotted from top=fast to bottom=slow? No, standard bottom=10ms, top=20s so shorter bar = faster!)
      const ms = Math.max(10, Math.min(20000, val * 1000));
      const frac = (Math.log10(ms) - 1) / (Math.log10(20000) - 1);
      return pad.t + ph - frac * ph;
    };

    if (p3Mode === "score") {
      [0, 2, 4, 6, 8, 10].forEach((v) => {
        const y = toY(v);
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
        ctx.fillText(`${v}.0`, 22, y + 4);
      });
    } else {
      [0.01, 0.05, 0.1, 0.5, 1.0, 5.0, 10.0].forEach((s) => {
        const y = toY(s);
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
        ctx.fillText(s < 1 ? `${Math.round(s * 1000)}ms` : `${s}s`, 12, y + 4);
      });
    }

    // Reference dashed line
    const refVal = p3Mode === "score" ? info.refScore : info.refTime;
    const yRef = toY(refVal);
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = C.plasma;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pad.l, yRef); ctx.lineTo(W - pad.r, yRef); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = C.plasma;
    ctx.font = "700 11px Inter, sans-serif";
    const refTxt = `Hand-Written Ref: ${info.refLabel}`;
    const refTw = ctx.measureText(refTxt).width;
    const refBoxX = W - pad.r - refTw - 10;
    const refBoxY = Math.max(pad.t + 2, yRef - 19);
    ctx.fillStyle = C.bg;
    ctx.globalAlpha = 0.88;
    ctx.fillRect(refBoxX - 4, refBoxY, refTw + 8, 16);
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.plasma;
    ctx.fillText(refTxt, refBoxX, refBoxY + 12);

    // Bars grouped by generation
    const gens = info.generations;
    const groupW = pw / gens.length;
    const series = [
      { key: "run1", label: "run-1 (lessons)", color: C.accent },
      { key: "run2", label: "run-2 (lessons)", color: C.emerald },
      { key: "control", label: "control (no lessons)", color: C.amber },
    ];

    gens.forEach((g, gi) => {
      const gx = pad.l + gi * groupW;
      const barW = Math.min(62, (groupW - 60) / 3);
      const startX = gx + (groupW - barW * 3 - 20) / 2;

      series.forEach((s, si) => {
        const item = g[s.key];
        const bx = startX + si * (barW + 10);
        if (!item) {
          ctx.fillStyle = C.muted;
          ctx.font = "500 11px Inter, sans-serif";
          ctx.fillText("N/A", bx + barW / 2 - 10, pad.t + ph - 8);
          return;
        }
        const passed = item.score > 0;
        if (p3Mode === "score") {
          const yTop = passed ? toY(item.score) : pad.t + ph - 4;
          const bh = pad.t + ph - yTop;
          ctx.fillStyle = passed ? s.color : C.danger;
          ctx.globalAlpha = passed ? 0.9 : 0.35;
          ctx.fillRect(bx, yTop, barW, bh);
          ctx.globalAlpha = 1;

          ctx.fillStyle = passed ? C.ink : C.danger;
          ctx.font = "700 12px JetBrains Mono, monospace";
          const txt = passed ? `${item.score.toFixed(1)}` : "0.0";
          ctx.fillText(txt, bx + barW / 2 - ctx.measureText(txt).width / 2, yTop - 6);
          if (passed && item.time) {
            ctx.fillStyle = C.muted;
            ctx.font = "500 10px JetBrains Mono, monospace";
            const tTxt = item.time < 0.1 ? `${(item.time * 1000).toFixed(1)}ms` : `${item.time.toFixed(2)}s`;
            ctx.fillText(tTxt, bx + barW / 2 - ctx.measureText(tTxt).width / 2, yTop - 20);
          }
        } else {
          if (!passed || !item.time) {
            ctx.fillStyle = C.danger;
            ctx.font = "700 10px JetBrains Mono, monospace";
            ctx.fillText("FAIL", bx + barW / 2 - 13, pad.t + ph - 10);
          } else {
            const yTop = toY(item.time);
            const bh = pad.t + ph - yTop;
            ctx.fillStyle = s.color;
            ctx.globalAlpha = 0.88;
            ctx.fillRect(bx, yTop, barW, bh);
            ctx.globalAlpha = 1;
            ctx.fillStyle = C.ink;
            ctx.font = "700 11px JetBrains Mono, monospace";
            const tTxt = item.time < 0.1 ? `${(item.time * 1000).toFixed(1)}ms` : `${item.time.toFixed(2)}s`;
            ctx.fillText(tTxt, bx + barW / 2 - ctx.measureText(tTxt).width / 2, yTop - 6);
          }
        }
      });

      // Group label
      ctx.fillStyle = C.ink;
      ctx.font = "700 12px Inter, sans-serif";
      const lbl = `${g.gen} ($${g.cost.toFixed(2)})`;
      ctx.fillText(lbl, gx + groupW / 2 - ctx.measureText(lbl).width / 2, H - 18);
    });

    // Legend
    let lx = pad.l;
    series.forEach((s) => {
      ctx.fillStyle = s.color;
      ctx.fillRect(lx, 12, 12, 12);
      ctx.fillStyle = C.ink;
      ctx.font = "600 12px Inter, sans-serif";
      ctx.fillText(s.label, lx + 17, 22);
      lx += ctx.measureText(s.label).width + 38;
    });
    ctx.fillStyle = C.muted;
    ctx.font = "600 11px Inter, sans-serif";
    const subHint = p3Mode === "score" ? "Higher score = faster verified solver" : "Shorter bar = faster combined 1k-fwd + 64-grad (log ms)";
    ctx.fillText(subHint, W - pad.r - ctx.measureText(subHint).width, 22);
  }

  function drawAllPhase3Charts() {
    ["tier1", "tier2", "tier3"].forEach(drawPhase3Chart);
  }
  drawAllPhase3Charts();

  // ---------- 7. Interactive Lab 3: Exact JS Port of Swarm's 15-State ORNL TRANSFORM Solver ----------
  const CP1 = 188.0, CV1 = 141.0, RHO1 = 9637.0;
  const CP2 = 2380.0, CV2 = 1785.0, RHO2 = 1948.0;
  const VZONE = 0.12 / 6.0;
  const M1CV1 = RHO1 * VZONE * CV1;
  const M2CV2 = RHO2 * VZONE * CV2;
  const UA6 = 48000.0 / 6.0;
  const T2_TARGET = 892.0;

  function solveSievertsJ(target) {
    let j = target / (1.0 + 0.45 * Math.abs(target) + 0.25 * target * target);
    for (let it = 0; it < 8; it++) {
      const aj = Math.abs(j);
      const g = j + 0.45 * j * aj + 0.25 * j * j * j;
      const gp = 1.0 + 0.9 * aj + 0.75 * j * j;
      j -= (g - target) / gp;
    }
    return j;
  }

  function rhsTransform(t, y, mPbli, mFlibe, tInEff, uVac) {
    const m1 = mPbli >= 15.0 ? mPbli : 15.0 + 0.15 * (mPbli - 15.0);
    const m2 = mFlibe >= 3.0 ? mFlibe : 3.0 + 0.15 * (mFlibe - 3.0);
    const tup0 = tInEff + 18.0 * Math.sin(0.2 * t);
    const dy = new Float64Array(15);

    let kSum = 0.0;
    for (let i = 0; i < 6; i++) {
      const T1i = y[i];
      const T2opp = y[6 + (5 - i)];
      const up1 = i === 0 ? tup0 : y[i - 1];
      const q = UA6 * (T1i - T2opp);
      dy[i] = (m1 * CP1 * (up1 - T1i) - q) / M1CV1;

      const T2i = y[6 + i];
      const T1opp = y[5 - i];
      const up2 = i === 0 ? 865.0 : y[6 + i - 1];
      const q2 = UA6 * (T1opp - T2i);
      dy[6 + i] = (m2 * CP2 * (up2 - T2i) + q2) / M2CV2;

      kSum += 0.22 * Math.exp(-3400.0 / T1i);
    }
    const kBar = kSum / 6.0;
    const j = solveSievertsJ(uVac * kBar * y[12]);
    dy[12] = -j;
    dy[13] = j - 0.06 * y[13];
    dy[14] = 0.06 * y[13];
    return dy;
  }

  function rk4Step(t, y, dt, mPbli, mFlibe, tInEff, uVac) {
    const k1 = rhsTransform(t, y, mPbli, mFlibe, tInEff, uVac);
    const y2 = new Float64Array(15);
    for (let i = 0; i < 15; i++) y2[i] = y[i] + 0.5 * dt * k1[i];
    const k2 = rhsTransform(t + 0.5 * dt, y2, mPbli, mFlibe, tInEff, uVac);
    const y3 = new Float64Array(15);
    for (let i = 0; i < 15; i++) y3[i] = y[i] + 0.5 * dt * k2[i];
    const k3 = rhsTransform(t + 0.5 * dt, y3, mPbli, mFlibe, tInEff, uVac);
    const y4 = new Float64Array(15);
    for (let i = 0; i < 15; i++) y4[i] = y[i] + dt * k3[i];
    const k4 = rhsTransform(t + dt, y4, mPbli, mFlibe, tInEff, uVac);
    const out = new Float64Array(15);
    for (let i = 0; i < 15; i++) out[i] = y[i] + (dt / 6.0) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    return out;
  }

  function runPlantSim(rampAmp, elmAmp, tripRetain, closedLoop) {
    const tInBase = 952.0;
    const elmTime = 12.0;
    const tripTime = 15.0;
    let y = new Float64Array([930, 930, 930, 930, 930, 930, 880, 880, 880, 880, 880, 880, 5.0, 0.5, 0.5]);
    const n0Total = y[12] + y[13] + y[14];

    const tArr = [0], t2Arr = [y[11]], t1Arr = [y[5]], tinArr = [tInBase];
    let intErr = 0.0;
    let maxDrift = 0.0;
    let maxT1 = y[5];
    let sqErr = 0.0;

    for (let step = 0; step < 30; step++) {
      const tNow = step * 1.0;
      const tInNow = tInBase + rampAmp * Math.tanh(tNow / 8.0) + elmAmp * Math.exp(-0.5 * Math.pow((tNow - elmTime) / 2.0, 2));
      const pumpHealth = 1.0 - (1.0 - tripRetain) * 0.5 * (1.0 + Math.tanh((tNow - tripTime) / 0.5));

      let u0 = 0.55, u1 = 0.45, u2 = 0.65;
      if (closedLoop) {
        const err = y[11] - T2_TARGET;
        intErr = Math.max(-40, Math.min(40, intErr + err * 1.0));
        // Coordinated PbLi/FLiBe feedback + feedforward disturbance compensation
        const ffHeat = (tInNow - 952.0) / 38.0;
        u1 = Math.max(0.02, Math.min(0.98, 0.42 + 0.048 * err + 0.015 * intErr + 0.34 * ffHeat - 0.28 * (1.0 - pumpHealth)));
        u0 = Math.max(0.05, Math.min(0.98, 0.50 - 0.024 * err + 0.55 * (1.0 - pumpHealth) + Math.max(0, (y[5] - 935.0) * 0.04)));
        u2 = 0.90;
      }

      for (let k = 0; k < 4; k++) {
        const tk = tNow + k * 0.25;
        const ph = 1.0 - (1.0 - tripRetain) * 0.5 * (1.0 + Math.tanh((tk - tripTime) / 0.5));
        const mPbli = (25.0 + 105.0 * u0) * ph;
        const mFlibe = 3.5 + 18.5 * u1;
        const uVac = 0.20 + 1.30 * u2;
        const tInEff = tInBase + rampAmp * Math.tanh(tk / 8.0) + elmAmp * Math.exp(-0.5 * Math.pow((tk - elmTime) / 2.0, 2)) - 18.0 * Math.sin(0.2 * tk);
        y = rk4Step(tk, y, 0.25, mPbli, mFlibe, tInEff, uVac);
      }

      const t2 = y[11], t1 = y[5];
      const drift = Math.abs(y[12] + y[13] + y[14] - n0Total);
      if (drift > maxDrift) maxDrift = drift;
      if (t1 > maxT1) maxT1 = t1;
      sqErr += (t2 - T2_TARGET) ** 2;
      tArr.push(step + 1);
      t2Arr.push(t2);
      t1Arr.push(t1);
      tinArr.push(tInBase + rampAmp * Math.tanh((step + 1) / 8.0) + elmAmp * Math.exp(-0.5 * Math.pow((step + 1 - elmTime) / 2.0, 2)));
    }
    return { tArr, t2Arr, t1Arr, tinArr, rmse: Math.sqrt(sqErr / 30), maxT1, maxDrift };
  }

  const simRamp = document.getElementById("sim-ramp");
  const simElm = document.getElementById("sim-elm");
  const simTrip = document.getElementById("sim-trip");
  const plantCanvas = document.getElementById("plant-sim-canvas");

  function renderPlantSim() {
    const ramp = parseFloat(simRamp.value);
    const elm = parseFloat(simElm.value);
    const trip = parseFloat(simTrip.value) / 100;

    document.getElementById("sim-ramp-out").textContent = `+${ramp} K`;
    document.getElementById("sim-elm-out").textContent = `+${elm} K`;
    document.getElementById("sim-trip-out").textContent = `${Math.round(trip * 100)}%`;

    const ol = runPlantSim(ramp, elm, trip, false);
    const cl = runPlantSim(ramp, elm, trip, true);

    document.getElementById("sim-ol-rmse").textContent = `${ol.rmse.toFixed(2)} K`;
    document.getElementById("sim-cl-rmse").textContent = `${cl.rmse.toFixed(2)} K`;
    document.getElementById("sim-max-t1").textContent = `${cl.maxT1.toFixed(1)} K`;
    document.getElementById("sim-drift").textContent = cl.maxDrift === 0 ? "0.00e+00" : cl.maxDrift.toExponential(2);

    const W = 960, H = 310;
    const ctx = setupHiDPI(plantCanvas, W, H);
    const C = themeColors();
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // Dual subplot: Left = FLiBe Outlet T2 (870..940 K), Right = PbLi Supply & Outlet (890..1015 K)
    const panelsSpec = [
      {
        x0: 54, w: 410, yMin: 870, yMax: 940, title: "Secondary FLiBe Turbine Inlet T₂ (Target 892 K)",
        refY: 892, refLabel: "892 K Target", refCol: C.emerald,
        curves: [
          { y: ol.t2Arr, color: C.danger, dash: [5, 4], label: "Open-Loop" },
          { y: cl.t2Arr, color: C.accent, dash: [], label: "Closed-Loop" }
        ]
      },
      {
        x0: 526, w: 410, yMin: 890, yMax: 1015, title: "Primary PbLi Blanket Supply & Outlet T₁",
        refY: 948, refLabel: "948 K Soft Ceiling", refCol: C.amber,
        curves: [
          { y: cl.tinArr, color: C.plasma, dash: [3, 3], label: "Blanket Supply (ELM+Ramp)" },
          { y: cl.t1Arr, color: C.emerald, dash: [], label: "PbLi Outlet T₁ (Controlled)" }
        ]
      }
    ];

    const top = 36, bot = 44, ph = H - top - bot;
    panelsSpec.forEach((sp) => {
      const toX = (t) => sp.x0 + (t / 30) * sp.w;
      const toY = (v) => top + ph - ((v - sp.yMin) / (sp.yMax - sp.yMin)) * ph;

      // Grid
      ctx.strokeStyle = C.border;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const val = sp.yMin + ((sp.yMax - sp.yMin) * i) / 4;
        const y = toY(val);
        ctx.beginPath(); ctx.moveTo(sp.x0, y); ctx.lineTo(sp.x0 + sp.w, y); ctx.stroke();
        ctx.fillStyle = C.muted;
        ctx.font = "500 10px JetBrains Mono, monospace";
        ctx.fillText(`${Math.round(val)}K`, sp.x0 - 38, y + 3);
      }

      // Event markers (ELM t=12, Pump trip t=15)
      ctx.save();
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = C.border;
      [12, 15].forEach((et) => {
        ctx.beginPath(); ctx.moveTo(toX(et), top); ctx.lineTo(toX(et), top + ph); ctx.stroke();
      });
      ctx.restore();
      ctx.fillStyle = C.muted;
      ctx.font = "600 9.5px Inter, sans-serif";
      ctx.fillText("ELM", toX(12) - 10, top + ph - 5);
      ctx.fillText("Trip", toX(15) - 9, top + ph - 5);

      // Reference line
      const ry = toY(sp.refY);
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = sp.refCol;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(sp.x0, ry); ctx.lineTo(sp.x0 + sp.w, ry); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = sp.refCol;
      ctx.font = "700 10px Inter, sans-serif";
      ctx.fillText(sp.refLabel, sp.x0 + 6, ry - 5);

      // Curves
      sp.curves.forEach((cv) => {
        ctx.save();
        ctx.strokeStyle = cv.color;
        ctx.lineWidth = 2.6;
        if (cv.dash.length) ctx.setLineDash(cv.dash);
        ctx.beginPath();
        cv.y.forEach((v, idx) => {
          const px = toX(idx), py = toY(Math.max(sp.yMin, Math.min(sp.yMax, v)));
          if (idx === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        });
        ctx.stroke();
        ctx.restore();
      });

      // Title & legend
      ctx.fillStyle = C.ink;
      ctx.font = "700 12px Inter, sans-serif";
      ctx.fillText(sp.title, sp.x0, 18);

      let lx = sp.x0;
      sp.curves.forEach((cv) => {
        ctx.fillStyle = cv.color;
        ctx.fillRect(lx, H - 17, 14, 3);
        ctx.fillStyle = C.muted;
        ctx.font = "600 10.5px Inter, sans-serif";
        ctx.fillText(cv.label, lx + 18, H - 12);
        lx += ctx.measureText(cv.label).width + 32;
      });
      [0, 10, 20, 30].forEach((t) => {
        ctx.fillStyle = C.muted;
        ctx.font = "500 10px JetBrains Mono, monospace";
        ctx.fillText(`${t}s`, toX(t) - 6, top + ph + 15);
      });
    });
  }

  [simRamp, simElm, simTrip].forEach((el) => el.addEventListener("input", renderPlantSim));
  document.getElementById("scen-mild").addEventListener("click", (e) => {
    setScenPreset(e.currentTarget, 10, 5, 90);
  });
  document.getElementById("scen-elm").addEventListener("click", (e) => {
    setScenPreset(e.currentTarget, 24, 20, 58);
  });
  document.getElementById("scen-severe").addEventListener("click", (e) => {
    setScenPreset(e.currentTarget, 32, 25, 45);
  });
  function setScenPreset(btn, r, e, tr) {
    ["scen-mild", "scen-elm", "scen-severe"].forEach((id) => {
      document.getElementById(id).setAttribute("aria-pressed", String(document.getElementById(id) === btn));
    });
    simRamp.value = r; simElm.value = e; simTrip.value = tr;
    renderPlantSim();
  }
  renderPlantSim();

  // ---------- 8. Phase 4 Verified RL vs SHAC Chart ----------
  const rlCanvas = document.getElementById("rl-canvas");
  let rlXAxis = "ep"; // "ep" or "sec"
  const btnRlEp = document.getElementById("rl-x-ep");
  const btnRlSec = document.getElementById("rl-x-sec");
  btnRlEp.addEventListener("click", () => {
    rlXAxis = "ep"; btnRlEp.setAttribute("aria-pressed", "true"); btnRlSec.setAttribute("aria-pressed", "false"); drawRlChart();
  });
  btnRlSec.addEventListener("click", () => {
    rlXAxis = "sec"; btnRlEp.setAttribute("aria-pressed", "false"); btnRlSec.setAttribute("aria-pressed", "true"); drawRlChart();
  });

  function drawRlChart() {
    const W = 600, H = 275;
    const ctx = setupHiDPI(rlCanvas, W, H);
    const C = themeColors();
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    const pad = { l: 54, r: 22, t: 32, b: 42 };
    const pw = W - pad.l - pad.r;
    const ph = H - pad.t - pad.b;

    const xToPx = (val) => {
      if (rlXAxis === "ep") {
        const lo = Math.log10(200), hi = Math.log10(1200000);
        return pad.l + ((Math.log10(val) - lo) / (hi - lo)) * pw;
      }
      return pad.l + (val / 7.0) * pw;
    };
    const yToPx = (cost) => {
      // Log cost from 1 to 350
      const lo = 0, hi = Math.log10(350);
      return pad.t + ph - ((Math.log10(Math.max(1, cost)) - lo) / (hi - lo)) * ph;
    };

    // Grid
    ctx.strokeStyle = C.border;
    ctx.fillStyle = C.muted;
    ctx.font = "500 10px JetBrains Mono, monospace";
    [1, 2, 5, 10, 50, 280].forEach((c) => {
      const y = yToPx(c);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
      ctx.fillText(String(c), 16, y + 3);
    });

    // Open-loop baseline line
    const yOL = yToPx(DATA.phase4.control.openLoop.cost);
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = C.danger;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(pad.l, yOL); ctx.lineTo(W - pad.r, yOL); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = C.danger;
    ctx.font = "700 10px Inter, sans-serif";
    ctx.fillText("Open-Loop Cost = 280.8 (14.93 K RMSE)", pad.l + 6, yOL - 4);

    // Draw SHAC and PPO curves
    const series = [
      { pts: DATA.phase4.control.shac.curve, color: C.emerald, label: "Diff. SHAC / BPTT (51.2k ep, 5.09 s)" },
      { pts: DATA.phase4.control.ppo.curve, color: C.amber, label: "GPU PPO (1.024M ep, 6.75 s)" },
    ];
    series.forEach((s) => {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      s.pts.forEach((pt, i) => {
        const px = xToPx(rlXAxis === "ep" ? pt.ep : pt.sec);
        const py = yToPx(pt.cost);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.stroke();
      s.pts.forEach((pt) => {
        const px = xToPx(rlXAxis === "ep" ? pt.ep : pt.sec);
        const py = yToPx(pt.cost);
        ctx.fillStyle = s.color;
        ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
      });
    });

    // X ticks
    ctx.fillStyle = C.muted;
    ctx.font = "500 10px JetBrains Mono, monospace";
    if (rlXAxis === "ep") {
      [500, 5000, 50000, 500000, 1000000].forEach((ep) => {
        const px = xToPx(ep);
        const lbl = ep >= 1e6 ? "1M" : ep >= 1e3 ? `${ep / 1e3}k` : String(ep);
        ctx.fillText(lbl, px - 10, pad.t + ph + 15);
      });
      ctx.fillStyle = C.ink;
      ctx.font = "600 11px Inter, sans-serif";
      ctx.fillText("Training Episodes (log scale) — SHAC reaches same cost with 20× fewer episodes", pad.l + 10, H - 8);
    } else {
      [0, 1, 2, 3, 4, 5, 6, 7].forEach((sec) => {
        const px = xToPx(sec);
        ctx.fillText(`${sec}s`, px - 6, pad.t + ph + 15);
      });
      ctx.fillStyle = C.ink;
      ctx.font = "600 11px Inter, sans-serif";
      ctx.fillText("NVIDIA A100 Wall Time (seconds) — Held-Out Cost (log Y)", pad.l + 40, H - 8);
    }

    // Legend
    let lx = pad.l;
    series.forEach((s) => {
      ctx.fillStyle = s.color;
      ctx.fillRect(lx, 10, 12, 10);
      ctx.fillStyle = C.ink;
      ctx.font = "600 11px Inter, sans-serif";
      ctx.fillText(s.label, lx + 16, 19);
      lx += ctx.measureText(s.label).width + 30;
    });
  }
  drawRlChart();

  // ---------- 9. Phase 4 Co-Design Explorer ----------
  const cdButtons = {
    nominal: document.getElementById("cd-nominal"),
    nelder: document.getElementById("cd-nelder"),
    lbfgs: document.getElementById("cd-lbfgs"),
  };

  function renderCodesign(modeKey) {
    const mode = DATA.phase4.codesign.modes[modeKey];
    Object.entries(cdButtons).forEach(([k, btn]) => {
      btn.setAttribute("aria-pressed", String(k === modeKey));
    });
    const badge = document.getElementById("cd-badge");
    badge.textContent = mode.badge;
    badge.className = `tag ${mode.feasible ? "pass" : "fail"}`;

    const m = mode.metrics;
    const pbliOk = m.t_in_pbli <= 965.0;
    const purOk = m.x_t2 >= 99.97;

    document.getElementById("cd-gauges").innerHTML = `
      <div class="gauge-card ${pbliOk ? "ok" : "bad"}">
        <div class="gauge-label">PbLi Inlet (≤ 965 K)</div>
        <div class="gauge-num">${m.t_in_pbli.toFixed(2)} K</div>
        <div class="gauge-status">${pbliOk ? "Safe (within limit)" : `+${(m.t_in_pbli - 965).toFixed(1)} K VIOLATION`}</div>
      </div>
      <div class="gauge-card ${mode.feasible ? "ok" : ""}">
        <div class="gauge-label">Net Electric Power</div>
        <div class="gauge-num">${m.p_net.toFixed(1)} MWe</div>
        <div class="gauge-status">${mode.feasible ? "Feasible Plant Output" : "Unusable (Violates PbLi)"}</div>
      </div>
      <div class="gauge-card ${m.q > 60 ? "ok" : ""}">
        <div class="gauge-label">Plasma Gain Q</div>
        <div class="gauge-num">${m.q.toFixed(2)}</div>
        <div class="gauge-status">P_fus = ${m.p_fus.toFixed(1)} MW</div>
      </div>
      <div class="gauge-card ${purOk ? "ok" : "bad"}">
        <div class="gauge-label">T₂ Purity (≥ 99.97%)</div>
        <div class="gauge-num">${m.x_t2.toFixed(3)}%</div>
        <div class="gauge-status">16-Stage Cryo Column</div>
      </div>
      <div class="gauge-card ${mode.feasible ? "ok" : "bad"}">
        <div class="gauge-label">Objective Loss</div>
        <div class="gauge-num">${m.loss > 0 ? "+" + Math.round(m.loss).toLocaleString() : m.loss.toFixed(2)}</div>
        <div class="gauge-status">${mode.evals} Coupled Evals</div>
      </div>`;

    document.getElementById("cd-dials").innerHTML = DATA.phase4.codesign.bounds
      .map((b, i) => {
        const val = mode.setpoints[i];
        const pct = Math.max(4, Math.min(100, ((val - b.lo) / (b.hi - b.lo)) * 100));
        return `
          <div class="dial-row">
            <strong>${b.label}</strong>
            <div class="dial-track" role="progressbar" aria-label="${b.label}" aria-valuenow="${val}" aria-valuemin="${b.lo}" aria-valuemax="${b.hi}">
              <div class="dial-fill" style="inline-size:${pct.toFixed(1)}%"></div>
            </div>
            <span class="mono" style="text-align:end;">${val.toFixed(val < 1 ? 3 : 1)} ${b.unit === "frac" ? "" : b.unit}</span>
          </div>`;
      })
      .join("");

    const sumBox = document.getElementById("cd-summary");
    sumBox.className = `callout ${mode.feasible ? "emerald" : "plasma"}`;
    sumBox.innerHTML = `<strong>${mode.label} (${mode.evals} evals):</strong> ${mode.summary}`;
  }

  Object.entries(cdButtons).forEach(([k, btn]) => btn.addEventListener("click", () => renderCodesign(k)));
  renderCodesign("lbfgs");

  // ---------- 10. Presentation Slide-Jump Mode & Active Nav ----------
  const sections = Array.from(document.querySelectorAll("main > .section"));
  const navLinks = Array.from(document.querySelectorAll(".nav-links a"));
  const presentBtn = document.getElementById("present-toggle");
  const slideLabel = document.getElementById("slide-label");
  let currentSlide = 0;

  function goToSlide(idx) {
    currentSlide = Math.max(0, Math.min(sections.length - 1, idx));
    sections[currentSlide].scrollIntoView({ behavior: "smooth", block: "start" });
    slideLabel.textContent = `${currentSlide + 1} / ${sections.length}`;
  }

  presentBtn.addEventListener("click", () => {
    const on = !document.body.classList.contains("present-mode");
    document.body.classList.toggle("present-mode", on);
    presentBtn.setAttribute("aria-pressed", String(on));
    slideLabel.textContent = `${currentSlide + 1} / ${sections.length}`;
  });
  document.getElementById("slide-prev").addEventListener("click", () => goToSlide(currentSlide - 1));
  document.getElementById("slide-next").addEventListener("click", () => goToSlide(currentSlide + 1));

  window.addEventListener("keydown", (e) => {
    if (!document.body.classList.contains("present-mode")) return;
    if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(document.activeElement?.tagName)) return;
    if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); goToSlide(currentSlide + 1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); goToSlide(currentSlide - 1); }
    else if (e.key === "Escape") { document.body.classList.remove("present-mode"); presentBtn.setAttribute("aria-pressed", "false"); }
  });

  // Track active section in nav
  const secObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          const idx = sections.indexOf(en.target);
          if (idx >= 0) {
            currentSlide = idx;
            slideLabel.textContent = `${idx + 1} / ${sections.length}`;
          }
          const id = en.target.id;
          navLinks.forEach((a) => {
            a.setAttribute("aria-current", String(a.getAttribute("href") === `#${id}`));
          });
        }
      });
    },
    { rootMargin: "-25% 0px -60% 0px" }
  );
  sections.forEach((s) => secObserver.observe(s));

  function redrawAllCanvases() {
    renderValveLab();
    drawAllPhase3Charts();
    renderPlantSim();
    drawRlChart();
    applyPipeStep();
    if (plant3dCtrl) plant3dCtrl.applyTheme(getRenderedScheme());
  }
})();
