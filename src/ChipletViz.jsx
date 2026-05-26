import { useState, useEffect, useRef, useCallback } from "react";

// ─── Topology ─────────────────────────────────────────────────────────────────

const CHIPLETS = [
  { id: 0, label: "CTR-0", name: "Interconnect", xr: 0.50, yr: 0.20 },
  { id: 1, label: "CMP-1", name: "Compute A",    xr: 0.20, yr: 0.48 },
  { id: 2, label: "CMP-2", name: "Compute B",    xr: 0.80, yr: 0.48 },
  { id: 3, label: "MEM-3", name: "Memory Ctrl",  xr: 0.34, yr: 0.78 },
  { id: 4, label: "I/O-4", name: "I/O Bridge",   xr: 0.66, yr: 0.78 },
];

const CONNECTIONS = [
  { id: "0-1", from: 0, to: 1 },
  { id: "0-2", from: 0, to: 2 },
  { id: "0-3", from: 0, to: 3 },
  { id: "0-4", from: 0, to: 4 },
  { id: "1-2", from: 1, to: 2 },
  { id: "1-3", from: 1, to: 3 },
  { id: "2-4", from: 2, to: 4 },
  { id: "3-4", from: 3, to: 4 },
];

const PPC = 5; // particles per connection

const LOADS = {
  unbalanced: {
    "0-1": 0.96, "0-2": 0.92, "0-3": 0.07, "0-4": 0.09,
    "1-2": 0.89, "1-3": 0.06, "2-4": 0.87, "3-4": 0.08,
  },
  balanced: {
    "0-1": 0.45, "0-2": 0.44, "0-3": 0.43, "0-4": 0.46,
    "1-2": 0.44, "1-3": 0.45, "2-4": 0.44, "3-4": 0.43,
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

function loadRGB(load) {
  if (load < 0.5) {
    const t = load * 2;
    return [lerp(28, 255, t), lerp(105, 155, t), lerp(235, 18, t)];
  }
  const t = (load - 0.5) * 2;
  return [255, lerp(155, 22, t), lerp(18, 0, t)];
}

function rgba([r, g, b], a) {
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ChipletViz() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [balanced, setBalanced] = useState(false);
  const [pressing, setPressing] = useState(false);
  const vizRef = useRef(null);

  // Lazy-init viz state
  if (!vizRef.current) {
    const particles = [];
    CONNECTIONS.forEach((conn) => {
      for (let i = 0; i < PPC; i++) {
        particles.push({
          connId: conn.id,
          from: conn.from,
          to: conn.to,
          progress: i / PPC + Math.random() * 0.05,
          dir: Math.random() > 0.25 ? 1 : -1,
        });
      }
    });
    vizRef.current = {
      balanced: false,
      loads: { ...LOADS.unbalanced },
      particles,
      tT: 0,
      transitioning: false,
      srcLoads: null,
    };
  }

  const toggle = useCallback(() => {
    setBalanced((prev) => {
      const next = !prev;
      const v = vizRef.current;
      v.srcLoads = { ...v.loads };
      v.balanced = next;
      v.tT = 0;
      v.transitioning = true;
      return next;
    });
  }, []);

  // Canvas animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf;
    let last = null;

    const CW = 96;
    const CH = 54;

    function chipPos(chip) {
      const W = canvas.width;
      const H = canvas.height;
      const pad = 0.09;
      return {
        x: pad * W + chip.xr * (1 - 2 * pad) * W,
        y: pad * H + chip.yr * (1 - 2 * pad) * H,
      };
    }

    function frame(ts) {
      if (last === null) last = ts;
      const dt = Math.min((ts - last) / 1000, 0.05);
      last = ts;

      const v = vizRef.current;
      const ctx = canvas.getContext("2d");
      const W = canvas.width;
      const H = canvas.height;

      // Transition
      if (v.transitioning) {
        v.tT = Math.min(v.tT + dt * 0.75, 1);
        const t = easeInOut(v.tT);
        const target = LOADS[v.balanced ? "balanced" : "unbalanced"];
        CONNECTIONS.forEach(({ id }) => {
          v.loads[id] = lerp(v.srcLoads[id], target[id], t);
        });
        if (v.tT >= 1) {
          v.transitioning = false;
          v.srcLoads = null;
        }
      }

      // Chiplet temperatures
      const acc = CHIPLETS.map(() => ({ s: 0, n: 0 }));
      CONNECTIONS.forEach(({ id, from, to }) => {
        const l = v.loads[id];
        acc[from].s += l; acc[from].n++;
        acc[to].s += l; acc[to].n++;
      });
      const temps = CHIPLETS.map((_, i) => (acc[i].n ? acc[i].s / acc[i].n : 0));

      // ── Clear ──
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#070c12";
      ctx.fillRect(0, 0, W, H);

      // ── Substrate ──
      const sp = 0.06;
      const sx = sp * W, sy = sp * H, sw = (1 - 2 * sp) * W, sh = (1 - 2 * sp) * H;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(sx, sy, sw, sh, 8);
      ctx.fillStyle = "#0b1520";
      ctx.fill();
      ctx.strokeStyle = "rgba(28,52,80,0.9)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      // Substrate pads (PCB-style corners)
      [[sx+14, sy+14],[sx+sw-14, sy+14],[sx+14, sy+sh-14],[sx+sw-14, sy+sh-14]].forEach(([px, py]) => {
        ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI*2);
        ctx.fillStyle = "rgba(35,70,110,0.55)"; ctx.fill();
        ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI*2);
        ctx.fillStyle = "rgba(70,130,190,0.45)"; ctx.fill();
      });

      // ── Connection lines ──
      CONNECTIONS.forEach(({ id, from, to }) => {
        const load = v.loads[id];
        const p1 = chipPos(CHIPLETS[from]);
        const p2 = chipPos(CHIPLETS[to]);
        const rgb = loadRGB(load);
        const baseAlpha = 0.10 + load * 0.52;
        const lw = 0.4 + load * 2.2;

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = rgba(rgb, baseAlpha);
        ctx.lineWidth = lw;
        ctx.stroke();

        // Hot glow layers
        if (load > 0.60) {
          const g = (load - 0.60) / 0.40;
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = rgba(rgb, g * 0.18); ctx.lineWidth = lw * 6; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = rgba(rgb, g * 0.30); ctx.lineWidth = lw * 2.8; ctx.stroke();
        }
      });

      // ── Particles ──
      v.particles.forEach((p) => {
        const load = v.loads[p.connId];
        const speed = (0.10 + load * 0.48) * p.dir;
        p.progress += speed * dt;
        if (p.progress > 1) p.progress -= 1;
        if (p.progress < 0) p.progress += 1;

        const pos1 = chipPos(CHIPLETS[p.from]);
        const pos2 = chipPos(CHIPLETS[p.to]);
        const px = lerp(pos1.x, pos2.x, p.progress);
        const py = lerp(pos1.y, pos2.y, p.progress);
        const rgb = loadRGB(load);
        const size = 1.4 + load * 2.8;
        const alpha = clamp(0.05 + load * 0.95, 0, 1);

        // Glow halo on hot particles
        if (load > 0.45) {
          const g = ctx.createRadialGradient(px, py, 0, px, py, size * 4.5);
          g.addColorStop(0, rgba(rgb, (load - 0.45) * 0.45));
          g.addColorStop(1, rgba(rgb, 0));
          ctx.beginPath(); ctx.arc(px, py, size * 4.5, 0, Math.PI*2);
          ctx.fillStyle = g; ctx.fill();
        }

        // Core dot
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fillStyle = rgba(rgb, alpha);
        ctx.fill();
      });

      // ── Chiplets ──
      CHIPLETS.forEach((chip, i) => {
        const pos = chipPos(chip);
        const temp = temps[i];
        const cx = pos.x - CW / 2;
        const cy = pos.y - CH / 2;
        const rgb = loadRGB(temp);

        // Glow aura
        if (temp > 0.22) {
          const gr = CW * 1.2;
          const g = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, gr);
          g.addColorStop(0, rgba(rgb, temp * 0.20));
          g.addColorStop(1, rgba(rgb, 0));
          ctx.fillStyle = g;
          ctx.fillRect(pos.x - gr, pos.y - gr, gr * 2, gr * 2);
        }

        // Body fill
        ctx.beginPath();
        ctx.roundRect(cx, cy, CW, CH, 4);
        ctx.fillStyle =
          temp > 0.65 ? "rgba(20,7,4,0.93)"
          : temp > 0.42 ? "rgba(16,11,3,0.93)"
          : "rgba(9,16,26,0.93)";
        ctx.fill();

        // Border
        ctx.strokeStyle = rgba(rgb, 0.45 + temp * 0.55);
        ctx.lineWidth = 1;
        ctx.stroke();

        // Internal grid lines
        ctx.strokeStyle = rgba(rgb, 0.06);
        ctx.lineWidth = 0.5;
        for (let gx = 1; gx < 4; gx++) {
          const lx = cx + (CW / 4) * gx;
          ctx.beginPath(); ctx.moveTo(lx, cy + 4); ctx.lineTo(lx, cy + CH - 4); ctx.stroke();
        }
        for (let gy = 1; gy < 3; gy++) {
          const ly = cy + (CH / 3) * gy;
          ctx.beginPath(); ctx.moveTo(cx + 4, ly); ctx.lineTo(cx + CW - 4, ly); ctx.stroke();
        }

        // Label
        ctx.textAlign = "center";
        ctx.font = `bold 10px 'JetBrains Mono', 'Courier New', monospace`;
        ctx.fillStyle = rgba(rgb, 0.92);
        ctx.fillText(chip.label, pos.x, cy + 16);

        // Sub-label
        ctx.font = `7.5px 'JetBrains Mono', 'Courier New', monospace`;
        ctx.fillStyle = rgba(rgb, 0.44);
        ctx.fillText(chip.name.toUpperCase(), pos.x, cy + 27);

        // Load bar background
        const bx = cx + 8, by = cy + CH - 11, bw = CW - 16, bh = 3;
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = rgba(rgb, 0.65);
        ctx.fillRect(bx, by, bw * temp, bh);

        // Load % text
        ctx.font = `7px 'JetBrains Mono', 'Courier New', monospace`;
        ctx.fillStyle = rgba(rgb, 0.55);
        ctx.fillText(`${Math.round(temp * 100)}%`, pos.x, cy + CH - 1);
      });

      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const resize = () => {
      canvas.width = wrap.clientWidth;
      canvas.height = wrap.clientHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  const mono = "'JetBrains Mono', 'Courier New', monospace";

  return (
    <div style={{
      background: "#070c12",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      fontFamily: mono,
      color: "#7a9ab8",
      userSelect: "none",
    }}>

      {/* Header */}
      <div style={{
        padding: "14px 24px",
        borderBottom: "1px solid rgba(28,52,80,0.9)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 9, color: "rgba(90,130,165,0.55)", letterSpacing: "0.12em", marginBottom: 3 }}>
            ATHOS SILICON / mSoC VISUALIZATION
          </div>
          <div style={{ fontSize: 13, color: "#8aa8c5", fontWeight: 700, letterSpacing: "0.04em" }}>
            Load Balancer — L3 ↔ L4 Fabric
          </div>
        </div>
        <div style={{
          fontSize: 9,
          letterSpacing: "0.10em",
          color: balanced ? "rgba(44,190,80,0.75)" : "rgba(210,55,35,0.75)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: balanced ? "rgba(44,190,80,0.85)" : "rgba(210,55,35,0.85)",
            display: "inline-block",
            boxShadow: balanced
              ? "0 0 6px rgba(44,190,80,0.7)"
              : "0 0 6px rgba(210,55,35,0.7)",
          }} />
          {balanced ? "BALANCED — ALL SYSTEMS NOMINAL" : "IMBALANCED — HOTSPOT DETECTED"}
        </div>
      </div>

      {/* Canvas */}
      <div ref={wrapRef} style={{ flex: 1, overflow: "hidden" }}>
        <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
      </div>

      {/* Controls */}
      <div style={{
        padding: "16px 24px",
        borderTop: "1px solid rgba(28,52,80,0.9)",
        display: "flex",
        alignItems: "center",
        gap: 24,
        flexShrink: 0,
      }}>

        {/* Toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            onClick={toggle}
            onMouseDown={() => setPressing(true)}
            onMouseUp={() => setPressing(false)}
            onMouseLeave={() => setPressing(false)}
            style={{
              width: 48,
              height: 26,
              borderRadius: 13,
              background: balanced ? "rgba(36,165,72,0.18)" : "rgba(195,48,28,0.18)",
              border: `1px solid ${balanced ? "rgba(36,165,72,0.55)" : "rgba(195,48,28,0.55)"}`,
              position: "relative",
              cursor: "pointer",
              transition: "background 0.25s ease, border-color 0.25s ease",
              transform: pressing ? "scale(0.97)" : "scale(1)",
            }}
          >
            <div style={{
              position: "absolute",
              top: 4,
              left: balanced ? 24 : 4,
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: balanced ? "rgba(50,190,85,0.95)" : "rgba(210,52,32,0.95)",
              transition: "left 0.22s ease, background 0.22s ease, box-shadow 0.22s ease",
              boxShadow: balanced
                ? "0 0 7px rgba(50,190,85,0.75)"
                : "0 0 7px rgba(210,52,32,0.75)",
            }} />
          </div>
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.08em", color: balanced ? "rgba(50,190,85,0.8)" : "rgba(210,52,32,0.8)" }}>
              LOAD BALANCER {balanced ? "ENABLED" : "DISABLED"}
            </div>
            <div style={{ fontSize: 8, color: "rgba(80,110,140,0.45)", letterSpacing: "0.06em", marginTop: 2 }}>
              {balanced ? "Fabric distributing evenly across all chiplets" : "Overload on CTR-0 / CMP-1 / CMP-2"}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 18, marginLeft: "auto", alignItems: "center" }}>
          {[
            { color: "#1c6ef0", label: "LOW LOAD" },
            { color: "#ff9f18", label: "MED LOAD" },
            { color: "#ff2a10", label: "HIGH LOAD" },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 22, height: 2, background: color, borderRadius: 1 }} />
              <span style={{ fontSize: 8, letterSpacing: "0.09em", color: "rgba(90,120,150,0.5)" }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
