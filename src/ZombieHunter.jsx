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

  const startGame = () => {
    const ps = names.filter(n => n.trim()).map((n, i) => ({ id: String(i), name: n.trim() }));
    const champId = ps[Math.min(championIdx, ps.length - 1)].id;
    const humans = ps.filter(p => p.id !== champId);
    setGame({
      allPlayers: ps,
      zombies: [champId],
      humans: humans.map(p => p.id),
      humanIdx: 0,
      zombieIdx: 0,
      phase: "zombie", // zombie throws first
      zombieScore: 0,
      humanScore: 0,
      zombieThrows: [],
      humanThrows: [],
      throwsLeft: throwsPerDuel,
      message: `🧟 ${ps[Math.min(championIdx, ps.length-1)].name} is the first zombie! The horde begins!`,
    });
    setGameOver(null);
    setStep("game");
  };

  const getName = (id) => game?.allPlayers.find(p => p.id === id)?.name || "?";

  const handleThrow = (zone) => {
    if (!game || gameOver) return;
    const isZombie = game.phase === "zombie";
    const pts = isZombie ? Math.min(zone.points, 5) : zone.points; // zombies max bullseye

    if (isZombie) {
      const newThrows = [...game.zombieThrows, { ...zone, points: pts }];
      const newScore = game.zombieScore + pts;
      // Check if all zombies have thrown their full turns
      const nextZombieIdx = game.zombieIdx + 1;
      if (newThrows.length >= throwsPerDuel) {
        if (nextZombieIdx < game.zombies.length) {
          // Next zombie throws
          setGame(prev => ({ ...prev, zombieIdx: nextZombieIdx, zombieScore: newScore, zombieThrows: [], throwsLeft: throwsPerDuel }));
        } else {
          // All zombies done, human's turn
          setGame(prev => ({ ...prev, phase: "human", zombieScore: newScore, zombieThrows: newThrows, zombieIdx: 0, throwsLeft: throwsPerDuel, humanThrows: [], message: "" }));
        }
      } else {
        setGame(prev => ({ ...prev, zombieScore: newScore, zombieThrows: newThrows, throwsLeft: prev.throwsLeft - 1 }));
      }
    } else {
      // Human throws
      const newThrows = [...game.humanThrows, { ...zone, points: pts }];
      const newScore = game.humanScore + pts;
      const humanId = game.humans[game.humanIdx];

      // Nipple = headshot!
      if (zone.id === "nipple") {
        const killedZombie = game.zombies[0];
        const remainingZombies = game.zombies.slice(1);
        const killedName = getName(killedZombie);
        const humanName = getName(humanId);
        if (remainingZombies.length === 0) {
          setGameOver({ winner: "humans", msg: `${humanName} lands a HEADSHOT and eliminates the last zombie! Humanity survives!` });
          return;
        }
        const nextHumanIdx = game.humanIdx + 1;
        if (nextHumanIdx >= game.humans.length) {
          setGameOver({ winner: "humans", msg: `All zombies eliminated! Humanity survives!` });
          return;
        }
        setGame(prev => ({ ...prev, zombies: remainingZombies, humanIdx: nextHumanIdx, phase: "zombie",
          zombieScore: 0, humanScore: 0, zombieThrows: [], humanThrows: [], throwsLeft: throwsPerDuel, zombieIdx: 0,
          message: `🎯 HEADSHOT! ${humanName} eliminates ${killedName} from the horde!` }));
        return;
      }

      if (newThrows.length >= throwsPerDuel) {
        // Duel resolved — tie goes to zombies
        const zombieWins = game.zombieScore >= newScore;
        const humanName = getName(humanId);
        if (zombieWins) {
          const newZombies = [...game.zombies, humanId];
          const newHumans = game.humans.filter(id => id !== humanId);
          if (newHumans.length === 0) {
            setGameOver({ winner: "zombies", msg: `${humanName} joins the horde — everyone is a zombie now! 🧟🧟🧟` });
            return;
          }
          const nextIdx = game.humanIdx >= newHumans.length ? 0 : game.humanIdx;
          setGame(prev => ({ ...prev, zombies: newZombies, humans: newHumans, humanIdx: nextIdx,
            phase: "zombie", zombieScore: 0, humanScore: 0, zombieThrows: [], humanThrows: [],
            throwsLeft: throwsPerDuel, zombieIdx: 0,
            message: `🧟 ${humanName} joins the zombie horde! ${newZombies.length} zombies vs ${newHumans.length} humans!` }));
        } else {
          const killedZombie = game.zombies[0];
          const killedName = getName(killedZombie);
          const remainingZombies = game.zombies.slice(1);
          if (remainingZombies.length === 0) {
            setGameOver({ winner: "humans", msg: `${humanName} defeats the last zombie! Humanity survives!` });
            return;
          }
          const nextHumanIdx = game.humanIdx + 1;
          if (nextHumanIdx >= game.humans.length) {
            setGameOver({ winner: "humans", msg: `All humans survived! The horde is defeated!` });
            return;
          }
          setGame(prev => ({ ...prev, zombies: remainingZombies, humanIdx: nextHumanIdx,
            phase: "zombie", zombieScore: 0, humanScore: 0, zombieThrows: [], humanThrows: [],
            throwsLeft: throwsPerDuel, zombieIdx: 0,
            message: `💀 ${humanName} defeats ${killedName}! ${remainingZombies.length} zombie${remainingZombies.length !== 1 ? "s" : ""} remain!` }));
        }
      } else {
        setGame(prev => ({ ...prev, humanScore: newScore, humanThrows: newThrows, throwsLeft: prev.throwsLeft - 1 }));
      }
    }
  };

  if (step === "setup") return (
    <div style={{ minHeight: "100vh", background: DARK, color: "#fff", padding: 20, maxWidth: 500, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
        <button onClick={onBack} style={{ ...btn("#333"), padding: "8px 16px" }}>← Back</button>
        <h2 style={{ color: ZG, margin: 0, fontFamily: "serif" }}>🧟 Zombie Hunter</h2>
      </div>
      <div style={{ textAlign: "center", fontSize: 64, marginBottom: 8 }}>🧟</div>
      <div style={{ color: "#888", fontFamily: "monospace", fontSize: 12, textAlign: "center", marginBottom: 20, lineHeight: 1.7 }}>
        The Champion is the first zombie.<br/>
        <span style={{ color: "#e63946" }}>🎯 Nipple = headshot — kills a zombie instantly!</span><br/>
        Zombies can't throw nipples (max bullseye).<br/>
        Ties go to the zombies.
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
        <div style={{ color: "#aaa", fontFamily: "monospace", fontSize: 13, marginBottom: 32, maxWidth: 360 }}>{gameOver.msg}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onBack} style={{ ...btn("#333"), padding: "12px 24px" }}>🏠 Menu</button>
          <button onClick={startGame} style={{ ...btn("#e63946"), padding: "12px 24px" }}>🔄 Again</button>
        </div>
      </div>
    );
  }

  if (step !== "game" || !game) return null;

  const isZombie = game.phase === "zombie";
  const humanId = game.humans[game.humanIdx];
  const zombieId = game.zombies[game.currentZombieIdx ?? game.zombieIdx ?? 0];
  const throws = isZombie ? game.zombieThrows : game.humanThrows;

  return (
    <div style={{ minHeight: "100vh", background: isZombie ? "#0d0505" : DARK, color: "#fff", padding: 16, maxWidth: 500, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <button onClick={() => { setStep("setup"); setGame(null); }} style={{ ...btn("#333"), padding: "8px 14px" }}>← Back</button>
        <h3 style={{ color: ZG, margin: 0, fontFamily: "serif", flex: 1 }}>🧟 Zombie Hunter</h3>
      </div>

      {game.message && (
        <div style={{ background: "#1a0505", border: "1px solid #e63946", borderRadius: 8, padding: "10px 14px", marginBottom: 12, color: "#e63946", fontFamily: "monospace", fontSize: 12, textAlign: "center" }}>
          {game.message}
        </div>
      )}

      {/* Horde vs Humans */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1, background: "#1a0505", border: "1px solid #e63946", borderRadius: 8, padding: 10, textAlign: "center" }}>
          <div style={{ color: "#e63946", fontFamily: "monospace", fontSize: 11, fontWeight: "bold", marginBottom: 6 }}>🧟 HORDE ({game.zombies.length})</div>
          {game.zombies.map(id => <div key={id} style={{ color: id === zombieId && isZombie ? "#ff8888" : "#cc4444", fontFamily: "monospace", fontSize: 12, fontWeight: id === zombieId && isZombie ? "bold" : "normal" }}>{id === zombieId && isZombie ? "▶ " : ""}{getName(id)}</div>)}
        </div>
        <div style={{ flex: 1, background: ZD, border: `1px solid ${ZG}`, borderRadius: 8, padding: 10, textAlign: "center" }}>
          <div style={{ color: ZG, fontFamily: "monospace", fontSize: 11, fontWeight: "bold", marginBottom: 6 }}>👤 HUMANS ({game.humans.length})</div>
          {game.humans.map((id, i) => <div key={id} style={{ color: i === game.humanIdx ? ZG : "#888", fontFamily: "monospace", fontSize: 12, fontWeight: i === game.humanIdx ? "bold" : "normal" }}>{i === game.humanIdx ? "▶ " : ""}{getName(id)}</div>)}
        </div>
      </div>

      {/* Duel scoreboard */}
      <div style={{ background: isZombie ? "#1a0505" : "#051a05", border: `2px solid ${isZombie ? "#e63946" : ZG}`, borderRadius: 10, padding: 12, marginBottom: 12, textAlign: "center" }}>
        <div style={{ fontFamily: "monospace", fontSize: 13, marginBottom: 8 }}>
          <span style={{ color: "#e63946" }}>{getName(zombieId)} 🧟</span>
          <span style={{ color: "#555", margin: "0 10px" }}>vs</span>
          <span style={{ color: ZG }}>{getName(humanId)} 👤</span>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 32, marginBottom: 6 }}>
          <div><div style={{ color: "#e63946", fontFamily: "monospace", fontSize: 11 }}>🧟 HORDE</div>
            <div style={{ color: "#e63946", fontFamily: "monospace", fontSize: 30, fontWeight: "bold" }}>{game.zombieScore}</div></div>
          <div><div style={{ color: ZG, fontFamily: "monospace", fontSize: 11 }}>👤 HUMAN</div>
            <div style={{ color: ZG, fontFamily: "monospace", fontSize: 30, fontWeight: "bold" }}>{game.humanScore}</div></div>
        </div>
        <div style={{ color: "#888", fontFamily: "monospace", fontSize: 11 }}>
          {isZombie ? `🧟 ${getName(zombieId)}'s throw — ${game.throwsLeft} left` : `👤 ${getName(humanId)}'s throw — ${game.throwsLeft} left`}
        </div>
        <div style={{ color: isZombie ? "#664422" : "#226644", fontFamily: "monospace", fontSize: 10, marginTop: 4 }}>
          {isZombie ? "⚠️ No nipples for zombies!" : "🎯 Hit a nipple for an instant headshot!"}
        </div>
      </div>

      {/* Throw pips */}
      <div style={{ display: "flex", gap: 5, justifyContent: "center", marginBottom: 10 }}>
        {Array.from({ length: throwsPerDuel }).map((_, i) => {
          const t = throws[i];
          return (
            <div key={i} style={{ width: 36, height: 36, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
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

      <AxeTarget onScore={handleThrow} noNipple={isZombie} />
    </div>
  );
}
