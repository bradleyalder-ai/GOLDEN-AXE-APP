import { useState } from "react";

const GOLD = "#f0c040", DARK = "#0d0d0d", RED = "#c1121f", BLUE = "#1d6a96";
const PANEL = "#151515", BORDER = "#2a2a2a";
const MEDALS = ["🥇","🥈","🥉"];

const SEQUENCES = {
  easy: [
    { label:"Outer",       id:"outer",    color:BLUE,      side:"any" },
    { label:"Inner",       id:"inner",    color:RED,       side:"any" },
    { label:"Bullseye",    id:"bullseye", color:GOLD,      side:"any" },
    { label:"Inner",       id:"inner",    color:RED,       side:"any" },
    { label:"Outer",       id:"outer",    color:BLUE,      side:"any" },
  ],
  medium: [
    { label:"Left Outer",  id:"outer",    color:BLUE,      side:"left" },
    { label:"Left Inner",  id:"inner",    color:RED,       side:"left" },
    { label:"Bullseye",    id:"bullseye", color:GOLD,      side:"any"  },
    { label:"Right Inner", id:"inner",    color:RED,       side:"right"},
    { label:"Right Outer", id:"outer",    color:BLUE,      side:"right"},
  ],
  hard: [
    { label:"Left Outer",  id:"outer",    color:BLUE,      side:"left" },
    { label:"Left Inner",  id:"inner",    color:RED,       side:"left" },
    { label:"Bullseye",    id:"bullseye", color:GOLD,      side:"any"  },
    { label:"Nipple",      id:"nipple",   color:"#e63946", side:"any"  },
    { label:"Bullseye",    id:"bullseye", color:GOLD,      side:"any"  },
    { label:"Right Inner", id:"inner",    color:RED,       side:"right"},
    { label:"Right Outer", id:"outer",    color:BLUE,      side:"right"},
  ],
};

function AxeTargetATW({ onScore, currentTarget }) {
  const t = currentTarget;
  const glow = (id, side="any") =>
    t?.id === id && (t?.side === "any" || t?.side === side || side === "any");
  const gs = (id, side) => ({
    cursor:"pointer",
    filter: glow(id,side) ? `drop-shadow(0 0 14px ${t.color})` : "none",
    opacity: glow(id,side) ? 1 : 0.45,
  });
  return (
    <svg viewBox="0 0 300 320" style={{ width:"100%", maxWidth:340, display:"block", margin:"0 auto" }}>
      <path d="M 20 170 A 130 130 0 0 1 150 40 L 150 170 Z"  fill={BLUE} style={gs("outer","left")}  onClick={() => onScore({id:"outer",side:"left"})} />
      <path d="M 150 40 A 130 130 0 0 1 280 170 L 150 170 Z" fill={BLUE} style={gs("outer","right")} onClick={() => onScore({id:"outer",side:"right"})} />
      <path d="M 280 170 A 130 130 0 0 1 20 170 Z"           fill={BLUE} style={{cursor:"pointer",opacity:0.4}} onClick={() => onScore({id:"outer",side:"any"})} />
      <path d="M 60 170 A 90 90 0 0 1 150 80 L 150 170 Z"    fill={RED}  style={gs("inner","left")}  onClick={() => onScore({id:"inner",side:"left"})} />
      <path d="M 150 80 A 90 90 0 0 1 240 170 L 150 170 Z"   fill={RED}  style={gs("inner","right")} onClick={() => onScore({id:"inner",side:"right"})} />
      <path d="M 240 170 A 90 90 0 0 1 60 170 Z"             fill={RED}  style={{cursor:"pointer",opacity:0.5}} onClick={() => onScore({id:"inner",side:"any"})} />
      <circle cx="150" cy="170" r="55" fill="#111"
        stroke={glow("bullseye") ? GOLD : "#333"} strokeWidth={glow("bullseye") ? 4 : 2}
        style={gs("bullseye","any")} onClick={() => onScore({id:"bullseye",side:"any"})} />
      <text pointerEvents="none" x="150" y="175" textAnchor="middle" fill={GOLD} fontSize="13" fontFamily="monospace" fontWeight="bold">5</text>
      {[{dx:-90,side:"left"},{dx:90,side:"right"}].map(({dx,side}) => (
        <g key={side} transform={`translate(${150+dx},50)`} style={gs("nipple",side)} onClick={() => onScore({id:"nipple",side})}>
          <circle cx="0" cy="0" r="22" fill="#e63946" />
          <text pointerEvents="none" x="0" y="5" textAnchor="middle" fill="#fff" fontSize="11" fontFamily="monospace" fontWeight="bold">7</text>
        </g>
      ))}
      <rect x="0" y="300" width="300" height="20" fill="#222" rx="4" style={{cursor:"pointer"}} onClick={() => onScore({id:"miss",side:"any"})} />
      <text pointerEvents="none" x="150" y="313" textAnchor="middle" fill="#555" fontSize="10" fontFamily="monospace">MISS</text>
      <text pointerEvents="none" x="45"  y="200" textAnchor="middle" fill="#444" fontSize="10" fontFamily="monospace">LEFT</text>
      <text pointerEvents="none" x="255" y="200" textAnchor="middle" fill="#444" fontSize="10" fontFamily="monospace">RIGHT</text>
    </svg>
  );
}

function Tiebreaker({ tied, placing, onDone }) {
  const [order, setOrder] = useState([]);
  const spotsLeft = Math.min(3 - placing + 1, tied.length);
  const tap = (id) => {
    if (order.includes(id)) return;
    const next = [...order, id];
    setOrder(next);
    if (next.length >= spotsLeft || next.length >= tied.length) onDone(next);
  };
  return (
    <div style={{ position:"fixed", inset:0, zIndex:300, background:"rgba(0,0,0,0.96)",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ fontSize:48, marginBottom:12 }}>🎯</div>
      <div style={{ color:GOLD, fontFamily:"Georgia,serif", fontSize:20, fontWeight:"bold", marginBottom:6, textAlign:"center" }}>
        Sudden Death Tiebreaker!
      </div>
      <div style={{ color:"#888", fontFamily:"monospace", fontSize:12, marginBottom:6, textAlign:"center" }}>
        {tied.length} players tied for {MEDALS[placing-1]} place
      </div>
      <div style={{ color:"#aaa", fontFamily:"monospace", fontSize:12, marginBottom:20, textAlign:"center", lineHeight:1.6 }}>
        Each player throws once at bullseye.<br/>Tap in order — <span style={{color:GOLD}}>closest first</span>.
      </div>
      <div style={{ width:"100%", maxWidth:360 }}>
        {tied.map(pl => {
          const rank = order.indexOf(pl.id);
          const sel = rank >= 0;
          const place = placing + rank;
          return (
            <div key={pl.id} onClick={() => tap(pl.id)} style={{
              background:sel?"#1a2a00":"#1a1a1a",
              border:`2px solid ${sel?(place===1?GOLD:place===2?"#aaa":"#cd7f32"):"#333"}`,
              borderRadius:10, padding:"12px 16px", marginBottom:8, cursor:"pointer",
              display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontFamily:"monospace", color:sel?"#fff":"#aaa", fontSize:15 }}>{pl.name}</span>
              {sel ? <span style={{fontSize:20}}>{MEDALS[place-1]||`#${place}`}</span>
                   : <span style={{color:"#444",fontFamily:"monospace",fontSize:11}}>tap if closest ▶</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AroundTheWorld({ onBack, roomPlayers = [] }) {
  const [step, setStep] = useState("mode");
  const [mode, setMode] = useState(null);
  const [names, setNames] = useState(() => roomPlayers.length >= 2 ? roomPlayers.map(p => p.name) : ["",""]);
  const [game, setGame] = useState(null);
  const [podium, setPodium] = useState([]);
  const [tiebreaker, setTiebreaker] = useState(null);

  const card = { background:PANEL, border:`1px solid ${BORDER}`, borderRadius:10, padding:14, marginBottom:10 };
  const btn = (bg,col) => ({ background:bg, color:col||"#fff", border:"none", borderRadius:8,
    padding:"10px 16px", fontFamily:"monospace", fontWeight:"bold", cursor:"pointer" });
  const validNames = names.filter(n => n.trim().length > 0);

  const startGame = () => {
    const ps = names.filter(n => n.trim()).map((n,i) => ({ id:String(i), name:n.trim() }));
    setGame({
      players: ps,
      progress: Object.fromEntries(ps.map(p => [p.id, 0])),
      throwCounts: Object.fromEntries(ps.map(p => [p.id, 0])),
      currentIdx: 0,
      sequence: SEQUENCES[mode],
      active: ps.map(p => p.id),
      pendingFinishers: [],
    });
    setPodium([]);
    setTiebreaker(null);
    setStep("game");
  };

  const nextActive = (currentIdx, players, activeIds) => {
    if (activeIds.length === 0) return currentIdx;
    for (let i = 1; i <= players.length; i++) {
      const idx = (currentIdx + i) % players.length;
      if (activeIds.includes(players[idx].id)) return idx;
    }
    return currentIdx;
  };

  const hasActiveAfter = (currentIdx, players, activeIds) => {
    for (let i = 1; i < players.length; i++) {
      const idx = (currentIdx + i) % players.length;
      if (activeIds.includes(players[idx].id)) return true;
    }
    return false;
  };

  const awardPlace = (finishers, remainingActive, currentPodium, g) => {
    const placingStart = currentPodium.length + 1;
    if (finishers.length === 0) {
      // No finishers this cycle — just continue
      setGame({ ...g, pendingFinishers: [] });
      return;
    }
    if (finishers.length === 1) {
      const winner = g.players.find(p => p.id === finishers[0].id);
      const newPodium = [...currentPodium, { ...winner, place:placingStart, throwCount:finishers[0].throwCount }];
      if (newPodium.length >= 3 || remainingActive.length === 0) {
        setPodium(newPodium);
        setStep("podium");
      } else {
        setPodium(newPodium);
        setGame({ ...g, active:remainingActive, pendingFinishers:[],
          currentIdx: g.players.findIndex(p => remainingActive.includes(p.id)) });
      }
    } else {
      const tiedPlayers = finishers.map(f => g.players.find(p => p.id === f.id));
      setGame({ ...g, pendingFinishers:[] });
      setTiebreaker({ tied:tiedPlayers, placing:placingStart, game:g, remaining:remainingActive, currentPodium });
    }
  };

  const handleTiebreakerDone = (orderedIds) => {
    const { game:g, remaining, placing, currentPodium } = tiebreaker;
    const newPodium = [...currentPodium];
    orderedIds.slice(0, 3 - currentPodium.length).forEach((id,i) => {
      const player = g.players.find(p => p.id === id);
      newPodium.push({ ...player, place:placing+i, throwCount:g.throwCounts[id] });
    });
    setTiebreaker(null);
    const allTiedIds = tiebreaker.tied.map(p => p.id);
    const newActive = remaining.filter(id => !allTiedIds.includes(id));
    if (newPodium.length >= 3 || newActive.length === 0) {
      setPodium(newPodium); setStep("podium");
    } else {
      setPodium(newPodium);
      setGame({ ...g, active:newActive, pendingFinishers:[],
        currentIdx:g.players.findIndex(p => newActive.includes(p.id)) });
    }
  };

  const handleThrow = (thrown) => {
    if (!game || tiebreaker || step === "podium") return;
    const p = game.players[game.currentIdx];
    if (!game.active.includes(p.id)) {
      setGame(prev => ({ ...prev, currentIdx:nextActive(prev.currentIdx, prev.players, prev.active) }));
      return;
    }

    const prog = game.progress[p.id];
    const target = game.sequence[prog];
    const hit = thrown.id === target.id && thrown.id !== "miss" &&
      (target.side === "any" || thrown.side === target.side ||
       thrown.id === "bullseye" || thrown.id === "nipple");

    const newProg = hit ? prog + 1 : prog;
    const newThrowCount = game.throwCounts[p.id] + 1;
    const newProgress = { ...game.progress, [p.id]: newProg };
    const newThrowCounts = { ...game.throwCounts, [p.id]: newThrowCount };
    const finished = hit && newProg >= game.sequence.length;

    if (finished) {
      const newActive = game.active.filter(id => id !== p.id);
      const newPending = [...game.pendingFinishers, { id:p.id, throwCount:newThrowCount }];
      const nextIdx = nextActive(game.currentIdx, game.players, newActive);
      const cycleComplete = newActive.length === 0 || !hasActiveAfter(game.currentIdx, game.players, newActive);

      const g = { ...game, progress:newProgress, throwCounts:newThrowCounts,
        active:newActive, pendingFinishers:newPending, currentIdx:nextIdx };

      if (cycleComplete) {
        awardPlace(newPending, newActive, podium, g);
      } else {
        setGame(g);
      }
      return;
    }

    // Miss or wrong zone — move to next player
    const nextIdx = nextActive(game.currentIdx, game.players, game.active);
    const cycleComplete = !hasActiveAfter(game.currentIdx, game.players, game.active);
    const g = { ...game, progress:newProgress, throwCounts:newThrowCounts, currentIdx:nextIdx };

    if (cycleComplete) {
      awardPlace(game.pendingFinishers, game.active, podium, { ...g, pendingFinishers:[] });
    } else {
      setGame(g);
    }
  };

  // ── SCREENS ──────────────────────────────────────────────────────────────────
  if (step === "mode") return (
    <div style={{ minHeight:"100vh", background:DARK, color:"#fff", padding:20, maxWidth:500, margin:"0 auto" }}>
      <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:20 }}>
        <button onClick={onBack} style={{ ...btn("#333"), padding:"8px 16px" }}>← Back</button>
        <h2 style={{ color:GOLD, margin:0, fontFamily:"serif" }}>🌍 Around the World</h2>
      </div>
      <div style={{ textAlign:"center", fontSize:64, marginBottom:16 }}>🌍</div>
      {[
        { key:"easy",   label:"Easy",   desc:"Hit in order: Outer → Inner → Bullseye → Inner → Outer",
          zones:"1 → 3 → 5 → 3 → 1", color:"#1a3a1a", border:"#4f4" },
        { key:"medium", label:"Medium", desc:"Left side: L.Outer → L.Inner → Bullseye → R.Inner → R.Outer",
          zones:"Left 1 → Left 3 → 5 → Right 3 → Right 1", color:"#1a2a3a", border:GOLD },
        { key:"hard",   label:"Hard",   desc:"Medium route + Nipple between the two Bullseyes!",
          zones:"Left 1 → Left 3 → 5 → Nipple → 5 → Right 3 → Right 1", color:"#3a1a1a", border:RED },
      ].map(m => (
        <div key={m.key} onClick={() => { setMode(m.key); setStep("players"); }} style={{
          background:m.color, border:`2px solid ${m.border}`, borderRadius:12, padding:"16px 20px", marginBottom:12, cursor:"pointer" }}>
          <div style={{ color:m.border, fontFamily:"monospace", fontWeight:"bold", fontSize:16, marginBottom:4 }}>{m.label}</div>
          <div style={{ color:"#aaa", fontFamily:"monospace", fontSize:12, marginBottom:4 }}>{m.desc}</div>
          <div style={{ color:"#555", fontFamily:"monospace", fontSize:11 }}>{m.zones}</div>
        </div>
      ))}
    </div>
  );

  if (step === "players") return (
    <div style={{ minHeight:"100vh", background:DARK, color:"#fff", padding:20, maxWidth:500, margin:"0 auto" }}>
      <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:20 }}>
        <button onClick={() => setStep("mode")} style={{ ...btn("#333"), padding:"8px 16px" }}>← Back</button>
        <h2 style={{ color:GOLD, margin:0, fontFamily:"serif" }}>🌍 {mode}</h2>
      </div>
      <div style={card}>
        <div style={{ color:GOLD, fontFamily:"monospace", fontSize:12, fontWeight:"bold", marginBottom:10 }}>PLAYER NAMES</div>
        {names.map((n,i) => (
          <div key={i} style={{ display:"flex", gap:8, marginBottom:8 }}>
            <input value={n} onChange={e => setNames(prev => prev.map((v,j) => j===i?e.target.value:v))}
              placeholder={`Player ${i+1}`}
              style={{ flex:1, background:"#222", border:"1px solid #444", borderRadius:8,
                padding:"10px 12px", color:"#fff", fontFamily:"monospace", fontSize:14 }} />
            {names.length > 1 && <button onClick={() => setNames(prev => prev.filter((_,j) => j!==i))}
              style={{ ...btn(RED), padding:"8px 12px" }}>✕</button>}
          </div>
        ))}
        {names.length < 8 && <button onClick={() => setNames(prev => [...prev,""])}
          style={{ ...btn("#1a2a1a"), border:"1px solid #3a5a3a", width:"100%", color:"#4f4" }}>+ Add Player</button>}
      </div>
      <div style={{ ...card, color:"#888", fontFamily:"monospace", fontSize:12 }}>
        <div style={{ color:GOLD, fontWeight:"bold", marginBottom:8 }}>SEQUENCE</div>
        {SEQUENCES[mode].map((s,i) => (
          <div key={i} style={{ display:"flex", gap:8, marginBottom:4 }}>
            <span style={{ color:"#555", minWidth:20 }}>{i+1}.</span>
            <span style={{ color:s.color, fontWeight:"bold" }}>{s.label}</span>
          </div>
        ))}
      </div>
      <button onClick={startGame} disabled={validNames.length < 1}
        style={{ ...btn(GOLD,DARK), width:"100%", padding:"14px", fontSize:16, opacity:validNames.length<1?0.5:1 }}>
        🌍 Start Game
      </button>
    </div>
  );

  if (step === "podium") return (
    <div style={{ minHeight:"100vh", background:DARK, color:"#fff", display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ fontSize:64, marginBottom:12 }}>🌍</div>
      <div style={{ color:GOLD, fontFamily:"Georgia,serif", fontSize:26, fontWeight:"bold", marginBottom:24, textAlign:"center" }}>
        Final Results
      </div>
      <div style={{ width:"100%", maxWidth:400, marginBottom:24 }}>
        {podium.map(pl => (
          <div key={pl.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
            background:pl.place===1?"#1a2a00":pl.place===2?"#1a1a2a":"#2a1a00",
            border:`1px solid ${pl.place===1?GOLD:pl.place===2?"#aaa":"#cd7f32"}`,
            borderRadius:8, padding:"12px 16px", marginBottom:8 }}>
            <span style={{ fontFamily:"monospace", color:"#fff", fontSize:15 }}>{MEDALS[pl.place-1]} {pl.name}</span>
            <span style={{ fontFamily:"monospace", color:"#888", fontSize:12 }}>{pl.throwCount} throws</span>
          </div>
        ))}
        {podium.length === 1 && game?.players.length === 1 && (
          <div style={{ color:"#888", fontFamily:"monospace", fontSize:12, textAlign:"center", marginTop:8 }}>
            Completed in {podium[0].throwCount} throws!
          </div>
        )}
      </div>
      <div style={{ display:"flex", gap:10 }}>
        <button onClick={onBack} style={{ ...btn("#333"), padding:"12px 24px" }}>🏠 Menu</button>
        <button onClick={startGame} style={{ ...btn(GOLD,DARK), padding:"12px 24px" }}>🔄 Again</button>
      </div>
    </div>
  );

  if (step !== "game" || !game) return null;

  const p = game.players[game.currentIdx];
  const prog = game.progress[p?.id] ?? 0;
  const target = game.sequence[prog];

  return (
    <div style={{ minHeight:"100vh", background:DARK, color:"#fff", padding:16, maxWidth:500, margin:"0 auto" }}>
      {tiebreaker && <Tiebreaker tied={tiebreaker.tied} placing={tiebreaker.placing} onDone={handleTiebreakerDone} />}
      <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:12 }}>
        <button onClick={() => setStep("players")} style={{ ...btn("#333"), padding:"8px 14px" }}>← Back</button>
        <h3 style={{ color:GOLD, margin:0, fontFamily:"serif", flex:1 }}>🌍 Around the World — {mode}</h3>
      </div>

      {/* Progress bars */}
      <div style={{ display:"flex", flexDirection:"column", gap:5, marginBottom:14 }}>
        {game.players.map(pl => {
          const isActive = game.active.includes(pl.id);
          const isCurrent = pl.id === p?.id && isActive;
          const podiumEntry = podium.find(x => x.id === pl.id);
          const pct = Math.round(((game.progress[pl.id]||0) / game.sequence.length) * 100);
          return (
            <div key={pl.id} style={{ display:"flex", alignItems:"center", gap:8, opacity:isActive?1:0.4 }}>
              <span style={{ color:isCurrent?GOLD:!isActive?"#444":"#888", fontFamily:"monospace",
                fontSize:11, minWidth:80, flexShrink:0 }}>
                {podiumEntry ? MEDALS[podiumEntry.place-1]+" " : isCurrent ? "▶ " : ""}{pl.name.slice(0,8)}
              </span>
              <div style={{ flex:1, height:10, background:"#222", borderRadius:6, overflow:"hidden",
                border:`1px solid ${isCurrent?GOLD+"44":"#333"}` }}>
                <div style={{ width:`${pct}%`, height:"100%",
                  background:isCurrent?GOLD:isActive?"#444":"#2a4a2a",
                  borderRadius:6, transition:"width 0.3s" }} />
              </div>
              <span style={{ color:"#555", fontFamily:"monospace", fontSize:10, minWidth:28 }}>
                {game.progress[pl.id]}/{game.sequence.length}
              </span>
            </div>
          );
        })}
      </div>

      {/* Current target */}
      {p && game.active.includes(p.id) && target && (
        <div style={{ background:"#1a1a00", border:`2px solid ${target.color}`, borderRadius:10,
          padding:"12px 16px", marginBottom:14, textAlign:"center" }}>
          <div style={{ color:"#888", fontFamily:"monospace", fontSize:11, marginBottom:4 }}>
            {p.name} — zone {prog+1} of {game.sequence.length}
          </div>
          <div style={{ color:target.color, fontFamily:"Georgia,serif", fontSize:22, fontWeight:"bold" }}>
            {target.label}
          </div>
          {target.side !== "any" && (
            <div style={{ color:"#888", fontFamily:"monospace", fontSize:11, marginTop:4 }}>
              {target.side === "left" ? "👈 Left side" : "👉 Right side"}
            </div>
          )}
        </div>
      )}

      <AxeTargetATW onScore={handleThrow} currentTarget={target} />
    </div>
  );
}
