import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react";
import Game21 from "./Game21";
import AroundTheWorld from "./AroundTheWorld";
import ZombieHunter from "./ZombieHunter";
import { writeGroupState, subscribeToGroup } from "./firebase";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const ZONES = [
  { id: "nipple_tl", label: "Nipple TL", points: 7, color: "#e63946" },
  { id: "nipple_tr", label: "Nipple TR", points: 7, color: "#e63946" },
  { id: "bullseye", label: "Bullseye", points: 5, color: "#1a1a2e" },
  { id: "inner", label: "Inner Ring", points: 3, color: "#c1121f" },
  { id: "outer", label: "Outer Ring", points: 1, color: "#1d6a96" },
  { id: "miss", label: "Miss / Board", points: 0, color: "#6b6b6b" },
];

const GOLD = "#f0c040";
const DARK = "#0d0d0d";
const PANEL = "#151515";
const BORDER = "#2a2a2a";
const RED = "#c1121f";
const BLUE = "#1d6a96";

// ─── RESPONSIVE HOOK ─────────────────────────────────────────────────────────
// Returns true when screen width >= 600px (tablet / large phone landscape)
function useTablet() {
  const [isTablet, setIsTablet] = useState(() => window.innerWidth >= 600);
  useEffect(() => {
    const handler = () => setIsTablet(window.innerWidth >= 600);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isTablet;
}

// ─── STORAGE HELPERS ─────────────────────────────────────────────────────────
const save = (key, val) => {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
};
const load = (key, def) => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; }
};


// ─── BRACKET SEEDS ───────────────────────────────────────────────────────────
// Returns ordered pairs for elimination bracket given n players seeded 1..n
function buildBracket(n) {
  // Pairs by seed rank for up to 50 players
  // First round byes for top seeds; bottom seeds play in
  // Use the specified bracket pattern
  const rounds = [];

  // Pre-round (play-in): positions 13-20 battle to reduce to 16
  const playIn = [];
  if (n > 16) {
    const playInPairs = [
      [16, 17], [13, 20], [15, 18], [19, 14]
    ].filter(([a, b]) => a <= n && b <= n);
    playIn.push(...playInPairs);
  }

  return { playIn, mainRound: buildMainBracket(n) };
}

function buildMainBracket(n) {
  // For <= 16 players, straight bracket seeded 1v16, 2v15, etc.
  // Returns array of [seedA, seedB | 'bye']
  const slots = 16;
  const pairs = [];
  // Standard single-elim seeding
  function seed(s) { return s <= n ? s : "bye"; }
  // 16-team bracket pairs: 1v16, 9v8, 5v12, 13v4, 3v14, 11v6, 7v10, 15v2
  const order = [1,16, 9,8, 5,12, 13,4, 3,14, 11,6, 7,10, 15,2];
  for (let i = 0; i < order.length; i += 2) {
    pairs.push([seed(order[i]), seed(order[i+1])]);
  }
  return pairs;
}

// ─── LEAGUE SCHEDULE ─────────────────────────────────────────────────────────
// Generates 7 nights of matches where every player gets ~21 total (3/night).
// Opponents spread as evenly as possible using round-robin day assignment.
function buildLeagueSchedule(playerIds, days = 7, targetTotal = 21) {
  const n = playerIds.length;
  if (n < 2) return Array.from({ length: days }, () => []);

  // Track how many times each pair has been scheduled (Copilot's opponentFrequency idea)
  const pairKey = (a, b) => [a, b].sort().join("|");
  const pairCount = {};
  const incPair = (a, b) => { const k = pairKey(a,b); pairCount[k] = (pairCount[k] || 0) + 1; };
  const getPairCount = (a, b) => pairCount[pairKey(a,b)] || 0;

  const allPairs = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      allPairs.push([playerIds[i], playerIds[j]]);

  // How many times each pair plays over the season
  const repeatsPerPair = Math.max(1, Math.round(targetTotal / (n - 1)));

  // Build full season match list
  const seasonMatches = [];
  for (const pair of allPairs)
    for (let k = 0; k < repeatsPerPair; k++)
      seasonMatches.push([...pair]);

  const MAX_PER_NIGHT = 4;
  const MIN_PER_NIGHT = 2;
  const daySlots = Array.from({ length: days }, () => []);
  const dayUsed = Array.from({ length: days }, () => {
    const u = {}; playerIds.forEach(p => { u[p] = 0; }); return u;
  });
  // Track which pairs are already scheduled on each night (avoid same pair twice/night)
  const dayPairs = Array.from({ length: days }, () => new Set());

  // Sort by least-played pair first (frequency balancing), shuffle ties randomly
  seasonMatches.sort((a, b) => {
    const diff = getPairCount(a[0], a[1]) - getPairCount(b[0], b[1]);
    return diff !== 0 ? diff : Math.random() - 0.5;
  });

  // Assign each match to a day — prefer days where neither player has played yet tonight,
  // and where this pair hasn't already been scheduled
  seasonMatches.forEach((match, i) => {
    const [a, b] = match;
    const key = pairKey(a, b);
    const preferred = i % days;

    // Score each day: lower = better
    // Prioritize: pair not already on this night, then fewest appearances for each player
    let bestDay = -1;
    let bestScore = Infinity;
    for (let offset = 0; offset < days; offset++) {
      const d = (preferred + offset) % days;
      if (dayUsed[d][a] >= MAX_PER_NIGHT || dayUsed[d][b] >= MAX_PER_NIGHT) continue;
      if (dayPairs[d].has(key)) continue; // same pair already tonight
      const score = (dayUsed[d][a] || 0) + (dayUsed[d][b] || 0);
      if (score < bestScore) { bestScore = score; bestDay = d; }
    }

    // Fallback: ignore same-pair-tonight restriction if no better option
    if (bestDay === -1) {
      for (let offset = 0; offset < days; offset++) {
        const d = (preferred + offset) % days;
        if (dayUsed[d][a] < MAX_PER_NIGHT && dayUsed[d][b] < MAX_PER_NIGHT) {
          bestDay = d; break;
        }
      }
    }

    // Last resort: least loaded day
    if (bestDay === -1) {
      bestDay = daySlots.reduce((best, s, d) => s.length < daySlots[best].length ? d : best, 0);
    }

    daySlots[bestDay].push(match);
    dayUsed[bestDay][a] = (dayUsed[bestDay][a] || 0) + 1;
    dayUsed[bestDay][b] = (dayUsed[bestDay][b] || 0) + 1;
    dayPairs[bestDay].add(key);
    incPair(a, b); // update frequency so next placement of same pair gets lower priority
  });

  // Second pass: enforce MIN_PER_NIGHT by moving matches from overloaded nights
  for (let d = 0; d < days; d++) {
    for (const p of playerIds) {
      if (dayUsed[d][p] >= MIN_PER_NIGHT) continue;
      for (let d2 = 0; d2 < days; d2++) {
        if (d2 === d || dayUsed[d2][p] <= MIN_PER_NIGHT) continue;
        for (let mi = 0; mi < daySlots[d2].length; mi++) {
          const m = daySlots[d2][mi];
          const opp = m[0] === p ? m[1] : m[1] === p ? m[0] : null;
          if (!opp) continue;
          if (dayUsed[d][opp] < MAX_PER_NIGHT && dayUsed[d][p] < MAX_PER_NIGHT) {
            daySlots[d2].splice(mi, 1);
            dayUsed[d2][p]--; dayUsed[d2][opp]--;
            daySlots[d].push(m);
            dayUsed[d][p]++; dayUsed[d][opp]++;
            break;
          }
        }
        if (dayUsed[d][p] >= MIN_PER_NIGHT) break;
      }
    }
  }

  return daySlots;
}

// ─── SCORING HELPERS ─────────────────────────────────────────────────────────
function totalScore(throws) {
  return throws.reduce((s, t) => s + (t?.points ?? 0), 0);
}

// ─── TARGET SVG ──────────────────────────────────────────────────────────────
function AxeTarget({ onScore, disabled }) {
  const [hover, setHover] = useState(null);

  const zones = [
    // Miss box - full area, shown as background
    { id: "miss", points: 0 },
    { id: "outer", points: 1 },
    { id: "inner", points: 3 },
    { id: "bullseye", points: 5 },
    { id: "nipple_tl", points: 7 },
    { id: "nipple_tr", points: 7 },
  ];

  const handleClick = (id, pts) => {
    if (!disabled) {
      const zone = ZONES.find(z => z.id === id);
      onScore({ id, points: pts, label: zone.label });
    }
  };

  const isTablet = useTablet();
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: isTablet ? 20 : 12 }}>
      <svg
        viewBox="0 0 300 320"
        style={{ width: "100%", maxWidth: isTablet ? 480 : 340, cursor: disabled ? "not-allowed" : "crosshair", filter: disabled ? "grayscale(0.6) opacity(0.7)" : "none", transition: "filter 0.3s" }}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Board background / Miss zone */}
        <rect
          x="10" y="10" width="280" height="300" rx="8"
          fill={hover === "miss" ? "#888" : "#555"}
          stroke={GOLD} strokeWidth="2"
          style={{ cursor: disabled ? "not-allowed" : "pointer", transition: "fill 0.15s" }}
          onClick={() => handleClick("miss", 0)}
          onMouseEnter={() => setHover("miss")}
          onMouseLeave={() => setHover(null)}
        />
        <text x="150" y="285" textAnchor="middle" fill="#aaa" fontSize="11" fontFamily="monospace">MISS / BOARD (0 pts)</text>

        {/* Outer blue ring */}
        <circle
          cx="150" cy="155" r="110"
          fill={hover === "outer" ? "#2a8abf" : BLUE}
          stroke="#333" strokeWidth="1.5"
          style={{ cursor: disabled ? "not-allowed" : "pointer", transition: "fill 0.15s" }}
          onClick={() => handleClick("outer", 1)}
          onMouseEnter={() => setHover("outer")}
          onMouseLeave={() => setHover(null)}
        />

        {/* Inner red ring */}
        <circle
          cx="150" cy="155" r="70"
          fill={hover === "inner" ? "#e84040" : RED}
          stroke="#222" strokeWidth="1.5"
          style={{ cursor: disabled ? "not-allowed" : "pointer", transition: "fill 0.15s" }}
          onClick={() => handleClick("inner", 3)}
          onMouseEnter={() => setHover("inner")}
          onMouseLeave={() => setHover(null)}
        />

        {/* Bullseye black */}
        <circle
          cx="150" cy="155" r="36"
          fill={hover === "bullseye" ? "#333" : "#111"}
          stroke={GOLD} strokeWidth="2"
          style={{ cursor: disabled ? "not-allowed" : "pointer", transition: "fill 0.15s" }}
          onClick={() => handleClick("bullseye", 5)}
          onMouseEnter={() => setHover("bullseye")}
          onMouseLeave={() => setHover(null)}
        />
        <text x="150" y="160" textAnchor="middle" fill={GOLD} fontSize="13" fontFamily="monospace" fontWeight="bold">●</text>

        {/* Nipple TL */}
        <circle
          cx="55" cy="45" r="18"
          fill={hover === "nipple_tl" ? "#ff5555" : RED}
          stroke={GOLD} strokeWidth="2.5"
          style={{ cursor: disabled ? "not-allowed" : "pointer", transition: "fill 0.15s" }}
          onClick={() => handleClick("nipple_tl", 7)}
          onMouseEnter={() => setHover("nipple_tl")}
          onMouseLeave={() => setHover(null)}
        />
        <text x="55" y="50" textAnchor="middle" fill={GOLD} fontSize="9" fontFamily="monospace" fontWeight="bold">7</text>

        {/* Nipple TR */}
        <circle
          cx="245" cy="45" r="18"
          fill={hover === "nipple_tr" ? "#ff5555" : RED}
          stroke={GOLD} strokeWidth="2.5"
          style={{ cursor: disabled ? "not-allowed" : "pointer", transition: "fill 0.15s" }}
          onClick={() => handleClick("nipple_tr", 7)}
          onMouseEnter={() => setHover("nipple_tr")}
          onMouseLeave={() => setHover(null)}
        />
        <text x="245" y="50" textAnchor="middle" fill={GOLD} fontSize="9" fontFamily="monospace" fontWeight="bold">7</text>

        {/* Ring labels */}
        <text x="150" y="106" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="9" fontFamily="monospace">3 pts</text>
        <text x="150" y="58" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="9" fontFamily="monospace">1 pt</text>
        <text x="150" y="155" textAnchor="middle" fill={GOLD} fontSize="10" fontFamily="monospace" fontWeight="bold">5</text>
      </svg>

      {/* Touch-friendly score buttons */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: isTablet ? 12 : 8, justifyContent: "center", maxWidth: isTablet ? 560 : 360 }}>
        {ZONES.map(z => (
          <button
            key={z.id}
            disabled={disabled}
            onClick={() => handleClick(z.id, z.points)}
            style={{
              background: hover === z.id ? z.color : `${z.color}bb`,
              border: `2px solid ${z.color}`,
              color: "#fff",
              borderRadius: 8,
              padding: isTablet ? "16px 24px" : "10px 16px",
              fontSize: isTablet ? 17 : 14,
              fontFamily: "monospace",
              fontWeight: "bold",
              cursor: disabled ? "not-allowed" : "pointer",
              minWidth: isTablet ? 110 : 80,
              transition: "all 0.15s",
              opacity: disabled ? 0.5 : 1,
            }}
            onMouseEnter={() => setHover(z.id)}
            onMouseLeave={() => setHover(null)}
          >
            {z.label}<br />
            <span style={{ fontSize: 18 }}>{z.points} pts</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── SCORE DISPLAY ────────────────────────────────────────────────────────────
function ThrowDots({ throws, maxThrows, onEdit, isAdmin }) {
  const isTablet = useTablet();
  return (
    <div style={{ display: "flex", gap: isTablet ? 10 : 6, flexWrap: "wrap" }}>
      {Array.from({ length: maxThrows }).map((_, i) => {
        const t = throws[i];
        const bg = t == null ? "#2a2a2a" : t.points === 7 ? "#e63946" : t.points === 5 ? "#111" : t.points === 3 ? RED : t.points === 1 ? BLUE : "#555";
        const border = t == null ? "#444" : t.points >= 5 ? GOLD : "#777";
        return (
          <div
            key={i}
            onClick={() => isAdmin && t != null && onEdit && onEdit(i)}
            style={{
              width: 44, height: 44, borderRadius: 8,
              background: bg, border: `2px solid ${border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: t == null ? "#555" : t.points >= 5 ? GOLD : "#fff",
              fontFamily: "monospace", fontWeight: "bold", fontSize: 16,
              cursor: isAdmin && t != null ? "pointer" : "default",
              transition: "all 0.15s",
              boxShadow: t?.points >= 5 ? `0 0 8px ${GOLD}66` : "none",
            }}
            title={t ? `${t.label} - ${t.points} pts${isAdmin ? " (click to edit)" : ""}` : "Not thrown"}
          >
            {t == null ? "·" : t.points}
          </div>
        );
      })}
    </div>
  );
}

// ─── MATCH SCREEN ─────────────────────────────────────────────────────────────
function MatchScreen({ match, players, settings, onComplete, isAdmin, onBack }) {
  const isTablet = useTablet();
  const maxThrows = settings.throwsPerPlayer || 5;
  const maxRounds = settings.roundsPerMatch || 1;
  // Solo mode: p1 is null — solo seeding throw, only player 0 throws
  const isSolo = !match.p1;

  const [round, setRound] = useState(0);
  const [currentPlayer, setCurrentPlayer] = useState(0); // 0 or 1
  const [scores, setScores] = useState(
    // scores[round][player] = array of throws
    Array.from({ length: maxRounds }, () => [[], []])
  );
  const [phase, setPhase] = useState("playing"); // playing | overtime | done | confirm
  const [overtimeScores, setOvertimeScores] = useState([]); // [p0score, p1score] per round
  const [editTarget, setEditTarget] = useState(null); // {round, player, throwIdx}
  const [message, setMessage] = useState("");
  const [pendingRoundResult, setPendingRoundResult] = useState(null); // {s0, s1, fromOT}
  const [matchWinner, setMatchWinner] = useState(null); // player id of winner, for banner
  const [showWinnerBanner, setShowWinnerBanner] = useState(false);

  const p0 = players.find(p => p.id === match.p0) || { id: match.p0, name: "Deleted Player" };
  const p1 = match.p1 ? (players.find(p => p.id === match.p1) || { id: match.p1, name: "Deleted Player" }) : null;

  const curThrows = scores[round]?.[currentPlayer] || [];
  const throwsDone = curThrows.length >= maxThrows;

  // In solo mode, done when player 0 has thrown maxThrows
  // In normal mode, both players must finish
  const soloRoundDone = isSolo && scores[round]?.[0]?.length >= maxThrows;
  const bothDone = !isSolo && scores[round]?.[0]?.length >= maxThrows && scores[round]?.[1]?.length >= maxThrows;

  // ── Executioner's Rule state — must be declared before handleScore uses it ──
  const [executionerRule, setExecutionerRule] = useState(null); // null | { winnerIdx, loserIdx, s0, s1 }
  const [executionerPhase, setExecutionerPhase] = useState("vote"); // "vote" | "mercy" | "celeb_mercy" | "celeb_timber"

  // Is this match in elimination bracket only (not seeding, not league)?
  const isElimMatch = !!match.tournamentId && match.matchType !== "seeding" && !match.leagueId;

  // Max pts still scoreable per throw
  const MAX_PER_THROW = 7; // nipple

  const handleScore = (zone) => {
    if (phase !== "playing") return;
    if (throwsDone) return;

    // Build the new scores array first so we can inspect it
    const newScores = scores.map(r => r.map(p => [...p]));
    newScores[round][currentPlayer].push(zone);
    setScores(newScores);

    if (!isSolo) {
      // Advance turn between players
      const p0Done = newScores[round][0].length >= maxThrows;
      const p1Done = newScores[round][1].length >= maxThrows;
      if (!p0Done || !p1Done) {
        setCurrentPlayer(p0Done ? 1 : p1Done ? 0 : currentPlayer === 0 ? 1 : 0);
      }

      // ── Executioner's Rule: check if gap is now mathematically unreachable (last round only) ──
      if (isElimMatch && !executionerRule && round === maxRounds - 1) {
        const p0throws = newScores[round][0];
        const p1throws = newScores[round][1];
        const s0 = totalScore(p0throws);
        const s1 = totalScore(p1throws);
        const p0remaining = maxThrows - p0throws.length;
        const p1remaining = maxThrows - p1throws.length;
        // Only trigger if at least one player still has throws left — otherwise round ends normally
        if (p0remaining > 0 || p1remaining > 0) {
          const p1maxPossible = s1 + (p1remaining * MAX_PER_THROW);
          const p0maxPossible = s0 + (p0remaining * MAX_PER_THROW);
          const p0unreachable = s0 > p1maxPossible && s0 > s1;
          const p1unreachable = s1 > p0maxPossible && s1 > s0;
          if (p0unreachable || p1unreachable) {
            const winnerIdx = p0unreachable ? 0 : 1;
            const loserIdx = p0unreachable ? 1 : 0;
            setExecutionerRule({ winnerIdx, loserIdx, s0, s1 });
            setExecutionerPhase("vote");
          }
        }
      }
    }
  };

  // Watch for solo round completion
  useEffect(() => {
    if (!soloRoundDone || phase !== "playing") return;
    if (round + 1 >= maxRounds) {
      const soloTotal = scores.reduce((s, r) => s + totalScore(r[0] || []), 0);
      setPhase("confirm");
      setMessage(`✅ Seeding done! ${p0.name}: ${soloTotal} pts — confirm to continue`);
      setPendingRoundResult({ solo: true, soloTotal });
    } else {
      setRound(r => r + 1);
    }
  }, [soloRoundDone, round]);

  // Watch for normal round completion
  useEffect(() => {
    if (isSolo || !bothDone || phase !== "playing") return;
    // If executioner rule already triggered mid-round, don't double-advance
    if (executionerRule) return;
    const s0 = totalScore(scores[round][0]);
    const s1 = totalScore(scores[round][1]);
    if (s0 === s1) {
      setMessage(`🪓 TIE! DEATH MATCH OVERTIME — One throw each! 🪓`);
      setPhase("overtime");
      setCurrentPlayer(0);
    } else {
      advanceRound(s0, s1);
    }
  }, [bothDone, round, executionerRule]);

  const [overtimeThrows, setOvertimeThrows] = useState([null, null]);
  const [editOTThrow, setEditOTThrow] = useState(null); // null | 0 | 1 — which OT throw slot is being edited
  const [otThrowCount, setOtThrowCount] = useState(0); // how many OT throw attempts so far
  const [matchOTPhase, setMatchOTPhase] = useState("round"); // "round" | "match"
  const [otThrowsLog, setOtThrowsLog] = useState([]); // all OT throws recorded for history
  const [executionerThrow, setExecutionerThrow] = useState(null); // {playerId, throw, result, roundIdx}

  const handleOvertimeScore = (zone) => {
    if (phase !== "overtime" && phase !== "match_overtime") return;
    const isMatchOT = phase === "match_overtime";
    const playerIdx = currentPlayer;
    setOvertimeThrows(prev => {
      const next = [...prev];
      next[playerIdx] = zone;
      if (playerIdx === 0) {
        setCurrentPlayer(1);
      } else {
        setTimeout(() => isMatchOT ? resolveMatchOvertime(next) : resolveOvertime(next), 100);
      }
      return next;
    });
  };

  const resolveOvertime = (ot) => {
    const s0 = ot[0]?.points ?? 0;
    const s1 = ot[1]?.points ?? 0;
    if (s0 === s1) {
      setOtThrowsLog(prev => [...prev, { p0throw: ot[0], p1throw: ot[1], type: "round", tied: true, roundIdx: round }]);
      setOtThrowCount(c => c + 1);
      setMessage("🪓 Still tied! Another Death Match throw! 🪓");
      setOvertimeThrows([null, null]);
      setEditOTThrow(null);
      setCurrentPlayer(0);
    } else {
      setOtThrowsLog(prev => [...prev, { p0throw: ot[0], p1throw: ot[1], type: "round", roundIdx: round }]);
      setMessage(s0 > s1 ? `${p0.name} wins the overtime!` : `${p1.name} wins the overtime!`);
      advanceRound(s0, s1, true);
    }
  };

  const resolveMatchOvertime = (ot) => {
    const s0 = ot[0]?.points ?? 0;
    const s1 = ot[1]?.points ?? 0;
    if (s0 === s1) {
      setOtThrowsLog(prev => [...prev, { p0throw: ot[0], p1throw: ot[1], type: "match", tied: true, roundIdx: null }]);
      setOtThrowCount(c => c + 1);
      setMessage("🪓 Still tied! Another Death Match throw! 🪓");
      setOvertimeThrows([null, null]);
      setEditOTThrow(null);
      setCurrentPlayer(0);
    } else {
      setOtThrowsLog(prev => [...prev, { p0throw: ot[0], p1throw: ot[1], type: "match", roundIdx: null }]);
      const winnerPlayerId = s0 > s1 ? match.p0 : match.p1;
      const winnerName = s0 > s1 ? p0.name : p1?.name;
      const w0 = s0 > s1 ? 1 : 0;
      const w1 = s0 > s1 ? 0 : 1;
      setMessage(`🏆 ${winnerName} wins the match!`);
      setPhase("confirm");
      setOtThrowCount(0);
      setPendingRoundResult({ isMatchOT: true, winnerPlayerId, w0, w1 });
    }
  };

  const advanceRound = (s0, s1, fromOT = false, fromExecutioner = false) => {
    setOvertimeThrows([null, null]);
    // Show confirm screen instead of immediately advancing
    const winnerIdx = s0 > s1 ? 0 : 1;
    const loserIdx = winnerIdx === 0 ? 1 : 0;
    const winnerPlayerId = winnerIdx === 0 ? match.p0 : match.p1;
    const winnerName = winnerIdx === 0 ? p0.name : p1?.name;
    const loserName  = loserIdx  === 0 ? p0.name : p1?.name;
    const msg = fromExecutioner
      ? `💀 ${loserName} is Outta Here! ${winnerName} moves on!`
      : fromOT
      ? `🪓 ${winnerName} wins overtime! (${s0} - ${s1})`
      : `Round ${round + 1}: ${winnerName} wins! (${s0} - ${s1})`;
    setMessage(msg);
    setPhase("confirm");
    setOtThrowCount(0);
    setPendingRoundResult({ s0, s1, fromOT, winnerIdx, winnerPlayerId });
  };

  const confirmRound = () => {
    if (!pendingRoundResult) return;
    const res = pendingRoundResult;
    setPendingRoundResult(null);
    if (res.isMatchOT) {
      // Match-level OT decided the winner — finalize
      setPhase("playing");
      finishMatch(res.winnerPlayerId, res.w0, res.w1);
      return;
    }
    if (res.solo) {
      // Solo seeding — no winner, just record throws
      setPhase("done");
      onComplete && onComplete({
        matchId: match.id,
        winner: null,
        scores,
        p0rounds: 0,
        p1rounds: 0,
        solo: true,
      });
      return;
    }
    // Check if this is the last round
    if (round + 1 >= maxRounds) {
      // Tally round wins — use actual scores from completed rounds
      // For rounds 0..round-1: read from scores array
      // For the current round (round): use res.s0/res.s1 (already computed, avoids stale state)
      let w0 = 0, w1 = 0;
      for (let ri = 0; ri < round; ri++) {
        const s0 = totalScore(scores[ri][0]);
        const s1 = totalScore(scores[ri][1]);
        if (s0 > s1) w0++;
        else if (s1 > s0) w1++;
      }
      // Current round result from pendingRoundResult (most reliable — passed directly from round completion)
      if (res.fromOT) {
        if (res.winnerIdx === 0) w0++; else w1++;
      } else if (res.fromExecutioner) {
        if (res.winnerIdx === 0) w0++; else w1++;
      } else {
        // Use res.s0 and res.s1 which are the actual scores passed to advanceRound
        if (res.s0 > res.s1) w0++;
        else if (res.s1 > res.s0) w1++;
      }
      if (w0 === w1) {
        // Overall match tie — trigger match-level death match!
        setPhase("match_overtime");
        setMatchOTPhase("match");
        setOvertimeThrows([null, null]);
        setCurrentPlayer(0);
        setMessage("🪓🪓 MATCH TIED! Overall Death Match — one throw each!");
      } else {
        finishMatch(res.fromOT ? res.winnerPlayerId : null, w0, w1);
      }
    } else {
      setPhase("playing");
      setRound(r => r + 1);
      setCurrentPlayer(0);
      setMessage("");
    }
  };

  const finishMatch = (otWinner = null, w0override = null, w1override = null) => {
    // Tally rounds won by score (unless overridden)
    let w0 = 0, w1 = 0;
    scores.forEach(r => {
      const s0 = totalScore(r[0]);
      const s1 = totalScore(r[1]);
      if (s0 > s1) w0++;
      else if (s1 > s0) w1++;
    });
    if (w0override !== null) w0 = w0override;
    if (w1override !== null) w1 = w1override;
    const winner = otWinner || (w0 > w1 ? match.p0 : w1 > w0 ? match.p1 : null);
    const winnerName = winner === match.p0 ? p0.name : p1?.name;
    setPhase("done");
    setMessage(winner ? `🏆 ${winnerName} wins the match!` : "Match complete! Overall tie.");
    if (winner && !match.tournamentId && !match.leagueId) {
      setMatchWinner(winnerName);
      setShowWinnerBanner(true);
    }
    onComplete && onComplete({ matchId: match.id, winner, scores, p0rounds: w0, p1rounds: w1, otThrowsLog, executionerThrow });
  };

  const handleEditThrow = (rnd, plyr, throwIdx) => {
    if (!isAdmin) return;
    setEditTarget({ round: rnd, player: plyr, throwIdx });
  };

  const handleEditScore = (zone) => {
    if (editOTThrow !== null) {
      // Editing an OT throw — update and re-resolve if both filled
      const next = [...overtimeThrows];
      next[editOTThrow] = zone;
      setOvertimeThrows(next);
      setEditOTThrow(null);
      // If both throws are now filled, re-resolve
      if (next[0] != null && next[1] != null) {
        const isMatchOT = phase === "match_overtime";
        setTimeout(() => isMatchOT ? resolveMatchOvertime(next) : resolveOvertime(next), 100);
      }
      return;
    }
    if (!editTarget) return;
    setScores(prev => {
      const next = prev.map(r => r.map(p => [...p]));
      next[editTarget.round][editTarget.player][editTarget.throwIdx] = zone;
      // After edit, re-check if round is fully complete and re-trigger confirm
      const editedRound = editTarget.round;
      const roundScores = next[editedRound];
      const p0done = roundScores[0]?.length >= maxThrows;
      const p1done = isSolo || roundScores[1]?.length >= maxThrows;
      if (p0done && p1done && phase === "playing") {
        const s0 = totalScore(roundScores[0]);
        const s1 = isSolo ? 0 : totalScore(roundScores[1]);
        setTimeout(() => {
          if (isSolo) {
            const soloTotal = next.reduce((s, r) => s + totalScore(r[0] || []), 0);
            setPhase("confirm");
            setMessage(`✅ Seeding done! ${p0.name}: ${soloTotal} pts — confirm to continue`);
            setPendingRoundResult({ solo: true, soloTotal });
          } else if (s0 !== s1) {
            advanceRound(s0, s1);
          } else {
            setMessage(`🪓 TIE! DEATH MATCH OVERTIME — One throw each! 🪓`);
            setPhase("overtime");
            setCurrentPlayer(0);
          }
        }, 50);
      }
      return next;
    });
    setEditTarget(null);
  };

  const curP = currentPlayer === 0 ? p0 : (p1 || p0);

  // Shared content blocks (used in both phone and tablet layouts)
  const headerBlock = (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <button onClick={onBack} style={btnStyle("#333")}>← Back</button>
      <h2 style={{ color: GOLD, fontFamily: "serif", margin: 0, fontSize: isTablet ? 26 : 20, flex: 1 }}>
        {isSolo ? `${p0.name} — Seeding` : `${p0.name} vs ${p1?.name}`}
      </h2>
    </div>
  );

  const roundTabs = (
    <div style={{ display: "flex", gap: 8 }}>
      {Array.from({ length: maxRounds }).map((_, i) => (
        <div key={i} style={{
          padding: isTablet ? "6px 18px" : "4px 12px", borderRadius: 6,
          background: i === round ? GOLD : "#222",
          color: i === round ? DARK : "#888",
          fontFamily: "monospace", fontWeight: "bold", fontSize: isTablet ? 15 : 13,
        }}>R{i + 1}</div>
      ))}
    </div>
  );

  const soloBlock = isSolo && (
    <div style={{ background: "#1a1a00", border: `1px solid ${GOLD}66`, borderRadius: 8, padding: "8px 12px", color: "#aaa", fontFamily: "monospace", fontSize: isTablet ? 15 : 13 }}>
      🎯 Solo seeding round — throw {maxThrows} times to earn your seed score
    </div>
  );

  const scoreBoard = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {(isSolo ? [p0] : [p0, p1 ?? p0]).filter((p,i) => !isSolo || i===0).map((p, pi) => (
        <div key={pi} style={{
          background: PANEL, border: `2px solid ${currentPlayer === pi && phase === "playing" ? GOLD : BORDER}`,
          borderRadius: 10, padding: isTablet ? 16 : 12,
          boxShadow: currentPlayer === pi && phase === "playing" ? `0 0 12px ${GOLD}55` : "none",
          transition: "all 0.2s",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ color: currentPlayer === pi && phase === "playing" ? GOLD : "#ccc", fontFamily: "monospace", fontWeight: "bold", fontSize: isTablet ? 20 : 16 }}>
              {currentPlayer === pi && phase === "playing" ? "🪓 " : ""}{p.name}
            </span>
            <div style={{ display: "flex", gap: 12 }}>
              {Array.from({ length: maxRounds }).map((_, ri) => (
                <span key={ri} style={{ color: ri === round ? GOLD : "#666", fontFamily: "monospace", fontSize: isTablet ? 15 : 13 }}>
                  R{ri + 1}: <strong style={{ color: "#fff" }}>{totalScore(scores[ri]?.[pi] || [])}</strong>
                </span>
              ))}
              <span style={{ color: "#aaa", fontFamily: "monospace", fontSize: isTablet ? 15 : 13 }}>
                Total: <strong style={{ color: GOLD }}>{scores.reduce((s, r) => s + totalScore(r[pi] || []), 0)}</strong>
              </span>
            </div>
          </div>
          <ThrowDots throws={scores[round]?.[pi] || []} maxThrows={maxThrows} onEdit={(ti) => handleEditThrow(round, pi, ti)} isAdmin={isAdmin} />
        </div>
      ))}
    </div>
  );

  const messageBlock = message && phase !== "confirm" && (
    <div style={{ background: "#1a1400", border: `2px solid ${GOLD}`, borderRadius: 8, padding: isTablet ? 16 : 12, color: GOLD, fontFamily: "monospace", textAlign: "center", fontSize: isTablet ? 17 : 15 }}>
      {message}
    </div>
  );

  // ── Executioner's Rule Banner ──
  const executionerBanner = executionerRule && (() => {
    const winnerName = executionerRule.winnerIdx === 0 ? p0.name : p1?.name;
    const loserName  = executionerRule.loserIdx  === 0 ? p0.name : p1?.name;
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(0,0,0,0.96)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", textAlign: "center", padding: "0 20px",
      }}>
        <style>{`
          @keyframes flashMercy { 0%,100%{box-shadow:0 0 0 0 transparent} 50%{box-shadow:0 0 0 6px #4f4} }
          @keyframes flashTimber { 0%,100%{box-shadow:0 0 0 0 transparent} 50%{box-shadow:0 0 0 6px #c1121f} }
          @keyframes exFadeIn { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
          @keyframes floatUp { 0%{transform:translateY(110vh) rotate(0deg);opacity:0} 10%{opacity:1} 85%{opacity:1} 100%{transform:translateY(-20vh) rotate(540deg);opacity:0} }
          @keyframes celebFade { 0%{opacity:0;transform:scale(0.5)} 15%{opacity:1;transform:scale(1.1)} 100%{opacity:1;transform:scale(1)} }
        `}</style>

        {executionerPhase === "vote" && (
          <div style={{ animation: "exFadeIn 0.4s ease both" }}>
            <div style={{ fontSize: 56, marginBottom: 8 }}>⚔️</div>
            <div style={{ color: RED, fontFamily: "Georgia, serif", fontSize: isTablet ? 36 : 28,
              fontWeight: "bold", letterSpacing: 2, marginBottom: 4,
              textShadow: "0 0 20px #c1121f, 0 0 40px #c1121f88" }}>
              Executioner's Rule!
            </div>
            <div style={{ color: "#aaa", fontFamily: "monospace", fontSize: 13, marginBottom: 6 }}>
              {loserName} is out of reach — the crowd decides!
            </div>
            <div style={{ color: "#555", fontFamily: "monospace", fontSize: 12, marginBottom: 28 }}>
              {winnerName} {executionerRule.s0 > executionerRule.s1 ? executionerRule.s0 : executionerRule.s1} pts
              &nbsp;·&nbsp;
              {loserName} {executionerRule.s0 > executionerRule.s1 ? executionerRule.s1 : executionerRule.s0} pts
            </div>
            <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
              {/* Mercy */}
              <button onClick={() => setExecutionerPhase("celeb_mercy")} style={{
                background: "#0d1f0d", border: "3px solid #4f4", borderRadius: 16,
                padding: isTablet ? "28px 36px" : "20px 24px", cursor: "pointer",
                animation: "flashMercy 1.2s ease-in-out infinite",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
              }}>
                <span style={{ fontSize: isTablet ? 56 : 44 }}>👍</span>
                <span style={{ color: "#4f4", fontFamily: "Georgia, serif",
                  fontSize: isTablet ? 22 : 18, fontWeight: "bold" }}>Mercy!</span>
              </button>
              {/* Timber-geddon */}
              <button onClick={() => {
                setExecutionerPhase("celeb_timber");
              }} style={{
                background: "#1f0d0d", border: "3px solid #c1121f", borderRadius: 16,
                padding: isTablet ? "28px 36px" : "20px 24px", cursor: "pointer",
                animation: "flashTimber 1.2s ease-in-out infinite 0.6s",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
              }}>
                <span style={{ fontSize: isTablet ? 56 : 44 }}>👎</span>
                <span style={{ color: RED, fontFamily: "Georgia, serif",
                  fontSize: isTablet ? 22 : 18, fontWeight: "bold" }}>Timber-geddon!</span>
              </button>
            </div>
          </div>
        )}

        {(executionerPhase === "celeb_mercy" || executionerPhase === "celeb_timber") && (() => {
          const isMercy = executionerPhase === "celeb_mercy";
          const emoji = isMercy ? "👎" : "👍";
          const label = isMercy ? "Mercy!" : "Timber-geddon!";
          const color = isMercy ? "#4f4" : RED;
          const emojis = Array.from({ length: 18 }, (_, i) => i);
          return (
            <div style={{ position: "relative", width: "100%", height: "100%", display: "flex",
              alignItems: "center", justifyContent: "center", flexDirection: "column",
              overflow: "hidden", gap: 32 }}>
              {/* Floating emojis — no delay, start immediately */}
              {emojis.map(i => (
                <span key={i} style={{
                  position: "absolute",
                  left: `${(i / 18) * 100}%`,
                  bottom: 0,
                  fontSize: `${28 + (i % 3) * 12}px`,
                  animation: `floatUp ${2.5 + (i % 5) * 0.4}s ease-in-out ${-(i * 0.37)}s infinite`,
                  pointerEvents: "none",
                }}>{emoji}</span>
              ))}
              {/* Big center text */}
              <div style={{
                color, fontFamily: "Georgia, serif",
                fontSize: isTablet ? 80 : 56, fontWeight: "bold",
                textShadow: `0 0 40px ${color}, 0 0 80px ${color}88`,
                animation: "celebFade 0.6s ease both",
                zIndex: 10, textAlign: "center",
              }}>{label}</div>
              {/* Confirm button */}
              <button
                onClick={() => {
                  if (isMercy) {
                    setExecutionerPhase("mercy");
                  } else {
                    const er = executionerRule;
                    const loser = er.loserIdx === 0 ? match.p0 : match.p1;
                    setExecutionerThrow({ playerId: loser, result: "timber", roundIdx: round });
                    setExecutionerRule(null);
                    advanceRound(er.s0, er.s1, false, true);
                  }
                }}
                style={{
                  zIndex: 10, background: isMercy ? "#0d1f0d" : "#1f0d0d",
                  border: `3px solid ${color}`, borderRadius: 16,
                  padding: "16px 36px", cursor: "pointer",
                  color, fontFamily: "Georgia, serif", fontSize: isTablet ? 22 : 18,
                  fontWeight: "bold",
                }}>
                {isMercy ? "👍 Confirm Mercy!" : "👎 Confirm Timber-geddon!"}
              </button>
              {/* Go back button */}
              <button
                onClick={() => setExecutionerPhase("vote")}
                style={{
                  zIndex: 10, background: "#222", border: "1px solid #555",
                  borderRadius: 10, padding: "10px 24px", cursor: "pointer",
                  color: "#888", fontFamily: "monospace", fontSize: 13,
                }}>
                ← Go Back
              </button>
            </div>
          );
        })()}

        {executionerPhase === "mercy" && (
          <div style={{ animation: "exFadeIn 0.3s ease both" }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>🪓</div>
            <div style={{ color: GOLD, fontFamily: "Georgia, serif", fontSize: isTablet ? 28 : 22,
              fontWeight: "bold", marginBottom: 6 }}>
              Mercy granted!
            </div>
            <div style={{ color: "#ccc", fontFamily: "monospace", fontSize: 14, marginBottom: 6 }}>
              {loserName} gets one last throw
            </div>
            <div style={{ color: "#888", fontFamily: "monospace", fontSize: 12, marginBottom: 28 }}>
              Hit a nipple to tie — go straight to Death Match!
            </div>
            <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
              {/* Nipple hit */}
              <button onClick={() => {
                const execLoser = executionerRule.loserIdx === 0 ? match.p0 : match.p1;
                setExecutionerThrow({ playerId: execLoser, throw: { id: "nipple_tl", points: 7, label: "Nipple" }, result: "mercy", roundIdx: round });
                setExecutionerRule(null);
                // Nipple hit — fresh death match, both players throw normally
                setMessage("🎯 Nipple hit! FRESH DEATH MATCH — both players throw! 🪓");
                setOvertimeThrows([null, null]);
                setOtThrowCount(0);
                setCurrentPlayer(0);
                setPhase("overtime");
              }} style={{
                background: "#1a0d1a", border: "3px solid #e63946", borderRadius: 16,
                padding: isTablet ? "28px 36px" : "20px 24px", cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
              }}>
                <span style={{ fontSize: isTablet ? 56 : 44 }}>🎯</span>
                <span style={{ color: "#e63946", fontFamily: "Georgia, serif",
                  fontSize: isTablet ? 20 : 16, fontWeight: "bold" }}>Nipple Hit!</span>
              </button>
              {/* Nipple missed */}
              <button onClick={() => {
                const er = executionerRule;
                const execLoser = er.loserIdx === 0 ? match.p0 : match.p1;
                setExecutionerThrow({ playerId: execLoser, result: "missed", roundIdx: round });
                setExecutionerRule(null);
                advanceRound(er.s0, er.s1, false, true);
              }} style={{
                background: "#1f0d0d", border: "3px solid #555", borderRadius: 16,
                padding: isTablet ? "28px 36px" : "20px 24px", cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
              }}>
                <span style={{ fontSize: isTablet ? 56 : 44 }}>💨</span>
                <span style={{ color: "#888", fontFamily: "Georgia, serif",
                  fontSize: isTablet ? 20 : 16, fontWeight: "bold" }}>Nipple Missed!</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  })();

  const confirmBlock = phase === "confirm" && (
    <div style={{ background: "#0d1a0d", border: `2px solid ${GOLD}`, borderRadius: 12, padding: isTablet ? 28 : 20, textAlign: "center" }}>
      <div style={{ color: GOLD, fontFamily: "monospace", fontSize: isTablet ? 20 : 16, marginBottom: 8, fontWeight: "bold" }}>✅ Round Complete</div>
      <div style={{ color: "#ccc", fontFamily: "monospace", fontSize: isTablet ? 16 : 14, marginBottom: 12 }}>{message}</div>
      <div style={{ color: "#777", fontFamily: "monospace", fontSize: isTablet ? 14 : 12, marginBottom: 16 }}>Tap any throw dot above to correct a score, then confirm.</div>
      {isAdmin && (
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => {
              // If the round was decided by OT, go back to overtime so OT dots are editable
              // Otherwise go back to playing so regular throw dots are editable
              const wasOT = pendingRoundResult?.fromOT;
              setPhase(wasOT ? "overtime" : "playing");
              setCurrentPlayer(wasOT ? 2 : 0); // 2 = both thrown, show dots but don't advance
              setPendingRoundResult(null);
              setMessage(wasOT ? "✏️ Edit the Death Match throws below, then re-score" : "");
            }}
            style={{ ...btnStyle("#333"), border: "1px solid #555", fontSize: isTablet ? 16 : 14, padding: isTablet ? "14px 24px" : "10px 18px", width: "auto" }}>
            ✏️ Go Back &amp; Edit
          </button>
          <button onClick={confirmRound} style={{ ...btnStyle(GOLD, DARK), fontSize: isTablet ? 20 : 16, padding: isTablet ? "18px 32px" : "14px 24px" }}>
            ✅ Confirm & Continue →
          </button>
        </div>
      )}
      {!isAdmin && <div style={{ color: "#888", fontFamily: "monospace", fontSize: 13 }}>Waiting for admin to confirm...</div>}
    </div>
  );

  const otDotStyle = (val, isActive, isEditing) => ({
    width: 44, height: 44, borderRadius: 8,
    background: val != null ? (val.points === 7 ? "#e63946" : val.points === 5 ? "#111" : val.points === 3 ? RED : val.points === 1 ? BLUE : "#555")
      : isActive ? "#1a1a1a" : "#111",
    border: `2px solid ${isEditing ? "#fff" : val != null ? (val.points >= 5 ? GOLD : "#777") : isActive ? "#555" : "#2a2a2a"}`,
    display: "flex", alignItems: "center", justifyContent: "center",
    color: val != null ? (val.points >= 5 ? GOLD : "#fff") : isActive ? "#555" : "#333",
    fontFamily: "monospace", fontWeight: "bold", fontSize: 16,
    cursor: isAdmin && (val != null || isEditing) ? "pointer" : "default",
    opacity: isActive ? 1 : 0.4,
    transition: "all 0.15s",
  });

  const overtimeBlock = (phase === "overtime" || phase === "match_overtime") && (
    <div>
      <div style={{ color: RED, fontFamily: "monospace", marginBottom: 10, textAlign: "center", fontWeight: "bold" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: isTablet ? 28 : 22, marginBottom: 4 }}>
          <span style={{ display: "inline-block", transform: "scaleX(-1)" }}>🪓</span>
          <span style={{ fontSize: isTablet ? 16 : 13, letterSpacing: 2, color: RED }}>
            {phase === "match_overtime" ? "MATCH DEATH MATCH" : "DEATH MATCH OVERTIME"}
            {otThrowCount > 0 && <span style={{ color: "#ff8888", fontSize: 11, marginLeft: 8 }}>throw #{otThrowCount + 1}</span>}
          </span>
          <span style={{ display: "inline-block", transform: "scaleX(-1)" }}>🪓</span>
        </div>
        <div style={{ fontSize: isTablet ? 16 : 14, color: "#ffaaaa", marginBottom: 10 }}>
          {editOTThrow !== null
            ? `Editing ${editOTThrow === 0 ? p0.name : p1?.name}'s OT throw — tap target`
            : `${currentPlayer === 0 ? p0.name : p1?.name}'s throw`}
        </div>
        {/* OT throw dots — greyed until active, editable once thrown */}
        <div style={{ display: "flex", justifyContent: "center", gap: 24 }}>
          {[p0, p1].filter(Boolean).map((p, pi) => {
            const val = overtimeThrows[pi];
            const isActive = pi === 0
              ? (overtimeThrows[0] == null || overtimeThrows[1] == null)
              : overtimeThrows[0] != null;
            const isEditing = editOTThrow === pi;
            return (
              <div key={pi} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#888", fontSize: 11, fontFamily: "monospace" }}>{p.name}</span>
                <div
                  onClick={() => isAdmin && val != null && !isEditing ? setEditOTThrow(pi) : null}
                  style={otDotStyle(val, isActive, isEditing)}
                  title={val ? `${val.points} pts${isAdmin ? " — tap to edit" : ""}` : "Not thrown yet"}
                >
                  {val == null ? "·" : val.points}
                </div>
                {isEditing && <span style={{ color: "#fff", fontSize: 10, fontFamily: "monospace" }}>tap target ↑</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // matchOTBlock merged into overtimeBlock above

  const doneBlock = phase === "done" && (
    <div style={{ textAlign: "center" }}>
      <div style={{ color: GOLD, fontFamily: "monospace", fontSize: isTablet ? 24 : 18, marginBottom: 12 }}>🏆 Match Complete!</div>
    </div>
  );

  const activeTarget = editTarget || editOTThrow !== null
    ? <AxeTarget onScore={handleEditScore} disabled={false} />
    : (phase === "playing" && (isSolo ? !soloRoundDone : !bothDone))
    ? <AxeTarget onScore={handleScore} disabled={false} />
    : (phase === "overtime" || phase === "match_overtime")
    ? <AxeTarget onScore={handleOvertimeScore} disabled={false} />
    : null;

  const throwLabel = (phase === "playing" && (isSolo ? !soloRoundDone : !bothDone)) && (
    <div style={{ color: "#aaa", fontFamily: "monospace", marginBottom: 8, textAlign: "center", fontSize: isTablet ? 16 : 14 }}>
      Throw {curThrows.length + 1} of {maxThrows} — <span style={{ color: GOLD, fontWeight: "bold" }}>{curP.name}</span>'s turn
    </div>
  );

  return (
    <div style={{ padding: isTablet ? 24 : 16, maxWidth: isTablet ? 1000 : 500, margin: "0 auto" }}>
      {isTablet && activeTarget ? (
        // ── TABLET: two-column layout ──────────────────────────────────────
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {headerBlock}
          {roundTabs}
          <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
            {/* Left: scores, messages, confirm */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
              {soloBlock}
              {scoreBoard}
              {messageBlock}
              {confirmBlock}
              {overtimeBlock}
              {doneBlock}
            </div>
            {/* Right: target + throw label */}
            <div style={{ width: 500, flexShrink: 0 }}>
              {throwLabel}
              {activeTarget}
            </div>
          </div>
        </div>
      ) : (
        // ── PHONE: single column layout ───────────────────────────────────
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {headerBlock}
          {roundTabs}
          {soloBlock}
          {scoreBoard}
          {messageBlock}
          {confirmBlock}
          {overtimeBlock}
          {(phase === "playing" && (isSolo ? !soloRoundDone : !bothDone)) && (
            <div>
              {throwLabel}
              {activeTarget}
            </div>
          )}
          {(phase === "overtime" || phase === "match_overtime") && activeTarget}
          {doneBlock}
        </div>
      )}

      {showWinnerBanner && matchWinner && (
        <ChampionBanner name={matchWinner} subtitle="Golden Axe Match Winner"
          onGoBack={() => {
            setShowWinnerBanner(false);
            setPhase("playing");
            setRound(maxRounds - 1);
            setCurrentPlayer(0);
            setMessage("");
          }}
          onClose={() => {
            setShowWinnerBanner(false);
            onBack();
          }} />
      )}

      {/* Executioner's Rule Banner */}
      {executionerBanner}

      {/* Edit modal */}
      {editTarget && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100
        }}>
          <div style={{ background: PANEL, border: `2px solid ${GOLD}`, borderRadius: 12, padding: 24, maxWidth: 400, width: "90%" }}>
            <h3 style={{ color: GOLD, fontFamily: "monospace", marginTop: 0 }}>Edit Throw Score</h3>
            <p style={{ color: "#aaa", fontFamily: "monospace" }}>
              Round {editTarget.round + 1}, {editTarget.player === 0 ? p0.name : p1?.name ?? p0.name}, Throw {editTarget.throwIdx + 1}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ZONES.map(z => (
                <button key={z.id} onClick={() => handleEditScore({ id: z.id, points: z.points, label: z.label })}
                  style={{ ...btnStyle(z.color), justifyContent: "space-between", display: "flex" }}>
                  <span>{z.label}</span><span>{z.points} pts</span>
                </button>
              ))}
            </div>
            <button onClick={() => setEditTarget(null)} style={{ ...btnStyle("#444"), marginTop: 12, width: "100%" }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PLAYER STATS ─────────────────────────────────────────────────────────────
function exportStats(players, allMatches) {
  const rows = ["Player,Matches,Wins,Losses,Total Points,Avg Points,Nipples,Bullseyes"];
  players.forEach(p => {
    const ms = allMatches.filter(m => m.p0 === p.id || m.p1 === p.id);
    const wins = ms.filter(m => m.winner === p.id).length;
    const losses = ms.length - wins;
    let total = 0, nipples = 0, bullseyes = 0;
    ms.forEach(m => {
      const pi = m.p0 === p.id ? 0 : 1;
      (m.scores || []).forEach(r => {
        (r[pi] || []).forEach(t => {
          total += t.points;
          if (t.id?.startsWith("nipple")) nipples++;
          if (t.id === "bullseye") bullseyes++;
        });
      });
    });
    const avg = ms.length ? (total / ms.length).toFixed(1) : 0;
    rows.push(`${p.name},${ms.length},${wins},${losses},${total},${avg},${nipples},${bullseyes}`);
  });
  const csv = rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "golden_axe_stats.csv"; a.click();
}

// ─── STYLE HELPERS ────────────────────────────────────────────────────────────
// ─── THEME ───────────────────────────────────────────────────────────────────
const ThemeContext = createContext({ dark: true });
const useTheme = () => useContext(ThemeContext);

function getTheme(dark) {
  return dark ? {
    bg:       "#0d0d0d",
    panel:    "#151515",
    panel2:   "#1a1a1a",
    border:   "#2a2a2a",
    text:     "#ffffff",
    subtext:  "#aaaaaa",
    muted:    "#555555",
    inputBg:  "#1a1a1a",
    headerBg: "linear-gradient(135deg, #1a1000, #2a1a00)",
    cardBg:   "#151515",
  } : {
    bg:       "#f0ece4",
    panel:    "#ffffff",
    panel2:   "#f5f0e8",
    border:   "#d0c8b8",
    text:     "#1a1209",
    subtext:  "#5a4a2a",
    muted:    "#9a8a6a",
    inputBg:  "#ffffff",
    headerBg: "linear-gradient(135deg, #3a2000, #5a3400)",
    cardBg:   "#ffffff",
  };
}

const btnStyle = (bg = "#333", fg = "#fff") => ({
  background: bg, color: fg, border: "none", borderRadius: 8,
  padding: "10px 18px", fontFamily: "monospace", fontWeight: "bold",
  fontSize: 14, cursor: "pointer", width: "100%", textAlign: "center",
});

const mkInputStyle = (t) => ({
  background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: 6,
  color: t.text, padding: "8px 12px", fontFamily: "monospace", fontSize: 14,
  width: "100%", boxSizing: "border-box",
});

const mkCardStyle = (t) => ({
  background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, padding: 16,
});

// Legacy aliases used throughout — resolved inside components via useTheme
const inputStyle = mkInputStyle({ inputBg: "#1a1a1a", border: "#2a2a2a", text: "#fff" });
const cardStyle  = mkCardStyle({ cardBg: "#151515", border: "#2a2a2a" });

// ─── CHAMPION BANNER ─────────────────────────────────────────────────────────
function ChampionBanner({ name, subtitle, onClose, onGoBack }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 300,
      background: "rgba(0,0,0,0.92)",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexDirection: "column", textAlign: "center", padding: "0 24px",
    }}>
      <style>{`
        @keyframes fadeInScale{from{opacity:0;transform:scale(0.7)}to{opacity:1;transform:scale(1)}}
        @keyframes spinAxe{from{transform:rotate(0deg)}to{transform:rotate(-360deg)}}
        @keyframes glow{0%,100%{text-shadow:0 0 40px #f0c040,0 0 80px #f0c04088}50%{text-shadow:0 0 80px #f0c040,0 0 140px #f0c040aa}}
      `}</style>
      <div style={{ animation: "fadeInScale 0.6s cubic-bezier(0.34,1.56,0.64,1) both" }}>
        <div style={{ fontSize: 96, marginBottom: 4, display: "inline-block", animation: "spinAxe 1.8s linear infinite", filter: "sepia(1) saturate(5) hue-rotate(5deg) brightness(1.2)" }}>🪓</div>
        <div style={{
          color: "#f0c040", fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: 22, letterSpacing: 6, textTransform: "uppercase",
          marginBottom: 16, textShadow: "0 0 30px #f0c040",
        }}>
          {subtitle || "Golden Axe Tournament Champion"}
        </div>
        <div style={{
          color: "#ffffff", fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: 72, fontWeight: "bold", lineHeight: 1.1,
          animation: "glow 2s ease-in-out infinite", marginBottom: 28, wordBreak: "break-word",
        }}>
          {name}
        </div>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 32 }}>
          {["🥇","🏆","🪓","🎉","🥇"].map((e,i) => (
            <span key={i} style={{ fontSize: 32 }}>{e}</span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          {onGoBack && (
            <button onClick={onGoBack} style={{
              background: "#222", color: "#888", border: "1px solid #555",
              borderRadius: 8, padding: "12px 24px", fontSize: 14,
              fontFamily: "monospace", cursor: "pointer",
            }}>✏️ Go Back &amp; Edit</button>
          )}
          <button onClick={onClose} style={{
            background: "#222", color: "#fff", border: "1px solid #444",
            borderRadius: 8, padding: "12px 36px", fontSize: 16,
            fontFamily: "monospace", cursor: "pointer",
          }}>{onGoBack ? "✅ Confirm" : "Close"}</button>
        </div>
      </div>
    </div>
  );
}

// Generate next bracket round from completed round's winners
function generateNextRound(completedRound) {
  const roundNum = (completedRound[0]?.roundNum ?? 1) + 1;
  const maxSlot = Math.max(...completedRound.map(m => m.slotIndex));
  const winnerBySlot = {};
  completedRound.forEach(m => {
    winnerBySlot[m.slotIndex] = m.completed ? (m.winner || null) : null;
  });
  const slots = [];
  for (let i = 0; i <= maxSlot; i++) slots.push(winnerBySlot[i] ?? null);

  // Collect only real (non-null) players going into next round
  const realPlayers = slots.filter(Boolean);
  // If only 1 real player remains, they are the champion — no more rounds needed
  if (realPlayers.length <= 1) return [];

  const round = [];
  for (let i = 0; i < slots.length; i += 2) {
    const p0 = slots[i] ?? null, p1 = slots[i + 1] ?? null;
    const slotIndex = i / 2;
    if (!p0 && !p1) continue;
    if (p0 && p1) {
      round.push({ id: `r${roundNum}_s${slotIndex}`, p0, p1, roundNum, slotIndex, completed: false, byeMatch: false });
    } else {
      // Only 1 real player in this pair — they auto-advance (bye)
      const winner = p0 || p1;
      round.push({ id: `r${roundNum}_s${slotIndex}`, p0: p0 || null, p1: p1 || null, roundNum, slotIndex, completed: true, winner, byeMatch: true });
    }
  }
  // If all byes again (odd bracket), cascade one more level
  if (round.length > 0 && round.every(m => m.byeMatch) && round.length > 1) {
    return generateNextRound(round);
  }
  return round;
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function GoldenAxeApp({ groupCode, onLeaveGroup }) {
  const isTablet = useTablet();
  const [screen, setScreen] = useState("hub");
  const [darkMode, setDarkMode] = useState(() => load("ga_dark", true));
  const theme = getTheme(darkMode);
  const t = theme;
  useEffect(() => { save("ga_dark", darkMode); }, [darkMode]);

  const [players, setPlayers] = useState(() => load(`ga_players_${groupCode}`, []));
  const [completedMatches, setCompletedMatches] = useState(() => load(`ga_matches_${groupCode}`, []));
  const [activeTournament, setActiveTournament] = useState(() => load(`ga_tournament_${groupCode}`, null));
  const [activeLeague, setActiveLeague] = useState(() => load(`ga_league_${groupCode}`, null));
  const [leagueHistory, setLeagueHistory] = useState(() => load(`ga_league_history_${groupCode}`, []));

  // Firebase sync — write on any state change
  const isSyncingRef = useRef(false); // prevent feedback loops
  const syncTimeout = useRef(null);

  const pushToFirebase = useCallback((overrides = {}) => {
    if (isSyncingRef.current) return;
    // Debounce — wait 500ms after last change before writing
    if (syncTimeout.current) clearTimeout(syncTimeout.current);
    syncTimeout.current = setTimeout(() => {
      writeGroupState(groupCode, {
        players: overrides.players ?? players,
        completedMatches: overrides.completedMatches ?? completedMatches,
        activeTournament: overrides.activeTournament !== undefined ? overrides.activeTournament : activeTournament,
        activeLeague: overrides.activeLeague !== undefined ? overrides.activeLeague : activeLeague,
        leagueHistory: overrides.leagueHistory ?? leagueHistory,
      }).catch(err => console.error("Firebase write error:", err));
    }, 500);
  }, [groupCode, players, completedMatches, activeTournament, activeLeague, leagueHistory]);

  // Subscribe to Firebase on mount
  useEffect(() => {
    if (!groupCode) return;
    const unsub = subscribeToGroup(groupCode, (data) => {
      if (!data) return;
      isSyncingRef.current = true;
      setSynced(true);
      if (data.players) { setPlayers(data.players); save(`ga_players_${groupCode}`, data.players); }
      if (data.completedMatches) { setCompletedMatches(data.completedMatches); save(`ga_matches_${groupCode}`, data.completedMatches); }
      if ("activeTournament" in data) { setActiveTournament(data.activeTournament); save(`ga_tournament_${groupCode}`, data.activeTournament); }
      if ("activeLeague" in data) { setActiveLeague(data.activeLeague); save(`ga_league_${groupCode}`, data.activeLeague); }
      if (data.leagueHistory) { setLeagueHistory(data.leagueHistory); save(`ga_league_history_${groupCode}`, data.leagueHistory); }
      setTimeout(() => { isSyncingRef.current = false; }, 100);
    });
    return unsub;
  }, [groupCode]);

  // Push to Firebase whenever state changes
  useEffect(() => { pushToFirebase({ players }); }, [players]);
  useEffect(() => { pushToFirebase({ completedMatches }); }, [completedMatches]);
  useEffect(() => { pushToFirebase({ activeTournament }); }, [activeTournament]);
  useEffect(() => { pushToFirebase({ activeLeague }); }, [activeLeague]);
  useEffect(() => { pushToFirebase({ leagueHistory }); }, [leagueHistory]);
  const [isAdmin, setIsAdmin] = useState(true);
  const [synced, setSynced] = useState(false); // true once first Firebase data received
  const [adminPin, setAdminPin] = useState(() => load("ga_pin", "1234"));
  const [pinInput, setPinInput] = useState("");
  const [pinModal, setPinModal] = useState(false);
  const [currentMatch, setCurrentMatch] = useState(null);
  const [matchSettings, setMatchSettings] = useState({ throwsPerPlayer: 5, roundsPerMatch: 1 });
  const [subScreen, setSubScreen] = useState(""); // for tournament sub-views
  const [newPlayerName, setNewPlayerName] = useState("");
  const [shareCode, setShareCode] = useState("");
  const [importCode, setImportCode] = useState("");
  const [notification, setNotification] = useState("");
  const [playerTab, setPlayerTab] = useState("all"); // "all" | "members" | "guests"

  // Persist
  // (localStorage writes now happen inside the Firebase subscriber above per group key)

  // One-time migration: re-tag any completedMatches that belong to active tournament
  useEffect(() => {
    if (!activeTournament) return;
    const tid = activeTournament.id;
    const seedIds = new Set((activeTournament.seedingMatches || []).map(m => m.id));
    const bracketIds = new Set((activeTournament.bracket || []).flat().map(m => m.id));
    const needsTag = completedMatches.some(m =>
      (seedIds.has(m.id) || bracketIds.has(m.id)) && !m.tournamentId
    );
    if (needsTag) {
      setCompletedMatches(prev => prev.map(m => {
        if (m.tournamentId) return m;
        if (seedIds.has(m.id)) return { ...m, tournamentId: tid, matchType: "seeding" };
        if (bracketIds.has(m.id)) return { ...m, tournamentId: tid, matchType: m.matchType || "elimination" };
        return m;
      }));
    }
  }, [activeTournament?.id]);
  useEffect(() => { save("ga_league", activeLeague); }, [activeLeague]);
  useEffect(() => { save("ga_league_history", leagueHistory); }, [leagueHistory]);

  const notify = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(""), 3000);
  };

  const [newPlayerIsMember, setNewPlayerIsMember] = useState(false);
  const addPlayer = () => {
    if (!newPlayerName.trim()) return;
    const p = { id: Date.now().toString(), name: newPlayerName.trim(), createdAt: Date.now(), member: newPlayerIsMember };
    setPlayers(prev => [...prev, p]);
    setNewPlayerName("");
  };
  const toggleMember = (id) => setPlayers(prev => prev.map(p => p.id === id ? { ...p, member: !p.member } : p));

  const handleMatchComplete = (result) => {
    const match = { ...currentMatch, ...result, completedAt: Date.now() };
    setCompletedMatches(prev => [...prev, match]);

    if (activeTournament) {
      setActiveTournament(prev => {
        if (!prev) return prev;
        const next = { ...prev };

        // Check if this is a seeding match
        const isSeedingMatch = (next.seedingMatches || []).some(m => m.id === match.id);

        if (isSeedingMatch) {
          // Update seedingMatches completion
          next.seedingMatches = next.seedingMatches.map(m => {
            if (m.id !== match.id) return m;
            const p0score = (result.scores || []).reduce((s, r) => s + totalScore(r[0] || []), 0);
            const p1score = (result.scores || []).reduce((s, r) => s + totalScore(r[1] || []), 0);
            next.seedScores = { ...(next.seedScores || {}), [m.p0]: p0score };
            if (m.p1 && !m.solo) next.seedScores[m.p1] = p1score;
            return { ...m, completed: true, result };
          });
        } else if (next.type === "double") {
          // Double elimination — use progressDoubleElim
          const winner = result.winner;
          const loser = match.p0 === winner ? match.p1 : match.p0;
          if (next.grandFinal && next.grandFinal.id === match.id) {
            if (winner === next.wbFinalist) {
              next.grandFinal = { ...next.grandFinal, completed: true, winner };
              next.champion = winner;
            } else {
              next.grandFinal = { ...next.grandFinal, completed: true, winner };
              next.grandFinalReset = {
                id: "grand_final_reset", p0: next.wbFinalist, p1: winner,
                roundNum: 100, slotIndex: 0, completed: false, byeMatch: false,
              };
            }
          } else if (next.grandFinalReset && next.grandFinalReset.id === match.id) {
            next.grandFinalReset = { ...next.grandFinalReset, completed: true, winner };
            next.champion = winner;
          } else {
            const updated = progressDoubleElim(next, match.id, winner, loser);
            Object.assign(next, updated);
          }
        } else {
          // Single elimination bracket match — update and propagate
          const winner = result.winner;
          const updatedBracket = (next.bracket || []).map(round =>
            round.map(m => m.id === match.id ? { ...m, ...result, completed: true, winner } : m)
          );

          // After updating, check if ALL matches in this round are complete
          // If so, generate the next round dynamically
          if (winner) {
            const matchRoundIdx = updatedBracket.findIndex(r => r.some(m => m.id === match.id));
            if (matchRoundIdx >= 0) {
              const currentRound = updatedBracket[matchRoundIdx];
              const allDone = currentRound.every(m => m.completed);
              // Only generate next round if it doesn't exist yet
              if (allDone && matchRoundIdx === updatedBracket.length - 1) {
                const nextRound = generateNextRound(currentRound);
                if (nextRound.length === 0) {
                  // No more matches — winner is the champion!
                  next.champion = winner;
                } else {
                  updatedBracket.push(nextRound);
                }
              }
            }
          }
          next.bracket = updatedBracket;
          next.matches = (next.matches || []).map(m =>
            m.id === match.id ? { ...m, ...result, completed: true } : m
          );
        }
        return next;
      });
    }

    if (activeLeague) {
      setActiveLeague(prev => {
        if (!prev) return prev;
        const next = { ...prev };
        // Use p0rounds/p1rounds from result — these already account for OT round wins
        const r0 = result.p0rounds ?? 0;
        const r1 = result.p1rounds ?? 0;
        const leagueWinner = r0 > r1 ? match.p0 : r1 > r0 ? match.p1 : result.winner;
        next.matches = (next.matches || []).map(m =>
          m.id === match.id ? { ...m, ...result, winner: leagueWinner, p0rounds: r0, p1rounds: r1, completed: true } : m
        );
        return next;
      });
    }

    // Route back
    const wasTournamentMatch = !!currentMatch?.tournamentId || !!(activeTournament &&
      ((activeTournament.seedingMatches || []).some(m => m.id === result.matchId) ||
       (activeTournament?.bracket || []).flat().some(m => m.id === result.matchId) ||
       (activeTournament?.wBracket || []).flat().some(m => m.id === result.matchId) ||
       (activeTournament?.lBracket || []).flat().some(m => m.id === result.matchId) ||
       activeTournament?.grandFinal?.id === result.matchId ||
       activeTournament?.grandFinalReset?.id === result.matchId));
    const wasLeagueMatch = !!currentMatch?.leagueId || !!(activeLeague &&
      (activeLeague.matches || []).some(m => m.id === result.matchId));
    // For quick matches, keep currentMatch alive so MatchScreen stays rendered for the banner
    // Navigation happens in the banner's onClose instead
    if (!wasTournamentMatch && !wasLeagueMatch && result.winner) {
      return;
    }
    setCurrentMatch(null);
    setScreen(wasTournamentMatch ? "tournament" : wasLeagueMatch ? "league" : "home");
    notify("Match recorded!");
  };

  const generateShareCode = () => {
    const data = { players, completedMatches, activeTournament, activeLeague };
    const code = btoa(JSON.stringify(data));
    setShareCode(code);
    notify("Share code generated!");
  };

  const importData = () => {
    try {
      const data = JSON.parse(atob(importCode));
      if (data.players) setPlayers(data.players);
      if (data.completedMatches) setCompletedMatches(data.completedMatches);
      if (data.activeTournament) setActiveTournament(data.activeTournament);
      if (data.activeLeague) setActiveLeague(data.activeLeague);
      setImportCode("");
      notify("Data imported!");
    } catch {
      notify("Invalid code!");
    }
  };

  // ── HOME ──────────────────────────────────────────────────────────────────
  if (screen === "game21") return <Game21 onBack={() => setScreen("hub")} />;
  if (screen === "aroundworld") return <AroundTheWorld onBack={() => setScreen("hub")} />;
  if (screen === "zombie") return <ZombieHunter onBack={() => setScreen("hub")} />;

  if (screen === "hub") return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", padding: isTablet ? 40 : 20, maxWidth: 600, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: isTablet ? 72 : 56, marginBottom: 8 }}>🪓</div>
        <h1 style={{ color: GOLD, fontFamily: "Georgia, serif", fontSize: isTablet ? 36 : 28, margin: "0 0 6px",
          letterSpacing: 3, textTransform: "uppercase" }}>Golden Axe</h1>
        <div style={{ color: "#555", fontFamily: "monospace", fontSize: 13, letterSpacing: 2 }}>AXE THROWING GAME CENTER</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 10 }}>
          <div style={{ background: "#111", border: `1px solid ${GOLD}44`, borderRadius: 8,
            padding: "4px 14px", fontFamily: "monospace", fontSize: 12, color: GOLD, letterSpacing: 2 }}>
            <span style={{ color: synced ? "#4f4" : "#f84", marginRight: 4, fontSize: 10 }}>●</span>{groupCode}
          </div>
          <button onClick={onLeaveGroup} style={{ background: "transparent", border: "1px solid #333",
            borderRadius: 8, padding: "4px 10px", color: "#555", fontFamily: "monospace", fontSize: 11, cursor: "pointer" }}>
            Leave
          </button>
        </div>
      </div>

      {/* Competitive */}
      <div style={{ color: GOLD, fontFamily: "monospace", fontSize: 11, fontWeight: "bold", letterSpacing: 2, marginBottom: 10 }}>
        ⚔️ COMPETITIVE
      </div>
      {[
        { key: "home", icon: "🏆", title: "Golden Axe Tournament", desc: "Single or Double Elimination · Seeding rounds · Champion banner", color: "#1a1500", border: GOLD },
        { key: "league", icon: "📅", title: "League Play", desc: "7-day schedule · 21 matches each · Double elimination playoff", color: "#0a0a1a", border: "#1d6a96" },
      ].map(g => (
        <div key={g.key} onClick={() => setScreen(g.key)} style={{
          background: g.color, border: `2px solid ${g.border}`, borderRadius: 14,
          padding: isTablet ? "20px 24px" : "16px 18px", marginBottom: 10, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 16,
          transition: "transform 0.1s", active: { transform: "scale(0.98)" },
        }}>
          <span style={{ fontSize: 40, flexShrink: 0 }}>{g.icon}</span>
          <div>
            <div style={{ color: g.border, fontFamily: "monospace", fontWeight: "bold", fontSize: isTablet ? 18 : 15, marginBottom: 3 }}>{g.title}</div>
            <div style={{ color: "#666", fontFamily: "monospace", fontSize: 11 }}>{g.desc}</div>
          </div>
        </div>
      ))}

      {/* Mini games */}
      <div style={{ color: "#888", fontFamily: "monospace", fontSize: 11, fontWeight: "bold", letterSpacing: 2, margin: "20px 0 10px" }}>
        🎮 MINI GAMES
      </div>
      {[
        { key: "game21", icon: "🎯", title: "21", desc: "Easy · Medium · Hard modes · Any number of players", color: "#001a0a", border: "#4f4" },
        { key: "aroundworld", icon: "🌍", title: "Around the World", desc: "Hit every zone in order · 3 modes · Side targeting", color: "#00101a", border: "#4fc3f7" },
        { key: "zombie", icon: "🧟", title: "Zombie Hunter", desc: "Champion vs the Horde · Nipple = headshot · Horde grows!", color: "#1a0000", border: "#e63946" },
      ].map(g => (
        <div key={g.key} onClick={() => setScreen(g.key)} style={{
          background: g.color, border: `2px solid ${g.border}`, borderRadius: 14,
          padding: isTablet ? "18px 24px" : "14px 18px", marginBottom: 10, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 16,
        }}>
          <span style={{ fontSize: 40, flexShrink: 0 }}>{g.icon}</span>
          <div>
            <div style={{ color: g.border, fontFamily: "monospace", fontWeight: "bold", fontSize: isTablet ? 18 : 15, marginBottom: 3 }}>{g.title}</div>
            <div style={{ color: "#555", fontFamily: "monospace", fontSize: 11 }}>{g.desc}</div>
          </div>
        </div>
      ))}

      {/* Footer */}
      <div style={{ textAlign: "center", marginTop: 24, color: "#333", fontFamily: "monospace", fontSize: 11 }}>
        🪓 Golden Axe Game Center
      </div>
    </div>
  );

  if (screen === "home") return (
    <ThemeContext.Provider value={{ dark: darkMode, theme: t }}>
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: "monospace" }}>
      {/* Header */}
      <div style={{ background: t.headerBg, borderBottom: `2px solid ${GOLD}`, padding: "20px 24px", textAlign: "center" }}>
        <button onClick={() => setScreen("hub")} style={{ position: "absolute", left: 16, top: 20, background: "#222", border: "1px solid #444", borderRadius: 8, padding: "6px 12px", color: "#aaa", fontFamily: "monospace", fontSize: 12, cursor: "pointer" }}>
          ← Hub
        </button>
        <div style={{ fontSize: isTablet ? 52 : 36, marginBottom: 4 }}>🪓</div>
        <h1 style={{ color: GOLD, margin: 0, fontSize: isTablet ? 38 : 28, fontFamily: "Georgia, serif", letterSpacing: 2, textShadow: `0 0 20px ${GOLD}66` }}>
          GOLDEN AXE
        </h1>
        <div style={{ color: "#aaa", fontSize: isTablet ? 14 : 12, letterSpacing: 3, marginTop: 4 }}>TOURNAMENT APP</div>
        <div style={{ marginTop: 6, fontFamily: "monospace", fontSize: 11, color: synced ? "#4f4" : "#f84" }}>
          <span style={{ marginRight: 4 }}>●</span>{synced ? `LIVE · ${groupCode}` : `CONNECTING · ${groupCode}`}
        </div>
        <div style={{ marginTop: 10, display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ background: isAdmin ? "#1a3a1a" : "#2a1a1a", border: `1px solid ${isAdmin ? "#4a4" : RED}`, borderRadius: 6, padding: "2px 10px", fontSize: 11, color: isAdmin ? "#4f4" : RED }}>
            {isAdmin ? "🔓 ADMIN" : "👁️ SPECTATOR"}
          </span>
          <button onClick={() => isAdmin ? setIsAdmin(false) : setPinModal(true)}
            style={{ background: "transparent", border: `1px solid #555`, borderRadius: 6, padding: "2px 10px", fontSize: 11, color: "#aaa", cursor: "pointer" }}>
            {isAdmin ? "Lock" : "Unlock"}
          </button>
          <button onClick={() => setDarkMode(d => !d)}
            style={{ background: "transparent", border: `1px solid ${GOLD}88`, borderRadius: 6, padding: "2px 10px", fontSize: 11, color: GOLD, cursor: "pointer" }}>
            {darkMode ? "☀️ Light" : "🌙 Dark"}
          </button>
        </div>
      </div>

      <div style={{ padding: isTablet ? "24px 32px" : 20, maxWidth: isTablet ? 900 : 500, margin: "0 auto", display: "flex", flexDirection: "column", gap: isTablet ? 16 : 12 }}>
        {/* Quick Match */}
        <div style={mkCardStyle(t)}>
          <h3 style={{ color: GOLD, margin: "0 0 12px", fontSize: isTablet ? 20 : 16 }}>⚡ Quick Match</h3>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ color: t.subtext, fontSize: isTablet ? 13 : 11 }}>Throws/Player</label>
              <select value={matchSettings.throwsPerPlayer}
                onChange={e => setMatchSettings(s => ({ ...s, throwsPerPlayer: Number(e.target.value) }))}
                style={mkInputStyle(t)}>
                {[3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ color: t.subtext, fontSize: isTablet ? 13 : 11 }}>Rounds</label>
              <select value={matchSettings.roundsPerMatch}
                onChange={e => setMatchSettings(s => ({ ...s, roundsPerMatch: Number(e.target.value) }))}
                style={mkInputStyle(t)}>
                {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {[0, 1].map(pi => (
              <div key={pi} style={{ flex: 1 }}>
                <label style={{ color: "#888", fontSize: 11 }}>Player {pi + 1}</label>
                <select
                  value={currentMatch?.["p" + pi] || ""}
                  onChange={e => setCurrentMatch(prev => ({ ...(prev || { id: Date.now().toString() }), ["p" + pi]: e.target.value }))}
                  style={mkInputStyle(t)}>
                  <option value="">-- Select --</option>
                  {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            ))}
          </div>
          <button
            disabled={!isAdmin || !currentMatch?.p0 || !currentMatch?.p1 || currentMatch.p0 === currentMatch.p1}
            onClick={() => {
              setCurrentMatch(prev => ({ ...prev, tournamentId: undefined, leagueId: undefined, id: Date.now().toString() }));
              setScreen("match");
            }}
            style={{ ...btnStyle(GOLD, DARK), opacity: (!currentMatch?.p0 || !currentMatch?.p1) ? 0.5 : 1 }}>
            🪓 Start Match
          </button>
        </div>

        {/* Tournament buttons */}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setScreen("tournament")} style={{ ...btnStyle("#1a2a1a"), border: `1px solid #3a4a3a`, flex: 1, padding: isTablet ? "16px 24px" : "10px 18px", fontSize: isTablet ? 16 : 14 }}>
            🏆 Elimination<br /><span style={{ fontSize: isTablet ? 13 : 11, color: "#888" }}>Tournament</span>
          </button>
          <button onClick={() => setScreen("league")} style={{ ...btnStyle("#1a1a2a"), border: `1px solid #3a3a4a`, flex: 1, padding: isTablet ? "16px 24px" : "10px 18px", fontSize: isTablet ? 16 : 14 }}>
            📅 League<br /><span style={{ fontSize: isTablet ? 13 : 11, color: "#888" }}>8-Day Schedule</span>
          </button>
        </div>

        {/* Players */}
        <div style={mkCardStyle(t)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h3 style={{ color: GOLD, margin: 0, fontSize: isTablet ? 18 : 15 }}>
              🪓 Competitors ({players.length})
              <span style={{ color: "#555", fontSize: 11, fontFamily: "monospace", marginLeft: 8 }}>
                {players.filter(p=>p.member).length} members · {players.filter(p=>!p.member).length} guests
              </span>
            </h3>
          </div>
          {/* Member / Guest tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {[["all","All"],["members","🏅 Members"],["guests","🎯 Guests"]].map(([val,label]) => (
              <button key={val} onClick={() => setPlayerTab(val)} style={{
                background: playerTab === val ? GOLD : t.panel2,
                color: playerTab === val ? DARK : t.subtext,
                border: `1px solid ${playerTab === val ? GOLD : t.border}`,
                borderRadius: 6, padding: "4px 10px", fontSize: 11,
                fontFamily: "monospace", fontWeight: "bold", cursor: "pointer",
              }}>{label}</button>
            ))}
          </div>
          {isAdmin && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={newPlayerName} onChange={e => setNewPlayerName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addPlayer()}
                  placeholder="Player name..." style={{ ...mkInputStyle(t), flex: 1, fontSize: isTablet ? 16 : 14 }} />
                <button onClick={addPlayer} style={{ ...btnStyle(GOLD, DARK), width: "auto", padding: isTablet ? "10px 24px" : "8px 16px", fontSize: isTablet ? 16 : 14 }}>Add</button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={() => setNewPlayerIsMember(m => !m)} style={{
                  background: newPlayerIsMember ? "#1a3a1a" : "#222",
                  border: `1px solid ${newPlayerIsMember ? "#4f4" : "#444"}`,
                  borderRadius: 6, padding: "4px 12px", fontSize: 12, fontFamily: "monospace",
                  color: newPlayerIsMember ? "#4f4" : "#666", cursor: "pointer",
                }}>
                  {newPlayerIsMember ? "🏅 League Member" : "🎯 One-Time Guest"}
                </button>
                <span style={{ color: "#555", fontSize: 11, fontFamily: "monospace" }}>tap to toggle before adding</span>
              </div>
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {players.filter(p => playerTab === "all" || (playerTab === "members" ? p.member : !p.member)).map(p => (
              <div key={p.id} style={{
                background: p.member ? (t.bg === "#f0ece4" ? "#e8f5e8" : "#0d1f0d") : t.panel2,
                border: `1px solid ${p.member ? "#3a6a3a" : t.border}`,
                borderRadius: 6, padding: isTablet ? "6px 14px" : "4px 10px",
                fontSize: isTablet ? 15 : 13, display: "flex", alignItems: "center", gap: 6, color: t.text
              }}>
                {p.member ? (
                  <span onClick={isAdmin ? () => toggleMember(p.id) : undefined}
                    title="Member — tap to make guest"
                    style={{ cursor: isAdmin ? "pointer" : "default", fontSize: 15, flexShrink: 0 }}>🏅</span>
                ) : (
                  <span onClick={isAdmin ? () => toggleMember(p.id) : undefined}
                    title="Guest — tap to make member"
                    style={{ cursor: isAdmin ? "pointer" : "default", fontSize: 15, flexShrink: 0 }}>🎯</span>
                )}
                {p.name}
                {isAdmin && <span onClick={() => setPlayers(prev => prev.filter(x => x.id !== p.id))} style={{ color: RED, cursor: "pointer", fontSize: 16, lineHeight: 1, marginLeft: 8 }}>×</span>}
              </div>
            ))}
            {players.filter(p => playerTab === "all" || (playerTab === "members" ? p.member : !p.member)).length === 0 &&
              <span style={{ color: "#555", fontSize: 12 }}>No {playerTab === "all" ? "players" : playerTab} yet</span>}
          </div>
        </div>

        {/* Stats + Share */}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setScreen("stats")} style={{ ...btnStyle("#2a1a2a"), border: `1px solid #4a3a4a`, flex: 1, padding: isTablet ? "14px 20px" : "10px 18px", fontSize: isTablet ? 16 : 14 }}>
            📊 Player Stats
          </button>
          <button onClick={() => setScreen("share")} style={{ ...btnStyle("#1a2a2a"), border: `1px solid #3a4a4a`, flex: 1, padding: isTablet ? "14px 20px" : "10px 18px", fontSize: isTablet ? 16 : 14 }}>
            🔗 Share / Import
          </button>
        </div>
      </div>

      {/* Pin Modal */}
      {pinModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ ...cardStyle, border: `2px solid ${GOLD}`, maxWidth: 300, width: "90%", textAlign: "center" }}>
            <h3 style={{ color: GOLD, margin: "0 0 12px" }}>🔐 Admin PIN</h3>
            <input type="password" value={pinInput} onChange={e => setPinInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  if (pinInput === adminPin) { setIsAdmin(true); setPinModal(false); setPinInput(""); notify("Admin unlocked!"); }
                  else notify("Wrong PIN");
                }
              }}
              placeholder="Enter PIN" style={{ ...inputStyle, textAlign: "center", letterSpacing: 8, marginBottom: 10 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => {
                if (pinInput === adminPin) { setIsAdmin(true); setPinModal(false); setPinInput(""); notify("Admin unlocked!"); }
                else notify("Wrong PIN");
              }} style={btnStyle(GOLD, DARK)}>Unlock</button>
              <button onClick={() => { setPinModal(false); setPinInput(""); }} style={btnStyle("#333")}>Cancel</button>
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: "#555" }}>Default PIN: 1234</div>
          </div>
        </div>
      )}

      {/* Notification */}
      {notification && (
        <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: GOLD, color: DARK, padding: "8px 20px", borderRadius: 20, fontFamily: "monospace", fontWeight: "bold", zIndex: 200 }}>
          {notification}
        </div>
      )}
    </div>
    </ThemeContext.Provider>
  );

  // ── MATCH SCREEN ──────────────────────────────────────────────────────────
  if (screen === "match" && currentMatch) return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text }}>
      <MatchScreen
        match={{ ...currentMatch, id: currentMatch.id || Date.now().toString() }}
        players={players}
        settings={matchSettings}
        onComplete={handleMatchComplete}
        isAdmin={isAdmin}
        onBack={() => { setScreen("home"); setCurrentMatch(null); }}
      />
    </div>
  );

  // ── STATS SCREEN ─────────────────────────────────────────────────────────
  if (screen === "stats") return (
    <StatsScreen
      players={players}
      completedMatches={completedMatches}
      leagueHistory={leagueHistory}
      activeTournament={activeTournament}
      activeLeague={activeLeague}
      onBack={() => setScreen("home")}
      isTablet={isTablet}
      t={t}
    />
  );
  if (screen === "_stats_old_replaced") return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, padding: isTablet ? 32 : 20, maxWidth: isTablet ? 900 : 600, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button onClick={() => setScreen("home")} style={{ ...btnStyle("#333"), width: "auto" }}>← Back</button>
        <h2 style={{ color: GOLD, margin: 0, fontFamily: "serif", flex: 1 }}>📊 Player Stats</h2>
        <button onClick={() => exportStats(players, completedMatches)} style={{ ...btnStyle("#1a3a1a"), width: "auto", border: `1px solid #3a5a3a` }}>⬇ CSV</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[...players]
        .sort((a, b) => a.name.localeCompare(b.name))
        .filter(p => p.name.toLowerCase().includes(playerSearch.toLowerCase()))
        .map(p => {
          // Only count league matches (have a leagueId) — or all completed if none tagged
          const ms = completedMatches.filter(m => m.p0 === p.id || m.p1 === p.id);
          const wins = ms.filter(m => m.winner === p.id).length;
          const losses = ms.length - wins;
          let totalPts = 0, nipples = 0, bullseyes = 0, inners = 0, outers = 0, misses = 0, throws = 0;
          let perfectRounds = 0, unnaturalPerfects = 0, supernaturals = 0, roundWins = 0, roundLosses = 0;
          ms.forEach(m => {
            const pi = m.p0 === p.id ? 0 : 1;
            let rw = 0, rl = 0;
            (m.scores || []).forEach(r => {
              const myThrows = r[pi] || [];
              const oppThrows = r[1-pi] || [];
              const myScore = totalScore(myThrows);
              const oppScore = totalScore(oppThrows);
              if (myScore > oppScore) rw++; else if (oppScore > myScore) rl++;
              const hasNipple = myThrows.some(t => t?.id?.startsWith("nipple"));
              if (myScore > 25) supernaturals++;
              else if (myScore === 25 && hasNipple) unnaturalPerfects++;
              else if (myScore === 25) perfectRounds++;
              myThrows.forEach(t => {
                totalPts += t?.points || 0; throws++;
                if (t?.id?.startsWith("nipple")) nipples++;
                else if (t?.id === "bullseye") bullseyes++;
                else if (t?.id === "inner") inners++;
                else if (t?.id === "outer") outers++;
                else misses++;
              });
            });
            roundWins += rw; roundLosses += rl;
          });
          const pct = (n) => throws > 0 ? ` (${(n/throws*100).toFixed(1)}%)` : "";
          const avg = throws > 0 ? (totalPts/throws).toFixed(2) : "0.00";
          return (
            <div key={p.id} style={{ ...cardStyle, border: `1px solid ${BORDER}` }}>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ color: GOLD, fontWeight: "bold", fontSize: 16, fontFamily: "monospace" }}>{p.name}</span>
                <span style={{ color: wins >= losses ? "#4f4" : "#aaa", fontFamily: "monospace", fontSize: 13 }}>{wins}W – {losses}L</span>
              </div>
              {/* Round record + totals */}
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "#aaa", fontFamily: "monospace", marginBottom: 8 }}>
                <span>Rounds: <strong style={{ color: "#ccc" }}>{roundWins}W–{roundLosses}L</strong></span>
                <span>Total pts: <strong style={{ color: "#ccc" }}>{totalPts}</strong></span>
                <span>Avg/throw: <strong style={{ color: GOLD }}>{avg}</strong></span>
                <span>Throws: <strong style={{ color: "#ccc" }}>{throws}</strong></span>
              </div>
              {/* Throw breakdown with percentages */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4, fontFamily: "monospace", fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#e63946" }}>★ Nipples (7pt)</span>
                  <span style={{ color: "#e63946" }}>{nipples}<span style={{ color: "#666" }}>{pct(nipples)}</span></span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: GOLD }}>🎯 Bullseyes (5pt)</span>
                  <span style={{ color: GOLD }}>{bullseyes}<span style={{ color: "#666" }}>{pct(bullseyes)}</span></span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#c1121f" }}>● Inners (3pt)</span>
                  <span style={{ color: "#c1121f" }}>{inners}<span style={{ color: "#666" }}>{pct(inners)}</span></span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#1d6a96" }}>○ Outers (1pt)</span>
                  <span style={{ color: "#1d6a96" }}>{outers}<span style={{ color: "#666" }}>{pct(outers)}</span></span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#555" }}>✗ Misses (0pt)</span>
                  <span style={{ color: "#555" }}>{misses}<span style={{ color: "#444" }}>{pct(misses)}</span></span>
                </div>
              </div>
              {/* Achievements */}
              {(perfectRounds > 0 || unnaturalPerfects > 0 || supernaturals > 0) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                  {supernaturals > 0 && <span style={{ background: "#1a0030", border: "1px solid #9b5de5", borderRadius: 6, padding: "2px 8px", fontSize: 11, color: "#9b5de5", fontFamily: "monospace" }}>⚡ {supernaturals}× Supernatural</span>}
                  {unnaturalPerfects > 0 && <span style={{ background: "#1a1a00", border: "1px solid #f77f00", borderRadius: 6, padding: "2px 8px", fontSize: 11, color: "#f77f00", fontFamily: "monospace" }}>🌀 {unnaturalPerfects}× Unnatural Perfect</span>}
                  {perfectRounds > 0 && <span style={{ background: "#001a00", border: `1px solid ${GOLD}`, borderRadius: 6, padding: "2px 8px", fontSize: 11, color: GOLD, fontFamily: "monospace" }}>✨ {perfectRounds}× Perfect Round</span>}
                </div>
              )}
            </div>
          );
        })}
        {players.length === 0 && <div style={{ color: "#555", textAlign: "center", padding: 40 }}>No players yet</div>}
      </div>
    </div>
  );

  // ── SHARE SCREEN ──────────────────────────────────────────────────────────
  if (screen === "share") return (
    <div style={{ minHeight: "100vh", background: DARK, color: "#fff", padding: isTablet ? 32 : 20, maxWidth: isTablet ? 800 : 500, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button onClick={() => setScreen("home")} style={{ ...btnStyle("#333"), width: "auto" }}>← Back</button>
        <h2 style={{ color: GOLD, margin: 0, fontFamily: "serif" }}>🔗 Share / Import</h2>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={cardStyle}>
          <h3 style={{ color: GOLD, margin: "0 0 10px" }}>Export / Share</h3>
          <button onClick={generateShareCode} style={btnStyle(GOLD, DARK)}>Generate Share Code</button>
          {shareCode && (
            <div style={{ marginTop: 10 }}>
              <textarea readOnly value={shareCode}
                style={{ ...inputStyle, height: 80, resize: "vertical", fontSize: 11 }} />
              <button onClick={() => { navigator.clipboard.writeText(shareCode); notify("Copied!"); }}
                style={{ ...btnStyle("#333"), marginTop: 6 }}>📋 Copy to Clipboard</button>
            </div>
          )}
        </div>
        <div style={cardStyle}>
          <h3 style={{ color: GOLD, margin: "0 0 10px" }}>Import Data</h3>
          <textarea value={importCode} onChange={e => setImportCode(e.target.value)}
            placeholder="Paste share code here..." style={{ ...inputStyle, height: 80, resize: "vertical" }} />
          <button onClick={importData} style={{ ...btnStyle("#1a3a1a"), border: `1px solid #3a5a3a`, marginTop: 8 }}>⬆ Import</button>
        </div>
        <div style={cardStyle}>
          <h3 style={{ color: GOLD, margin: "0 0 10px" }}>Admin PIN</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="password" placeholder="New PIN" value={pinInput} onChange={e => setPinInput(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
            <button onClick={() => { if (isAdmin && pinInput) { setAdminPin(pinInput); save("ga_pin", pinInput); setPinInput(""); notify("PIN updated!"); } else notify("Admin only"); }}
              style={{ ...btnStyle(GOLD, DARK), width: "auto", padding: "8px 14px" }}>Set</button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── TOURNAMENT SCREEN ─────────────────────────────────────────────────────
  if (screen === "tournament" || activeTournament?.isPlayoff) return (
    <TournamentScreen
      players={players} isAdmin={isAdmin}
      activeTournament={activeTournament}
      setActiveTournament={(t) => {
        if (!t && activeTournament?.isPlayoff) {
          setLeagueHistory(prev => [...(prev || []), { ...activeLeague, finishedAt: Date.now() }]);
          setActiveLeague(null);
        }
        setActiveTournament(t);
      }}
      completedMatches={completedMatches}
      onStartMatch={(match, settings) => {
        setCurrentMatch(match);
        setMatchSettings(settings);
        setScreen("match");
      }}
      onBack={() => setScreen("home")}
      notify={notify}
    />
  );

  // ── LEAGUE SCREEN ─────────────────────────────────────────────────────────
  if (screen === "league") return (
    <LeagueScreen
      players={players} isAdmin={isAdmin}
      activeLeague={activeLeague} setActiveLeague={setActiveLeague}
      leagueHistory={leagueHistory} setLeagueHistory={setLeagueHistory}
      onStartMatch={(match, settings) => {
        setCurrentMatch(match);
        setMatchSettings(settings);
        setScreen("match");
      }}
      onStartPlayoff={(seededIds, standings) => {
        const seedScores = {};
        standings.forEach((p, i) => { seedScores[p.id] = standings.length - i; });
        const dbl = buildDoubleElimBracket(seededIds);
        setActiveTournament({
          id: Date.now().toString(),
          name: "League Playoff",
          players: seededIds,
          seedScores,
          seeded: seededIds,
          phase: "elimination",
          settings: { throwsPerPlayer: 5, roundsPerMatch: 3 },
          seedingMatches: [],
          isPlayoff: true,
          elimType: "double",
          ...dbl,
        });
        // No need to setScreen — the router above shows tournament whenever
        // activeTournament.isPlayoff is set, regardless of screen state
      }}
      onBack={() => setScreen("home")}
      notify={notify}
    />
  );

  return null;
}

// ─── TOURNAMENT SCREEN ────────────────────────────────────────────────────────
// ─── BRACKET BUILDER (module-level so both main app and TournamentScreen can use it) ──
function buildInitialBracket(seeded) {
  const n = seeded.length;
  let size = 1;
  while (size < n) size *= 2;

  function getBracketOrder(sz) {
    if (sz <= 1) return [1];
    if (sz === 2) return [1, 2];
    const half = sz / 2;
    const top = getBracketOrder(half);
    const result = [];
    top.forEach(s => { result.push(s); result.push(sz + 1 - s); });
    return result;
  }

  const order = getBracketOrder(size);
  const slots = order.map(s => (s <= n ? (seeded[s - 1]?.id ?? seeded[s - 1]) : null));

  const r1 = [];
  for (let i = 0; i < slots.length; i += 2) {
    const p0 = slots[i], p1 = slots[i + 1] ?? null;
    const slotIndex = i / 2;
    if (!p0 && !p1) continue;
    if (p0 && p1) {
      r1.push({ id: `r1_s${slotIndex}`, p0, p1, roundNum: 1, slotIndex, completed: false, byeMatch: false });
    } else {
      const winner = p0 || p1;
      r1.push({ id: `r1_s${slotIndex}`, p0: p0||null, p1: p1||null, roundNum: 1, slotIndex, completed: true, winner, byeMatch: true });
    }
  }
  return [r1];
}


// ─── DOUBLE ELIMINATION BRACKET BUILDER ─────────────────────────────────────
// Returns { wBracket: [[...rounds]], lBracket: [[...rounds]], grandFinal: null }
function buildDoubleElimBracket(seeded) {
  // Start with winners bracket = same as single elim round 1
  const wR1 = buildInitialBracket(seeded)[0];
  return {
    wBracket: [wR1],  // Winners bracket rounds
    lBracket: [],     // Losers bracket rounds (filled as W matches complete)
    grandFinal: null, // { p0: wbWinner, p1: lbWinner, ... } when ready
    grandFinalReset: null, // if LB winner beats WB winner, play again
    type: "double",
  };
}

// After a winners bracket match completes, route the loser to the losers bracket
// and advance the winner. Also generate new LB rounds as needed.
function progressDoubleElim(tournament, matchId, winnerId, loserId) {
  const t = { ...tournament };
  t.wBracket = (t.wBracket || []).map(r => [...r]);
  t.lBracket = (t.lBracket || []).map(r => [...r]);

  // Find the match in wBracket or lBracket or grandFinal
  let matchSource = null;
  for (let ri = 0; ri < t.wBracket.length; ri++) {
    const mi = t.wBracket[ri].findIndex(m => m.id === matchId);
    if (mi >= 0) { matchSource = { bracket: "w", ri, mi }; break; }
  }
  if (!matchSource) {
    for (let ri = 0; ri < t.lBracket.length; ri++) {
      const mi = t.lBracket[ri].findIndex(m => m.id === matchId);
      if (mi >= 0) { matchSource = { bracket: "l", ri, mi }; break; }
    }
  }

  if (!matchSource) return t; // match not found

  const { bracket, ri, mi } = matchSource;
  const bracketArr = bracket === "w" ? t.wBracket : t.lBracket;
  bracketArr[ri][mi] = { ...bracketArr[ri][mi], completed: true, winner: winnerId };

  if (bracket === "w") {
    // Loser drops to losers bracket
    // LB round corresponding to WB round ri:
    // WB R1 losers → LB R1
    // WB R2 losers → LB R3
    // WB Rn losers → LB R(2n-1)
    const lbRoundForLoser = ri * 2; // 0-indexed
    if (!t.lBracket[lbRoundForLoser]) t.lBracket[lbRoundForLoser] = [];
    const slotIndex = t.lBracket[lbRoundForLoser].length;
    t.lBracket[lbRoundForLoser].push({
      id: `lb_r${lbRoundForLoser}_s${slotIndex}`,
      p0: loserId, p1: null, // p1 filled when paired
      roundNum: lbRoundForLoser + 1, slotIndex, completed: false, byeMatch: false,
      fromWB: true,
    });

    // Try to pair LB dropins
    const lbRound = t.lBracket[lbRoundForLoser];
    const unpaired = lbRound.filter(m => m.p1 === null && !m.byeMatch);
    if (unpaired.length >= 2) {
      // Pair them up
      const a = unpaired[0], b = unpaired[1];
      const pairIdx = lbRound.indexOf(a);
      lbRound[pairIdx] = { ...a, p1: b.p0 };
      lbRound.splice(lbRound.indexOf(b), 1);
    } else if (unpaired.length === 1 && lbRound.filter(m => m.p1 === null).length === 0) {
      // Odd one out — bye
      const a = unpaired[0];
      lbRound[lbRound.indexOf(a)] = { ...a, completed: true, winner: a.p0, byeMatch: true };
    }

    // Check if WB round is done → generate next WB round
    if (bracketArr[ri].every(m => m.completed)) {
      const wbWinners = bracketArr[ri].map(m => m.winner).filter(Boolean);
      if (wbWinners.length === 1) {
        // WB is done — this is the grand finalist
        t.wbFinalist = wbWinners[0];
      } else if (wbWinners.length > 1) {
        // Generate next WB round
        const nextRound = [];
        for (let i = 0; i < wbWinners.length; i += 2) {
          if (wbWinners[i] && wbWinners[i+1]) {
            nextRound.push({ id: `w_r${ri+1}_s${i/2}`, p0: wbWinners[i], p1: wbWinners[i+1],
              roundNum: ri+2, slotIndex: i/2, completed: false, byeMatch: false });
          }
        }
        if (nextRound.length > 0) t.wBracket.push(nextRound);
      }
    }
  } else {
    // LB match completed — loser is eliminated, winner advances in LB
    if (bracketArr[ri].every(m => m.completed)) {
      const lbWinners = bracketArr[ri].map(m => m.winner).filter(Boolean);
      if (lbWinners.length === 1 && t.wbFinalist) {
        // LB final done — set up grand final
        t.grandFinal = {
          id: "grand_final", p0: t.wbFinalist, p1: lbWinners[0],
          roundNum: 99, slotIndex: 0, completed: false, byeMatch: false,
        };
      } else if (lbWinners.length > 1) {
        // Generate next LB round
        const nextRound = [];
        // Alternate: even LB rounds are LB-only, odd rounds bring in WB dropins
        for (let i = 0; i < lbWinners.length; i += 2) {
          if (lbWinners[i] && lbWinners[i+1]) {
            nextRound.push({ id: `lb_r${ri+1}_s${i/2}`, p0: lbWinners[i], p1: lbWinners[i+1],
              roundNum: ri+2, slotIndex: i/2, completed: false, byeMatch: false });
          } else if (lbWinners[i]) {
            nextRound.push({ id: `lb_r${ri+1}_s${i/2}`, p0: lbWinners[i], p1: null,
              roundNum: ri+2, slotIndex: i/2, completed: false, byeMatch: false });
          }
        }
        if (nextRound.length > 0) t.lBracket.push(nextRound);
      }
    }
  }

  return t;
}

// ─── STATS SCREEN COMPONENT ──────────────────────────────────────────────────
function StatsScreen({ players, completedMatches, leagueHistory, activeTournament, activeLeague, onBack, isTablet, t }) {
  const [statsTab, setStatsTab] = useState("players"); // always players now
  const [expandedMatch, setExpandedMatch] = useState(null); // match id currently expanded
  const [playerSearch, setPlayerSearch] = useState(""); // search filter for player list
  const [playerHistory, setPlayerHistory] = useState(null); // { player, matchType } | null
  const [historyMatchType, setHistoryMatchType] = useState("quick"); // "quick"|"tournament"|"league"
  const [historyExpanded, setHistoryExpanded] = useState(null); // expanded match id in history
  const GOLD = "#f0c040", DARK = "#0d0d0d", RED = "#c1121f", BLUE = "#1d6a96", PANEL = "#151515", BORDER = "#2a2a2a";
  const cardStyle = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: isTablet ? 16 : 12 };
  const btnStyle = (bg, col) => ({ background: bg || "#333", color: col || "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontFamily: "monospace", fontWeight: "bold", cursor: "pointer", width: "100%", fontSize: 14 });

  const getPlayerName = (id) => players.find(p => p.id === id)?.name || id || "?";

  // Build a lookup of which matches belong to which tournament (from completed matches history)
  // This handles old data that was saved before tournamentId was added
  const leagueIdByMatchId = {};
  (leagueHistory || []).forEach(lg => (lg.matches || []).forEach(m => { leagueIdByMatchId[m.id] = lg.id; }));
  (activeLeague?.matches || []).forEach(m => { leagueIdByMatchId[m.id] = activeLeague.id; });

  // For active tournament, build a set of bracket match IDs so we can tag them
  const activeTourneyId = activeTournament?.id;
  const activeTourneyMatchIds = new Set([
    ...((activeTournament?.seedingMatches || []).map(m => m.id)),
    ...((activeTournament?.bracket || []).flat().map(m => m.id)),
  ]);

  const seen = new Map();
  [
    // completedMatches first — tag any missing tournamentId/leagueId
    ...completedMatches.map(m => ({
      ...m,
      tournamentId: m.tournamentId || (activeTourneyMatchIds.has(m.id) ? activeTourneyId : undefined),
      leagueId: m.leagueId || leagueIdByMatchId[m.id] || undefined,
      matchType: m.matchType || (activeTourneyMatchIds.has(m.id) ?
        ((activeTournament?.seedingMatches || []).some(s => s.id === m.id) ? "seeding" : "elimination")
        : undefined),
    })),
    // Fallback: active tournament matches not yet in completedMatches
    ...((activeTournament?.seedingMatches || []).filter(m => m.completed).map(m => ({
      ...m, ...(m.result || {}), tournamentId: activeTourneyId, matchType: "seeding",
    }))),
    ...((activeTournament?.bracket || []).flat().filter(m => m.completed && !m.byeMatch && m.p0 && m.p1).map(m => ({
      ...m, tournamentId: activeTourneyId, matchType: m.matchType || "elimination",
    }))),
    // Fallback: league matches not yet in completedMatches
    ...((leagueHistory || []).flatMap(lg =>
      (lg.matches || []).filter(m => m.completed).map(m => ({ ...m, leagueId: m.leagueId || lg.id }))
    )),
    ...((activeLeague?.matches || []).filter(m => m.completed).map(m => ({ ...m, leagueId: m.leagueId || activeLeague.id }))),
  ].forEach(m => { if (m.id) seen.set(m.id, m); });

  const allMatches = [...seen.values()]
    .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

  const getMatchType = (m) => {
    if (m.leagueId) return { label: "League", color: BLUE, icon: "📅" };
    if (m.tournamentId && m.matchType === "seeding") return { label: "Seeding", color: "#888", icon: "🎯" };
    if (m.tournamentId) return { label: "Tournament", color: "#9b5de5", icon: "🏆" };
    return { label: "Quick Match", color: GOLD, icon: "🪓" };
  };

  const formatDate = (ts) => {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) + " " +
      d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  };

  const zoneColor = (z) => {
    if (!z) return "#444";
    if (z.id?.startsWith("nipple")) return "#e63946";
    if (z.id === "bullseye") return "#f0c040";
    if (z.id === "inner") return RED;
    if (z.id === "outer") return BLUE;
    return "#555";
  };

  const ThrowPip = ({ z }) => (
    <div style={{
      width: 32, height: 32, borderRadius: 6, flexShrink: 0,
      background: zoneColor(z), border: `1px solid ${z ? "#666" : "#333"}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: z?.id === "bullseye" ? "#0d0d0d" : z?.points >= 5 ? GOLD : "#fff", fontFamily: "monospace", fontWeight: "bold", fontSize: 12,
    }}>{z ? z.points : "·"}</div>
  );

  // ── PLAYER STATS TAB (existing logic extracted) ──────────────────────────
  const PlayerStatsTab = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {[...players]
        .sort((a, b) => a.name.localeCompare(b.name))
        .filter(p => p.name.toLowerCase().includes(playerSearch.toLowerCase()))
        .map(p => {
        const ms = completedMatches.filter(m => m.p0 === p.id || m.p1 === p.id);
        const wins = ms.filter(m => m.winner === p.id).length;
        const losses = ms.length - wins;
        let totalPts = 0, nipples = 0, bullseyes = 0, inners = 0, outers = 0, misses = 0, throws = 0;
        let perfectRounds = 0, unnaturalPerfects = 0, supernaturals = 0, roundWins = 0, roundLosses = 0;
        ms.forEach(m => {
          const pi = m.p0 === p.id ? 0 : 1;
          let rw = 0, rl = 0;
          (m.scores || []).forEach(r => {
            const myThrows = r[pi] || [];
            const oppThrows = r[1-pi] || [];
            const myScore = totalScore(myThrows);
            const oppScore = totalScore(oppThrows);
            if (myScore > oppScore) rw++; else if (oppScore > myScore) rl++;
            const hasNipple = myThrows.some(t => t?.id?.startsWith("nipple"));
            if (myScore > 25) supernaturals++;
            else if (myScore === 25 && hasNipple) unnaturalPerfects++;
            else if (myScore === 25) perfectRounds++;
            myThrows.forEach(t => {
              totalPts += t?.points || 0; throws++;
              if (t?.id?.startsWith("nipple")) nipples++;
              else if (t?.id === "bullseye") bullseyes++;
              else if (t?.id === "inner") inners++;
              else if (t?.id === "outer") outers++;
              else misses++;
            });
          });
          roundWins += rw; roundLosses += rl;
        });
        const pct = (n) => throws > 0 ? ` (${(n/throws*100).toFixed(1)}%)` : "";
        const avg = throws > 0 ? (totalPts/throws).toFixed(2) : "0.00";
        return (
          <div key={p.id} style={{ ...cardStyle, border: `1px solid ${BORDER}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ color: GOLD, fontWeight: "bold", fontSize: 16, fontFamily: "monospace" }}>{p.name}</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ color: wins >= losses ? "#4f4" : "#aaa", fontFamily: "monospace", fontSize: 13 }}>{wins}W – {losses}L</span>
                <button onClick={e => { e.stopPropagation(); setPlayerHistory(p); setHistoryMatchType("quick"); setHistoryExpanded(null); }}
                  style={{ background: "#1a1a2a", border: "1px solid #444", borderRadius: 6, padding: "3px 10px",
                    fontSize: 11, fontFamily: "monospace", color: "#aaa", cursor: "pointer" }}>
                  📋 History
                </button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "#aaa", fontFamily: "monospace", marginBottom: 8 }}>
              <span>Rounds: <strong style={{ color: "#ccc" }}>{roundWins}W–{roundLosses}L</strong></span>
              <span>Total pts: <strong style={{ color: "#ccc" }}>{totalPts}</strong></span>
              <span>Avg/throw: <strong style={{ color: GOLD }}>{avg}</strong></span>
              <span>Throws: <strong style={{ color: "#ccc" }}>{throws}</strong></span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontFamily: "monospace", fontSize: 12 }}>
              {[["★ Nipples (7pt)","#e63946",nipples],["🎯 Bullseyes (5pt)",GOLD,bullseyes],["● Inners (3pt)",RED,inners],["○ Outers (1pt)",BLUE,outers],["✗ Misses (0pt)","#555",misses]].map(([label,color,val]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color }}>{label}</span>
                  <span style={{ color }}>{val}<span style={{ color: "#666" }}>{pct(val)}</span></span>
                </div>
              ))}
            </div>
            {(perfectRounds > 0 || unnaturalPerfects > 0 || supernaturals > 0) && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {supernaturals > 0 && <span style={{ background: "#1a0030", border: "1px solid #9b5de5", borderRadius: 6, padding: "2px 8px", fontSize: 11, color: "#9b5de5", fontFamily: "monospace" }}>⚡ {supernaturals}× Supernatural</span>}
                {unnaturalPerfects > 0 && <span style={{ background: "#1a1a00", border: "1px solid #f77f00", borderRadius: 6, padding: "2px 8px", fontSize: 11, color: "#f77f00", fontFamily: "monospace" }}>🌀 {unnaturalPerfects}× Unnatural Perfect</span>}
                {perfectRounds > 0 && <span style={{ background: "#001a00", border: `1px solid ${GOLD}`, borderRadius: 6, padding: "2px 8px", fontSize: 11, color: GOLD, fontFamily: "monospace" }}>✨ {perfectRounds}× Perfect Round</span>}
              </div>
            )}
          </div>
        );
      })}
      {[...players].filter(p => p.name.toLowerCase().includes(playerSearch.toLowerCase())).length === 0 &&
        <div style={{ color: "#555", textAlign: "center", padding: 40 }}>
          {playerSearch ? `No players matching "${playerSearch}"` : "No players yet"}
        </div>}
    </div>
  );

  // ── MATCH LOG TAB ─────────────────────────────────────────────────────────
  const MatchCard = ({ m, idx }) => {
    const type = getMatchType(m);
    const p0name = getPlayerName(m.p0);
    const p1name = m.p1 ? getPlayerName(m.p1) : null;
    const winnerName = m.winner ? getPlayerName(m.winner) : null;
    const isExpanded = expandedMatch === m.id;
    const p0total = (m.scores || []).reduce((s, r) => s + totalScore(r[0] || []), 0);
    const p1total = p1name ? (m.scores || []).reduce((s, r) => s + totalScore(r[1] || []), 0) : null;
    const p0rounds = m.p0rounds ?? (m.scores || []).filter(r => totalScore(r[0]||[]) > totalScore(r[1]||[])).length;
    const p1rounds = m.p1rounds ?? (m.scores || []).filter(r => totalScore(r[1]||[]) > totalScore(r[0]||[])).length;
    return (
      <div key={m.id || idx} style={{
        ...cardStyle, border: `1px solid ${isExpanded ? GOLD + "66" : BORDER}`,
        cursor: "pointer", transition: "border 0.2s",
      }} onClick={() => setExpandedMatch(isExpanded ? null : m.id)}>
        {/* Row summary */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ color: "#ccc", fontFamily: "monospace", fontSize: 13, flex: 1, minWidth: 0 }}>
            <span style={{ color: m.winner === m.p0 ? GOLD : "#ccc", fontWeight: m.winner === m.p0 ? "bold" : "normal" }}>{p0name}</span>
            {p1name && <>
              <span style={{ color: "#555", margin: "0 6px" }}>vs</span>
              <span style={{ color: m.winner === m.p1 ? GOLD : "#ccc", fontWeight: m.winner === m.p1 ? "bold" : "normal" }}>{p1name}</span>
            </>}
          </span>
          <span style={{ color: "#666", fontFamily: "monospace", fontSize: 11, flexShrink: 0 }}>{formatDate(m.completedAt)}</span>
          <span style={{ color: "#555", fontSize: 12 }}>{isExpanded ? "▲" : "▼"}</span>
        </div>
        {/* Score summary */}
        <div style={{ display: "flex", gap: 10, marginTop: 5, fontSize: 12, fontFamily: "monospace", flexWrap: "wrap", alignItems: "center" }}>
          {winnerName && <span style={{ color: "#4f4" }}>🏆 {winnerName}</span>}
          {p1name && <span style={{ color: "#777" }}>
            {p0name}: <strong style={{ color: "#ccc" }}>{p0total}pts {p0rounds}R</strong>
            <span style={{ color: "#444", margin: "0 4px" }}>·</span>
            {p1name}: <strong style={{ color: "#ccc" }}>{p1total}pts {p1rounds}R</strong>
          </span>}
          {!p1name && <span style={{ color: "#777" }}>Solo: <strong style={{ color: "#ccc" }}>{p0total}pts</strong></span>}
        </div>
        {/* Expanded throws */}
        {isExpanded && (
          <div style={{ marginTop: 12, borderTop: `1px solid #222`, paddingTop: 12 }}
            onClick={e => e.stopPropagation()}>
            {(m.scores || []).length === 0 && <div style={{ color: "#555", fontFamily: "monospace", fontSize: 12 }}>No throw data recorded</div>}
            {(m.scores || []).map((round, ri) => {
              const s0 = totalScore(round[0] || []);
              const s1 = p1name ? totalScore(round[1] || []) : null;
              const roundWinner = s1 !== null ? (s0 > s1 ? m.p0 : s1 > s0 ? m.p1 : null) : null;
              return (
                <div key={ri} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ color: GOLD, fontFamily: "monospace", fontSize: 12, fontWeight: "bold" }}>Round {ri + 1}</span>
                    <span style={{ color: "#888", fontSize: 11, fontFamily: "monospace" }}>{s0}pts{s1 !== null ? ` – ${s1}pts` : ""}</span>
                    {roundWinner && <span style={{ color: "#4f4", fontSize: 11, fontFamily: "monospace" }}>🏆 {getPlayerName(roundWinner)}</span>}
                  </div>
                  {[0, p1name ? 1 : -1].filter(pi => pi >= 0).map(pi => {
                    const pname = pi === 0 ? p0name : p1name;
                    const throws = round[pi] || [];
                    const score = totalScore(throws);
                    const isWin = roundWinner === (pi === 0 ? m.p0 : m.p1);
                    return (
                      <div key={pi} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span style={{ color: isWin ? GOLD : "#888", fontFamily: "monospace", fontSize: 12,
                          minWidth: isTablet ? 80 : 55, fontWeight: isWin ? "bold" : "normal", flexShrink: 0 }}>{pname}</span>
                        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                          {throws.map((z, zi) => <ThrowPip key={zi} z={z} />)}
                        </div>
                        <span style={{ color: isWin ? GOLD : "#666", fontFamily: "monospace", fontSize: 12, marginLeft: "auto" }}>{score}pts</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const MatchLogTab = () => {
    const groups = [
      { key: "tournament", label: "🏆 Tournament", color: "#9b5de5", matches: allMatches.filter(m => m.tournamentId && m.matchType !== "seeding") },
      { key: "league",     label: "📅 League",     color: BLUE,      matches: allMatches.filter(m => m.leagueId) },
      { key: "quick",      label: "🪓 Quick Match", color: GOLD,      matches: allMatches.filter(m => !m.tournamentId && !m.leagueId) },
      { key: "seeding",    label: "🎯 Seeding",     color: "#888",    matches: allMatches.filter(m => m.tournamentId && m.matchType === "seeding") },
    ].filter(g => g.matches.length > 0);

    if (allMatches.length === 0) return (
      <div style={{ color: "#555", textAlign: "center", padding: 40, fontFamily: "monospace" }}>No matches recorded yet</div>
    );
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {groups.map(g => (
          <div key={g.key}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ color: g.color, fontFamily: "monospace", fontSize: 13, fontWeight: "bold" }}>{g.label}</span>
              <span style={{ color: "#444", fontFamily: "monospace", fontSize: 11 }}>{g.matches.length} match{g.matches.length !== 1 ? "es" : ""}</span>
              <div style={{ flex: 1, height: 1, background: g.color + "33" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {g.matches.map((m, idx) => <MatchCard key={m.id || idx} m={m} idx={idx} />)}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ── PLAYER HISTORY OVERLAY ───────────────────────────────────────────────
  if (playerHistory) {
    const p = playerHistory;
    const pMatches = allMatches.filter(m => m.p0 === p.id || m.p1 === p.id);
    const quickMatches = pMatches.filter(m => !m.tournamentId && !m.leagueId);
    const leagueMatches = pMatches.filter(m => m.leagueId);
    const tourneyMatches = pMatches.filter(m => m.tournamentId).sort((a, b) => {
      // newest first, but seeding and elim are visually distinguished by badge
      return (b.completedAt || 0) - (a.completedAt || 0);
    });

    const tabs = [
      { key: "quick",      label: "🪓 Quick",      matches: quickMatches,  color: GOLD },
      { key: "tournament", label: "🏆 Tournament",  matches: tourneyMatches, color: "#9b5de5" },
      { key: "league",     label: "📅 League",      matches: leagueMatches, color: BLUE },
    ];
    // Default to first non-empty tab if current tab is empty
    const defaultTab = tabs.find(tb => tb.matches.length > 0)?.key || "quick";
    const activeTabKey = tabs.find(tb => tb.key === historyMatchType)?.key || defaultTab;
    const shownMatches = tabs.find(tb => tb.key === activeTabKey)?.matches || [];

    return (
      <div style={{ minHeight: "100vh", background: t.bg, color: t.text, padding: isTablet ? 32 : 20, maxWidth: isTablet ? 900 : 600, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button onClick={() => setPlayerHistory(null)}
            style={{ background: "#333", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontFamily: "monospace", fontWeight: "bold", cursor: "pointer", width: "auto" }}>← Back</button>
          <h2 style={{ color: GOLD, margin: 0, fontFamily: "serif", flex: 1 }}>📋 {p.name}</h2>
          <span style={{ color: "#666", fontFamily: "monospace", fontSize: 12 }}>{pMatches.length} matches</span>
        </div>


        {/* Type tabs — always show all 3 */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {tabs.map(tb => {
            const isEmpty = tb.matches.length === 0;
            const isActive = activeTabKey === tb.key;
            return (
              <button key={tb.key}
                onClick={() => { if (!isEmpty) { setHistoryMatchType(tb.key); setHistoryExpanded(null); } }}
                style={{
                  flex: 1, background: isActive ? tb.color : isEmpty ? "#111" : "#1a1a1a",
                  color: isActive ? DARK : isEmpty ? "#333" : "#666",
                  border: `1px solid ${isActive ? tb.color : isEmpty ? "#222" : "#333"}`,
                  borderRadius: 8, padding: "7px 6px", fontFamily: "monospace",
                  fontWeight: "bold", cursor: isEmpty ? "default" : "pointer", fontSize: 11,
                  opacity: isEmpty ? 0.5 : 1,
                }}>
                {tb.label}
                <div style={{ fontSize: 10, opacity: 0.7, fontWeight: "normal" }}>
                  {isEmpty ? "none" : `${tb.matches.length} match${tb.matches.length !== 1 ? "es" : ""}`}
                </div>
              </button>
            );
          })}
        </div>
        {/* Match list */}
        {shownMatches.length === 0 && (
          <div style={{ color: "#555", textAlign: "center", padding: 40, fontFamily: "monospace" }}>No matches yet</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {shownMatches.map((m, idx) => {
            const isSeed = m.matchType === "seeding";
            const oppId = m.p0 === p.id ? m.p1 : m.p0;
            const oppName = getPlayerName(oppId);
            const won = m.winner === p.id;
            const pi = m.p0 === p.id ? 0 : 1;
            const myTotal = (m.scores || []).reduce((s, r) => s + totalScore(r[pi] || []), 0);
            const oppTotal = oppId ? (m.scores || []).reduce((s, r) => s + totalScore(r[1-pi] || []), 0) : null;
            const myRounds = m.p0 === p.id ? (m.p0rounds ?? 0) : (m.p1rounds ?? 0);
            const oppRounds = m.p0 === p.id ? (m.p1rounds ?? 0) : (m.p0rounds ?? 0);
            const matchKey = `${m.id || "x"}_${idx}`;
            const isExpanded = historyExpanded === matchKey;
            return (
              <div key={matchKey} style={{
                ...cardStyle,
                border: `1px solid ${isExpanded ? GOLD+"66" : isSeed ? "#333" : BORDER}`,
                cursor: "pointer",
              }} onClick={() => setHistoryExpanded(isExpanded ? null : matchKey)}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {/* Seeding vs Elimination indicator */}
                  {historyMatchType === "tournament" && (
                    <span style={{ fontSize: 10, fontFamily: "monospace", flexShrink: 0,
                      color: isSeed ? "#888" : "#9b5de5",
                      background: isSeed ? "#1a1a1a" : "#1a0030",
                      border: `1px solid ${isSeed ? "#333" : "#9b5de580"}`,
                      borderRadius: 4, padding: "2px 6px" }}>
                      {isSeed ? "🎯 Seed" : "🏆 Elim"}
                    </span>
                  )}
                  {/* Result badge */}
                  {m.winner && (
                    <span style={{ fontSize: 11, fontFamily: "monospace", flexShrink: 0,
                      color: won ? "#4f4" : "#c44", fontWeight: "bold" }}>
                      {won ? "W" : "L"}
                    </span>
                  )}
                  {/* Opponent */}
                  <span style={{ color: "#ccc", fontFamily: "monospace", fontSize: 13, flex: 1 }}>
                    {oppId ? <>vs <span style={{ color: won ? GOLD : "#ccc", fontWeight: won ? "bold" : "normal" }}>{oppName}</span></> : "Solo seeding"}
                  </span>
                  {/* Score */}
                  <span style={{ color: "#888", fontFamily: "monospace", fontSize: 12 }}>
                    {myTotal}pts{oppTotal !== null ? ` – ${oppTotal}pts` : ""}
                    {oppId && <span style={{ color: "#555", marginLeft: 4 }}>({myRounds}–{oppRounds}R)</span>}
                  </span>
                  {/* Date */}
                  <span style={{ color: "#555", fontFamily: "monospace", fontSize: 10, flexShrink: 0 }}>{formatDate(m.completedAt)}</span>
                  <span style={{ color: "#555", fontSize: 11 }}>{isExpanded ? "▲" : "▼"}</span>
                </div>
                {/* Expanded throws */}
                {isExpanded && (
                  <div style={{ marginTop: 12, borderTop: "1px solid #222", paddingTop: 10 }}
                    onClick={e => e.stopPropagation()}>
                    {(m.scores || []).map((round, ri) => {
                      const myThrows = round[pi] || [];
                      const oppThrows = round[1-pi] || [];
                      const ms = totalScore(myThrows);
                      const os = totalScore(oppThrows);
                      const roundWon = ms > os;
                      // OT throws that belong to this round (roundIdx undefined = old data, show on last round)
                      const isLastRound = ri === (m.scores || []).length - 1;
                      const roundOTs = (m.otThrowsLog || []).filter(ot =>
                        ot.type === "round" && (ot.roundIdx === ri || (ot.roundIdx === undefined && isLastRound))
                      );
                      return (
                        <div key={ri} style={{ marginBottom: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ color: GOLD, fontFamily: "monospace", fontSize: 12, fontWeight: "bold" }}>Round {ri+1}</span>
                            <span style={{ color: roundWon ? "#4f4" : "#c44", fontFamily: "monospace", fontSize: 11 }}>
                              {roundWon ? "Won" : "Lost"} {ms}–{os}pts
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                            <span style={{ color: GOLD, fontFamily: "monospace", fontSize: 11, minWidth: 55, flexShrink: 0 }}>{p.name}</span>
                            <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                              {myThrows.map((z, zi) => <ThrowPip key={zi} z={z} />)}
                            </div>
                            <span style={{ color: GOLD, fontFamily: "monospace", fontSize: 11, marginLeft: "auto" }}>{ms}pts</span>
                          </div>
                          {oppId && oppThrows.length > 0 && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: "#888", fontFamily: "monospace", fontSize: 11, minWidth: 55, flexShrink: 0 }}>{oppName}</span>
                              <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                                {oppThrows.map((z, zi) => <ThrowPip key={zi} z={z} />)}
                              </div>
                              <span style={{ color: "#666", fontFamily: "monospace", fontSize: 11, marginLeft: "auto" }}>{os}pts</span>
                            </div>
                          )}
                          {/* Executioner's Rule for this round */}
                          {(m.executionerThrow && m.executionerThrow.roundIdx === ri ? [m.executionerThrow] : [])
                            .map((et, eti) => (
                            <div key={`exec_${eti}`} style={{ marginTop: 6, paddingTop: 6, borderTop: "1px dashed #2a2a2a" }}>
                              <span style={{ color: et.result === "timber" ? "#c1121f" : "#e63946",
                                fontFamily: "monospace", fontSize: 10, fontWeight: "bold" }}>
                                {et.result === "timber" ? "⚔️ TIMBER-GEDDON!" : "⚔️ MERCY THROW"}
                              </span>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                                <span style={{ color: "#aaa", fontFamily: "monospace", fontSize: 11,
                                  minWidth: 55, flexShrink: 0 }}>{getPlayerName(et.playerId)}</span>
                                {et.throw && <ThrowPip z={et.throw} />}
                                <span style={{ color: et.result === "mercy" ? "#e63946" : et.result === "missed" ? "#888" : "#c1121f",
                                  fontFamily: "monospace", fontSize: 10 }}>
                                  {et.result === "mercy" ? "🎯 Nipple Hit!" :
                                   et.result === "missed" ? "💨 Missed" : "👍 No mercy"}
                                </span>
                              </div>
                            </div>
                          ))}
                          {/* Round-level Death Match OT — shown inline after this round */}
                          {roundOTs.map((ot, oti) => {
                            const histP0name = getPlayerName(m.p0);
                            const histP1name = m.p1 ? getPlayerName(m.p1) : null;
                            return (
                              <div key={oti} style={{ marginTop: 6, paddingTop: 6, borderTop: "1px dashed #2a2a2a" }}>
                                <span style={{ color: RED, fontFamily: "monospace", fontSize: 10, fontWeight: "bold" }}>
                                  {ot.tied ? "💀 TIED —" : "💀"} DEATH MATCH{ot.tied ? " (tied again)" : ""}
                                </span>
                                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                                  {[["p0throw", histP0name], ["p1throw", histP1name]].filter(([,n]) => n).map(([key, pname]) => {
                                    const z = ot[key];
                                    const won2 = !ot.tied && ((key === "p0throw" && (ot.p0throw?.points??0) > (ot.p1throw?.points??0)) ||
                                                              (key === "p1throw" && (ot.p1throw?.points??0) > (ot.p0throw?.points??0)));
                                    return (
                                      <div key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                        <span style={{ color: won2 ? GOLD : "#888", fontSize: 10, fontFamily: "monospace", flexShrink: 0 }}>{pname}</span>
                                        <ThrowPip z={z} />
                                        <span style={{ color: won2 ? GOLD : "#666", fontSize: 10, fontFamily: "monospace" }}>{z ? z.points+"pts" : "—"}{won2 ? " 🏆" : ""}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                    {(m.scores || []).length === 0 && <div style={{ color: "#555", fontFamily: "monospace", fontSize: 12 }}>No throw data</div>}
                {/* Executioner's Rule events not attached to a round (fallback for old data) */}
                {(m.executionerThrow && (m.executionerThrow.roundIdx === undefined || m.executionerThrow.roundIdx === null) ? [m.executionerThrow] : [])
                  .map((et, eti) => (
                  <div key={eti} style={{ marginTop: 8, borderTop: "1px dashed #333", paddingTop: 10 }}>
                    <div style={{ color: et.result === "timber" ? "#c1121f" : "#e63946",
                      fontFamily: "monospace", fontSize: 11, fontWeight: "bold", marginBottom: 6 }}>
                      {et.result === "timber" ? "⚔️ EXECUTIONER'S RULE — TIMBER-GEDDON!" : "⚔️ EXECUTIONER'S RULE — MERCY THROW"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: "#aaa", fontFamily: "monospace", fontSize: 12, minWidth: isTablet ? 80 : 55, flexShrink: 0 }}>
                        {getPlayerName(et.playerId)}
                      </span>
                      {et.throw && <ThrowPip z={et.throw} />}
                      <span style={{ color: et.result === "mercy" ? "#e63946" : et.result === "missed" ? "#888" : "#c1121f",
                        fontFamily: "monospace", fontSize: 11 }}>
                        {et.result === "mercy" ? "🎯 Nipple Hit! → Death Match" :
                         et.result === "missed" ? "💨 Nipple Missed — Eliminated!" :
                         "👎 Timber-geddon! — Crowd showed no mercy"}
                      </span>
                    </div>
                  </div>
                ))}
                {/* Death Match OT throws */}
                {(m.otThrowsLog || []).filter(ot => ot.type === 'match' || (ot.type === undefined && ot.roundIdx === undefined)).length > 0 && (
                  <div style={{ marginTop: 8, borderTop: "1px dashed #333", paddingTop: 10 }}>
                    {(m.otThrowsLog || []).filter(ot => ot.type === 'match' || (ot.type === undefined && ot.roundIdx === undefined)).map((ot, oti) => {
                      const histP0name = getPlayerName(m.p0);
                      const histP1name = m.p1 ? getPlayerName(m.p1) : null;
                      return (
                        <div key={oti} style={{ marginBottom: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                            <span style={{ color: ot.type === "match" ? "#ff4444" : RED, fontFamily: "monospace", fontSize: 11, fontWeight: "bold" }}>
                              {ot.tied ? "💀 TIED" : "💀"} {ot.type === "match" ? "MATCH" : "ROUND"} DEATH MATCH {ot.tied ? "(tied)" : ""}
                            </span>
                          </div>
                          {[["p0throw", histP0name], ["p1throw", histP1name]].filter(([,n]) => n).map(([key, pname]) => {
                            const z = ot[key];
                            const won2 = !ot.tied && ((key === "p0throw" && (ot.p0throw?.points ?? 0) > (ot.p1throw?.points ?? 0)) ||
                                                     (key === "p1throw" && (ot.p1throw?.points ?? 0) > (ot.p0throw?.points ?? 0)));
                            return (
                              <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                                <span style={{ color: won2 ? GOLD : "#888", fontFamily: "monospace", fontSize: 12,
                                  minWidth: isTablet ? 80 : 55, flexShrink: 0, fontWeight: won2 ? "bold" : "normal" }}>{pname}</span>
                                <ThrowPip z={z} />
                                <span style={{ color: won2 ? GOLD : "#666", fontFamily: "monospace", fontSize: 12 }}>
                                  {z ? `${z.points}pts` : "—"}{won2 ? " 🏆" : ""}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, padding: isTablet ? 32 : 20, maxWidth: isTablet ? 900 : 600, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: "#333", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontFamily: "monospace", fontWeight: "bold", cursor: "pointer", width: "auto" }}>← Back</button>
        <h2 style={{ color: GOLD, margin: 0, fontFamily: "serif", flex: 1 }}>📊 Stats</h2>
        <button onClick={() => exportStats(players, completedMatches)} style={{ background: "#1a3a1a", color: "#fff", border: "1px solid #3a5a3a", borderRadius: 8, padding: "8px 16px", fontFamily: "monospace", fontWeight: "bold", cursor: "pointer", width: "auto" }}>⬇ CSV</button>
      </div>
      {/* Search bar */}
      <div style={{ marginBottom: 14 }}>
        <input
          value={playerSearch}
          onChange={e => setPlayerSearch(e.target.value)}
          placeholder="🔍 Search players..."
          style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 8,
            padding: "10px 14px", width: "100%", boxSizing: "border-box",
            color: "#fff", fontFamily: "monospace", fontSize: 14 }}
        />
      </div>
      <PlayerStatsTab />
    </div>
  );
}

function TournamentScreen({ players, isAdmin, activeTournament, setActiveTournament, completedMatches, onStartMatch, onBack, notify }) {
  const isTablet = useTablet();
  const [setup, setSetup] = useState({ throwsPerPlayer: 3, roundsPerMatch: 1 });
  const [elimType, setElimType] = useState("single"); // "single" | "double"
  const [tourneyPlayerFilter, setTourneyPlayerFilter] = useState("all"); // "all"|"members"|"guests"
  const [finalBannerMatch, setFinalBannerMatch] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [finalSettings, setFinalSettings] = useState({ throwsPerPlayer: 5, roundsPerMatch: 1 }); // editable on champ banner
  const [showBracketSettings, setShowBracketSettings] = useState(false); // show inline settings editor
  const [showBracketConfirm, setShowBracketConfirm] = useState(() => 
    activeTournament?.phase === "elimination" && !(activeTournament?.bracket?.flat()?.some(m => m.completed && !m.byeMatch))
  ); // show confirm popup at start of bracket if no matches played yet
  const [showSeedingConfirm, setShowSeedingConfirm] = useState(() => !activeTournament?.seedingMatches?.some(m => m.completed)); // only show on first load
  const [seedingSettings, setSeedingSettings] = useState({ throwsPerPlayer: 5, roundsPerMatch: 1 }); // local editable copy
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  // Derive view from activeTournament.phase so it's always in sync
  // (useState initializer only runs once on mount — causes stale view on playoff launch)
  const view = !activeTournament ? "setup"
    : activeTournament.phase === "elimination" ? "bracket"
    : "seeding";
  // setView is now just a helper to update the phase on the tournament object
  const setView = (v) => {
    if (v === "bracket") setActiveTournament(prev => prev ? { ...prev, phase: "elimination" } : prev);
    if (v === "seeding") setActiveTournament(prev => prev ? { ...prev, phase: "seeding" } : prev);
    // "setup" means clear tournament
  };

  const createTournament = () => {
    if (selectedPlayers.length < 2) { notify("Need at least 2 players!"); return; }
    const sorted = [...selectedPlayers];
    const seedingMatches = [];
    for (let i = 0; i < sorted.length - 1; i += 2) {
      seedingMatches.push({
        id: `seed_${i}`, p0: sorted[i], p1: sorted[i + 1],
        type: "seeding", completed: false, seedOnly: false,
      });
    }
    if (sorted.length % 2 !== 0) {
      seedingMatches.push({
        id: `seed_solo`, p0: sorted[sorted.length - 1], p1: null,
        type: "seeding", completed: false, solo: true,
      });
    }
    const t = {
      id: Date.now().toString(), players: sorted,
      settings: setup, seedingMatches, matches: [], bracket: [], phase: "seeding",
      seedScores: {}, elimType, // "single" or "double"
    };
    setActiveTournament(t);
    setSeedingSettings({ throwsPerPlayer: setup.throwsPerPlayer, roundsPerMatch: setup.roundsPerMatch });
    setShowSeedingConfirm(true);
    setView("seeding");
  };

  const completeSeedingMatch = (match, result) => {
    setActiveTournament(prev => {
      const next = { ...prev };
      next.seedingMatches = next.seedingMatches.map(m =>
        m.id === match.id ? { ...m, completed: true, result } : m
      );
      // Record seed scores
      const p0score = result.scores ? result.scores.reduce((s, r) => s + totalScore(r[0] || []), 0) : 0;
      const p1score = result.scores ? result.scores.reduce((s, r) => s + totalScore(r[1] || []), 0) : 0;
      next.seedScores = { ...next.seedScores, [match.p0]: p0score };
      if (match.p1) next.seedScores[match.p1] = p1score;
      return next;
    });
  };

  const buildElimBracket = () => {
    if (!activeTournament) return;
    const { players: tPlayers, seedScores, elimType: tType } = activeTournament;
    const seeded = [...tPlayers].sort((a, b) => (seedScores[b] || 0) - (seedScores[a] || 0));
    if (tType === "double") {
      const dbl = buildDoubleElimBracket(seeded);
      setActiveTournament(prev => ({ ...prev, phase: "elimination", ...dbl, seeded }));
    } else {
      const bracket = buildInitialBracket(seeded);
      setActiveTournament(prev => ({ ...prev, phase: "elimination", bracket, seeded }));
    }
    setShowBracketConfirm(true);
    setView("bracket");
  };

  // buildInitialBracket is defined at module level (used by both TournamentScreen and main app)



  const getPlayerName = (id) => {
    if (!id || id === "bye") return "BYE";
    return players.find(p => p.id === id)?.name || "?";
  };

  const seedingDone = activeTournament?.seedingMatches?.every(m => m.completed);

  // ── Render ──
  if (view === "setup" && !activeTournament) return (
    <div style={{ minHeight: "100vh", background: DARK, color: "#fff", padding: 20, maxWidth: 500, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <button onClick={onBack} style={{ ...btnStyle("#333"), width: "auto" }}>← Back</button>
        <h2 style={{ color: GOLD, margin: 0, fontFamily: "serif" }}>🏆 Elimination Tournament</h2>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={cardStyle}>
          <h3 style={{ color: GOLD, margin: "0 0 10px" }}>Settings</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ color: "#888", fontSize: 11 }}>Throws/Player <span style={{color:"#555"}}>(final always 5)</span></label>
              <select value={setup.throwsPerPlayer} onChange={e => setSetup(s => ({ ...s, throwsPerPlayer: Number(e.target.value) }))} style={inputStyle}>
                {[3,4,5,6,7,8,9,10].map(n => <option key={n}>{n}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ color: "#888", fontSize: 11 }}>Rounds/Match</label>
              <select value={setup.roundsPerMatch} onChange={e => setSetup(s => ({ ...s, roundsPerMatch: Number(e.target.value) }))} style={inputStyle}>
                {[1,2,3,4,5].map(n => <option key={n}>{n}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h3 style={{ color: GOLD, margin: 0 }}>Select Competitors ({selectedPlayers.length}/50)</h3>
            <div style={{ display: "flex", gap: 4 }}>
              {[["all","All"],["members","🏅"],["guests","🎯"]].map(([val,label]) => (
                <button key={val} onClick={() => setTourneyPlayerFilter(val)} style={{
                  background: tourneyPlayerFilter === val ? GOLD : "#222",
                  color: tourneyPlayerFilter === val ? DARK : "#888",
                  border: `1px solid ${tourneyPlayerFilter === val ? GOLD : "#444"}`,
                  borderRadius: 6, padding: "3px 10px", fontSize: 11, fontFamily: "monospace", cursor: "pointer",
                }}>{label}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {players.filter(p => tourneyPlayerFilter === "all" || (tourneyPlayerFilter === "members" ? p.member : !p.member)).map(p => {
              const sel = selectedPlayers.includes(p.id);
              return (
                <button key={p.id} onClick={() => {
                  if (sel) setSelectedPlayers(prev => prev.filter(x => x !== p.id));
                  else if (selectedPlayers.length < 50) setSelectedPlayers(prev => [...prev, p.id]);
                }} style={{
                  background: sel ? GOLD : "#222", color: sel ? DARK : "#ccc",
                  border: `2px solid ${sel ? GOLD : p.member ? "#3a6a3a" : "#444"}`, borderRadius: 8,
                  padding: "8px 14px", fontFamily: "monospace", fontWeight: "bold", cursor: "pointer", fontSize: 13,
                }}>
                  {p.member ? "🏅 " : "🎯 "}{p.name}
                </button>
              );
            })}
          </div>
        </div>
        {/* Elimination type toggle */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {[["single", "⚔️ Single Elim"], ["double", "🔥 Double Elim"]].map(([val, label]) => (
            <button key={val} onClick={() => setElimType(val)} style={{
              flex: 1, background: elimType === val ? (val === "double" ? "#3a0a0a" : "#1a2a1a") : "#1a1a1a",
              color: elimType === val ? (val === "double" ? "#ff6666" : GOLD) : "#555",
              border: `2px solid ${elimType === val ? (val === "double" ? "#c1121f" : GOLD) : "#333"}`,
              borderRadius: 8, padding: "10px", fontFamily: "monospace",
              fontWeight: "bold", cursor: "pointer", fontSize: 13,
            }}>{label}</button>
          ))}
        </div>
        {elimType === "double" && (
          <div style={{ color: "#888", fontFamily: "monospace", fontSize: 11, marginBottom: 10, textAlign: "center" }}>
            Every player gets 2 losses before elimination. Winners & Losers brackets.
          </div>
        )}
        <button onClick={createTournament} disabled={selectedPlayers.length < 2 || !isAdmin}
          style={{ ...btnStyle(GOLD, DARK), opacity: selectedPlayers.length < 2 ? 0.5 : 1 }}>
          🪓 Start Tournament
        </button>
      </div>
    </div>
  );

  if (activeTournament && view === "seeding") return (
    <div style={{ minHeight: "100vh", background: DARK, color: "#fff", padding: 20, maxWidth: 500, margin: "0 auto" }}>

      {/* Seeding settings confirmation overlay */}
      {showSeedingConfirm && isAdmin && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.92)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#151515", border: `2px solid ${GOLD}`, borderRadius: 16,
            padding: 28, maxWidth: 400, width: "100%", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>🪓</div>
            <div style={{ color: GOLD, fontFamily: "Georgia, serif", fontSize: 20, fontWeight: "bold", marginBottom: 6 }}>
              Seeding Round Setup
            </div>
            <div style={{ color: "#888", fontFamily: "monospace", fontSize: 12, marginBottom: 20 }}>
              Confirm throws and rounds for seeding matches
            </div>
            <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1, textAlign: "left" }}>
                <label style={{ color: "#888", fontSize: 11, display: "block", marginBottom: 4, fontFamily: "monospace" }}>Throws/Player</label>
                <select value={seedingSettings.throwsPerPlayer}
                  onChange={e => setSeedingSettings(s => ({ ...s, throwsPerPlayer: Number(e.target.value) }))}
                  style={{ background: "#222", color: "#fff", border: `1px solid ${GOLD}66`, borderRadius: 6,
                    padding: "8px 12px", width: "100%", fontSize: 15, fontFamily: "monospace" }}>
                  {[3,4,5,6,7,8,9,10].map(n => <option key={n}>{n}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, textAlign: "left" }}>
                <label style={{ color: "#888", fontSize: 11, display: "block", marginBottom: 4, fontFamily: "monospace" }}>Rounds/Match</label>
                <select value={seedingSettings.roundsPerMatch}
                  onChange={e => setSeedingSettings(s => ({ ...s, roundsPerMatch: Number(e.target.value) }))}
                  style={{ background: "#222", color: "#fff", border: `1px solid ${GOLD}66`, borderRadius: 6,
                    padding: "8px 12px", width: "100%", fontSize: 15, fontFamily: "monospace" }}>
                  {[1,2,3,4,5].map(n => <option key={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <button
              onClick={() => {
                // Save seeding settings into the tournament
                setActiveTournament(prev => ({ ...prev, settings: { ...prev.settings, ...seedingSettings } }));
                setShowSeedingConfirm(false);
              }}
              style={{ ...btnStyle(GOLD, DARK), fontSize: 17, padding: "14px 32px" }}>
              🪓 Start Seeding Round
            </button>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: confirmReset ? 8 : 0 }}>
          <button onClick={onBack} style={{ ...btnStyle("#333"), width: "auto" }}>← Back</button>
          <h2 style={{ color: GOLD, margin: 0, fontFamily: "serif", flex: 1, fontSize: isTablet ? 24 : 18 }}>Seeding Round</h2>
          {isAdmin && <button onClick={() => setShowSeedingConfirm(true)}
            style={{ ...btnStyle("#222"), border: "1px solid #555", width: "auto", padding: "6px 12px", fontSize: 12 }}>
            ⚙️ {activeTournament.settings.throwsPerPlayer}T · {activeTournament.settings.roundsPerMatch}R
          </button>}
          {isAdmin && !confirmReset && (
            <button onClick={() => setConfirmReset(true)} style={{ background: RED, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontFamily: "monospace", fontWeight: "bold", cursor: "pointer", fontSize: 13, flexShrink: 0 }}>⚠️ Reset</button>
          )}
        </div>
        {isAdmin && confirmReset && (
          <div style={{ background: "#2a0a0a", border: `1px solid ${RED}`, borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ color: "#ff8888", fontFamily: "monospace", fontSize: 13, flex: 1 }}>Reset and clear the tournament?</span>
            <button onClick={() => { setActiveTournament(null); setConfirmReset(false); }} style={{ background: RED, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontFamily: "monospace", fontWeight: "bold", cursor: "pointer" }}>Yes, Reset</button>
            <button onClick={() => setConfirmReset(false)} style={{ background: "#444", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontFamily: "monospace", fontWeight: "bold", cursor: "pointer" }}>Cancel</button>
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {activeTournament.seedingMatches.map(m => {
          const p0 = getPlayerName(m.p0);
          const p1 = m.solo ? "SOLO" : getPlayerName(m.p1);
          const score0 = activeTournament.seedScores?.[m.p0] ?? "-";
          const score1 = m.p1 ? (activeTournament.seedScores?.[m.p1] ?? "-") : "-";
          return (
            <div key={m.id} style={{ ...cardStyle, border: `1px solid ${m.completed ? "#3a5a3a" : BORDER}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ color: GOLD }}>{p0}</span>
                  {!m.solo && <> <span style={{ color: "#555" }}>vs</span> <span style={{ color: GOLD }}>{p1}</span></>}
                  {m.solo && <span style={{ color: "#888" }}> (solo seed)</span>}
                </div>
                <div style={{ color: "#aaa", fontSize: 13 }}>
                  {m.completed ? <span style={{ color: "#4f4" }}>✓ {score0}{!m.solo && ` - ${score1}`}</span> : <span style={{ color: "#888" }}>Pending</span>}
                </div>
              </div>
              {!m.completed && isAdmin && (
                <button onClick={() => onStartMatch(
                  { id: m.id, p0: m.p0, p1: m.solo ? null : m.p1, tournamentId: activeTournament.id, matchType: "seeding" },
                  activeTournament.settings
                )} style={{ ...btnStyle(GOLD, DARK), marginTop: 8 }}>
                  🪓 Play Match
                </button>
              )}
            </div>
          );
        })}
        {seedingDone && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {showBracketSettings ? (
              <div style={{ background: "#151515", border: `1px solid ${GOLD}55`, borderRadius: 10, padding: 14 }}>
                <div style={{ color: GOLD, fontFamily: "monospace", fontSize: 12, fontWeight: "bold", marginBottom: 10 }}>
                  ⚙️ BRACKET MATCH SETTINGS
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ color: "#888", fontSize: 11, display: "block", marginBottom: 4 }}>Throws/Player</label>
                    <select value={activeTournament.settings.throwsPerPlayer}
                      onChange={e => setActiveTournament(prev => ({ ...prev, settings: { ...prev.settings, throwsPerPlayer: Number(e.target.value) } }))}
                      style={{ background: "#222", color: "#fff", border: "1px solid #444", borderRadius: 6, padding: "6px 10px", width: "100%", fontSize: 14 }}>
                      {[3,4,5,6,7,8,9,10].map(n => <option key={n}>{n}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ color: "#888", fontSize: 11, display: "block", marginBottom: 4 }}>Rounds/Match</label>
                    <select value={activeTournament.settings.roundsPerMatch}
                      onChange={e => setActiveTournament(prev => ({ ...prev, settings: { ...prev.settings, roundsPerMatch: Number(e.target.value) } }))}
                      style={{ background: "#222", color: "#fff", border: "1px solid #444", borderRadius: 6, padding: "6px 10px", width: "100%", fontSize: 14 }}>
                      {[1,2,3,4,5].map(n => <option key={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { setShowBracketSettings(false); buildElimBracket(); }}
                    style={{ ...btnStyle("#1a3a1a"), border: `1px solid ${GOLD}`, flex: 1 }}>
                    🏆 Build Bracket with These Settings
                  </button>
                  <button onClick={() => setShowBracketSettings(false)}
                    style={{ ...btnStyle("#333"), border: "1px solid #444", width: "auto", padding: "10px 16px" }}>
                    ✕
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={buildElimBracket} style={{ ...btnStyle("#1a3a1a"), border: `1px solid ${GOLD}`, flex: 1 }}>
                  🏆 Build Elimination Bracket →
                </button>
                <button onClick={() => setShowBracketSettings(true)}
                  style={{ ...btnStyle("#222"), border: "1px solid #555", width: "auto", padding: "10px 16px" }}
                  title="Edit match settings before building bracket">
                  ⚙️
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (activeTournament && view === "bracket") {
    // Flatten all rounds into one list, grouped by round label
    const allBracketMatches = (activeTournament.bracket || []).flat();
    // Figure out the current active round: first round with any incomplete non-bye match
    const activeRoundIdx = (activeTournament.bracket || []).findIndex(round =>
      round.some(m => !m.completed && !m.byeMatch)
    );

    return (
      <div style={{ minHeight: "100vh", background: DARK, color: "#fff", padding: isTablet ? 32 : 20, maxWidth: isTablet ? 1000 : 600, margin: "0 auto" }}>

        {/* Elimination Bracket settings confirmation overlay */}
        {showBracketConfirm && isAdmin && (
          <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.92)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <div style={{ background: "#151515", border: `2px solid ${GOLD}`, borderRadius: 16,
              padding: 28, maxWidth: 400, width: "100%", textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>🏆</div>
              <div style={{ color: GOLD, fontFamily: "Georgia, serif", fontSize: 20, fontWeight: "bold", marginBottom: 6 }}>
                Elimination Bracket
              </div>
              <div style={{ color: "#888", fontFamily: "monospace", fontSize: 12, marginBottom: 20 }}>
                Confirm throws and rounds for bracket matches
              </div>
              <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <label style={{ color: "#888", fontSize: 11, display: "block", marginBottom: 4, fontFamily: "monospace" }}>Throws/Player</label>
                  <select value={activeTournament.settings.throwsPerPlayer}
                    onChange={e => setActiveTournament(prev => ({ ...prev, settings: { ...prev.settings, throwsPerPlayer: Number(e.target.value) } }))}
                    style={{ background: "#222", color: "#fff", border: `1px solid ${GOLD}66`, borderRadius: 6,
                      padding: "8px 12px", width: "100%", fontSize: 15, fontFamily: "monospace" }}>
                    {[3,4,5,6,7,8,9,10].map(n => <option key={n}>{n}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <label style={{ color: "#888", fontSize: 11, display: "block", marginBottom: 4, fontFamily: "monospace" }}>Rounds/Match</label>
                  <select value={activeTournament.settings.roundsPerMatch}
                    onChange={e => setActiveTournament(prev => ({ ...prev, settings: { ...prev.settings, roundsPerMatch: Number(e.target.value) } }))}
                    style={{ background: "#222", color: "#fff", border: `1px solid ${GOLD}66`, borderRadius: 6,
                      padding: "8px 12px", width: "100%", fontSize: 15, fontFamily: "monospace" }}>
                    {[1,2,3,4,5].map(n => <option key={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <button
                onClick={() => setShowBracketConfirm(false)}
                style={{ ...btnStyle(GOLD, DARK), fontSize: 17, padding: "14px 32px" }}>
                🏆 Start Elimination Bracket
              </button>
            </div>
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: confirmReset ? 8 : 0 }}>
            <button onClick={onBack} style={{ ...btnStyle("#333"), width: "auto" }}>← Back</button>
            <h2 style={{ color: GOLD, margin: 0, fontFamily: "serif", flex: 1, minWidth: 0, fontSize: isTablet ? 24 : 18 }}>🏆 Elimination</h2>
            {isAdmin && !confirmReset && (
              <button onClick={() => setConfirmReset(true)} style={{ background: RED, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontFamily: "monospace", fontWeight: "bold", cursor: "pointer", fontSize: 13, flexShrink: 0 }}>⚠️ Reset</button>
            )}
          </div>
          {isAdmin && confirmReset && (
            <div style={{ background: "#2a0a0a", border: `1px solid ${RED}`, borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ color: "#ff8888", fontFamily: "monospace", fontSize: 13, flex: 1 }}>Reset and clear the tournament?</span>
              <button onClick={() => { setActiveTournament(null); setConfirmReset(false); }} style={{ background: RED, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontFamily: "monospace", fontWeight: "bold", cursor: "pointer" }}>Yes, Reset</button>
              <button onClick={() => setConfirmReset(false)} style={{ background: "#444", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontFamily: "monospace", fontWeight: "bold", cursor: "pointer" }}>Cancel</button>
            </div>
          )}
        </div>

        {/* Seed list */}
        {activeTournament.seeded && (
          <div style={{ ...cardStyle, marginBottom: 14 }}>
            <div style={{ color: GOLD, fontFamily: "monospace", fontSize: 12, marginBottom: 6, fontWeight: "bold" }}>SEEDS</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {activeTournament.seeded.map((pid, i) => (
                <div key={pid} style={{ background: "#1a1a1a", border: `1px solid #333`, borderRadius: 6, padding: "3px 9px", fontSize: 12 }}>
                  <span style={{ color: GOLD }}>#{i + 1}</span> {getPlayerName(pid)}
                  <span style={{ color: "#666" }}> {activeTournament.seedScores?.[pid] ?? 0}pts</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Render bracket rounds — handles single and double elimination */}
        {(() => {
          const isDouble = activeTournament.type === "double";

          // Reusable match card renderer
          const renderMatch = (m, bracketLabel) => {
            if (!m || (!m.p0 && !m.p1)) return null;
            const isBye = m.byeMatch;
            const p0Name = getPlayerName(m.p0);
            const p1Name = getPlayerName(m.p1);
            const isGrandFinal = m.id === "grand_final" || m.id === "grand_final_reset";
            const p0missing = !m.p0 || !players.find(p => p.id === m.p0);
            const p1missing = !m.p1 || !players.find(p => p.id === m.p1);
            const hasMissing = (p0missing || p1missing) && !isBye;
            return (
              <div key={m.id} style={{
                ...cardStyle,
                border: `1px solid ${
                  isGrandFinal ? "#9b5de5" :
                  isBye ? "#1e2e1e" :
                  m.completed ? "#3a6a3a" :
                  bracketLabel === "L" ? `${RED}88` :
                  `${GOLD}88`
                }`,
                opacity: isBye ? 0.5 : 1,
                marginBottom: 6,
              }}>
                {isGrandFinal && <div style={{ color: "#9b5de5", fontFamily: "monospace", fontSize: 10, fontWeight: "bold", marginBottom: 4 }}>
                  👑 {m.id === "grand_final_reset" ? "BRACKET RESET — GRAND FINAL" : "GRAND FINAL"}
                </div>}
                <div style={{ fontFamily: "monospace", fontSize: 15, marginBottom: 6 }}>
                  <span style={{ color: m.winner === m.p0 ? GOLD : "#ddd" }}>{p0Name}</span>
                  {!isBye && <><span style={{ color: "#555", margin: "0 10px" }}>vs</span>
                  <span style={{ color: m.winner === m.p1 ? GOLD : "#ddd" }}>{p1Name}</span></>}
                  {isBye && <span style={{ color: "#555", fontSize: 12 }}> — advances (bye)</span>}
                </div>
                {isBye ? null : m.completed
                  ? <div style={{ color: "#4f4", fontSize: 13 }}>🏆 {getPlayerName(m.winner)} wins</div>
                  : isAdmin ? (() => {
                      if (hasMissing) {
                        const winner = p0missing ? m.p1 : m.p0;
                        return (
                          <button onClick={() => {
                            setActiveTournament(prev => {
                              if (!prev) return prev;
                              const next = { ...prev };
                              if (prev.type === "double") {
                                const updated = progressDoubleElim(next, m.id, winner, p0missing ? m.p0 : m.p1);
                                Object.assign(next, updated);
                              } else {
                                next.bracket = (next.bracket || []).map(r => r.map(bm => bm.id === m.id ? { ...bm, completed: true, winner } : bm));
                              }
                              return next;
                            });
                          }} style={{ ...btnStyle("#555"), fontSize: 12, border: "1px solid #777" }}>
                            🚫 Forfeit — {getPlayerName(winner)} advances
                          </button>
                        );
                      }
                      const playMatch = () => {
                        if (!players.find(p => p.id === m.p0) || !players.find(p => p.id === m.p1)) return;
                        const grandFinalSettings = { throwsPerPlayer: 5, roundsPerMatch: 5 };
                        if (isGrandFinal) {
                          onStartMatch({ id: m.id, p0: m.p0, p1: m.p1, tournamentId: activeTournament.id, matchType: "elimination" }, grandFinalSettings);
                        } else if (isDouble) {
                          onStartMatch({ id: m.id, p0: m.p0, p1: m.p1, tournamentId: activeTournament.id, matchType: "elimination" }, activeTournament.settings);
                        } else {
                          const allFlat = (activeTournament.bracket || []).flat();
                          const eliminated = new Set(allFlat.filter(x => x.completed && x.winner).map(x => x.p0 === x.winner ? x.p1 : x.p0).filter(Boolean));
                          const remaining = (activeTournament.players || []).length - eliminated.size;
                          const isFinal = remaining === 2 && !m.completed && m.p0 && m.p1;
                          if (isFinal && !activeTournament.isPlayoff) {
                            setFinalSettings({ throwsPerPlayer: 5, roundsPerMatch: 3 });
                            setFinalBannerMatch({ id: m.id, p0: m.p0, p1: m.p1 });
                          } else {
                            onStartMatch({ id: m.id, p0: m.p0, p1: m.p1, tournamentId: activeTournament.id, matchType: "elimination" }, activeTournament.settings);
                          }
                        }
                      };
                      const allFlat = isDouble ? [] : (activeTournament.bracket || []).flat();
                      const eliminated = new Set(allFlat.filter(x => x.completed && x.winner).map(x => x.p0 === x.winner ? x.p1 : x.p0).filter(Boolean));
                      const remaining = (activeTournament.players || []).length - eliminated.size;
                      const isFinal = !isDouble && remaining === 2 && !m.completed && m.p0 && m.p1;
                      return (
                        <button onClick={playMatch}
                          style={{ ...btnStyle(isGrandFinal ? "#4a0080" : isFinal ? "#4a0080" : GOLD, isGrandFinal || isFinal ? "#fff" : DARK),
                            border: (isGrandFinal || isFinal) ? "2px solid #bb86fc" : "none" }}>
                          {isGrandFinal ? "👑 Play Grand Final" : isFinal ? "👑 Play Championship Match" : "🪓 Play Match"}
                        </button>
                      );
                    })()
                  : <div style={{ color: "#888", fontSize: 12 }}>Pending</div>
                }
              </div>
            );
          };

          const renderRounds = (rounds, label, color) => {
            const firstReal = rounds.findIndex(r => r.some(m => !m.byeMatch));
            return rounds.map((round, ri) => {
              if (!round || !round.some(m => m.p0 || m.p1)) return null;
              const roundNum = round[0]?.roundNum ?? (ri + 1);
              const isActive = ri === firstReal;
              return (
                <div key={`${label}_r${ri}`} style={{ marginBottom: 16 }}>
                  <div style={{ color: isActive ? color : "#555", fontFamily: "monospace", fontSize: 11,
                    fontWeight: "bold", marginBottom: 8, letterSpacing: 2 }}>
                    {isActive ? "▶ " : ""}{label} ROUND {roundNum}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {round.filter(m => m.p0 || m.p1).map(m => renderMatch(m, label))}
                  </div>
                </div>
              );
            });
          };

          if (isDouble) {
            const wBracket = activeTournament.wBracket || [];
            const lBracket = activeTournament.lBracket || [];
            const gf = activeTournament.grandFinal;
            const gfr = activeTournament.grandFinalReset;
            if (wBracket.length === 0) {
              return <div style={{ color: RED, fontFamily: "monospace", padding: 20, textAlign: "center" }}>No bracket data. Try resetting.</div>;
            }
            return (
              <div>
                <div style={{ color: GOLD, fontFamily: "monospace", fontSize: 12, fontWeight: "bold", marginBottom: 10, letterSpacing: 2 }}>⚔️ WINNERS BRACKET</div>
                {renderRounds(wBracket, "W", GOLD)}
                {lBracket.some(r => r && r.length > 0) && <>
                  <div style={{ height: 1, background: "#333", margin: "16px 0" }} />
                  <div style={{ color: RED, fontFamily: "monospace", fontSize: 12, fontWeight: "bold", marginBottom: 10, letterSpacing: 2 }}>💀 LOSERS BRACKET</div>
                  {renderRounds(lBracket, "L", RED)}
                </>}
                {gf && !gf.completed && gf.p0 && gf.p1 && <>
                  <div style={{ height: 1, background: "#9b5de5", margin: "16px 0" }} />
                  <div style={{ color: "#9b5de5", fontFamily: "monospace", fontSize: 12, fontWeight: "bold", marginBottom: 10, letterSpacing: 2 }}>👑 GRAND FINAL</div>
                  {renderMatch(gf, "GF")}
                </>}
                {gfr && !gfr.completed && gfr.p0 && gfr.p1 && <>
                  <div style={{ height: 1, background: "#9b5de5", margin: "16px 0" }} />
                  {renderMatch(gfr, "GF")}
                </>}
              </div>
            );
          }

          // Single elimination
          const bracket = activeTournament.bracket || [];
          if (bracket.length === 0) {
            return <div style={{ color: RED, fontFamily: "monospace", padding: 20, textAlign: "center" }}>No bracket data. Try resetting.</div>;
          }
          const firstRealRoundIdx = bracket.findIndex(r => r.some(m => !m.byeMatch));
          return bracket.map((round, ri) => {
            const roundNum = round[0]?.roundNum ?? (ri + 1);
            const isActiveRound = ri === firstRealRoundIdx;
            const hasRealMatches = round.some(m => !m.byeMatch);
            if (!round.some(m => m.p0 || m.p1)) return null;
            return (
              <div key={ri} style={{ marginBottom: 20 }}>
                <div style={{ color: isActiveRound ? GOLD : "#555", fontFamily: "monospace", fontSize: 11,
                  fontWeight: "bold", marginBottom: 8, letterSpacing: 2, textTransform: "uppercase" }}>
                  {isActiveRound ? "▶ " : ""}{hasRealMatches ? `Round ${roundNum}` : `Round ${roundNum} — Auto Advances`}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {round.filter(m => m.p0 || m.p1).map(m => renderMatch(m, "W"))}
                </div>
              </div>
            );
          });
        })()}

        {/* Championship pre-match settings banner */}
        {finalBannerMatch && (
          <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.95)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <div style={{ background: "#0d0d0d", border: `2px solid #9b5de5`, borderRadius: 16,
              padding: 28, maxWidth: 400, width: "100%", textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>🪓🏆🪓</div>
              <div style={{ color: "#9b5de5", fontFamily: "Georgia, serif", fontSize: 22, fontWeight: "bold", marginBottom: 6 }}>
                Championship Match
              </div>
              <div style={{ color: GOLD, fontFamily: "monospace", fontSize: 16, marginBottom: 4 }}>
                {getPlayerName(finalBannerMatch.p0)}
              </div>
              <div style={{ color: "#555", fontFamily: "monospace", fontSize: 13, marginBottom: 4 }}>vs</div>
              <div style={{ color: GOLD, fontFamily: "monospace", fontSize: 16, marginBottom: 20 }}>
                {getPlayerName(finalBannerMatch.p1)}
              </div>
              <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <label style={{ color: "#888", fontSize: 11, display: "block", marginBottom: 4, fontFamily: "monospace" }}>Throws/Player</label>
                  <select value={finalSettings.throwsPerPlayer}
                    onChange={e => setFinalSettings(prev => ({ ...prev, throwsPerPlayer: Number(e.target.value) }))}
                    style={{ background: "#222", color: "#fff", border: `1px solid #9b5de5`, borderRadius: 6,
                      padding: "8px 12px", width: "100%", fontSize: 15, fontFamily: "monospace" }}>
                    {[3,4,5,6,7,8,9,10].map(n => <option key={n}>{n}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <label style={{ color: "#888", fontSize: 11, display: "block", marginBottom: 4, fontFamily: "monospace" }}>Rounds</label>
                  <select value={finalSettings.roundsPerMatch}
                    onChange={e => setFinalSettings(prev => ({ ...prev, roundsPerMatch: Number(e.target.value) }))}
                    style={{ background: "#222", color: "#fff", border: `1px solid #9b5de5`, borderRadius: 6,
                      padding: "8px 12px", width: "100%", fontSize: 15, fontFamily: "monospace" }}>
                    {[1,2,3,4,5].map(n => <option key={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <button onClick={() => {
                onStartMatch({ id: finalBannerMatch.id, p0: finalBannerMatch.p0, p1: finalBannerMatch.p1,
                  tournamentId: activeTournament.id, matchType: "elimination" }, finalSettings);
                setFinalBannerMatch(null);
              }} style={{ background: "#9b5de5", color: "#fff", border: "none", borderRadius: 10,
                padding: "14px 32px", fontFamily: "monospace", fontWeight: "bold", fontSize: 16, cursor: "pointer", width: "100%" }}>
                🪓 Begin Championship
              </button>
              <button onClick={() => setFinalBannerMatch(null)}
                style={{ background: "transparent", border: "none", color: "#555", fontFamily: "monospace",
                  fontSize: 13, cursor: "pointer", marginTop: 10, width: "100%" }}>
                ✕ Cancel
              </button>
            </div>
          </div>
        )}

        {/* Champion floating overlay banner */}
        {(() => {
          if (activeTournament.championDismissed) return null;
          // Use explicitly stored champion, or fall back to last completed real match winner
          const allMatches = activeTournament.type === "double"
            ? [...(activeTournament.wBracket || []).flat(), ...(activeTournament.lBracket || []).flat(),
               activeTournament.grandFinal, activeTournament.grandFinalReset].filter(Boolean)
            : (activeTournament.bracket || []).flat();
          const remainingReal = allMatches.filter(m => !m.completed && !m.byeMatch && m.p0 && m.p1);
          const lastRealMatch = allMatches.filter(m => m.completed && !m.byeMatch && m.winner).slice(-1)[0];
          const champId = activeTournament.champion || (remainingReal.length === 0 ? lastRealMatch?.winner : null);
          if (champId) {
            const champName = getPlayerName(champId);
            return (
              <ChampionBanner name={champName} onClose={() => setActiveTournament(null)} />
            );
          }
          return null;
        })()}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: DARK, padding: 20 }}>
      <button onClick={onBack} style={btnStyle("#333")}>← Back</button>
      <div style={{ color: "#888", marginTop: 20 }}>Loading tournament...</div>
    </div>
  );
}

// ─── LEAGUE SCREEN ────────────────────────────────────────────────────────────
// League settings: always 3 rounds of 5 throws. Win 2/3 rounds = match win.
// All 3 rounds always played for stats. Leagues are named, stats persist across leagues.
function LeagueScreen({ players, isAdmin, activeLeague, setActiveLeague, leagueHistory, setLeagueHistory, onStartMatch, onStartPlayoff, onBack, notify }) {
  const isTablet = useTablet();
  const LEAGUE_SETTINGS = { throwsPerPlayer: 5, roundsPerMatch: 3, matchesPerPlayer: 3, days: 7 };
  const [leagueName, setLeagueName] = useState("");
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [dayView, setDayView] = useState(0);
  const [tab, setTab] = useState("schedule"); // schedule | standings | history
  const [confirmReset, setConfirmReset] = useState(false);
  const [leaguePlayerFilter, setLeaguePlayerFilter] = useState("all");
  const [viewingHistory, setViewingHistory] = useState(null);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [addPlayerSelected, setAddPlayerSelected] = useState([]);

  const addPlayersToLeague = (newPlayerIds) => {
    if (!activeLeague || newPlayerIds.length === 0) return;
    const now = Date.now();
    const allIds = [...activeLeague.players, ...newPlayerIds];
    const days = activeLeague.settings?.days || 7;

    // Keep completed matches exactly as-is
    const completedMatches = (activeLeague.matches || []).filter(m => m.completed);

    // Count how many completed matches each existing player has
    const completedCount = {};
    allIds.forEach(id => { completedCount[id] = 0; });
    completedMatches.forEach(m => {
      if (m.p0 in completedCount) completedCount[m.p0]++;
      if (m.p1 && m.p1 in completedCount) completedCount[m.p1]++;
    });

    // Target remaining matches = 21 minus what the least-played player has already played
    // This keeps everyone at ~21 total by the end
    const maxCompleted = Math.max(...Object.values(completedCount));
    const targetRemaining = Math.max(3, 21 - maxCompleted);

    // Regenerate all unplayed matches with full player list
    const freshSchedule = buildLeagueSchedule(allIds, days, targetRemaining);
    const freshMatches = freshSchedule.flatMap((dayMatches, di) =>
      dayMatches.map(([p0, p1], mi) => ({
        id: `league_d${di}_m${mi}_${now + di * 100 + mi}`,
        p0, p1, day: di, completed: false,
      }))
    );

    const totalPerPlayer = maxCompleted + targetRemaining;
    setActiveLeague(prev => ({
      ...prev,
      players: allIds,
      matches: [...completedMatches, ...freshMatches],
      midLeagueJoins: [
        ...(prev.midLeagueJoins || []),
        ...newPlayerIds.map(id => ({ id, joinedAt: now })),
      ],
    }));
    notify(`Added ${newPlayerIds.length} player${newPlayerIds.length > 1 ? "s" : ""} — schedule reset! ~${totalPerPlayer} matches each`);
    setShowAddPlayer(false);
    setAddPlayerSelected([]);
  };

  const getPlayerName = (id) => players.find(p => p.id === id)?.name || "?";

  const createLeague = () => {
    if (!leagueName.trim()) { notify("Please enter a league name!"); return; }
    if (selectedPlayers.length < 2) { notify("Need at least 2 players!"); return; }
    if (!isAdmin) { notify("Admin required"); return; }
    const schedule = buildLeagueSchedule(selectedPlayers);
    const matches = schedule.flatMap((dayMatches, di) =>
      dayMatches.map(([p0, p1], mi) => ({
        id: `league_d${di}_m${mi}_${Date.now()}`, p0, p1, day: di, completed: false,
      }))
    );
    setActiveLeague({
      id: Date.now().toString(),
      name: leagueName.trim(),
      players: selectedPlayers,
      settings: LEAGUE_SETTINGS,
      matches,
      createdAt: Date.now(),
    });
  };

  // Compute standings from active league matches
  const getStandings = (leagueData) => {
    if (!leagueData) return [];
    const tally = {};
    leagueData.players.forEach(id => { tally[id] = { wins: 0, losses: 0, roundWins: 0, roundLosses: 0, bullseyes: 0, nipples: 0, inners: 0, outers: 0, misses: 0, totalPts: 0, totalThrows: 0, matchesPlayed: 0, perfectRounds: 0, unnaturalPerfects: 0, supernaturals: 0 }; });
    (leagueData.matches || []).filter(m => m.completed).forEach(m => {
      if (!tally[m.p0] || !tally[m.p1]) return;
      // Count round wins from scores
      let r0 = 0, r1 = 0;
      // Use stored p0rounds/p1rounds (which include OT round wins) if available
      if (m.p0rounds != null && m.p1rounds != null) {
        r0 = m.p0rounds; r1 = m.p1rounds;
      } else {
        (m.scores || []).forEach(round => {
          const s0 = totalScore(round[0] || []);
          const s1 = totalScore(round[1] || []);
          if (s0 > s1) r0++; else if (s1 > s0) r1++;
        });
      }
      // dummy forEach to keep structure (scores still used for throw stats below)
      ;(m.scores || []).forEach(round => {
        void round; // throw stats counted separately below
        // Stats for all throws + round achievements
        [0,1].forEach(pi => {
          const pid = pi === 0 ? m.p0 : m.p1;
          const throws = round[pi] || [];
          const roundScore = totalScore(throws);
          const hasNipple = throws.some(t => t?.id?.startsWith("nipple"));
          throws.forEach(t => {
            tally[pid].totalPts += t?.points || 0;
            tally[pid].totalThrows++;
            if (t?.id === "bullseye") tally[pid].bullseyes++;
            else if (t?.id?.startsWith("nipple")) tally[pid].nipples++;
            else if (t?.id === "inner") tally[pid].inners++;
            else if (t?.id === "outer") tally[pid].outers++;
            else tally[pid].misses++;
          });
          // Round achievement titles
          if (roundScore > 25) {
            tally[pid].supernaturals++;
          } else if (roundScore === 25 && hasNipple) {
            tally[pid].unnaturalPerfects++;
          } else if (roundScore === 25 && !hasNipple) {
            tally[pid].perfectRounds++;
          }
        });
      });
      tally[m.p0].roundWins += r0; tally[m.p0].roundLosses += r1;
      tally[m.p1].roundWins += r1; tally[m.p1].roundLosses += r0;
      tally[m.p0].matchesPlayed++; tally[m.p1].matchesPlayed++;
      // Match winner = most rounds won (always play all 3)
      if (m.winner) {
        tally[m.winner].wins++;
        const loser = m.winner === m.p0 ? m.p1 : m.p0;
        if (tally[loser]) tally[loser].losses++;
      }
    });
    return leagueData.players
      .map(id => ({ id, name: getPlayerName(id), ...tally[id] }))
      .sort((a, b) => b.wins - a.wins || b.roundWins - a.roundWins);
  };

  // All-time stats across all league history for a player
  const getCareerStats = (playerId) => {
    const base = { wins: 0, losses: 0, roundWins: 0, roundLosses: 0, bullseyes: 0, nipples: 0, inners: 0, outers: 0, misses: 0, totalPts: 0, totalThrows: 0, matchesPlayed: 0, perfectRounds: 0, unnaturalPerfects: 0, supernaturals: 0, leagues: 0 };
    [...(leagueHistory || []), ...(activeLeague ? [activeLeague] : [])].forEach(league => {
      if (!league.players.includes(playerId)) return;
      base.leagues++;
      const s = getStandings(league).find(p => p.id === playerId);
      if (!s) return;
      base.wins += s.wins; base.losses += s.losses;
      base.roundWins += s.roundWins; base.roundLosses += s.roundLosses;
      base.bullseyes += s.bullseyes; base.nipples += s.nipples;
      base.inners += s.inners; base.outers += s.outers; base.misses += s.misses;
      base.totalPts += s.totalPts; base.totalThrows += s.totalThrows;
      base.matchesPlayed += s.matchesPlayed;
      base.perfectRounds += s.perfectRounds; base.unnaturalPerfects += s.unnaturalPerfects; base.supernaturals += s.supernaturals;
    });
    return base;
  };

  // Setup screen
  if (!activeLeague) return (
    <div style={{ minHeight: "100vh", background: DARK, color: "#fff", padding: 20, maxWidth: 500, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <button onClick={onBack} style={{ ...btnStyle("#333"), width: "auto" }}>← Back</button>
        <h2 style={{ color: GOLD, margin: 0, fontFamily: "serif" }}>📅 League</h2>
      </div>

      {/* Past league detail viewer */}
      {viewingHistory && (() => {
        const lg = viewingHistory;
        const stand = getStandings(lg);
        const lgPlayers = lg.players.map(id => players.find(p => p.id === id) || { id, name: id });
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.97)", overflowY: "auto", padding: isTablet ? 32 : 16 }}>
            <div style={{ maxWidth: isTablet ? 800 : 560, margin: "0 auto" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
                <button onClick={() => setViewingHistory(null)} style={{ background: "#333", border: "none", color: "#fff", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontFamily: "monospace" }}>← Back</button>
                <h2 style={{ color: GOLD, margin: 0, fontFamily: "serif" }}>📅 {lg.name}</h2>
                <span style={{ color: "#555", fontSize: 12, fontFamily: "monospace", marginLeft: "auto" }}>
                  {lg.finishedAt ? new Date(lg.finishedAt).toLocaleDateString() : ""}
                </span>
              </div>
              {/* Standings */}
              <div style={{ background: "#151515", border: "1px solid #333", borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <div style={{ color: GOLD, fontFamily: "monospace", fontSize: 12, fontWeight: "bold", marginBottom: 10 }}>FINAL STANDINGS</div>
                {stand.map((p, i) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid #1a1a1a" }}>
                    <span style={{ color: i === 0 ? GOLD : "#666", fontFamily: "monospace", fontSize: 13, minWidth: 24 }}>
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i+1}`}
                    </span>
                    <span style={{ color: "#ddd", flex: 1, fontFamily: "monospace" }}>{p.name}</span>
                    <span style={{ color: "#4f4", fontFamily: "monospace", fontSize: 13 }}>{p.wins}W</span>
                    <span style={{ color: "#888", fontFamily: "monospace", fontSize: 13 }}>{p.losses}L</span>
                    <span style={{ color: "#555", fontFamily: "monospace", fontSize: 11 }}>{p.totalThrows > 0 ? (p.totalPts / p.totalThrows).toFixed(1) : "0.0"}pts/throw</span>
                  </div>
                ))}
              </div>
              {/* Schedule by day */}
              {Array.from({ length: lg.settings?.days || 7 }, (_, d) => {
                const dayMatches = (lg.matches || []).filter(m => m.day === d);
                if (dayMatches.length === 0) return null;
                return (
                  <div key={d} style={{ background: "#151515", border: "1px solid #333", borderRadius: 10, padding: 16, marginBottom: 10 }}>
                    <div style={{ color: GOLD, fontFamily: "monospace", fontSize: 12, fontWeight: "bold", marginBottom: 8 }}>
                      DAY {d + 1} {dayMatches.every(m => m.completed) ? <span style={{ color: "#4f4" }}>✓</span> : ""}
                    </div>
                    {dayMatches.map(m => {
                      const p0name = lgPlayers.find(p => p.id === m.p0)?.name || "?";
                      const p1name = lgPlayers.find(p => p.id === m.p1)?.name || "?";
                      const r0 = m.p0rounds ?? 0; const r1 = m.p1rounds ?? 0;
                      return (
                        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: "1px solid #1a1a1a", fontSize: 13, fontFamily: "monospace" }}>
                          <span style={{ color: m.winner === m.p0 ? GOLD : "#888", flex: 1 }}>{p0name}</span>
                          <span style={{ color: "#555", fontSize: 11 }}>{m.completed ? `${r0}–${r1}` : "vs"}</span>
                          <span style={{ color: m.winner === m.p1 ? GOLD : "#888", flex: 1, textAlign: "right" }}>{p1name}</span>
                          {m.completed && <span style={{ color: "#4f4", fontSize: 11, marginLeft: 4 }}>✓</span>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Past leagues */}
      {(leagueHistory || []).length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 14 }}>
          <div style={{ color: GOLD, fontFamily: "monospace", fontSize: 12, fontWeight: "bold", marginBottom: 8 }}>PAST LEAGUES</div>
          {leagueHistory.map((lg, i) => {
            const stand = getStandings(lg);
            return (
              <div key={lg.id} onClick={() => setViewingHistory(lg)}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 4px", borderBottom: "1px solid #222", fontSize: 13, cursor: "pointer", borderRadius: 4 }}
                onMouseEnter={e => e.currentTarget.style.background = "#1a1a1a"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <span style={{ color: "#ccc" }}>{lg.name}</span>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ color: GOLD, fontSize: 12 }}>🏆 {stand[0]?.name || "?"}</span>
                  <span style={{ color: "#555", fontSize: 11 }}>→</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={cardStyle}>
          <h3 style={{ color: GOLD, margin: "0 0 10px" }}>League Name</h3>
          <input value={leagueName} onChange={e => setLeagueName(e.target.value)} placeholder="e.g. Winter 2026 League"
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
        </div>
        <div style={{ ...cardStyle, background: "#111" }}>
          <div style={{ color: GOLD, fontFamily: "monospace", fontSize: 12, fontWeight: "bold", marginBottom: 6 }}>FORMAT (FIXED)</div>
          <div style={{ color: "#888", fontFamily: "monospace", fontSize: 12, lineHeight: 1.7 }}>
            <div>• 3 rounds per match, 5 throws per round</div>
            <div>• Win 2 of 3 rounds = match win</div>
            <div>• All 3 rounds played (for stats)</div>
            <div>• Each player plays 3 matches per night</div>
            <div>• 8 nights = 24 games per player</div>
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h3 style={{ color: GOLD, margin: 0 }}>Select Players ({selectedPlayers.length})</h3>
            <div style={{ display: "flex", gap: 4 }}>
              {[["all","All"],["members","🏅"],["guests","🎯"]].map(([val,label]) => (
                <button key={val} onClick={() => setLeaguePlayerFilter(val)} style={{
                  background: leaguePlayerFilter === val ? GOLD : "#222",
                  color: leaguePlayerFilter === val ? DARK : "#888",
                  border: `1px solid ${leaguePlayerFilter === val ? GOLD : "#444"}`,
                  borderRadius: 6, padding: "3px 10px", fontSize: 11, fontFamily: "monospace", cursor: "pointer",
                }}>{label}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {players.filter(p => leaguePlayerFilter === "all" || (leaguePlayerFilter === "members" ? p.member : !p.member)).map(p => {
              const sel = selectedPlayers.includes(p.id);
              const career = getCareerStats(p.id);
              return (
                <button key={p.id} onClick={() => sel ? setSelectedPlayers(prev => prev.filter(x => x !== p.id)) : setSelectedPlayers(prev => [...prev, p.id])}
                  style={{ background: sel ? GOLD : "#222", color: sel ? DARK : "#ccc", border: `2px solid ${sel ? GOLD : p.member ? "#3a6a3a" : "#444"}`, borderRadius: 8, padding: "8px 14px", fontFamily: "monospace", fontWeight: "bold", cursor: "pointer", fontSize: 13, textAlign: "left" }}>
                  <div>{p.member ? "🏅 " : "🎯 "}{p.name}</div>
                  {career.leagues > 0 && <div style={{ fontSize: 10, fontWeight: "normal", color: sel ? "#5a4000" : "#666" }}>{career.wins}W–{career.losses}L career</div>}
                </button>
              );
            })}
          </div>
        </div>
        <button onClick={createLeague} disabled={selectedPlayers.length < 2 || !leagueName.trim() || !isAdmin}
          style={{ ...btnStyle(GOLD, DARK), opacity: (selectedPlayers.length < 2 || !leagueName.trim()) ? 0.5 : 1 }}>
          📅 Generate Schedule
        </button>
      </div>
    </div>
  );

  const todayMatches = (activeLeague.matches || []).filter(m => m.day === dayView);
  const stand = getStandings(activeLeague);
  const allDone = (activeLeague.matches || []).every(m => m.completed);

  const finishLeague = () => {
    if (!isAdmin) return;
    setLeagueHistory(prev => [...(prev || []), { ...activeLeague, finishedAt: Date.now() }]);
    setActiveLeague(null);
    notify("League saved to history!");
  };

  const startLeaguePlayoff = () => {
    if (!isAdmin) return;
    // Seed players by league match wins — best record gets #1 seed
    const seeded = stand.map(p => p.id);
    // NOTE: league stays open so you can review stats after the playoff
    // It gets cleared automatically when the playoff champion is crowned
    onStartPlayoff && onStartPlayoff(seeded, stand);
  };

  return (
    <div style={{ minHeight: "100vh", background: DARK, color: "#fff", padding: isTablet ? 32 : 20, maxWidth: isTablet ? 900 : 600, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 4 }}>
        <button onClick={onBack} style={{ ...btnStyle("#333"), width: "auto" }}>← Back</button>
        <h2 style={{ color: GOLD, margin: 0, fontFamily: "serif", flex: 1 }}>📅 {activeLeague.name}</h2>
        {isAdmin && !confirmReset && <button onClick={() => setConfirmReset(true)} style={{ ...btnStyle(RED), width: "auto" }}>Reset</button>}
        {isAdmin && confirmReset && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ color: "#f88", fontFamily: "monospace", fontSize: 12 }}>Sure?</span>
            <button onClick={() => { setActiveLeague(null); setConfirmReset(false); }} style={{ ...btnStyle(RED), width: "auto", padding: "6px 12px" }}>Yes</button>
            <button onClick={() => setConfirmReset(false)} style={{ ...btnStyle("#444"), width: "auto", padding: "6px 12px" }}>No</button>
          </div>
        )}
      </div>
      <div style={{ color: "#666", fontFamily: "monospace", fontSize: 11, marginBottom: 14 }}>
        {activeLeague.players.length} players · {(activeLeague.matches||[]).filter(m=>m.completed).length}/{(activeLeague.matches||[]).length} matches played
        {isAdmin && (
          <button onClick={() => { setShowAddPlayer(v => !v); setAddPlayerSelected([]); }}
            style={{ marginLeft: 12, background: "#1a2a1a", border: "1px solid #3a5a3a", borderRadius: 6,
              padding: "3px 10px", color: "#4f4", fontFamily: "monospace", fontSize: 11, cursor: "pointer" }}>
            {showAddPlayer ? "✕ Cancel" : "➕ Add Player"}
          </button>
        )}
      </div>

      {/* Mid-league add player panel */}
      {showAddPlayer && isAdmin && (
        <div style={{ ...cardStyle, marginBottom: 14, border: "1px solid #3a5a3a" }}>
          <div style={{ color: "#4f4", fontFamily: "monospace", fontSize: 12, fontWeight: "bold", marginBottom: 10 }}>
            ➕ Add Players Mid-League
          </div>
          <div style={{ color: "#888", fontFamily: "monospace", fontSize: 11, marginBottom: 10 }}>
            New players will get matches against everyone they haven't played yet, scheduled on remaining days.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {players
              .filter(p => !activeLeague.players.includes(p.id))
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(p => {
                const sel = addPlayerSelected.includes(p.id);
                return (
                  <div key={p.id} onClick={() => setAddPlayerSelected(prev =>
                    sel ? prev.filter(id => id !== p.id) : [...prev, p.id]
                  )} style={{
                    background: sel ? "#1a3a1a" : "#1a1a1a",
                    border: `1px solid ${sel ? "#4f4" : "#333"}`,
                    borderRadius: 8, padding: "6px 12px", cursor: "pointer",
                    fontFamily: "monospace", fontSize: 13,
                    color: sel ? "#4f4" : "#aaa",
                  }}>
                    {sel ? "✓ " : ""}{p.member ? "🏅" : "🎯"} {p.name}
                  </div>
                );
              })}
            {players.filter(p => !activeLeague.players.includes(p.id)).length === 0 && (
              <div style={{ color: "#555", fontFamily: "monospace", fontSize: 12 }}>All players are already in this league</div>
            )}
          </div>
          {addPlayerSelected.length > 0 && (
            <button onClick={() => addPlayersToLeague(addPlayerSelected)}
              style={{ ...btnStyle("#1a3a1a"), border: "1px solid #4f4", color: "#4f4" }}>
              ➕ Add {addPlayerSelected.length} Player{addPlayerSelected.length > 1 ? "s" : ""} to League
            </button>
          )}
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["schedule","📅 Schedule"],["standings","🏆 Standings"],["history","📊 Career"]].map(([t,label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? GOLD : "#222", color: tab === t ? DARK : "#888",
            border: "none", borderRadius: 6, padding: "7px 14px", fontFamily: "monospace",
            fontWeight: "bold", cursor: "pointer", fontSize: 12, flex: 1,
          }}>{label}</button>
        ))}
      </div>

      {tab === "standings" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {stand.map((p, i) => {
            const joinedMid = (activeLeague.midLeagueJoins || []).find(j => j.id === p.id);
            return (
            <div key={p.id} style={{ ...cardStyle, border: `1px solid ${i === 0 ? GOLD : BORDER}` }}>
              {/* Name + W/L */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: joinedMid ? 4 : 8 }}>
                <span style={{ color: i === 0 ? GOLD : "#ccc", fontFamily: "monospace", fontWeight: "bold", fontSize: 15 }}>
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i+1}`} {p.name}
                </span>
                <span style={{ color: "#4f4", fontFamily: "monospace", fontSize: 13 }}>{p.wins}W – {p.losses}L</span>
              </div>
              {joinedMid && (
                <div style={{ color: "#f77f00", fontFamily: "monospace", fontSize: 10, marginBottom: 6 }}>
                  ⚡ Joined mid-league · {new Date(joinedMid.joinedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </div>
              )}
              {/* Round wins + total pts */}
              <div style={{ display: "flex", gap: 12, marginBottom: 6, fontFamily: "monospace", fontSize: 12, color: "#aaa" }}>
                <span>Rounds: {p.roundWins}W–{p.roundLosses}L</span>
                <span>Total pts: {p.totalPts}</span>
                {p.totalThrows > 0 && <span>Avg: {(p.totalPts/p.totalThrows).toFixed(2)}/throw</span>}
              </div>
              {/* Throw breakdown */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 6, fontFamily: "monospace", fontSize: 11 }}>
                <span style={{ color: "#e63946" }}>★ {p.nipples} nipples</span>
                <span style={{ color: GOLD }}>🎯 {p.bullseyes} bullseyes</span>
                <span style={{ color: "#c1121f" }}>{p.inners} inners (3pt)</span>
                <span style={{ color: "#1d6a96" }}>{p.outers} outers (1pt)</span>
                <span style={{ color: "#555" }}>{p.misses} misses</span>
              </div>
              {/* Achievement badges */}
              {(p.perfectRounds > 0 || p.unnaturalPerfects > 0 || p.supernaturals > 0) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                  {p.supernaturals > 0 && (
                    <span style={{ background: "#1a0030", border: "1px solid #9b5de5", borderRadius: 6, padding: "2px 8px", fontSize: 11, color: "#9b5de5", fontFamily: "monospace" }}>
                      ⚡ {p.supernaturals}× Supernatural
                    </span>
                  )}
                  {p.unnaturalPerfects > 0 && (
                    <span style={{ background: "#1a1a00", border: "1px solid #f77f00", borderRadius: 6, padding: "2px 8px", fontSize: 11, color: "#f77f00", fontFamily: "monospace" }}>
                      🌀 {p.unnaturalPerfects}× Unnatural Perfect
                    </span>
                  )}
                  {p.perfectRounds > 0 && (
                    <span style={{ background: "#001a00", border: `1px solid ${GOLD}`, borderRadius: 6, padding: "2px 8px", fontSize: 11, color: GOLD, fontFamily: "monospace" }}>
                      ✨ {p.perfectRounds}× Perfect Round
                    </span>
                  )}
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      {tab === "history" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ color: GOLD, fontFamily: "monospace", fontSize: 12, fontWeight: "bold" }}>CAREER STATS — ALL LEAGUES</div>
          {activeLeague.players.map(pid => {
            const c = getCareerStats(pid);
            return (
              <div key={pid} style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ color: "#ccc", fontFamily: "monospace", fontWeight: "bold" }}>{getPlayerName(pid)}</span>
                  <span style={{ color: "#888", fontFamily: "monospace", fontSize: 11 }}>{c.leagues} league{c.leagues !== 1 ? "s" : ""}</span>
                </div>
                <div style={{ display: "flex", gap: 12, fontFamily: "monospace", fontSize: 12, color: "#aaa", marginBottom: 6 }}>
                  <span style={{ color: "#4f4" }}>{c.wins}W–{c.losses}L</span>
                  <span>Rounds {c.roundWins}W–{c.roundLosses}L</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontFamily: "monospace", fontSize: 11, marginBottom: 6 }}>
                  <span style={{ color: "#e63946" }}>★ {c.nipples} nipples</span>
                  <span style={{ color: GOLD }}>🎯 {c.bullseyes} bullseyes</span>
                  <span style={{ color: "#c1121f" }}>{c.inners} inners</span>
                  <span style={{ color: "#1d6a96" }}>{c.outers} outers</span>
                  <span style={{ color: "#555" }}>{c.misses} misses</span>
                  {c.totalThrows > 0 && <span style={{ color: "#aaa" }}>{(c.totalPts/c.totalThrows).toFixed(2)} avg</span>}
                </div>
                {(c.perfectRounds > 0 || c.unnaturalPerfects > 0 || c.supernaturals > 0) && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {c.supernaturals > 0 && <span style={{ background: "#1a0030", border: "1px solid #9b5de5", borderRadius: 6, padding: "2px 8px", fontSize: 11, color: "#9b5de5", fontFamily: "monospace" }}>⚡ {c.supernaturals}× Supernatural</span>}
                    {c.unnaturalPerfects > 0 && <span style={{ background: "#1a1a00", border: "1px solid #f77f00", borderRadius: 6, padding: "2px 8px", fontSize: 11, color: "#f77f00", fontFamily: "monospace" }}>🌀 {c.unnaturalPerfects}× Unnatural Perfect</span>}
                    {c.perfectRounds > 0 && <span style={{ background: "#001a00", border: `1px solid ${GOLD}`, borderRadius: 6, padding: "2px 8px", fontSize: 11, color: GOLD, fontFamily: "monospace" }}>✨ {c.perfectRounds}× Perfect Round</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === "schedule" && (<>
        {/* Day tabs */}
        <div style={{ display: "flex", gap: 5, marginBottom: 12, flexWrap: "wrap" }}>
          {Array.from({ length: activeLeague.settings.days }).map((_, i) => {
            const dayDone = (activeLeague.matches||[]).filter(m=>m.day===i).every(m=>m.completed);
            return (
              <button key={i} onClick={() => setDayView(i)} style={{
                background: i === dayView ? GOLD : dayDone ? "#1a2a1a" : "#222",
                color: i === dayView ? DARK : dayDone ? "#4f4" : "#888",
                border: `1px solid ${dayDone ? "#2a4a2a" : "#333"}`,
                borderRadius: 6, padding: "6px 11px", fontFamily: "monospace",
                fontWeight: "bold", cursor: "pointer", fontSize: 12,
              }}>Day {i + 1}</button>
            );
          })}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {todayMatches.length === 0 && <div style={{ color: "#555", fontFamily: "monospace" }}>No matches scheduled this day.</div>}
          {todayMatches.map(m => (
            <div key={m.id} style={{ ...cardStyle, border: `1px solid ${m.completed ? "#3a5a3a" : BORDER}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "monospace", fontSize: 15 }}>
                  <span style={{ color: m.winner === m.p0 ? GOLD : "#ccc" }}>{getPlayerName(m.p0)}</span>
                  <span style={{ color: "#555", margin: "0 8px" }}>vs</span>
                  <span style={{ color: m.winner === m.p1 ? GOLD : "#ccc" }}>{getPlayerName(m.p1)}</span>
                </span>
                {m.completed && (
                  <div style={{ textAlign: "right", fontFamily: "monospace", fontSize: 11 }}>
                    <div style={{ color: "#4f4" }}>✓ {getPlayerName(m.winner)} wins</div>
                    <div style={{ color: "#666" }}>{m.p0rounds}–{m.p1rounds} rounds</div>
                  </div>
                )}
              </div>
              {!m.completed && isAdmin && (
                <button onClick={() => onStartMatch({ ...m, leagueId: activeLeague.id }, activeLeague.settings)} style={{ ...btnStyle(GOLD, DARK), marginTop: 8 }}>🪓 Play</button>
              )}
            </div>
          ))}
        </div>

        {allDone && isAdmin && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
            <div style={{ color: GOLD, fontFamily: "monospace", fontSize: 13, textAlign: "center" }}>
              🏆 League Complete! What next?
            </div>
            <button onClick={startLeaguePlayoff} style={{ ...btnStyle(GOLD, DARK), border: `2px solid ${GOLD}` }}>
              🪓 Start Playoff Tournament
            </button>
            <div style={{ color: "#888", fontFamily: "monospace", fontSize: 11, textAlign: "center", lineHeight: 1.4 }}>
              Players seeded by wins. League stays open so you can review stats after the playoff.
            </div>
            <button onClick={finishLeague} style={{ ...btnStyle("#1a3a1a"), border: `1px solid #3a5a3a` }}>
              📅 Save to History & Close League
            </button>
            <div style={{ color: "#666", fontFamily: "monospace", fontSize: 11, textAlign: "center" }}>
              No playoff — just archive the league results.
            </div>
          </div>
        )}
      </>)}
    </div>
  );
}
