import { useState } from "react";

const GOLD = "#f0c040", DARK = "#0d0d0d", RED = "#c1121f", BLUE = "#1d6a96";
const PANEL = "#151515", BORDER = "#2a2a2a";
const MEDALS = ["🥇", "🥈", "🥉"];

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

// Tiebreaker: show tied players, admin taps in order closest→furthest
function Tiebreaker({ tied, placing, onDone }) {
  // tied: [{id, name}], placing: 1-based index of first place being contested
  const [order, setOrder] = useState([]); // ids in order tapped (closest first)
  const remaining = tied.filter(p => !order.includes(p.id));
  const spotsLeft = Math.min(3 - placing + 1, tied.length); // how many places left to fill

  const tap = (id) => {
    if (order.includes(id)) return;
    const newOrder = [...order, id];
    setOrder(newOrder);
    if (newOrder.length >= spotsLeft || newOrder.length >= tied.length) {
      onDone(newOrder);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.96)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
      <div style={{ color: GOLD, fontFamily: "Georgia, serif", fontSize: 20, fontWeight: "bold", marginBottom: 6, textAlign: "center" }}>
        Sudden Death Tiebreaker!
      </div>
      <div style={{ color: "#888", fontFamily: "monospace", fontSize: 12, marginBottom: 6, textAlign: "center" }}>
        {tied.length} players tied for {MEDALS[placing - 1]} place
      </div>
      <div style={{ color: "#aaa", fontFamily: "monospace", fontSize: 12, marginBottom: 20, textAlign: "center", lineHeight: 1.6 }}>
        Each player throws once at bullseye.<br />
        Tap them below in order — <span style={{ color: GOLD }}>closest first</span>.
      </div>
      <div style={{ width: "100%", maxWidth: 360, marginBottom: 16 }}>
        {tied.map((p, i) => {
          const rank = order.indexOf(p.id);
          const selected = rank >= 0;
          const place = placing + rank;
          return (
            <div key={p.id} onClick={() => tap(p.id)} style={{
              background: selected ? (place === 1 ? "#1a2a00" : place === 2 ? "#1a1a2a" : place === 3 ? "#2a1a00" : "#1a1a1a") : "#1a1a1a",
              border: `2px solid ${selected ? (place === 1 ? GOLD : place === 2 ? "#aaa" : "#cd7f32") : "#333"}`,
              borderRadius: 10, padding: "12px 16px", marginBottom: 8, cursor: "pointer",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontFamily: "monospace", color: selected ? "#fff" : "#aaa", fontSize: 15 }}>{p.name}</span>
              {selected
                ? <span style={{ fontSize: 20 }}>{MEDALS[place - 1] || `#${place}`}</span>
                : remaining.indexOf(p) === 0
                  ? <span style={{ color: GOLD, fontFamily: "monospace", fontSize: 11 }}>tap if closest ▶</span>
                  : <span style={{ color: "#444", fontFamily: "monospace", fontSize: 11 }}>waiting</span>
              }
            </div>
          );
        })}
      </div>
      {order.length > 0 && order.length < spotsLeft && (
        <div style={{ color: "#888", fontFamily: "monospace", fontSize: 12, textAlign: "center" }}>
          Tap {spotsLeft - order.length} more in order closest → furthest
        </div>
      )}
    </div>
  );
}

export default function Game21({ onBack }) {
  const [step, setStep] = useState("mode");
  const [mode, setMode] = useState(null);
  const [throwsPerTurn, setThrowsPerTurn] = useState(3);
  const [names, setNames] = useState(["", ""]);
  const [game, setGame] = useState(null);
  const [podium, setPodium] = useState(null); // [{id, name, place, throwCount}]
  const [tiebreaker, setTiebreaker] = useState(null); // {tied, placing}

  const card = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, marginBottom: 10 };
  const btn = (bg, col) => ({ background: bg, color: col || "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontFamily: "monospace", fontWeight: "bold", cursor: "pointer" });
  const validNames = names.filter(n => n.trim().length > 0);

  const startGame = () => {
    const ps = names.filter(n => n.trim()).map((n, i) => ({ id: String(i), name: n.trim() }));
    setGame({
      players: ps,
      scores: Object.fromEntries(ps.map(p => [p.id, 0])),
      throwCounts: Object.fromEntries(ps.map(p => [p.id, 0])),
      currentIdx: 0,
      throwsLeft: throwsPerTurn,
      turnThrows: [],
      roundFinishers: [], // players who finished this round [{id, throwCount}]
      active: ps.map(p => p.id), // still playing
    });
    setPodium(null);
    setTiebreaker(null);
    setStep("game");
  };

  const handleThrow = (zone) => {
    if (!game || podium || tiebreaker) return;

    // Find current active player
    const activeIds = game.active;
    if (activeIds.length === 0) return;
    const p = game.players[game.currentIdx];
    if (!activeIds.includes(p.id)) {
      // Skip to next active player
      const nextIdx = findNextActive(game.currentIdx, game.players, activeIds);
      setGame(prev => ({ ...prev, currentIdx: nextIdx }));
      return;
    }

    const cur = game.scores[p.id];
    let next = cur + zone.points;
    if (mode === "hard" && next > 21) next = 11;
    else if (mode === "medium" && next > 21) next = cur;

    const newThrowCount = game.throwCounts[p.id] + 1;
    const newThrows = [...game.turnThrows, { ...zone, points: next - cur }];
    const newScores = { ...game.scores, [p.id]: next };
    const newThrowCounts = { ...game.throwCounts, [p.id]: newThrowCount };
    const won = mode === "hard" ? next === 21 : next >= 21;

    if (won) {
      const newFinishers = [...game.roundFinishers, { id: p.id, throwCount: newThrowCount }];
      const newActive = game.active.filter(id => id !== p.id);
      const nextIdx = findNextActive(game.currentIdx, game.players, newActive);
      const updatedGame = { ...game, scores: newScores, throwCounts: newThrowCounts, roundFinishers: newFinishers, active: newActive, currentIdx: nextIdx, turnThrows: [], throwsLeft: throwsPerTurn };

      // Check if this turn is the last active player — resolve round
      if (newActive.length === 0 || isEndOfRound(game.currentIdx, game.players, newActive)) {
        resolveRound(updatedGame, newFinishers, newActive);
      } else {
        setGame(updatedGame);
      }
      return;
    }

    if (newThrows.length >= throwsPerTurn) {
      const nextIdx = findNextActive(game.currentIdx, game.players, activeIds);
      const updatedGame = { ...game, scores: newScores, throwCounts: newThrowCounts, currentIdx: nextIdx, throwsLeft: throwsPerTurn, turnThrows: [] };

      // Check end of round — everyone active has thrown
      if (isEndOfRound(game.currentIdx, game.players, activeIds)) {
        resolveRound(updatedGame, game.roundFinishers, activeIds);
      } else {
        setGame(updatedGame);
      }
    } else {
      setGame(prev => ({ ...prev, scores: newScores, throwCounts: newThrowCounts, throwsLeft: prev.throwsLeft - 1, turnThrows: newThrows }));
    }
  };

  const findNextActive = (currentIdx, players, activeIds) => {
    if (activeIds.length === 0) return currentIdx;
    let next = (currentIdx + 1) % players.length;
    let attempts = 0;
    while (!activeIds.includes(players[next].id) && attempts < players.length) {
      next = (next + 1) % players.length;
      attempts++;
    }
    return next;
  };

  const isEndOfRound = (currentIdx, players, activeIds) => {
    // True if after currentIdx, all remaining are not active (i.e. we've gone around)
    if (activeIds.length === 0) return true;
    let next = (currentIdx + 1) % players.length;
    let attempts = 0;
    while (attempts < players.length) {
      if (activeIds.includes(players[next].id)) return false;
      next = (next + 1) % players.length;
      attempts++;
    }
    return true;
  };

  const resolveRound = (updatedGame, finishers, remainingActive) => {
    const currentPodium = podium || [];
    const placingStart = currentPodium.length + 1;

    if (finishers.length === 0) {
      // Nobody finished this round — reset roundFinishers, continue
      setGame({ ...updatedGame, roundFinishers: [] });
      return;
    }

    if (finishers.length === 1) {
      // Clear winner for this place
      const winner = updatedGame.players.find(p => p.id === finishers[0].id);
      const newPodium = [...currentPodium, { ...winner, place: placingStart, throwCount: finishers[0].throwCount }];
      checkGameOver(newPodium, remainingActive, updatedGame);
    } else {
      // Multiple finishers — need tiebreaker
      const tiedPlayers = finishers.map(f => updatedGame.players.find(p => p.id === f.id));
      setGame({ ...updatedGame, roundFinishers: [] });
      setTiebreaker({ tied: tiedPlayers, placing: placingStart, game: updatedGame, remaining: remainingActive });
    }
  };

  const handleTiebreakerDone = (orderedIds) => {
    const { game: g, remaining, placing } = tiebreaker;
    const currentPodium = podium || [];
    const newPodium = [...currentPodium];
    orderedIds.slice(0, 3 - currentPodium.length).forEach((id, i) => {
      const player = g.players.find(p => p.id === id);
      newPodium.push({ ...player, place: placing + i, throwCount: g.throwCounts[id] });
    });
    setTiebreaker(null);
    // Remove all tied players from active (they all finished this round)
    const allTiedIds = tiebreaker.tied.map(p => p.id);
    const newActive = remaining.filter(id => !allTiedIds.includes(id));
    checkGameOver(newPodium, newActive, g);
  };

  const checkGameOver = (newPodium, remainingActive, g) => {
    if (newPodium.length >= 3 || remainingActive.length === 0) {
      setPodium(newPodium);
      setStep("podium");
    } else {
      setPodium(newPodium);
      const nextIdx = g.players.findIndex(p => remainingActive.includes(p.id));
      setGame({ ...g, active: remainingActive, roundFinishers: [], currentIdx: nextIdx >= 0 ? nextIdx : 0, throwsLeft: throwsPerTurn, turnThrows: [] });
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
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input value={n} onChange={e => setNames(prev => prev.map((v, j) => j === i ? e.target.value : v))}
              placeholder={`Player ${i + 1}`}
              style={{ flex: 1, background: "#222", border: "1px solid #444", borderRadius: 8, padding: "10px 12px", color: "#fff", fontFamily: "monospace", fontSize: 14 }} />
            {names.length > 1 && <button onClick={() => setNames(prev => prev.filter((_, j) => j !== i))} style={{ ...btn(RED), padding: "8px 12px" }}>✕</button>}
          </div>
        ))}
        {names.length < 8 && <button onClick={() => setNames(prev => [...prev, ""])} style={{ ...btn("#1a2a1a"), border: "1px solid #3a5a3a", width: "100%", marginTop: 4, color: "#4f4" }}>+ Add Player</button>}
      </div>
      <button onClick={startGame} disabled={validNames.length < 1}
        style={{ ...btn(GOLD, DARK), width: "100%", padding: "14px", fontSize: 16, opacity: validNames.length < 1 ? 0.5 : 1 }}>
        🎯 Start Game
      </button>
    </div>
  );

  if (step === "podium" && podium) return (
    <div style={{ minHeight: "100vh", background: DARK, color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ fontSize: 64, marginBottom: 12 }}>🏆</div>
      <div style={{ color: GOLD, fontFamily: "Georgia, serif", fontSize: 26, fontWeight: "bold", marginBottom: 24, textAlign: "center" }}>
        Final Results
      </div>
      <div style={{ width: "100%", maxWidth: 400, marginBottom: 24 }}>
        {podium.map((p) => (
          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
            background: p.place === 1 ? "#1a2a00" : p.place === 2 ? "#1a1a2a" : "#2a1a00",
            border: `1px solid ${p.place === 1 ? GOLD : p.place === 2 ? "#aaa" : "#cd7f32"}`,
            borderRadius: 8, padding: "12px 16px", marginBottom: 8 }}>
            <span style={{ fontFamily: "monospace", color: "#fff", fontSize: 15 }}>
              {MEDALS[p.place - 1]} {p.name}
            </span>
            <span style={{ fontFamily: "monospace", color: "#888", fontSize: 12 }}>
              {game?.scores[p.id] ?? ""}pts · {p.throwCount} throws
            </span>
          </div>
        ))}
        {/* Solo player result */}
        {podium.length === 1 && game?.players.length === 1 && (
          <div style={{ color: "#888", fontFamily: "monospace", fontSize: 12, textAlign: "center", marginTop: 8 }}>
            Completed in {podium[0].throwCount} throws!
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onBack} style={{ ...btn("#333"), padding: "12px 24px" }}>🏠 Menu</button>
        <button onClick={startGame} style={{ ...btn(GOLD, DARK), padding: "12px 24px" }}>🔄 Again</button>
      </div>
    </div>
  );

  if (step !== "game" || !game) return null;

  const activeP = game.players[game.currentIdx];
  const throwsDone = throwsPerTurn - game.throwsLeft;
  const podiumIds = (podium || []).map(p => p.id);

  return (
    <div style={{ minHeight: "100vh", background: DARK, color: "#fff", padding: 16, maxWidth: 500, margin: "0 auto" }}>
      {tiebreaker && <Tiebreaker tied={tiebreaker.tied} placing={tiebreaker.placing} onDone={handleTiebreakerDone} />}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <button onClick={() => setStep("players")} style={{ ...btn("#333"), padding: "8px 14px" }}>← Back</button>
        <h3 style={{ color: GOLD, margin: 0, fontFamily: "serif", flex: 1 }}>🎯 21 — {mode}</h3>
      </div>

      {/* Scoreboard */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {game.players.map((p) => {
          const isActive = game.active.includes(p.id);
          const isCurrent = p.id === activeP?.id && isActive;
          const place = podiumIds.indexOf(p.id);
          return (
            <div key={p.id} style={{
              flex: 1, minWidth: 70, background: isCurrent ? "#1a2a00" : !isActive ? "#0a0a0a" : PANEL,
              border: `1px solid ${isCurrent ? GOLD : !isActive ? "#222" : BORDER}`,
              borderRadius: 8, padding: "8px 6px", textAlign: "center", opacity: isActive ? 1 : 0.5,
            }}>
              <div style={{ fontFamily: "monospace", fontSize: 10, marginBottom: 2, color: isCurrent ? GOLD : "#888" }}>
                {!isActive && place >= 0 ? MEDALS[place] : p.name.slice(0, 8)}
              </div>
              <div style={{ color: isCurrent ? GOLD : !isActive ? "#444" : "#ccc", fontFamily: "monospace", fontSize: 20, fontWeight: "bold" }}>
                {game.scores[p.id]}
              </div>
            </div>
          );
        })}
      </div>

      {/* Current turn */}
      {game.active.length > 0 && activeP && (
        <div style={{ background: "#1a1a00", border: `1px solid ${GOLD}44`, borderRadius: 8, padding: "10px 14px", marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: GOLD, fontFamily: "monospace", fontWeight: "bold" }}>{activeP.name}'s turn</span>
          <span style={{ color: "#888", fontFamily: "monospace", fontSize: 13 }}>
            Throw {throwsDone + 1}/{throwsPerTurn} · {game.scores[activeP.id]}pts
          </span>
        </div>
      )}

      {/* Throw pips */}
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
