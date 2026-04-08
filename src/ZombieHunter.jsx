import { useState } from "react";

const GOLD = "#f0c040", DARK = "#0d0d0d", RED = "#c1121f", BLUE = "#1d6a96";
const PANEL = "#151515", BORDER = "#2a2a2a";
const ZG = "#39ff14", ZD = "#0a1a0a";

function AxeTarget({ onScore, noNipple }) {
  const s = (ok) => ({ cursor: ok ? "pointer" : "not-allowed", opacity: ok ? 1 : 0.3 });
  return (
    <svg viewBox="0 0 300 320" style={{ width: "100%", maxWidth: 320, display: "block", margin: "0 auto" }}>
      <circle cx="150" cy="170" r="130" fill={BLUE} style={s(true)} onClick={() => onScore({ id: "outer", points: 1 })} />
      <circle cx="150" cy="170" r="90" fill={RED} style={s(true)} onClick={() => onScore({ id: "inner", points: 3 })} />
      <circle cx="150" cy="170" r="55" fill="#111" stroke={GOLD} strokeWidth="3" style={s(true)} onClick={() => onScore({ id: "bullseye", points: 5 })} />
      <text x="150" y="175" textAnchor="middle" fill={GOLD} fontSize="13" fontFamily="monospace" fontWeight="bold">5</text>
      {[[-90], [90]].map(([dx], i) => (
        <g key={i} transform={`translate(${150 + dx}, 50)`} style={s(!noNipple)} onClick={() => !noNipple && onScore({ id: "nipple", points: 7 })}>
          <circle cx="0" cy="0" r="22" fill={noNipple ? "#333" : "#e63946"} />
          <text x="0" y="5" textAnchor="middle" fill={noNipple ? "#555" : "#fff"} fontSize="11" fontFamily="monospace" fontWeight="bold">{noNipple ? "🚫" : "7"}</text>
        </g>
      ))}
      <text x="150" y="290" textAnchor="middle" fill={BLUE} fontSize="11" fontFamily="monospace">1pt</text>
      <text x="150" y="245" textAnchor="middle" fill={RED} fontSize="11" fontFamily="monospace">3pt</text>
      <rect x="0" y="300" width="300" height="20" fill="#222" rx="4" style={s(true)} onClick={() => onScore({ id: "miss", points: 0 })} />
      <text x="150" y="313" textAnchor="middle" fill="#555" fontSize="10" fontFamily="monospace">MISS</text>
    </svg>
  );
}

// Game state:
// zombieQueue: [id, ...] — front is current dueling zombie
// humanQueue:  [id, ...] — front is current dueling human
// phase: "zombie_throw" | "human_throw" | "done"
// zombieThrows: throws so far this duel for the zombie
// humanThrows:  throws so far this duel for the human
// eliminated:   [id, ...] — permanently dead zombies (headshot)
// message:      string

export default function ZombieHunter({ onBack }) {
  const [step, setStep] = useState("setup");
  const [throwsPerDuel, setThrowsPerDuel] = useState(3);
  const [names, setNames] = useState(["", "", ""]);
  const [championIdx, setChampionIdx] = useState(0);
  const [game, setGame] = useState(null);
  const [gameOver, setGameOver] = useState(null);

  const btn = (bg, col) => ({ background: bg, color: col || "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontFamily: "monospace", fontWeight: "bold", cursor: "pointer" });
  const card = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, marginBottom: 10 };
  const validNames = names.filter(n => n.trim());

  const getName = (id, g) => (g || game)?.allPlayers.find(p => p.id === id)?.name || "?";

  const zombieScore = (g) => g.zombieThrows.reduce((s, t) => s + t.points, 0);
  const humanScore  = (g) => g.humanThrows.reduce((s, t) => s + t.points, 0);

  const startGame = () => {
    const ps = names.filter(n => n.trim()).map((n, i) => ({ id: String(i), name: n.trim() }));
    const champId = ps[Math.min(championIdx, ps.length - 1)].id;
    const humans = ps.filter(p => p.id !== champId).map(p => p.id);
    const g = {
      allPlayers: ps,
      zombieQueue: [champId],   // front = current dueling zombie
      humanQueue: humans,        // front = current dueling human
      eliminated: [],            // dead zombies (headshot)
      phase: "zombie_throw",
      zombieThrows: [],
      humanThrows: [],
      throwsLeft: throwsPerDuel,
      message: `🧟 ${ps[Math.min(championIdx, ps.length-1)].name} is the first zombie! The horde begins!`,
    };
    setGame(g);
    setGameOver(null);
    setStep("game");
  };

  const handleThrow = (zone) => {
    if (!game || gameOver) return;
    setGame(prev => {
      const g = { ...prev };
      const isZombieTurn = g.phase === "zombie_throw";

      if (isZombieTurn) {
        // Zombies cap at bullseye (5pts)
        const pts = Math.min(zone.points, 5);
        const newThrows = [...g.zombieThrows, { ...zone, points: pts }];
        if (newThrows.length >= throwsPerDuel) {
          // Zombie done — human's turn
          return { ...g, zombieThrows: newThrows, phase: "human_throw", humanThrows: [], throwsLeft: throwsPerDuel, message: "" };
        }
        return { ...g, zombieThrows: newThrows, throwsLeft: g.throwsLeft - 1 };
      } else {
        // Human's turn
        const newThrows = [...g.humanThrows, zone];
        const zScore = zombieScore(g);

        // Nipple = instant headshot on current zombie
        if (zone.id === "nipple") {
          const deadZombie = g.zombieQueue[0];
          const remainingZombies = g.zombieQueue.slice(1);
          const humanName = getName(g.humanQueue[0], g);
          const zombieName = getName(deadZombie, g);

          if (remainingZombies.length === 0) {
            // All zombies dead — humans win!
            setGameOver({ winner: "humans", msg: `HEADSHOT! ${humanName} eliminates ${zombieName} — the last zombie! Humanity survives!` });
            return { ...g, zombieQueue: [], phase: "done" };
          }
          // Zombie eliminated — same human faces next zombie
          return {
            ...g,
            zombieQueue: remainingZombies,
            eliminated: [...g.eliminated, deadZombie],
            phase: "zombie_throw",
            zombieThrows: [],
            humanThrows: [],
            throwsLeft: throwsPerDuel,
            message: `🎯 HEADSHOT! ${humanName} eliminates ${zombieName}! Next zombie steps up!`,
          };
        }

        if (newThrows.length >= throwsPerDuel) {
          // Duel resolved
          const hScore = newThrows.reduce((s, t) => s + t.points, 0);
          const zombieWins = zScore >= hScore; // tie = zombie wins
          const humanId = g.humanQueue[0];
          const zombieId = g.zombieQueue[0];
          const humanName = getName(humanId, g);
          const zombieName = getName(zombieId, g);

          if (zombieWins) {
            // Human joins zombie horde (back of zombie queue)
            const newHumanQueue = g.humanQueue.slice(1);
            const newZombieQueue = [...g.zombieQueue, humanId]; // new zombie goes to back

            if (newHumanQueue.length === 0) {
              setGameOver({ winner: "zombies", msg: `${humanName} joins the horde — everyone is a zombie now! 🧟🧟🧟` });
              return { ...g, zombieQueue: newZombieQueue, humanQueue: [], phase: "done" };
            }
            // Next human faces front zombie
            return {
              ...g,
              zombieQueue: newZombieQueue,
              humanQueue: newHumanQueue,
              phase: "zombie_throw",
              zombieThrows: [],
              humanThrows: [],
              throwsLeft: throwsPerDuel,
              message: `🧟 ${humanName} joins the horde! ${zombieName} faces the next human!`,
            };
          } else {
            // Human wins — current zombie eliminated, same human faces next zombie
            const remainingZombies = g.zombieQueue.slice(1);

            if (remainingZombies.length === 0) {
              setGameOver({ winner: "humans", msg: `${humanName} defeats ${zombieName} — the last zombie! Humanity survives!` });
              return { ...g, zombieQueue: [], eliminated: [...g.eliminated, zombieId], phase: "done" };
            }
            // Same human stays, next zombie steps up
            return {
              ...g,
              zombieQueue: remainingZombies,
              eliminated: [...g.eliminated, zombieId],
              phase: "zombie_throw",
              zombieThrows: [],
              humanThrows: [],
              throwsLeft: throwsPerDuel,
              message: `💀 ${humanName} defeats ${zombieName}! Next zombie steps up!`,
            };
          }
        }

        return { ...g, humanThrows: newThrows, throwsLeft: g.throwsLeft - 1 };
      }
    });
  };

  if (step === "setup") return (
    <div style={{ minHeight: "100vh", background: DARK, color: "#fff", padding: 20, maxWidth: 500, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
        <button onClick={onBack} style={{ ...btn("#333"), padding: "8px 16px" }}>← Back</button>
        <h2 style={{ color: ZG, margin: 0, fontFamily: "serif" }}>🧟 Zombie Hunter</h2>
      </div>
      <div style={{ textAlign: "center", fontSize: 64, marginBottom: 8 }}>🧟</div>
      <div style={{ color: "#888", fontFamily: "monospace", fontSize: 12, textAlign: "center", marginBottom: 20, lineHeight: 1.8 }}>
        Champion = first zombie. Zombie throws first, then human.<br/>
        <span style={{ color: "#e63946" }}>🎯 Nipple = headshot — instant zombie kill!</span><br/>
        Zombies can't throw nipples (max bullseye). Ties → zombie wins.<br/>
        Converted humans join back of zombie queue.
      </div>

      <div style={card}>
        <div style={{ color: ZG, fontFamily: "monospace", fontSize: 12, fontWeight: "bold", marginBottom: 10 }}>THROWS PER DUEL</div>
        <div style={{ display: "flex", gap: 8 }}>
          {[1,2,3,4,5].map(n => (
            <button key={n} onClick={() => setThrowsPerDuel(n)} style={{
              flex: 1, ...btn(throwsPerDuel === n ? ZG : "#222", throwsPerDuel === n ? DARK : "#888"),
              border: `1px solid ${throwsPerDuel === n ? ZG : "#444"}`, padding: "10px 0", fontSize: 16,
            }}>{n}</button>
          ))}
        </div>
      </div>

      <div style={card}>
        <div style={{ color: ZG, fontFamily: "monospace", fontSize: 12, fontWeight: "bold", marginBottom: 10 }}>PLAYER NAMES</div>
        {names.map((n, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input value={n} onChange={e => setNames(prev => prev.map((v, j) => j === i ? e.target.value : v))}
              placeholder={`Player ${i + 1}`}
              style={{ flex: 1, background: "#222", border: "1px solid #444", borderRadius: 8, padding: "10px 12px", color: "#fff", fontFamily: "monospace", fontSize: 14 }} />
            {names.length > 2 && <button onClick={() => setNames(prev => prev.filter((_, j) => j !== i))} style={{ ...btn(RED), padding: "8px 12px" }}>✕</button>}
          </div>
        ))}
        {names.length < 12 && <button onClick={() => setNames(prev => [...prev, ""])} style={{ ...btn(ZD), border: `1px solid ${ZG}`, width: "100%", color: ZG }}>+ Add Player</button>}
      </div>

      {validNames.length >= 2 && (
        <div style={card}>
          <div style={{ color: "#e63946", fontFamily: "monospace", fontSize: 12, fontWeight: "bold", marginBottom: 10 }}>🧟 WHO IS THE CHAMPION ZOMBIE?</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {names.map((n, i) => n.trim() ? (
              <button key={i} onClick={() => setChampionIdx(i)} style={{
                ...btn(championIdx === i ? "#3a0a0a" : "#1a1a1a", championIdx === i ? "#e63946" : "#aaa"),
                border: `2px solid ${championIdx === i ? "#e63946" : "#333"}`,
              }}>
                {championIdx === i ? "🧟 " : ""}{n.trim()}
              </button>
            ) : null)}
          </div>
        </div>
      )}

      <button onClick={startGame} disabled={validNames.length < 2}
        style={{ ...btn("#e63946"), width: "100%", padding: "14px", fontSize: 16, opacity: validNames.length < 2 ? 0.5 : 1 }}>
        🧟 RELEASE THE HORDE
      </button>
    </div>
  );

  if (gameOver) {
    const humansWon = gameOver.winner === "humans";
    return (
      <div style={{ minHeight: "100vh", background: humansWon ? "#040f04" : "#1a0000", color: "#fff",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, textAlign: "center" }}>
        <div style={{ fontSize: 80, marginBottom: 16 }}>{humansWon ? "🏆" : "🧟"}</div>
        <div style={{ color: humansWon ? ZG : "#e63946", fontFamily: "Georgia, serif", fontSize: 26, fontWeight: "bold", marginBottom: 12 }}>
          {humansWon ? "HUMANITY SURVIVES!" : "THE HORDE WINS!"}
        </div>
        <div style={{ color: "#aaa", fontFamily: "monospace", fontSize: 13, marginBottom: 32, maxWidth: 360, lineHeight: 1.6 }}>{gameOver.msg}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onBack} style={{ ...btn("#333"), padding: "12px 24px" }}>🏠 Menu</button>
          <button onClick={startGame} style={{ ...btn("#e63946"), padding: "12px 24px" }}>🔄 Again</button>
        </div>
      </div>
    );
  }

  if (step !== "game" || !game) return null;

  const isZombieTurn = game.phase === "zombie_throw";
  const currentZombieId = game.zombieQueue[0];
  const currentHumanId = game.humanQueue[0];
  const throws = isZombieTurn ? game.zombieThrows : game.humanThrows;
  const zScore = zombieScore(game);
  const hScore = humanScore(game);

  return (
    <div style={{ minHeight: "100vh", background: isZombieTurn ? "#0d0505" : DARK, color: "#fff", padding: 16, maxWidth: 500, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <button onClick={() => { setStep("setup"); setGame(null); }} style={{ ...btn("#333"), padding: "8px 14px" }}>← Back</button>
        <h3 style={{ color: ZG, margin: 0, fontFamily: "serif", flex: 1 }}>🧟 Zombie Hunter</h3>
      </div>

      {game.message && (
        <div style={{ background: "#1a0505", border: "1px solid #e63946", borderRadius: 8, padding: "10px 14px", marginBottom: 12,
          color: "#e63946", fontFamily: "monospace", fontSize: 12, textAlign: "center" }}>
          {game.message}
        </div>
      )}

      {/* Queues */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1, background: "#1a0505", border: "1px solid #e63946", borderRadius: 8, padding: 10 }}>
          <div style={{ color: "#e63946", fontFamily: "monospace", fontSize: 11, fontWeight: "bold", marginBottom: 6, textAlign: "center" }}>
            🧟 ZOMBIE QUEUE ({game.zombieQueue.length})
          </div>
          {game.zombieQueue.map((id, i) => (
            <div key={id} style={{ color: i === 0 ? "#ff8888" : "#994444", fontFamily: "monospace", fontSize: 12,
              fontWeight: i === 0 ? "bold" : "normal", padding: "2px 0" }}>
              {i === 0 ? "▶ " : `${i+1}. `}{getName(id)}
            </div>
          ))}
          {game.eliminated.length > 0 && (
            <div style={{ marginTop: 6, borderTop: "1px solid #333", paddingTop: 6 }}>
              {game.eliminated.map(id => (
                <div key={id} style={{ color: "#444", fontFamily: "monospace", fontSize: 11, textDecoration: "line-through" }}>💀 {getName(id)}</div>
              ))}
            </div>
          )}
        </div>
        <div style={{ flex: 1, background: ZD, border: `1px solid ${ZG}`, borderRadius: 8, padding: 10 }}>
          <div style={{ color: ZG, fontFamily: "monospace", fontSize: 11, fontWeight: "bold", marginBottom: 6, textAlign: "center" }}>
            👤 HUMAN QUEUE ({game.humanQueue.length})
          </div>
          {game.humanQueue.map((id, i) => (
            <div key={id} style={{ color: i === 0 ? ZG : "#888", fontFamily: "monospace", fontSize: 12,
              fontWeight: i === 0 ? "bold" : "normal", padding: "2px 0" }}>
              {i === 0 ? "▶ " : `${i+1}. `}{getName(id)}
            </div>
          ))}
        </div>
      </div>

      {/* Current duel */}
      <div style={{ background: isZombieTurn ? "#1a0505" : "#051a05", border: `2px solid ${isZombieTurn ? "#e63946" : ZG}`,
        borderRadius: 10, padding: 12, marginBottom: 12, textAlign: "center" }}>
        <div style={{ fontFamily: "monospace", fontSize: 14, marginBottom: 8 }}>
          <span style={{ color: "#e63946" }}>{getName(currentZombieId)} 🧟</span>
          <span style={{ color: "#555", margin: "0 12px" }}>vs</span>
          <span style={{ color: ZG }}>{getName(currentHumanId)} 👤</span>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 40, marginBottom: 6 }}>
          <div>
            <div style={{ color: "#e63946", fontFamily: "monospace", fontSize: 11 }}>🧟 ZOMBIE</div>
            <div style={{ color: "#e63946", fontFamily: "monospace", fontSize: 32, fontWeight: "bold" }}>{zScore}</div>
          </div>
          <div>
            <div style={{ color: ZG, fontFamily: "monospace", fontSize: 11 }}>👤 HUMAN</div>
            <div style={{ color: ZG, fontFamily: "monospace", fontSize: 32, fontWeight: "bold" }}>{hScore}</div>
          </div>
        </div>
        <div style={{ color: "#888", fontFamily: "monospace", fontSize: 12 }}>
          {isZombieTurn
            ? `🧟 ${getName(currentZombieId)}'s throw — ${game.throwsLeft} left`
            : `👤 ${getName(currentHumanId)}'s throw — ${game.throwsLeft} left`}
        </div>
        <div style={{ color: isZombieTurn ? "#664422" : "#226644", fontFamily: "monospace", fontSize: 10, marginTop: 4 }}>
          {isZombieTurn ? "⚠️ No nipples for zombies! Max = bullseye" : "🎯 Hit nipple = instant HEADSHOT!  Tie = zombie wins"}
        </div>
      </div>

      {/* Throw pips */}
      <div style={{ display: "flex", gap: 5, justifyContent: "center", marginBottom: 10 }}>
        {Array.from({ length: throwsPerDuel }).map((_, i) => {
          const t = throws[i];
          return (
            <div key={i} style={{ width: 38, height: 38, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "monospace", fontWeight: "bold", fontSize: 13,
              background: t ? (t.id === "miss" ? "#333" : t.id === "outer" ? BLUE : t.id === "inner" ? RED : t.id === "bullseye" ? "#222" : "#e63946") : "#1a1a1a",
              border: t ? `1px solid ${t.id === "bullseye" ? GOLD : "#555"}` : "1px dashed #333",
              color: t ? (t.id === "bullseye" ? GOLD : "#fff") : "#444",
            }}>
              {t ? (t.id === "nipple" ? "★" : t.id === "miss" ? "✗" : t.points) : "·"}
            </div>
          );
        })}
      </div>

      <AxeTarget onScore={handleThrow} noNipple={isZombieTurn} />
    </div>
  );
}
