import { useState } from "react";

const GOLD = "#f0c040", DARK = "#0d0d0d", RED = "#c1121f", BLUE = "#1d6a96";
const PANEL = "#151515", BORDER = "#2a2a2a";

const SEQUENCES = {
  easy: [
    { label: "Outer", id: "outer", points: 1, color: BLUE, side: "any" },
    { label: "Inner", id: "inner", points: 3, color: RED, side: "any" },
    { label: "Bullseye", id: "bullseye", points: 5, color: GOLD, side: "any" },
    { label: "Inner", id: "inner", points: 3, color: RED, side: "any" },
    { label: "Outer", id: "outer", points: 1, color: BLUE, side: "any" },
  ],
  medium: [
    { label: "Left Outer", id: "outer", points: 1, color: BLUE, side: "left" },
    { label: "Left Inner", id: "inner", points: 3, color: RED, side: "left" },
    { label: "Bullseye", id: "bullseye", points: 5, color: GOLD, side: "any" },
    { label: "Right Inner", id: "inner", points: 3, color: RED, side: "right" },
    { label: "Right Outer", id: "outer", points: 1, color: BLUE, side: "right" },
  ],
  hard: [
    { label: "Left Outer", id: "outer", points: 1, color: BLUE, side: "left" },
    { label: "Left Inner", id: "inner", points: 3, color: RED, side: "left" },
    { label: "Bullseye", id: "bullseye", points: 5, color: GOLD, side: "any" },
    { label: "Nipple", id: "nipple", points: 7, color: "#e63946", side: "any" },
    { label: "Bullseye", id: "bullseye", points: 5, color: GOLD, side: "any" },
    { label: "Right Inner", id: "inner", points: 3, color: RED, side: "right" },
    { label: "Right Outer", id: "outer", points: 1, color: BLUE, side: "right" },
  ],
};

function AxeTargetATW({ onScore, currentTarget }) {
  const t = currentTarget;
  const glow = (id, side = "any") => t?.id === id && (t?.side === "any" || t?.side === side || side === "any");
  const gs = (id, side) => ({ cursor: "pointer", filter: glow(id, side) ? `drop-shadow(0 0 14px ${t.color})` : "none", opacity: glow(id, side) ? 1 : 0.5 });
  return (
    <svg viewBox="0 0 300 320" style={{ width: "100%", maxWidth: 340, display: "block", margin: "0 auto" }}>
      {/* Outer left */}
      <path d="M 20 170 A 130 130 0 0 1 150 40 L 150 170 Z" fill={BLUE} style={gs("outer","left")} onClick={() => onScore({ id: "outer", side: "left" })} />
      {/* Outer right */}
      <path d="M 150 40 A 130 130 0 0 1 280 170 L 150 170 Z" fill={BLUE} style={gs("outer","right")} onClick={() => onScore({ id: "outer", side: "right" })} />
      {/* Outer bottom */}
      <path d="M 280 170 A 130 130 0 0 1 20 170 Z" fill={BLUE} style={{ cursor:"pointer", opacity: 0.4 }} onClick={() => onScore({ id: "outer", side: "any" })} />
      {/* Inner left */}
      <path d="M 60 170 A 90 90 0 0 1 150 80 L 150 170 Z" fill={RED} style={gs("inner","left")} onClick={() => onScore({ id: "inner", side: "left" })} />
      {/* Inner right */}
      <path d="M 150 80 A 90 90 0 0 1 240 170 L 150 170 Z" fill={RED} style={gs("inner","right")} onClick={() => onScore({ id: "inner", side: "right" })} />
      {/* Inner bottom */}
      <path d="M 240 170 A 90 90 0 0 1 60 170 Z" fill={RED} style={{ cursor:"pointer", opacity: 0.5 }} onClick={() => onScore({ id: "inner", side: "any" })} />
      {/* Bullseye */}
      <circle cx="150" cy="170" r="55" fill="#111" stroke={glow("bullseye") ? GOLD : "#333"} strokeWidth={glow("bullseye") ? 4 : 2}
        style={gs("bullseye","any")} onClick={() => onScore({ id: "bullseye", side: "any" })} />
      <text x="150" y="175" textAnchor="middle" fill={GOLD} fontSize="13" fontFamily="monospace" fontWeight="bold">5</text>
      {/* Nipples */}
      {[{ dx: -90, side: "left" }, { dx: 90, side: "right" }].map(({ dx, side }) => (
        <g key={side} transform={`translate(${150 + dx}, 50)`} style={gs("nipple",side)} onClick={() => onScore({ id: "nipple", side })}>
          <circle cx="0" cy="0" r="22" fill="#e63946" />
          <text x="0" y="5" textAnchor="middle" fill="#fff" fontSize="11" fontFamily="monospace" fontWeight="bold">7</text>
        </g>
      ))}
      <rect x="0" y="300" width="300" height="20" fill="#222" rx="4" style={{ cursor:"pointer" }} onClick={() => onScore({ id: "miss", side: "any" })} />
      <text x="150" y="313" textAnchor="middle" fill="#555" fontSize="10" fontFamily="monospace">MISS</text>
      <text x="45" y="200" textAnchor="middle" fill="#444" fontSize="10" fontFamily="monospace">LEFT</text>
      <text x="255" y="200" textAnchor="middle" fill="#444" fontSize="10" fontFamily="monospace">RIGHT</text>
    </svg>
  );
}

export default function AroundTheWorld({ onBack }) {
  const [step, setStep] = useState("mode");
  const [mode, setMode] = useState(null);
  const [names, setNames] = useState(["", ""]);
  const [game, setGame] = useState(null);
  const [winner, setWinner] = useState(null);

  const card = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, marginBottom: 10 };
  const btn = (bg, col) => ({ background: bg, color: col || "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontFamily: "monospace", fontWeight: "bold", cursor: "pointer" });
  const validNames = names.filter(n => n.trim().length > 0);

  const startGame = () => {
    const ps = names.filter(n => n.trim()).map((n, i) => ({ id: String(i), name: n.trim() }));
    setGame({ players: ps, progress: Object.fromEntries(ps.map(p => [p.id, 0])), currentIdx: 0, sequence: SEQUENCES[mode] });
    setWinner(null);
    setStep("game");
  };

  const handleThrow = (thrown) => {
    if (!game || winner) return;
    const p = game.players[game.currentIdx];
    const prog = game.progress[p.id];
    const target = game.sequence[prog];
    const hit = thrown.id === target.id && thrown.id !== "miss" &&
      (target.side === "any" || thrown.side === target.side || thrown.id === "bullseye" || thrown.id === "nipple");

    let newProg = hit ? prog + 1 : prog;
    if (hit && newProg >= game.sequence.length) {
      setWinner(p);
      setGame(prev => ({ ...prev, progress: { ...prev.progress, [p.id]: newProg } }));
      setStep("winner");
      return;
    }
    const nextIdx = (game.currentIdx + 1) % game.players.length;
    setGame(prev => ({ ...prev, progress: { ...prev.progress, [p.id]: newProg }, currentIdx: nextIdx }));
  };

  if (step === "mode") return (
    <div style={{ minHeight: "100vh", background: DARK, color: "#fff", padding: 20, maxWidth: 500, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
        <button onClick={onBack} style={{ ...btn("#333"), padding: "8px 16px" }}>← Back</button>
        <h2 style={{ color: GOLD, margin: 0, fontFamily: "serif" }}>🌍 Around the World</h2>
      </div>
      <div style={{ textAlign: "center", fontSize: 64, marginBottom: 16 }}>🌍</div>
      {[
        { key: "easy", label: "Easy", desc: "Hit in order: Outer → Inner → Bullseye → Inner → Outer", zones: "1 → 3 → 5 → 3 → 1", color: "#1a3a1a", border: "#4f4" },
        { key: "medium", label: "Medium", desc: "Left side: L.Outer → L.Inner → Bullseye → R.Inner → R.Outer", zones: "Left 1 → Left 3 → 5 → Right 3 → Right 1", color: "#1a2a3a", border: GOLD },
        { key: "hard", label: "Hard", desc: "Medium route but hit a Nipple between the two Bullseyes!", zones: "Left 1 → Left 3 → 5 → Nipple → 5 → Right 3 → Right 1", color: "#3a1a1a", border: RED },
      ].map(m => (
        <div key={m.key} onClick={() => { setMode(m.key); setStep("players"); }} style={{
          background: m.color, border: `2px solid ${m.border}`, borderRadius: 12, padding: "16px 20px", marginBottom: 12, cursor: "pointer" }}>
          <div style={{ color: m.border, fontFamily: "monospace", fontWeight: "bold", fontSize: 16, marginBottom: 4 }}>{m.label}</div>
          <div style={{ color: "#aaa", fontFamily: "monospace", fontSize: 12, marginBottom: 4 }}>{m.desc}</div>
          <div style={{ color: "#555", fontFamily: "monospace", fontSize: 11 }}>{m.zones}</div>
        </div>
      ))}
    </div>
  );

  if (step === "players") return (
    <div style={{ minHeight: "100vh", background: DARK, color: "#fff", padding: 20, maxWidth: 500, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
        <button onClick={() => setStep("mode")} style={{ ...btn("#333"), padding: "8px 16px" }}>← Back</button>
        <h2 style={{ color: GOLD, margin: 0, fontFamily: "serif" }}>🌍 {mode}</h2>
      </div>
      <div style={card}>
        <div style={{ color: GOLD, fontFamily: "monospace", fontSize: 12, fontWeight: "bold", marginBottom: 10 }}>PLAYER NAMES</div>
        {names.map((n, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input value={n} onChange={e => setNames(prev => prev.map((v, j) => j === i ? e.target.value : v))}
              placeholder={`Player ${i + 1}`}
              style={{ flex: 1, background: "#222", border: "1px solid #444", borderRadius: 8, padding: "10px 12px", color: "#fff", fontFamily: "monospace", fontSize: 14 }} />
            {names.length > 2 && <button onClick={() => setNames(prev => prev.filter((_, j) => j !== i))} style={{ ...btn(RED), padding: "8px 12px" }}>✕</button>}
          </div>
        ))}
        {names.length < 8 && <button onClick={() => setNames(prev => [...prev, ""])} style={{ ...btn("#1a2a1a"), border: "1px solid #3a5a3a", width: "100%", color: "#4f4" }}>+ Add Player</button>}
      </div>
      <div style={{ ...card, color: "#888", fontFamily: "monospace", fontSize: 12 }}>
        <div style={{ color: GOLD, fontWeight: "bold", marginBottom: 8 }}>SEQUENCE</div>
        {SEQUENCES[mode].map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
            <span style={{ color: "#555", minWidth: 20 }}>{i + 1}.</span>
            <span style={{ color: s.color, fontWeight: "bold" }}>{s.label}</span>
          </div>
        ))}
      </div>
      <button onClick={startGame} disabled={validNames.length < 2}
        style={{ ...btn(GOLD, DARK), width: "100%", padding: "14px", fontSize: 16, opacity: validNames.length < 2 ? 0.5 : 1 }}>
        🌍 Start Game
      </button>
    </div>
  );

  if (step === "winner" && winner && game) return (
    <div style={{ minHeight: "100vh", background: DARK, color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ fontSize: 72, marginBottom: 16 }}>🌍</div>
      <div style={{ color: GOLD, fontFamily: "Georgia, serif", fontSize: 26, fontWeight: "bold", marginBottom: 8, textAlign: "center" }}>
        🏆 {winner.name} went Around the World!
      </div>
      <div style={{ color: "#888", fontFamily: "monospace", fontSize: 14, marginBottom: 32 }}>Mode: {mode}</div>
      <div style={{ width: "100%", maxWidth: 400, marginBottom: 24 }}>
        {game.players.map((p, i) => (
          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", marginBottom: 6,
            background: p.id === winner.id ? "#1a2a00" : PANEL, border: `1px solid ${p.id === winner.id ? GOLD : BORDER}`, borderRadius: 8 }}>
            <span style={{ fontFamily: "monospace", color: p.id === winner.id ? GOLD : "#ccc" }}>{p.id === winner.id ? "🏆 " : ""}{p.name}</span>
            <span style={{ fontFamily: "monospace", color: "#888", fontSize: 13 }}>{game.progress[p.id]}/{game.sequence.length} zones</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onBack} style={{ ...btn("#333"), padding: "12px 24px" }}>🏠 Menu</button>
        <button onClick={startGame} style={{ ...btn(GOLD, DARK), padding: "12px 24px" }}>🔄 Again</button>
      </div>
    </div>
  );

  if (step !== "game" || !game) return null;

  const p = game.players[game.currentIdx];
  const prog = game.progress[p.id];
  const target = game.sequence[prog];

  return (
    <div style={{ minHeight: "100vh", background: DARK, color: "#fff", padding: 16, maxWidth: 500, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <button onClick={() => setStep("players")} style={{ ...btn("#333"), padding: "8px 14px" }}>← Back</button>
        <h3 style={{ color: GOLD, margin: 0, fontFamily: "serif", flex: 1 }}>🌍 Around the World — {mode}</h3>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
        {game.players.map(pl => {
          const pct = Math.round((game.progress[pl.id] / game.sequence.length) * 100);
          return (
            <div key={pl.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: pl.id === p.id ? GOLD : "#888", fontFamily: "monospace", fontSize: 12, minWidth: 80, flexShrink: 0 }}>
                {pl.id === p.id ? "▶ " : ""}{pl.name.slice(0,8)}
              </span>
              <div style={{ flex: 1, height: 12, background: "#222", borderRadius: 6, overflow: "hidden", border: `1px solid ${pl.id === p.id ? GOLD+"44" : "#333"}` }}>
                <div style={{ width: `${pct}%`, height: "100%", background: pl.id === p.id ? GOLD : "#444", borderRadius: 6, transition: "width 0.3s" }} />
              </div>
              <span style={{ color: "#888", fontFamily: "monospace", fontSize: 11, minWidth: 30 }}>{game.progress[pl.id]}/{game.sequence.length}</span>
            </div>
          );
        })}
      </div>
      <div style={{ background: "#1a1a00", border: `2px solid ${target.color}`, borderRadius: 10, padding: "12px 16px", marginBottom: 14, textAlign: "center" }}>
        <div style={{ color: "#888", fontFamily: "monospace", fontSize: 11, marginBottom: 4 }}>{p.name} — hit zone {prog + 1} of {game.sequence.length}</div>
        <div style={{ color: target.color, fontFamily: "Georgia, serif", fontSize: 22, fontWeight: "bold" }}>{target.label}</div>
        {target.side !== "any" && <div style={{ color: "#888", fontFamily: "monospace", fontSize: 11, marginTop: 4 }}>{target.side === "left" ? "👈 Left side" : "👉 Right side"}</div>}
      </div>
      <AxeTargetATW onScore={handleThrow} currentTarget={target} />
    </div>
  );
}
