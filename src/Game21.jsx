import { useState } from "react";

const GOLD = "#f0c040", DARK = "#0d0d0d", RED = "#c1121f", BLUE = "#1d6a96";
const PANEL = "#151515", BORDER = "#2a2a2a";

function AxeTarget({ onScore }) {
  const s = { cursor: "pointer" };
  return (
    <svg viewBox="0 0 300 320" style={{ width: "100%", maxWidth: 340, display: "block", margin: "0 auto" }}>
      <circle cx="150" cy="170" r="130" fill={BLUE} style={s} onClick={() => onScore({ id: "outer", points: 1 })} />
      <circle cx="150" cy="170" r="90" fill={RED} style={s} onClick={() => onScore({ id: "inner", points: 3 })} />
      <circle cx="150" cy="170" r="55" fill="#111" stroke={GOLD} strokeWidth="3" style={s} onClick={() => onScore({ id: "bullseye", points: 5 })} />
      <text x="150" y="175" textAnchor="middle" fill={GOLD} fontSize="13" fontFamily="monospace" fontWeight="bold">5</text>
      {[[-90], [90]].map(([dx], i) => (
        <g key={i} transform={`translate(${150 + dx}, 50)`} style={s} onClick={() => onScore({ id: "nipple", points: 7 })}>
          <circle cx="0" cy="0" r="22" fill="#e63946" />
          <text x="0" y="5" textAnchor="middle" fill="#fff" fontSize="11" fontFamily="monospace" fontWeight="bold">7</text>
        </g>
      ))}
      <text x="150" y="290" textAnchor="middle" fill={BLUE} fontSize="11" fontFamily="monospace">1pt</text>
      <text x="150" y="245" textAnchor="middle" fill={RED} fontSize="11" fontFamily="monospace">3pt</text>
      <rect x="0" y="300" width="300" height="20" fill="#222" rx="4" style={s} onClick={() => onScore({ id: "miss", points: 0 })} />
      <text x="150" y="313" textAnchor="middle" fill="#555" fontSize="10" fontFamily="monospace">MISS (tap here)</text>
    </svg>
  );
}

export default function Game21({ onBack }) {
  const [step, setStep] = useState("mode"); // mode | players | game | winner
  const [mode, setMode] = useState(null);
  const [throwsPerTurn, setThrowsPerTurn] = useState(3);
  const [names, setNames] = useState(["", ""]);
  const [game, setGame] = useState(null);
  const [winner, setWinner] = useState(null);

  const card = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, marginBottom: 10 };
  const btn = (bg, col) => ({ background: bg, color: col || "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontFamily: "monospace", fontWeight: "bold", cursor: "pointer" });

  const validNames = names.filter(n => n.trim().length > 0);

  const startGame = () => {
    const ps = names.filter(n => n.trim()).map((n, i) => ({ id: String(i), name: n.trim() }));
    setGame({
      players: ps,
      scores: Object.fromEntries(ps.map(p => [p.id, 0])),
      currentIdx: 0,
      throwsLeft: throwsPerTurn,
      turnThrows: [],
    });
    setWinner(null);
    setStep("game");
  };

  const handleThrow = (zone) => {
    if (!game || winner) return;
    const p = game.players[game.currentIdx];
    const cur = game.scores[p.id];
    let next = cur + zone.points;

    if (mode === "hard" && next > 21) next = 11;
    else if (mode === "medium" && next > 21) next = cur;

    const newThrows = [...game.turnThrows, { ...zone, points: next - cur }];
    const newScores = { ...game.scores, [p.id]: next };
    const won = mode === "hard" ? next === 21 : next >= 21;

    if (won) {
      setWinner(p);
      setGame(prev => ({ ...prev, scores: newScores }));
      setStep("winner");
      return;
    }

    if (newThrows.length >= throwsPerTurn) {
      const nextIdx = (game.currentIdx + 1) % game.players.length;
      setGame(prev => ({ ...prev, scores: newScores, currentIdx: nextIdx, throwsLeft: throwsPerTurn, turnThrows: [] }));
    } else {
      setGame(prev => ({ ...prev, scores: newScores, throwsLeft: prev.throwsLeft - 1, turnThrows: newThrows }));
    }
  };

  if (step === "mode") return (
    <div style={{ minHeight: "100vh", background: DARK, color: "#fff", padding: 20, maxWidth: 500, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
        <button onClick={onBack} style={{ ...btn("#333"), padding: "8px 16px" }}>← Back</button>
        <h2 style={{ color: GOLD, margin: 0, fontFamily: "serif" }}>🎯 21</h2>
      </div>
      <div style={{ textAlign: "center", fontSize: 64, marginBottom: 16 }}>🎯</div>
      {[
        { key: "easy", label: "Easy", desc: "First to 21+ wins. No penalty for going over.", color: "#1a3a1a", border: "#4f4" },
        { key: "medium", label: "Medium", desc: "Must reach exactly 21. Going over wastes the throw.", color: "#1a2a3a", border: GOLD },
        { key: "hard", label: "Hard", desc: "Exactly 21 wins. Go over? Bust back to 11!", color: "#3a1a1a", border: RED },
      ].map(m => (
        <div key={m.key} onClick={() => { setMode(m.key); setStep("players"); }} style={{
          background: m.color, border: `2px solid ${m.border}`, borderRadius: 12,
          padding: "16px 20px", marginBottom: 12, cursor: "pointer",
        }}>
          <div style={{ color: m.border, fontFamily: "monospace", fontWeight: "bold", fontSize: 16, marginBottom: 4 }}>{m.label}</div>
          <div style={{ color: "#aaa", fontFamily: "monospace", fontSize: 12 }}>{m.desc}</div>
        </div>
      ))}
    </div>
  );

  if (step === "players") return (
    <div style={{ minHeight: "100vh", background: DARK, color: "#fff", padding: 20, maxWidth: 500, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
        <button onClick={() => setStep("mode")} style={{ ...btn("#333"), padding: "8px 16px" }}>← Back</button>
        <h2 style={{ color: GOLD, margin: 0, fontFamily: "serif" }}>🎯 21 — {mode}</h2>
      </div>
      <div style={card}>
        <div style={{ color: GOLD, fontFamily: "monospace", fontSize: 12, fontWeight: "bold", marginBottom: 10 }}>THROWS PER TURN</div>
        <div style={{ display: "flex", gap: 8 }}>
          {[1,2,3,4,5].map(n => (
            <button key={n} onClick={() => setThrowsPerTurn(n)} style={{
              flex: 1, ...btn(throwsPerTurn === n ? GOLD : "#222", throwsPerTurn === n ? DARK : "#888"),
              border: `1px solid ${throwsPerTurn === n ? GOLD : "#444"}`, padding: "10px 0", fontSize: 16,
            }}>{n}</button>
          ))}
        </div>
      </div>
      <div style={card}>
        <div style={{ color: GOLD, fontFamily: "monospace", fontSize: 12, fontWeight: "bold", marginBottom: 10 }}>PLAYER NAMES</div>
        {names.map((n, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
            <input value={n} onChange={e => setNames(prev => prev.map((v, j) => j === i ? e.target.value : v))}
              placeholder={`Player ${i + 1}`}
              style={{ flex: 1, background: "#222", border: "1px solid #444", borderRadius: 8, padding: "10px 12px", color: "#fff", fontFamily: "monospace", fontSize: 14 }} />
            {names.length > 2 && (
              <button onClick={() => setNames(prev => prev.filter((_, j) => j !== i))}
                style={{ ...btn(RED), padding: "8px 12px" }}>✕</button>
            )}
          </div>
        ))}
        {names.length < 8 && (
          <button onClick={() => setNames(prev => [...prev, ""])}
            style={{ ...btn("#1a2a1a"), border: "1px solid #3a5a3a", width: "100%", marginTop: 4, color: "#4f4" }}>
            + Add Player
          </button>
        )}
      </div>
      <button onClick={startGame} disabled={validNames.length < 2}
        style={{ ...btn(GOLD, DARK), width: "100%", padding: "14px", fontSize: 16, opacity: validNames.length < 2 ? 0.5 : 1 }}>
        🎯 Start Game
      </button>
    </div>
  );

  if (step === "winner" && winner) return (
    <div style={{ minHeight: "100vh", background: DARK, color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ fontSize: 72, marginBottom: 16 }}>🎯</div>
      <div style={{ color: GOLD, fontFamily: "Georgia, serif", fontSize: 28, fontWeight: "bold", marginBottom: 8, textAlign: "center" }}>
        🏆 {winner.name} wins!
      </div>
      <div style={{ color: "#aaa", fontFamily: "monospace", fontSize: 16, marginBottom: 32 }}>
        Reached {game.scores[winner.id]} pts — {mode} mode
      </div>
      <div style={{ width: "100%", maxWidth: 400, marginBottom: 24 }}>
        {[...game.players].sort((a,b) => game.scores[b.id] - game.scores[a.id]).map((p, i) => (
          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
            background: p.id === winner.id ? "#1a2a00" : PANEL, border: `1px solid ${p.id === winner.id ? GOLD : BORDER}`,
            borderRadius: 8, padding: "10px 14px", marginBottom: 6 }}>
            <span style={{ fontFamily: "monospace", color: p.id === winner.id ? GOLD : "#ccc" }}>
              {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i+1}`} {p.name}
            </span>
            <span style={{ fontFamily: "monospace", color: p.id === winner.id ? GOLD : "#888", fontSize: 20, fontWeight: "bold" }}>
              {game.scores[p.id]}
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onBack} style={{ ...btn("#333"), padding: "12px 24px" }}>🏠 Menu</button>
        <button onClick={() => { startGame(); }} style={{ ...btn(GOLD, DARK), padding: "12px 24px" }}>🔄 Again</button>
      </div>
    </div>
  );

  if (step !== "game" || !game) return null;

  const p = game.players[game.currentIdx];
  const throwsDone = throwsPerTurn - game.throwsLeft;

  return (
    <div style={{ minHeight: "100vh", background: DARK, color: "#fff", padding: 16, maxWidth: 500, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <button onClick={() => setStep("players")} style={{ ...btn("#333"), padding: "8px 14px" }}>← Back</button>
        <h3 style={{ color: GOLD, margin: 0, fontFamily: "serif", flex: 1 }}>🎯 21 — {mode}</h3>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {game.players.map(pl => (
          <div key={pl.id} style={{
            flex: 1, minWidth: 70, background: pl.id === p.id ? "#1a2a00" : PANEL,
            border: `1px solid ${pl.id === p.id ? GOLD : BORDER}`, borderRadius: 8, padding: "8px 6px", textAlign: "center",
          }}>
            <div style={{ color: pl.id === p.id ? GOLD : "#888", fontFamily: "monospace", fontSize: 11, marginBottom: 2 }}>
              {pl.name.slice(0, 8)}
            </div>
            <div style={{ color: pl.id === p.id ? GOLD : "#ccc", fontFamily: "monospace", fontSize: 22, fontWeight: "bold" }}>
              {game.scores[pl.id]}
            </div>
          </div>
        ))}
      </div>
      <div style={{ background: "#1a1a00", border: `1px solid ${GOLD}44`, borderRadius: 8, padding: "10px 14px", marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
        <span style={{ color: GOLD, fontFamily: "monospace", fontWeight: "bold" }}>{p.name}'s turn</span>
        <span style={{ color: "#888", fontFamily: "monospace", fontSize: 13 }}>
          Throw {throwsDone + 1}/{throwsPerTurn} · Score: {game.scores[p.id]}
        </span>
      </div>
      {game.turnThrows.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {game.turnThrows.map((t, i) => (
            <div key={i} style={{ width: 40, height: 40, borderRadius: 6, display: "flex", alignItems: "center",
              justifyContent: "center", fontFamily: "monospace", fontWeight: "bold", fontSize: 14,
              background: t.id === "miss" ? "#333" : t.id === "outer" ? BLUE : t.id === "inner" ? RED : t.id === "bullseye" ? "#222" : "#e63946",
              border: `1px solid ${t.id === "bullseye" ? GOLD : "#555"}`,
              color: t.id === "bullseye" ? GOLD : "#fff" }}>
              {t.id === "miss" ? "✗" : t.points}
            </div>
          ))}
          {Array.from({ length: throwsPerTurn - game.turnThrows.length }).map((_, i) => (
            <div key={i} style={{ width: 40, height: 40, borderRadius: 6, background: "#1a1a1a", border: "1px dashed #333", display: "flex", alignItems: "center", justifyContent: "center", color: "#444", fontSize: 18 }}>·</div>
          ))}
        </div>
      )}
      <AxeTarget onScore={handleThrow} />
      <div style={{ textAlign: "center", marginTop: 10, color: "#555", fontFamily: "monospace", fontSize: 11 }}>
        {mode === "easy" && "First to 21+ wins"}
        {mode === "medium" && "Reach exactly 21 — over = wasted throw"}
        {mode === "hard" && "Hit exactly 21 — go over and bust back to 11!"}
      </div>
    </div>
  );
}
