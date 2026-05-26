import { useState, useEffect, useRef, useCallback } from "react";

const CHIPLETS = [
  { id: 0, label: "CTR-0", name: "Interconnect", xr: 0.50, yr: 0.18 },
  { id: 1, label: "CMP-1", name: "Compute A",    xr: 0.20, yr: 0.48 },
  { id: 2, label: "CMP-2", name: "Compute B",    xr: 0.80, yr: 0.48 },
  { id: 3, label: "MEM-3", name: "Memory Ctrl",  xr: 0.35, yr: 0.80 },
  { id: 4, label: "I/O-4", name: "I/O Bridge",   xr: 0.65, yr: 0.80 },
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

const PPC = 4;

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

export default function ChipletViz() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [balanced, setBalanced] = useState(false);
  const [pressing, setPressing] = useState(false);
  const vizRef = useRef(null);

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf;
    let last = null;

    const CW = 130;
    const CH = 64;
    const R = 6;

    function chipPos(chip) {
      const W = canvas.width;
      const H = canvas.height;
      const pad = 0.10;
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

      if (v.transitioning) {
        v.tT = Math.min(v.tT + dt * 0.75, 1);
        const t = easeInOut(v.tT);
        const target = LOADS[v.balanced ? "balanced" : "unbalanced"];
        CONNECTIONS.forEach(({ id }) => {
          v.loads[id] = lerp(v.srcLoads[id], target[id], t);
        });
        if (v.tT >= 1) { v.transitioning = false; v.srcLoads = null; }
      }

      const acc = CHIPLETS.map(() => ({ s: 0, n: 0 }));
      CONNECTIONS.forEach(({ id, from, to }) => {
        const l = v.loads[id];
        acc[from].s += l; acc[from].n++;
        acc[to].s += l; acc[to].n++;
      });
      const temps = CHIPLETS.map((_, i) => (acc[i].n ? acc[i].s / acc[i].n : 0));

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#070c12";
      ctx.fillRect(0, 0, W, H);

      // ── Connection lines ──
      CONNECTIONS.forEach(({ id, from, to }) => {
        const load = v.loads[id];
        const p1 = chipPos(CHIPLETS[from]);
        const p2 = chipPos(CHIPLETS[to]);
        const rgb = loadRGB(load);
        const lw = 1.0 + load * 2.0;

        // Single glow pass for hot links only
        if (load > 0.55) {
          const g = (load - 0.55) / 0.45;
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = rgba(rgb, g * 0.12); ctx.lineWidth = lw * 7; ctx.stroke();
        }

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = rgba(rgb, 0.15 + load * 0.60);
        ctx.lineWidth = lw;
        ctx.stroke();
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
        const size = 1.5 + load * 2.0;
        const alpha = clamp(0.15 + load * 0.85, 0, 1);

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

        // Body
        ctx.beginPath();
        ctx.roundRect(cx, cy, CW, CH, R);
        ctx.fillStyle =
          temp > 0.65 ? "rgba(22,8,4,0.97)"
          : temp > 0.42 ? "rgba(16,12,4,0.97)"
          : "rgba(8,15,26,0.97)";
        ctx.fill();

        // Border — crisp, no blur
        ctx.strokeStyle = rgba(rgb, 0.55 + temp * 0.45);
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Subtle top highlight line
        ctx.beginPath();
        ctx.moveTo(cx + R, cy + 1);
        ctx.lineTo(cx + CW - R, cy + 1);
        ctx.strokeStyle = rgba(rgb, 0.18);
        ctx.lineWidth = 1;
        ctx.stroke();

        // Label
        ctx.textAlign = "center";
        ctx.font = `bold 13px 'JetBrains Mono', 'Courier New', monospace`;
        ctx.fillStyle = rgba(rgb, 0.95);
        ctx.fillText(chip.label, pos.x, cy + 22);

        // Sub-label
        ctx.font = `9px 'JetBrains Mono', 'Courier New', monospace`;
        ctx.fillStyle = rgba(rgb, 0.50);
        ctx.fillText(chip.name.toUpperCase(), pos.x, cy + 35);

        // Load bar
        const bx = cx + 12, by = cy + CH - 14, bw = CW - 24, bh = 3;
        ctx.fillStyle = "rgba(255,255,255,0.07)";
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = rgba(rgb, 0.80);
        ctx.fillRect(bx, by, bw * temp, bh);

        // Percentage
        ctx.font = `bold 9px 'JetBrains Mono', 'Courier New', monospace`;
        ctx.fillStyle = rgba(rgb, 0.70);
        ctx.fillText(`${Math.round(temp * 100)}%`, pos.x, cy + CH - 2);
      });

      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

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

  const mono = "'JetBrains Mono', 'Courier New', monospace";

  return (
    <div style={{
      background: "#070c12",
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      fontFamily: mono,
      userSelect: "none",
    }}>
      {/* Canvas fills everything */}
      <div ref={wrapRef} style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />

        {/* Toggle — floating bottom-center */}
        <div style={{
          position: "absolute",
          bottom: 28,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}>
          <div
            onClick={toggle}
            onMouseDown={() => setPressing(true)}
            onMouseUp={() => setPressing(false)}
            onMouseLeave={() => setPressing(false)}
            style={{
              width: 52,
              height: 28,
              borderRadius: 14,
              background: balanced ? "rgba(36,165,72,0.20)" : "rgba(195,48,28,0.20)",
              border: `1px solid ${balanced ? "rgba(36,165,72,0.60)" : "rgba(195,48,28,0.60)"}`,
              position: "relative",
              cursor: "pointer",
              transition: "background 0.25s, border-color 0.25s",
              transform: pressing ? "scale(0.96)" : "scale(1)",
              flexShrink: 0,
            }}
          >
            <div style={{
              position: "absolute",
              top: 5,
              left: balanced ? 26 : 5,
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: balanced ? "rgba(50,190,85,0.95)" : "rgba(210,52,32,0.95)",
              transition: "left 0.22s ease, background 0.22s ease",
              boxShadow: balanced ? "0 0 6px rgba(50,190,85,0.7)" : "0 0 6px rgba(210,52,32,0.7)",
            }} />
          </div>
          <div>
            <div style={{
              fontSize: 11,
              letterSpacing: "0.09em",
              color: balanced ? "rgba(50,190,85,0.85)" : "rgba(210,52,32,0.85)",
            }}>
              LOAD BALANCER {balanced ? "ENABLED" : "DISABLED"}
            </div>
            <div style={{
              fontSize: 9,
              color: "rgba(80,110,140,0.50)",
              letterSpacing: "0.06em",
              marginTop: 3,
            }}>
              {balanced ? "Distributing evenly across all chiplets" : "Overload on CTR-0 / CMP-1 / CMP-2"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
