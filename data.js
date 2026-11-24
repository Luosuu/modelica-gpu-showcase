// Verified experimental data extracted directly from:
//   - results/modelica_jax/regrade-one-a100.txt (Slurm job 23388961, NVIDIA A100-SXM4-40GB)
//   - results/modelica_jax/REPORT.md
//   - results/modelica_jax/phase4_metrics.json (Slurm job 23390494, NVIDIA A100-SXM4-40GB)

window.RESEARCH_DATA = {
  plantStages: [
    {
      id: "core",
      step: "Stage 1",
      title: "1D Burning Plasma Core",
      subtitle: "D–T Fusion Heat Source (Phase 4)",
      color: "#d9532f",
      analogy: "Think of this as the furnace: deuterium and tritium nuclei fuse at ~35 keV (~400 million °C), releasing 14.1 MeV neutrons that stream outward into the blanket walls.",
      engineering: "12-zone 1D radial diffusive energy & particle PDE with Bosch–Hale D–T reactivity, alpha self-heating, bremsstrahlung radiation, and gyro-Bohm confinement degradation (400 RK4 steps over a 10 s flattop).",
      challenge: "Must be coupled differentiably to downstream thermal-hydraulics and fuel purification so reducing auxiliary heating (P_aux) simultaneously balances fusion gain Q and blanket structural temperature.",
      metrics: [
        { label: "Plasma Volume", value: "420 m³" },
        { label: "Co-Designed P_fus", value: "965.5 MW" },
        { label: "Co-Designed Gain Q", value: "74.54" }
      ]
    },
    {
      id: "tier1",
      step: "Stage 2 · Tier 1",
      title: "PbLi Blanket & Non-Smooth Check Valve",
      subtitle: "BlanketValveDAE (6 states + 2 algebraic)",
      color: "#b45309",
      analogy: "Liquid lead-lithium (PbLi) metal flows around the reactor walls like car radiator coolant, carrying heat out while breeding new tritium fuel. One-way check valves stop backflow, and a pump pressure balance locks all loops together.",
      engineering: "6 ODE states + 2 implicit algebraic DAE constraints with hard if/else check-valve kinks, stiff thermal/tritium modes, and molar tritium conservation.",
      challenge: "Rumoca 0.10.4 fails with unsupported residual equations & event discontinuities. Hard if/else branches stall GPU warps and produce NaN/broken adjoint gradients (9.1e-4 FD failure in Gen 1).",
      metrics: [
        { label: "Rumoca 0.10.4", value: "FAIL" },
        { label: "Swarm Gen-3 Peak", value: "6.0 / 10" },
        { label: "1k-Fwd / Parity", value: "0.216 s · 3.6e-8" }
      ]
    },
    {
      id: "tier2",
      step: "Stage 3 · Tier 2",
      title: "ORNL TRANSFORM PbLi/FLiBe Heat Exchanger",
      subtitle: "TransformPbLiFLiBeHX (15 states + Sieverts Permeator)",
      color: "#1a5fb4",
      analogy: "A counter-current radiator where hot liquid metal (PbLi) warms a secondary molten salt loop (FLiBe) to drive electricity turbines, while a vacuum membrane extracts tritium gas from the coolant.",
      engineering: "Real multi-package ORNL TRANSFORM Simple_HX (nV = 6 counter-current zones, cv ≠ cp enthalpy/internal-energy semantics, regStep low-flow limiters) coupled to a nonlinear Arrhenius/Sieverts cubic permeator.",
      challenge: "Rumoca 0.10.4 fails 0/9 on TRANSFORM-UnitTests. Our Swarm unpacked exact semantics via omc instantiateModel, solved the cubic permeator with Newton + @jax.custom_jvp, and replaced adaptive Rosenbrock with 100-step RK4.",
      metrics: [
        { label: "Swarm Gen-2 Peak", value: "10.0 / 10" },
        { label: "1k-Fwd + 64-Grad", value: "7.8 ms + 17.5 ms" },
        { label: "vs. Hand-Written Ref", value: "165× Faster" }
      ]
    },
    {
      id: "tier3",
      step: "Stage 4 · Tier 3",
      title: "16-Stage Cryogenic H₂/HD/T₂ Distillation",
      subtitle: "CryoHDTColumn16 (32 stiff ODE + 32 algebraic)",
      color: "#157a4c",
      analogy: "An ultra-cold (~24 K) 16-tray separation tower that sorts hydrogen isotopes by boiling point—sending light H₂ out the top and delivering ≥ 99.97% pure tritium (T₂) from the bottom back to refuel the plasma.",
      engineering: "32 stiff species states coupled to 32 tray equilibrium relations (Raoult/Antoine vapor pressures, nested condenser/reboiler splits). Naive dense O(N³) Jacobians spill GPU registers.",
      challenge: "Requires structure-aware tridiagonal/banded linear solves and @jax.custom_jvp (since Rosenbrock solvers call jacfwd inside reverse replay, breaking @jax.custom_vjp).",
      metrics: [
        { label: "Swarm Gen-2 Peak", value: "8.0 / 10" },
        { label: "1k-Fwd / Combined", value: "42.8 ms / 0.175 s" },
        { label: "omc Parity / Drift", value: "5.2e-10 / 2.0e-15" }
      ]
    }
  ],

  stackLayers: [
    {
      id: "omc",
      layer: "Layer 1",
      name: "OpenModelica (omc 1.27.1)",
      role: "Ground-Truth Reference Oracle",
      badge: "CPU Reference",
      tone: "neutral",
      what: "Compiles full Modelica Standard Library & ORNL TRANSFORM models on CPU using DASSL (tol 1e-10). Provides exact flattened equations (instantiateModel) and hidden held-out trajectory ground truth.",
      whyNotAlone: "Serial CPU execution (~1–5 s per run) with zero GPU batching and no automatic differentiation for RL or gradient-based co-design."
    },
    {
      id: "rumoca",
      layer: "Layer 2",
      name: "Rumoca (v0.10.4)",
      role: "Deterministic Modelica → JAX Front-End",
      badge: "0/3 Tiers · 0/9 TRANSFORM",
      tone: "amber",
      what: "Rust-based Modelica compiler that exports clean, explicit flat ODEs to JAX cleanly and deterministically.",
      whyNotAlone: "Stops at industrial constructs: external package records, implicit DAE residual equations, hard if/else valve discontinuities, and GPU register-spilling dense Jacobians. We invoke it as an agent tool—we complement, never replace it."
    },
    {
      id: "swarm",
      layer: "Layer 3",
      name: "meshswarm + meshevolve",
      role: "Multi-Agent Refactoring & Cross-Task Evolution",
      badge: "10/20 Passed · $9.69 Total",
      tone: "blue",
      what: "3-agent peer swarms refactor non-smooth valves, eliminate DAE loops via Newton + @jax.custom_jvp, optimize GPU memory/scan structure, and distill cross-generation lessons under a strict 5-gate anti-cheat grader.",
      whyNotAlone: "Every candidate must pass AST checks, 8 unseen omc cases, < 1e-11 molar conservation, and dual JVP/VJP + macro finite-difference adjoint verification."
    },
    {
      id: "jax",
      layer: "Layer 4",
      name: "JAX / XLA GPU + gradsolve + Optax",
      role: "Differentiable GPU Runtime & Downstream Workflows",
      badge: "7.8 ms / 1k · 151k ep/s",
      tone: "green",
      what: "Executes fused jax.jit(jax.vmap(lax.scan)) kernels across thousands of simultaneous trajectories on NVIDIA GPUs while exposing exact end-to-end gradients (jax.value_and_grad).",
      whyNotAlone: "Unlocks Phase 4 closed-loop GPU RL (1.024M episodes in 6.75 s), differentiable SHAC/BPTT, < 18 µs CPU MLP distillation, and 3-solver whole-plant co-design."
    }
  ],

  gates: [
    {
      symbol: "I_compile",
      name: "AST & Clean Execution Gate",
      criterion: "Binary (0 or 1)",
      detail: "Statically inspects solver_jax.py via Python AST to ban subprocess/OpenModelica calls, file I/O, or hardcoded lookup tables, then runs in an isolated --network none Apptainer container."
    },
    {
      symbol: "I_traj_gold",
      name: "Held-Out OpenModelica Parity",
      criterion: "Rel err ≤ 2.5e-4 – 5e-4",
      detail: "Compares GPU ensemble observables against 8 unseen OpenModelica DASSL (tol 1e-10) parameter cases spanning wide off-design regimes."
    },
    {
      symbol: "I_mass",
      name: "Exact Molar / Mass Conservation",
      criterion: "Drift < 1e-11",
      detail: "Verifies total tritium / hydrogen isotope inventory conservation across the entire ensemble. Any 1e-6 leak probe immediately scores 0.0."
    },
    {
      symbol: "I_adjoint",
      name: "Dual-Mode + Fresh-Macro Adjoint Gate",
      criterion: "JVP=VJP < 1e-10 · FD < 5e-5",
      detail: "Checks reverse-mode VJP against forward-mode JVP (catches custom_vjp bugs), closure finite differences, and fresh macro parameter perturbations (catches stop_gradient/detached cheats)."
    },
    {
      symbol: "R_perf",
      name: "10-Rung GPU Speed Ladder",
      criterion: "1.0 – 10.0 pts",
      detail: "Scores warm GPU wall time for 1,000 forward trajectories + 64 batched reverse gradients against thresholds [30, 15, 8, 4, 2, 1, 0.5, 0.25, 0.12, 0.06] s."
    }
  ],

  phase3: {
    tiers: {
      tier1: {
        name: "Tier 1 — BlanketValveDAE",
        subtitle: "6 ODE + 2 Algebraic DAE · Non-Smooth Check Valve",
        refTime: 1.34,
        refScore: 5.0,
        refLabel: "Phase 0 Smoke Ref (1.34 s fwd)",
        takeaway: "Gen 1 failed closure FD (9.1e-4) due to an unsmoothed valve kink; Gen 2 hit 240 s adaptive solver timeouts. After reviewer lessons diagnosed smoothing width and fixed-step convergence, Gen 3 run-1 passed all 4 gates at 6.0/10 (0.843 s combined, omc_err 3.62e-8, drift 7.99e-15).",
        generations: [
          { gen: "Gen 1 (Seed)", run1: { score: 0, time: null, note: "Valve kink broke FD (9.1e-4)" }, run2: { score: 0, time: null, note: "Case 3 sign error (2.6e-2)" }, control: null, cost: 0.90 },
          { gen: "Gen 2", run1: { score: 0, time: null, note: "Timed out > 240 s" }, run2: { score: 0, time: null, note: "Left stub unmerged" }, control: { score: 0, time: null, note: "Timed out > 240 s" }, cost: 0.56 },
          { gen: "Gen 3", run1: { score: 6.0, time: 0.8431, fwd: 0.2160, grad: 0.6270, omc: "3.62e-8", mass: "7.99e-15", note: "Passed all 4 gates!" }, run2: { score: 0, time: null, note: "Left stub unmerged" }, control: { score: 0, time: null, note: "Left stub unmerged" }, cost: 0.61 }
        ]
      },
      tier2: {
        name: "Tier 2 — ORNL TRANSFORM PbLi/FLiBe HX",
        subtitle: "15 ODE + Implicit Sieverts Permeator · Cross-Task Transfer from Tier 1",
        refTime: 4.18,
        refScore: 3.0,
        refLabel: "Hand-Written Adaptive Ref (4.18 s, 3.0/10)",
        takeaway: "Cross-task lessons from Tier 1 yielded 6/6 gate-passing solvers on a real ORNL TRANSFORM model. Gen 2 run-1 profiled thermal eigenvalues, replaced adaptive Rosenbrock with a 100-step RK4 + Newton/custom_jvp kernel, and achieved 10.0/10 in 25.3 ms combined (7.8 ms 1k-fwd) — 165× faster than our hand-written reference!",
        generations: [
          { gen: "Gen 1 (Transfer)", run1: { score: 4.0, time: 3.4339, fwd: 2.9392, grad: 0.4947, omc: "3.05e-8", mass: "4.14e-15", note: "Passed all 4 gates" }, run2: { score: 9.0, time: 0.1072, fwd: 0.0413, grad: 0.0658, omc: "1.34e-8", mass: "1.78e-15", note: "150-step RK4 (41.3 ms fwd)" }, control: { score: 5.0, time: 1.4428, fwd: 1.2070, grad: 0.2358, omc: "3.11e-8", mass: "3.11e-15", note: "Adaptive solver" }, cost: 2.32 },
          { gen: "Gen 2", run1: { score: 10.0, time: 0.0253, fwd: 0.0078, grad: 0.0175, omc: "1.63e-7", mass: "1.63e-15", note: "100-step RK4 — 165× vs ref!" }, run2: { score: 5.0, time: 1.3292, fwd: 0.6658, grad: 0.6634, omc: "3.03e-8", mass: "3.55e-15", note: "Passed all 4 gates" }, control: { score: 7.0, time: 0.2628, fwd: 0.1311, grad: 0.1317, omc: "6.18e-8", mass: "1.48e-15", note: "Passed all 4 gates" }, cost: 2.92 }
        ]
      },
      tier3: {
        name: "Tier 3 — CryoHDTColumn16",
        subtitle: "32 Stiff ODE + 32 Algebraic · 16-Stage Cryogenic Isotope Column",
        refTime: 0.143,
        refScore: 8.0,
        refLabel: "Hand-Written Tridiagonal Scan Ref (0.143 s fwd)",
        takeaway: "In Gen 1, 0/3 swarms passed (lesson swarms left prototypes in scratch/; control used @jax.custom_vjp which crashed forward-mode JVP). Reviewer lessons ('Deliverable first; ugly and green within 10–15 min' + @jax.custom_jvp) lifted Gen 2 to 3/3 passing, peaking at 8.0/10 (42.8 ms 1k-fwd, omc_err 5.18e-10).",
        generations: [
          { gen: "Gen 1 (Transfer)", run1: { score: 0, time: null, note: "Prototype left in scratch/" }, run2: { score: 0, time: null, note: "Prototype left in scratch/" }, control: { score: 0, time: null, note: "custom_vjp broke JVP check" }, cost: 0.79 },
          { gen: "Gen 2", run1: { score: 2.0, time: 8.0450, fwd: 5.2384, grad: 2.8066, omc: "1.51e-10", mass: "2.47e-15", note: "Passed; conservative step count" }, run2: { score: 5.0, time: 1.8634, fwd: 0.5512, grad: 1.3122, omc: "1.50e-10", mass: "3.86e-15", note: "Passed all 4 gates" }, control: { score: 8.0, time: 0.1749, fwd: 0.0428, grad: 0.1321, omc: "5.18e-10", mass: "2.01e-15", note: "42.8 ms fwd · 174.9 ms total" }, cost: 1.00 }
        ]
      }
    }
  },

  phase4: {
    control: {
      openLoop: { cost: 280.83, rmse: 14.93, maxT1: 917.26, drift: 1.63e-15 },
      shac: {
        episodes: 51200,
        wallSec: 5.094,
        epsPerSec: 10051,
        cost: 2.05,
        rmse: 1.37,
        maxT1: 916.98,
        drift: 1.78e-15,
        params: 1475,
        curve: [
          { ep: 256, sec: 0.044, cost: 169.59, rmse: 11.56 },
          { ep: 6400, sec: 0.667, cost: 6.77, rmse: 2.24 },
          { ep: 12800, sec: 1.304, cost: 3.27, rmse: 1.58 },
          { ep: 25600, sec: 2.570, cost: 2.38, rmse: 1.47 },
          { ep: 51200, sec: 5.093, cost: 2.05, rmse: 1.37 }
        ]
      },
      ppo: {
        episodes: 1024000,
        wallSec: 6.751,
        epsPerSec: 151690,
        cost: 1.99,
        rmse: 1.34,
        maxT1: 917.16,
        drift: 1.78e-15,
        curve: [
          { ep: 2048, sec: 0.028, cost: 118.70, rmse: 9.75 },
          { ep: 102400, sec: 0.724, cost: 2.35, rmse: 1.42 },
          { ep: 307200, sec: 2.066, cost: 2.05, rmse: 1.34 },
          { ep: 614400, sec: 4.075, cost: 2.03, rmse: 1.33 },
          { ep: 1024000, sec: 6.750, cost: 1.99, rmse: 1.34 }
        ]
      },
      edgeMlp: {
        arch: "9 → 16 → 16 → 3",
        params: 483,
        paramLimit: 10000,
        cost: 2.69,
        rmse: 1.51,
        drift: 1.48e-15,
        parity: "2.22e-16",
        meanUs: 11.69,
        p50Us: 11.60,
        p99Us: 15.45,
        p999Us: 17.47,
        targetUs: 1000.0
      }
    },
    codesign: {
      bounds: [
        { key: "s_fuel", label: "Fueling Rate S_fuel", unit: "×10²⁰ m⁻³s⁻¹", lo: 0.08, hi: 0.55 },
        { key: "p_aux", label: "Aux Heating P_aux", unit: "MW", lo: 12.0, hi: 65.0 },
        { key: "m_pbli", label: "Primary PbLi Flow", unit: "kg/s", lo: 45.0, hi: 125.0 },
        { key: "m_flibe", label: "Secondary FLiBe Flow", unit: "kg/s", lo: 6.0, hi: 18.0 },
        { key: "v_boil", label: "Cryo Reboiler Boilup", unit: "mol/s", lo: 1.45, hi: 2.35 },
        { key: "d_rec", label: "Distillate Recovery", unit: "frac", lo: 0.07, hi: 0.22 }
      ],
      modes: {
        nominal: {
          label: "Nominal Midpoint",
          evals: 1,
          feasible: false,
          badge: "INFEASIBLE (+82.3 K violation)",
          tone: "danger",
          setpoints: [0.315, 38.5, 85.0, 12.0, 1.90, 0.145],
          metrics: { p_net: 276.24, p_fus: 1377.98, q: 35.79, t_in_pbli: 1047.31, t2_out: 940.01, x_t2: 99.978, loss: 135209.9 },
          summary: "Starting at the midpoint of all 6 bounds produces excessive fusion neutron power (1378 MW) at moderate PbLi flow (85 kg/s), pushing blanket PbLi inlet temperature to 1047.3 K — 82.3 K above the 965.0 K ferritic-steel structural limit."
        },
        nelder: {
          label: "Gradient-Free Nelder–Mead",
          evals: 60,
          feasible: false,
          badge: "INFEASIBLE (+72.0 K violation)",
          tone: "danger",
          setpoints: [0.305, 38.7, 87.2, 12.1, 1.88, 0.145],
          metrics: { p_net: 250.85, p_fus: 1303.74, q: 33.69, t_in_pbli: 1037.01, t2_out: 936.33, x_t2: 99.978, loss: 103459.7 },
          summary: "Without cross-solver derivatives, 60 simplex evaluations struggle to coordinate plasma fueling/heating against downstream blanket coolant flow. After burning the entire evaluation budget, PbLi inlet still sits at 1037.0 K (+72.0 K over limit)."
        },
        lbfgs: {
          label: "3-Solver Exact-Grad L-BFGS-B",
          evals: 59,
          feasible: true,
          badge: "FEASIBLE · OPTIMAL (FD err 2.51e-7)",
          tone: "success",
          setpoints: [0.2556, 12.9533, 123.5611, 17.7842, 1.4662, 0.145],
          metrics: { p_net: 172.66, p_fus: 965.52, q: 74.54, t_in_pbli: 964.70, t2_out: 899.75, x_t2: 99.979, loss: -171.71 },
          summary: "Exact end-to-end jax.value_and_grad derivatives across Core → Blanket HX → Cryo Column simultaneously throttle P_aux to 12.95 MW (doubling plasma Q to 74.54), ramp PbLi/FLiBe flows (123.6 / 17.8 kg/s) to hold PbLi at 964.70 K (≤ 965 K), and cut cryo boilup to 1.466 mol/s while maintaining 99.979% T₂ purity."
        }
      }
    }
  }
};
