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
        <g key={i} transform={`translate(${150+dx}, 50)`} style={s(!noNipple)} onClick={() => !noNipple && onScore({ id: "nipple", points: 7 })}>
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

// RULES:
// - zombieQueue[0] is always the current dueling zombie
// - humanQueue[0] is always the current dueling human
// - Zombie throws ALL turns first, then human throws ALL turns
// - After duel resolves:
//   ZOMBIE WINS: loser human → back of zombieQueue. Winner zombie → back of zombieQueue. Next human/zombie step up.
//   HUMAN WINS:  loser zombie → eliminated. Winner human → back of humanQueue (cycles). Next zombie steps up.
//   HEADSHOT:    current zombie → eliminated instantly. Human → back of humanQueue. Next zombie steps up.
// - ZOMBIES WIN: humanQueue is empty
// - HUMANS WIN:  zombieQueue is empty


// ── HORDE WINS ANIMATION ─────────────────────────────────────────────────────
function HordeWinsScreen({ msg, onBack, onAgain }) {
  // Zombies at 3 depths: far (small+faded), mid, close (large)
  const zombies = [
    // far back row
    { x: 8,   size: 28, delay: 0.0, dur: 3.2, bobY: 4,  opacity: 0.45, row: 0 },
    { x: 18,  size: 26, delay: 0.7, dur: 2.9, bobY: 3,  opacity: 0.40, row: 0 },
    { x: 60,  size: 30, delay: 1.3, dur: 3.5, bobY: 4,  opacity: 0.50, row: 0 },
    { x: 78,  size: 27, delay: 0.4, dur: 3.1, bobY: 3,  opacity: 0.42, row: 0 },
    // mid row
    { x: 3,   size: 40, delay: 0.2, dur: 2.6, bobY: 6,  opacity: 0.70, row: 1 },
    { x: 26,  size: 38, delay: 1.0, dur: 2.4, bobY: 7,  opacity: 0.72, row: 1 },
    { x: 52,  size: 42, delay: 0.5, dur: 2.8, bobY: 6,  opacity: 0.68, row: 1 },
    { x: 74,  size: 36, delay: 1.5, dur: 2.5, bobY: 5,  opacity: 0.75, row: 1 },
    // close row — biggest, most visible
    { x: 0,   size: 58, delay: 0.3, dur: 2.0, bobY: 10, opacity: 1.00, row: 2 },
    { x: 30,  size: 62, delay: 1.1, dur: 1.8, bobY: 12, opacity: 1.00, row: 2 },
    { x: 62,  size: 55, delay: 0.6, dur: 2.2, bobY: 9,  opacity: 1.00, row: 2 },
  ];

  // Fence posts — will shake
  const posts = [4, 17, 30, 43, 56, 69, 82, 95];

  return (
    <div style={{ minHeight: "100vh", background: "#060000", color: "#fff",
      display: "flex", flexDirection: "column", alignItems: "center", padding: 0, overflow: "hidden" }}>

      <style>{`
        @keyframes bloodPulse {
          0%,100% { opacity: 0.6; } 50% { opacity: 1; }
        }
        @keyframes fenceShake {
          0%,100% { transform: rotate(0deg); }
          20% { transform: rotate(-2deg) translateX(-1px); }
          40% { transform: rotate(1.5deg) translateX(1px); }
          60% { transform: rotate(-1deg) translateX(-1px); }
          80% { transform: rotate(2deg) translateX(1px); }
        }
        @keyframes fenceRail {
          0%,100% { transform: translateX(0px); }
          25% { transform: translateX(-2px); }
          75% { transform: translateX(2px); }
        }
        @keyframes zbob0 { 0%,100%{transform:translateY(0px) rotate(-4deg);} 50%{transform:translateY(-4px) rotate(3deg);} }
        @keyframes zbob1 { 0%,100%{transform:translateY(0px) rotate(3deg);} 50%{transform:translateY(-6px) rotate(-4deg);} }
        @keyframes zbob2 { 0%,100%{transform:translateY(0px) rotate(-5deg);} 50%{transform:translateY(-10px) rotate(4deg);} }
        @keyframes fogDrift { 0%{transform:translateX(0);opacity:0.18;} 50%{opacity:0.28;} 100%{transform:translateX(60px);opacity:0.18;} }
        @keyframes flicker { 0%,100%{opacity:0.8;} 30%{opacity:0.5;} 60%{opacity:0.9;} }
      `}</style>

      {/* Scene */}
      <div style={{ width: "100%", maxWidth: 500, position: "relative", height: 320, flexShrink: 0 }}>
        <svg viewBox="0 0 100 80" style={{ width: "100%", height: "100%" }} preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id="hSky" cx="50%" cy="0%">
              <stop offset="0%" stopColor="#2a0000" />
              <stop offset="100%" stopColor="#060000" />
            </radialGradient>
            <radialGradient id="moonGlow" cx="50%" cy="50%">
              <stop offset="0%" stopColor="#ff2200" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#ff2200" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Sky */}
          <rect width="100" height="80" fill="url(#hSky)" />

          {/* Blood moon */}
          <circle cx="80" cy="12" r="10" fill="url(#moonGlow)" />
          <circle cx="80" cy="12" r="7" fill="#cc1100" style={{ animation: "bloodPulse 3s ease-in-out infinite" }} />
          <circle cx="78" cy="10" r="3" fill="#880000" opacity="0.7" />

          {/* Stars */}
          {[[15,6],[35,4],[55,8],[10,15],[45,11],[70,5],[25,9]].map(([sx,sy],i)=>(
            <circle key={i} cx={sx} cy={sy} r="0.4" fill="#fff" opacity="0.6"
              style={{ animation: `flicker ${1.5+i*0.3}s ease-in-out infinite`, animationDelay:`${i*0.4}s` }} />
          ))}

          {/* Ground */}
          <rect x="0" y="58" width="100" height="22" fill="#0d0000" />
          <rect x="0" y="56" width="100" height="4" fill="#1a0500" />

          {/* Fog layers */}
          <rect x="-20" y="50" width="80" height="10" rx="5" fill="#330000" opacity="0.2"
            style={{ animation: "fogDrift 8s linear infinite" }} />
          <rect x="30" y="53" width="90" height="8" rx="4" fill="#220000" opacity="0.25"
            style={{ animation: "fogDrift 11s linear infinite reverse" }} />

          {/* Zombies — far row */}
          {zombies.filter(z=>z.row===0).map((z,i)=>(
            <text key={i} x={z.x * 1.0} y="52" fontSize={z.size * 0.38} opacity={z.opacity}
              style={{ animation: `zbob0 ${z.dur}s ease-in-out infinite`, animationDelay:`${z.delay}s`,
                filter: "drop-shadow(0 0 2px #ff0000)", userSelect:"none" }}>🧟</text>
          ))}

          {/* Zombies — mid row */}
          {zombies.filter(z=>z.row===1).map((z,i)=>(
            <text key={i} x={z.x * 1.0} y="57" fontSize={z.size * 0.38} opacity={z.opacity}
              style={{ animation: `zbob1 ${z.dur}s ease-in-out infinite`, animationDelay:`${z.delay}s`,
                filter: "drop-shadow(0 0 3px #ff2200)", userSelect:"none" }}>🧟</text>
          ))}

          {/* FENCE — shaking, between mid and close zombies */}
          <g style={{ animation: "fenceShake 0.6s ease-in-out infinite", transformOrigin: "50px 62px" }}>
            {/* Rails */}
            <rect x="2" y="60" width="96" height="2.5" rx="1" fill="#4a3020"
              style={{ animation: "fenceRail 0.5s ease-in-out infinite" }} />
            <rect x="2" y="65" width="96" height="2.5" rx="1" fill="#3a2515"
              style={{ animation: "fenceRail 0.5s ease-in-out infinite reverse" }} />
            {/* Posts */}
            {posts.map((px, i) => (
              <rect key={i} x={px} y="56" width="2.5" height="14" rx="0.8" fill="#5a3a1a" />
            ))}
            {/* Barbed wire hint on top */}
            {[8,21,34,47,60,73,86].map((px,i)=>(
              <line key={i} x1={px} y1="59" x2={px+6} y2="57.5" stroke="#888" strokeWidth="0.4" opacity="0.6" />
            ))}
          </g>

          {/* Zombies — close row (in FRONT of fence) */}
          {zombies.filter(z=>z.row===2).map((z,i)=>(
            <text key={i} x={z.x * 1.0 + 5} y="72" fontSize={z.size * 0.38} opacity={z.opacity}
              style={{ animation: `zbob2 ${z.dur}s ease-in-out infinite`, animationDelay:`${z.delay}s`,
                filter: "drop-shadow(0 0 4px #ff0000) drop-shadow(0 2px 6px #000)", userSelect:"none" }}>🧟</text>
          ))}

          {/* Dark foreground vignette */}
          <rect x="0" y="70" width="100" height="10" fill="#060000" opacity="0.7" />
        </svg>
      </div>

      {/* Text */}
      <div style={{ padding: "0 24px 28px", textAlign: "center", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#e63946", fontFamily: "Georgia, serif", fontSize: 28, fontWeight: "bold",
          marginBottom: 10, textShadow: "0 0 24px #e63946, 0 0 40px #990000" }}>
          🧟 THE HORDE WINS! 🧟
        </div>
        <div style={{ color: "#884444", fontFamily: "monospace", fontSize: 13, marginBottom: 28,
          maxWidth: 320, lineHeight: 1.7 }}>{msg}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onBack} style={{ background: "#1a0000", color: "#aaa", border: "1px solid #440000", borderRadius: 8, padding: "12px 24px", fontFamily: "monospace", fontWeight: "bold", cursor: "pointer" }}>🏠 Menu</button>
          <button onClick={onAgain} style={{ background: "#e63946", color: "#fff", border: "none", borderRadius: 8, padding: "12px 24px", fontFamily: "monospace", fontWeight: "bold", cursor: "pointer" }}>🔄 Again</button>
        </div>
      </div>
    </div>
  );
}

// ── HUMANITY WINS ANIMATION ───────────────────────────────────────────────────
function HumanityWinsScreen({ msg, onBack, onAgain }) {
  const people = [
    { x: 6,  y: 68, size: 7,  delay: 0.0, dur: 0.85, jumpH: 5,  emoji: "🙌" },
    { x: 19, y: 68, size: 8,  delay: 0.4, dur: 0.75, jumpH: 7,  emoji: "🎉" },
    { x: 33, y: 67, size: 9,  delay: 0.8, dur: 0.90, jumpH: 8,  emoji: "🙋" },
    { x: 47, y: 68, size: 7,  delay: 0.2, dur: 0.80, jumpH: 6,  emoji: "👐" },
    { x: 60, y: 67, size: 10, delay: 0.6, dur: 0.70, jumpH: 9,  emoji: "🎊" },
    { x: 74, y: 68, size: 8,  delay: 0.3, dur: 0.95, jumpH: 7,  emoji: "🤸" },
    { x: 87, y: 67, size: 7,  delay: 0.9, dur: 0.82, jumpH: 5,  emoji: "🙌" },
  ];

  const confetti = Array.from({ length: 30 }, (_, i) => ({
    x: (i * 11) % 100,
    delay: (i * 0.22) % 3,
    dur: 2.2 + (i % 4) * 0.6,
    color: ["#f0c040","#e63946","#39ff14","#4a90d9","#bb86fc","#fff","#e8a838","#ff69b4"][i % 8],
    size: 1.2 + (i % 3) * 0.6,
    drift: (i % 2 === 0 ? 1 : -1) * (3 + i % 5),
  }));

  const jumpStyles = people.map(p =>
    `@keyframes jump_h_${p.x} { 0%,100%{transform:translateY(0px);} 40%{transform:translateY(-${p.jumpH}px);} }`
  ).join(" ");

  return (
    <div style={{ minHeight: "100vh", background: "#040d1a", color: "#fff",
      display: "flex", flexDirection: "column", alignItems: "center", padding: 0, overflow: "hidden" }}>
      <style>{`
        @keyframes sunRise { 0%{transform:translateY(20px);opacity:0.3;} 100%{transform:translateY(0);opacity:1;} }
        @keyframes starTwinkleW { 0%,100%{opacity:0.9;} 50%{opacity:0.2;} }
        @keyframes windowGlowW { 0%,100%{opacity:0.45;} 50%{opacity:0.95;} }
        @keyframes axeFloat { 0%,100%{transform:translateY(0px) rotate(-5deg);} 50%{transform:translateY(-4px) rotate(5deg);} }
        @keyframes firefly { 0%,100%{opacity:0.9;r:0.7;} 50%{opacity:0.2;r:0.3;} }
        ${jumpStyles}
      `}</style>

      <div style={{ width: "100%", maxWidth: 500, height: 320, flexShrink: 0 }}>
        <svg viewBox="0 0 100 85" style={{ width: "100%", height: "100%" }} preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id="hSkyWin" cx="50%" cy="100%">
              <stop offset="0%" stopColor="#1a4a1a" />
              <stop offset="45%" stopColor="#0a1a2a" />
              <stop offset="100%" stopColor="#040d1a" />
            </radialGradient>
            <radialGradient id="sunGlowW" cx="50%" cy="50%">
              <stop offset="0%" stopColor="#f0c040" stopOpacity="0.55" />
              <stop offset="60%" stopColor="#f0a020" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#f0a020" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Sky */}
          <rect width="100" height="85" fill="url(#hSkyWin)" />

          {/* Rising sun glow from horizon */}
          <circle cx="50" cy="90" r="32" fill="url(#sunGlowW)"
            style={{ animation: "sunRise 2.5s ease-out forwards" }} />

          {/* Fading stars */}
          {[[12,8],[28,5],[45,10],[62,6],[78,9],[90,14],[5,18],[35,16],[70,13]].map(([sx,sy],i)=>(
            <circle key={i} cx={sx} cy={sy} r="0.5" fill="#fff"
              style={{ animation:`starTwinkleW ${1.2+i*0.25}s ease-in-out infinite`, animationDelay:`${i*0.3}s` }} />
          ))}

          {/* Floating golden axe */}
          <text x="50" y="22" textAnchor="middle" fontSize="12" userSelect="none"
            style={{ animation:"axeFloat 2s ease-in-out infinite",
              filter:"drop-shadow(0 0 6px #f0c040) drop-shadow(0 0 14px #f0c040)" }}>🪓</text>

          {/* Confetti */}
          {confetti.map((c, i) => (
            <rect key={i} x={c.x} y="-3" width={c.size} height={c.size * 1.5}
              fill={c.color} opacity="0.9" rx="0.3">
              <animateTransform attributeName="transform" type="translate"
                values={`0,0; ${c.drift},92`}
                dur={`${c.dur}s`} begin={`${c.delay}s`} repeatCount="indefinite" />
            </rect>
          ))}

          {/* Skyline — silhouette buildings */}
          <rect x="0"  y="45" width="14" height="40" fill="#071520" />
          <rect x="2"  y="36" width="5"  height="9"  fill="#071520" />
          <rect x="13" y="48" width="11" height="40" fill="#050f18" />
          <rect x="23" y="42" width="16" height="40" fill="#071520" />
          <rect x="26" y="32" width="4"  height="10" fill="#071520" />
          <rect x="38" y="46" width="13" height="40" fill="#050f18" />
          <rect x="50" y="40" width="18" height="40" fill="#071520" />
          <rect x="54" y="29" width="4"  height="11" fill="#071520" />
          <rect x="67" y="44" width="14" height="40" fill="#050f18" />
          <rect x="80" y="38" width="20" height="40" fill="#071520" />
          <rect x="86" y="28" width="5"  height="10" fill="#071520" />

          {/* Glowing windows */}
          {[
            [3,49],[7,49],[3,56],[7,56],[15,52],[15,59],
            [25,46],[29,46],[25,53],[29,53],[40,50],[44,50],[40,57],
            [52,44],[57,44],[62,44],[52,51],[57,51],
            [68,48],[72,48],[68,55],
            [81,42],[86,42],[91,42],[81,49],[86,49],
          ].map(([wx,wy],i)=>(
            <rect key={i} x={wx} y={wy} width="2.5" height="2" rx="0.4" fill="#f0c040"
              style={{ animation:`windowGlowW ${1+i%3*0.4}s ease-in-out infinite`, animationDelay:`${i*0.15}s` }} />
          ))}

          {/* Ground */}
          <rect x="0" y="72" width="100" height="13" fill="#061018" />
          <rect x="0" y="71" width="100" height="1.5" fill="#0d2030" />

          {/* Celebrating people — proper emojis, jumping */}
          {people.map((p, i) => (
            <text key={i} x={p.x} y={p.y} fontSize={p.size} textAnchor="middle"
              userSelect="none"
              style={{
                animation: `jump_h_${p.x} ${p.dur}s ease-in-out infinite`,
                animationDelay: `${p.delay}s`,
                filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.7))",
              }}>
              {p.emoji}
            </text>
          ))}

          {/* Firefly sparkles near ground */}
          {[[15,70],[32,69],[50,71],[68,70],[85,69]].map(([fx,fy],i)=>(
            <circle key={i} cx={fx} cy={fy} r="0.7" fill="#39ff14"
              style={{ animation:`firefly ${0.7+i*0.3}s ease-in-out infinite`, animationDelay:`${i*0.45}s` }} />
          ))}
        </svg>
      </div>

      <div style={{ padding: "0 24px 28px", textAlign: "center", flex: 1, display: "flex",
        flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#39ff14", fontFamily: "Georgia, serif", fontSize: 26, fontWeight: "bold",
          marginBottom: 10, textShadow: "0 0 20px #39ff14, 0 0 40px #004400" }}>
          🏆 HUMANITY SURVIVES! 🏆
        </div>
        <div style={{ color: "#4a8a4a", fontFamily: "monospace", fontSize: 13, marginBottom: 28,
          maxWidth: 320, lineHeight: 1.7 }}>{msg}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onBack} style={{ background: "#061018", color: "#aaa", border: "1px solid #1a3a1a",
            borderRadius: 8, padding: "12px 24px", fontFamily: "monospace", fontWeight: "bold", cursor: "pointer" }}>🏠 Menu</button>
          <button onClick={onAgain} style={{ background: "#39ff14", color: "#000", border: "none",
            borderRadius: 8, padding: "12px 24px", fontFamily: "monospace", fontWeight: "bold", cursor: "pointer" }}>🔄 Again</button>
        </div>
      </div>
    </div>
  );
}
export default function ZombieHunter({ onBack }) {
  const [step, setStep] = useState("setup");
  const [throwsPerDuel, setThrowsPerDuel] = useState(3);
  const [names, setNames] = useState(["", "", ""]);
  const [championIdx, setChampionIdx] = useState(0);
  const [startingZombies, setStartingZombies] = useState(1);
  const [game, setGame] = useState(null);
  const [gameOver, setGameOver] = useState(null);

  const btn = (bg, col) => ({ background: bg, color: col || "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontFamily: "monospace", fontWeight: "bold", cursor: "pointer" });
  const card = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, marginBottom: 10 };
  const validNames = names.filter(n => n.trim());
  const getName = (id, g) => (g || game)?.allPlayers.find(p => p.id === id)?.name || "?";

  const startGame = () => {
    const ps = names.filter(n => n.trim()).map((n, i) => ({ id: String(i), name: n.trim() }));
    const champId = ps[Math.min(championIdx, ps.length - 1)].id;
    // Build starting zombie list: champion first, then next N-1 players in order
    const othersInOrder = ps.filter(p => p.id !== champId).map(p => p.id);
    const numZ = Math.min(startingZombies, othersInOrder.length);
    const initialZombies = [champId, ...othersInOrder.slice(0, numZ - 1)];
    const humans = othersInOrder.slice(numZ - 1);
    setGame({
      allPlayers: ps,
      zombieQueue: initialZombies,
      humanQueue: humans,
      eliminated: [],
      phase: "zombie_throw",
      zombieThrows: [],
      humanThrows: [],
      throwsLeft: throwsPerDuel,
      message: `🧟 ${ps[Math.min(championIdx, ps.length-1)].name} is the first zombie!`,
    });
    setGameOver(null);
    setStep("game");
  };

  const resolveGameOver = (zQ, hQ, msg, winner) => {
    setGameOver({ winner, msg });
  };

  const handleThrow = (zone) => {
    if (!game || gameOver) return;
    setGame(prev => {
      const g = { ...prev };

      if (g.phase === "zombie_throw") {
        const pts = Math.min(zone.points, 5); // zombies cap at bullseye
        const newThrows = [...g.zombieThrows, { ...zone, points: pts }];
        if (newThrows.length >= throwsPerDuel) {
          // Zombie done throwing — human's turn
          return { ...g, zombieThrows: newThrows, phase: "human_throw", humanThrows: [], throwsLeft: throwsPerDuel, message: "" };
        }
        return { ...g, zombieThrows: newThrows, throwsLeft: g.throwsLeft - 1 };
      }

      // Human's turn
      const newHumanThrows = [...g.humanThrows, zone];
      const zombieId = g.zombieQueue[0];
      const humanId = g.humanQueue[0];
      const zombieName = getName(zombieId, g);
      const humanName = getName(humanId, g);
      const zScore = g.zombieThrows.reduce((s, t) => s + t.points, 0);

      // HEADSHOT — nipple kills current zombie instantly
      if (zone.id === "nipple") {
        const newEliminated = [...g.eliminated, zombieId];
        const newZombieQueue = g.zombieQueue.slice(1); // remove dead zombie from front
        // Human winner cycles to back of human queue
        const newHumanQueue = g.humanQueue.length > 1
          ? [...g.humanQueue.slice(1), humanId]
          : [humanId]; // last human stays

        if (newZombieQueue.length === 0) {
          setTimeout(() => setGameOver({ winner: "humans", msg: `HEADSHOT! ${humanName} eliminates ${zombieName} — the last zombie! Humanity survives! 🎉` }), 50);
          return { ...g, zombieQueue: [], humanQueue: newHumanQueue, eliminated: newEliminated, phase: "done", message: `🎯 HEADSHOT! ${zombieName} eliminated!` };
        }
        return {
          ...g,
          zombieQueue: newZombieQueue,
          humanQueue: newHumanQueue,
          eliminated: newEliminated,
          phase: "zombie_throw",
          zombieThrows: [],
          humanThrows: [],
          throwsLeft: throwsPerDuel,
          message: `🎯 HEADSHOT! ${humanName} eliminates ${zombieName}! Next zombie: ${getName(newZombieQueue[0], g)}`,
        };
      }

      if (newHumanThrows.length >= throwsPerDuel) {
        const hScore = newHumanThrows.reduce((s, t) => s + t.points, 0);
        const zombieWins = zScore >= hScore; // tie = zombie wins

        if (zombieWins) {
          // Human loses → becomes zombie (back of zombie queue)
          // Current zombie also rotates to back of zombie queue
          const newZombieQueue = [...g.zombieQueue.slice(1), g.zombieQueue[0], humanId];
          // zombie rotates: [z1,z2,z3] → [z2,z3,z1,newZ]
          const newHumanQueue = g.humanQueue.slice(1);

          if (newHumanQueue.length === 0) {
            setTimeout(() => setGameOver({ winner: "zombies", msg: `${humanName} joins the horde — everyone is a zombie now! 🧟🧟🧟` }), 50);
            return { ...g, zombieQueue: newZombieQueue, humanQueue: [], phase: "done",
              message: `🧟 ${humanName} joins the horde!` };
          }
          return {
            ...g,
            zombieQueue: newZombieQueue,
            humanQueue: newHumanQueue,
            phase: "zombie_throw",
            zombieThrows: [],
            humanThrows: [],
            throwsLeft: throwsPerDuel,
            message: `🧟 ${humanName} joins the horde! Next: ${getName(newZombieQueue[0], g)} vs ${getName(newHumanQueue[0], g)}`,
          };
        } else {
          // Human wins → zombie eliminated, human cycles to back of human queue
          const newEliminated = [...g.eliminated, zombieId];
          const newZombieQueue = g.zombieQueue.slice(1); // remove dead zombie
          const newHumanQueue = g.humanQueue.length > 1
            ? [...g.humanQueue.slice(1), humanId]
            : [humanId]; // last human stays

          if (newZombieQueue.length === 0) {
            setTimeout(() => setGameOver({ winner: "humans", msg: `${humanName} defeats ${zombieName} — the last zombie! Humanity survives! 🎉` }), 50);
            return { ...g, zombieQueue: [], humanQueue: newHumanQueue, eliminated: newEliminated, phase: "done",
              message: `💀 ${zombieName} eliminated!` };
          }
          return {
            ...g,
            zombieQueue: newZombieQueue,
            humanQueue: newHumanQueue,
            eliminated: newEliminated,
            phase: "zombie_throw",
            zombieThrows: [],
            humanThrows: [],
            throwsLeft: throwsPerDuel,
            message: `💀 ${humanName} defeats ${zombieName}! Next: ${getName(newZombieQueue[0], g)} vs ${getName(newHumanQueue[0], g)}`,
          };
        }
      }

      return { ...g, humanThrows: newHumanThrows, throwsLeft: g.throwsLeft - 1 };
    });
  };

  // ── SETUP ──
  if (step === "setup") return (
    <div style={{ minHeight: "100vh", background: DARK, color: "#fff", padding: 20, maxWidth: 500, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
        <button onClick={onBack} style={{ ...btn("#333"), padding: "8px 16px" }}>← Back</button>
        <h2 style={{ color: ZG, margin: 0, fontFamily: "serif" }}>🧟 Zombie Hunter</h2>
      </div>
      <div style={{ textAlign: "center", fontSize: 64, marginBottom: 8 }}>🧟</div>
      <div style={{ color: "#888", fontFamily: "monospace", fontSize: 12, textAlign: "center", marginBottom: 20, lineHeight: 1.9 }}>
        Champion = first zombie. 1v1 duels, everyone rotates.<br/>
        Win = rotate to back of your queue.<br/>
        Lose (human) = join zombie queue. Lose (zombie) = eliminated.<br/>
        <span style={{ color: "#e63946" }}>🎯 Nipple = instant headshot — zombie eliminated!</span><br/>
        Zombies can't throw nipples. Ties → zombie wins.
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
              placeholder={`Player ${i+1}`}
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
              }}>{championIdx === i ? "🧟 " : ""}{n.trim()}</button>
            ) : null)}
          </div>
        </div>
      )}
      {validNames.length >= 2 && (
        <div style={card}>
          <div style={{ color: "#e63946", fontFamily: "monospace", fontSize: 12, fontWeight: "bold", marginBottom: 10 }}>
            🧟 STARTING ZOMBIES: {Math.min(startingZombies, Math.max(1, validNames.length - 1))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Array.from({ length: Math.max(1, validNames.length - 1) }, (_, i) => i + 1).map(n => (
              <button key={n} onClick={() => setStartingZombies(n)} style={{
                flex: 1, minWidth: 44,
                ...btn(startingZombies === n ? "#e63946" : "#1a1a1a", startingZombies === n ? "#fff" : "#888"),
                border: `1px solid ${startingZombies === n ? "#e63946" : "#333"}`, padding: "10px 0", fontSize: 16,
              }}>{n}</button>
            ))}
          </div>
          {startingZombies > 1 && (
            <div style={{ color: "#666", fontFamily: "monospace", fontSize: 11, marginTop: 8 }}>
              Champion + {Math.min(startingZombies, validNames.length - 1) - 1} more start as zombies
            </div>
          )}
        </div>
      )}
      <button onClick={startGame} disabled={validNames.length < 2}
        style={{ ...btn("#e63946"), width: "100%", padding: "14px", fontSize: 16, opacity: validNames.length < 2 ? 0.5 : 1 }}>
        🧟 RELEASE THE HORDE ({Math.min(startingZombies, Math.max(1, validNames.length - 1))} zombie{Math.min(startingZombies, Math.max(1, validNames.length - 1)) > 1 ? "s" : ""} vs {Math.max(1, validNames.length - Math.min(startingZombies, Math.max(1, validNames.length - 1)))} human{Math.max(1, validNames.length - Math.min(startingZombies, Math.max(1, validNames.length - 1))) > 1 ? "s" : ""})
      </button>
    </div>
  );

  // ── GAME OVER ──
  if (gameOver) {
    if (gameOver.winner === "humans") {
      return <HumanityWinsScreen msg={gameOver.msg} onBack={onBack} onAgain={startGame} />;
    } else {
      return <HordeWinsScreen msg={gameOver.msg} onBack={onBack} onAgain={startGame} />;
    }
  }

  if (step !== "game" || !game) return null;

  // ── GAME SCREEN ──
  const isZombieTurn = game.phase === "zombie_throw";
  const currentZombieId = game.zombieQueue[0];
  const currentHumanId = game.humanQueue[0];
  const throws = isZombieTurn ? game.zombieThrows : game.humanThrows;
  const zScore = game.zombieThrows.reduce((s, t) => s + t.points, 0);
  const hScore = game.humanThrows.reduce((s, t) => s + t.points, 0);

  return (
    <div style={{ minHeight: "100vh", background: isZombieTurn ? "#0d0505" : DARK, color: "#fff", padding: 16, maxWidth: 500, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <button onClick={() => { setStep("setup"); setGame(null); }} style={{ ...btn("#333"), padding: "8px 14px" }}>← Back</button>
        <h3 style={{ color: ZG, margin: 0, fontFamily: "serif", flex: 1 }}>🧟 Zombie Hunter</h3>
      </div>

      {game.message && (
        <div style={{ background: "#1a0505", border: "1px solid #e63946", borderRadius: 8, padding: "10px 14px",
          marginBottom: 12, color: "#e63946", fontFamily: "monospace", fontSize: 12, textAlign: "center" }}>
          {game.message}
        </div>
      )}

      {/* Queues side by side */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {/* Zombie queue */}
        <div style={{ flex: 1, background: "#1a0505", border: "1px solid #e63946", borderRadius: 8, padding: 10 }}>
          <div style={{ color: "#e63946", fontFamily: "monospace", fontSize: 11, fontWeight: "bold", marginBottom: 6, textAlign: "center" }}>
            🧟 ZOMBIES ({game.zombieQueue.length})
          </div>
          {game.zombieQueue.map((id, i) => (
            <div key={`z_${id}_${i}`} style={{ color: i === 0 ? "#ff8888" : "#774444", fontFamily: "monospace",
              fontSize: 12, fontWeight: i === 0 ? "bold" : "normal", padding: "2px 0" }}>
              {i === 0 ? "▶ " : `${i+1}. `}{getName(id)}
            </div>
          ))}
          {game.eliminated.length > 0 && <>
            <div style={{ borderTop: "1px solid #333", marginTop: 6, paddingTop: 6 }}>
              {game.eliminated.map((id, i) => (
                <div key={`e_${id}_${i}`} style={{ color: "#333", fontFamily: "monospace", fontSize: 11, textDecoration: "line-through" }}>
                  💀 {getName(id)}
                </div>
              ))}
            </div>
          </>}
        </div>
        {/* Human queue */}
        <div style={{ flex: 1, background: ZD, border: `1px solid ${ZG}`, borderRadius: 8, padding: 10 }}>
          <div style={{ color: ZG, fontFamily: "monospace", fontSize: 11, fontWeight: "bold", marginBottom: 6, textAlign: "center" }}>
            👤 HUMANS ({game.humanQueue.length})
          </div>
          {game.humanQueue.map((id, i) => (
            <div key={`h_${id}_${i}`} style={{ color: i === 0 ? ZG : "#558855", fontFamily: "monospace",
              fontSize: 12, fontWeight: i === 0 ? "bold" : "normal", padding: "2px 0" }}>
              {i === 0 ? "▶ " : `${i+1}. `}{getName(id)}
            </div>
          ))}
        </div>
      </div>

      {/* Current duel */}
      <div style={{ background: isZombieTurn ? "#1a0505" : "#051a05",
        border: `2px solid ${isZombieTurn ? "#e63946" : ZG}`,
        borderRadius: 10, padding: 12, marginBottom: 12, textAlign: "center" }}>
        <div style={{ fontFamily: "monospace", fontSize: 14, marginBottom: 8 }}>
          <span style={{ color: "#e63946" }}>{getName(currentZombieId)} 🧟</span>
          <span style={{ color: "#555", margin: "0 12px" }}>vs</span>
          <span style={{ color: ZG }}>{getName(currentHumanId)} 👤</span>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 40, marginBottom: 6 }}>
          <div>
            <div style={{ color: "#e63946", fontFamily: "monospace", fontSize: 11 }}>🧟 SCORE</div>
            <div style={{ color: "#e63946", fontFamily: "monospace", fontSize: 32, fontWeight: "bold" }}>{zScore}</div>
          </div>
          <div>
            <div style={{ color: ZG, fontFamily: "monospace", fontSize: 11 }}>👤 SCORE</div>
            <div style={{ color: ZG, fontFamily: "monospace", fontSize: 32, fontWeight: "bold" }}>{hScore}</div>
          </div>
        </div>
        <div style={{ color: "#888", fontFamily: "monospace", fontSize: 12 }}>
          {isZombieTurn
            ? `🧟 ${getName(currentZombieId)} throws — ${game.throwsLeft} left`
            : `👤 ${getName(currentHumanId)} throws — ${game.throwsLeft} left`}
        </div>
        <div style={{ color: isZombieTurn ? "#664422" : "#226644", fontFamily: "monospace", fontSize: 10, marginTop: 4 }}>
          {isZombieTurn ? "⚠️ No nipples for zombies! Max = bullseye" : "🎯 Nipple = HEADSHOT! Tie = zombie wins"}
        </div>
      </div>

      {/* Throw pips */}
      <div style={{ display: "flex", gap: 5, justifyContent: "center", marginBottom: 10 }}>
        {Array.from({ length: throwsPerDuel }).map((_, i) => {
          const t = throws[i];
          return (
            <div key={i} style={{ width: 38, height: 38, borderRadius: 6, display: "flex", alignItems: "center",
              justifyContent: "center", fontFamily: "monospace", fontWeight: "bold", fontSize: 13,
              background: t ? (t.id==="miss"?"#333":t.id==="outer"?BLUE:t.id==="inner"?RED:t.id==="bullseye"?"#222":"#e63946") : "#1a1a1a",
              border: t ? `1px solid ${t.id==="bullseye"?GOLD:"#555"}` : "1px dashed #333",
              color: t ? (t.id==="bullseye"?GOLD:"#fff") : "#444",
            }}>
              {t ? (t.id==="nipple"?"★":t.id==="miss"?"✗":t.points) : "·"}
            </div>
          );
        })}
      </div>

      <AxeTarget onScore={handleThrow} noNipple={isZombieTurn} />
    </div>
  );
}
