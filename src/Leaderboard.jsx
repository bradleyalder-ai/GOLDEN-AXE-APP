import { useState, useEffect } from "react";
import { getDatabase, ref, onValue, off } from "firebase/database";

const GOLD = "#f0c040", DARK = "#0d0d0d", RED = "#c1121f", BLUE = "#1d6a96";
const PANEL = "#111", BORDER = "#222";

const CATEGORIES = [
  { key: "matchScore",      label: "🎯 Match High Score", desc: "Highest single match score",        unit: "pts"  },
  { key: "tournamentWins",  label: "🏆 Tournament Wins",  desc: "Most tournament championships",     unit: "wins" },
  { key: "leagueWins",      label: "📅 League Wins",      desc: "Most league season championships",  unit: "wins" },
];

const MEDALS = ["🥇","🥈","🥉"];
const RANK_COLORS = ["#f0c040","#aaaaaa","#cd7f32"];

function getRankStyle(rank) {
  if (rank === 0) return { color: GOLD, bg: "#1a1500", border: `1px solid ${GOLD}` };
  if (rank === 1) return { color: "#aaa", bg: "#111", border: "1px solid #555" };
  if (rank === 2) return { color: "#cd7f32", bg: "#100a00", border: "1px solid #cd7f32" };
  return { color: "#666", bg: PANEL, border: `1px solid ${BORDER}` };
}

export default function Leaderboard({ shopRoomCode, shopName, onBack }) {
  const [category, setCategory] = useState("matchScore");
  const [entries, setEntries] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shopRoomCode) return;
    const db = getDatabase();
    const lbRef = ref(db, `leaderboards/${shopRoomCode}`);
    onValue(lbRef, snap => {
      setEntries(snap.val() || {});
      setLoading(false);
    });
    return () => off(lbRef);
  }, [shopRoomCode]);

  const catEntries = Object.values(entries[category] || {})
    .sort((a, b) => b.score - a.score)
    .slice(0, 100);

  const cat = CATEGORIES.find(c => c.key === category);

  return (
    <div style={{ minHeight: "100vh", background: DARK, color: "#fff",
      maxWidth: 500, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ background: "#0a0a0a", borderBottom: `2px solid ${GOLD}`,
        padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <button onClick={onBack} style={{ background: "#222", color: "#fff", border: "none",
            borderRadius: 8, padding: "8px 14px", fontFamily: "monospace",
            fontWeight: "bold", cursor: "pointer" }}>← Back</button>
          <div>
            <div style={{ color: GOLD, fontFamily: "Georgia, serif", fontSize: 18,
              fontWeight: "bold" }}>🏅 Leaderboard</div>
            <div style={{ color: "#555", fontFamily: "monospace", fontSize: 11 }}>{shopName}</div>
          </div>
        </div>

        {/* Category tabs */}
        <div style={{ display: "flex", gap: 6 }}>
          {CATEGORIES.map(c => (
            <button key={c.key} onClick={() => setCategory(c.key)} style={{
              flex: 1, background: category === c.key ? "#1a1500" : "#111",
              border: `1px solid ${category === c.key ? GOLD : "#333"}`,
              borderRadius: 8, padding: "8px 4px", fontFamily: "monospace",
              fontSize: 10, color: category === c.key ? GOLD : "#555",
              cursor: "pointer", lineHeight: 1.4, textAlign: "center",
            }}>{c.label}</button>
          ))}
        </div>
      </div>

      {/* Category description */}
      <div style={{ padding: "10px 20px", background: "#0d0d0d",
        borderBottom: "1px solid #1a1a1a" }}>
        <div style={{ color: "#555", fontFamily: "monospace", fontSize: 11 }}>
          {cat.desc} · Top 100 all-time
        </div>
      </div>

      {/* Entries */}
      <div style={{ padding: "14px 16px" }}>
        {loading && (
          <div style={{ textAlign: "center", color: "#555", fontFamily: "monospace",
            fontSize: 13, padding: 40 }}>Loading...</div>
        )}

        {!loading && catEntries.length === 0 && (
          <div style={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🏅</div>
            <div style={{ color: "#555", fontFamily: "monospace", fontSize: 13 }}>
              No scores yet.<br/>Be the first on the board!
            </div>
          </div>
        )}

        {catEntries.map((entry, i) => {
          const rs = getRankStyle(i);
          return (
            <div key={`${entry.name}_${i}`} style={{
              display: "flex", alignItems: "center", gap: 12,
              background: rs.bg, border: rs.border, borderRadius: 10,
              padding: "12px 14px", marginBottom: 8,
            }}>
              {/* Rank */}
              <div style={{ minWidth: 36, textAlign: "center", flexShrink: 0 }}>
                {i < 3
                  ? <span style={{ fontSize: 22 }}>{MEDALS[i]}</span>
                  : <span style={{ color: "#444", fontFamily: "monospace",
                      fontSize: 13, fontWeight: "bold" }}>#{i + 1}</span>
                }
              </div>

              {/* Name + date */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: rs.color, fontFamily: "monospace",
                  fontWeight: "bold", fontSize: 15,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {entry.name}
                </div>
                {entry.date && (
                  <div style={{ color: "#444", fontFamily: "monospace", fontSize: 10, marginTop: 2 }}>
                    {new Date(entry.date).toLocaleDateString("en-CA",
                      { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                )}
                {entry.context && (
                  <div style={{ color: "#444", fontFamily: "monospace", fontSize: 10 }}>
                    {entry.context}
                  </div>
                )}
              </div>

              {/* Score */}
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ color: rs.color, fontFamily: "monospace",
                  fontSize: 22, fontWeight: "bold" }}>{entry.score}</div>
                <div style={{ color: "#444", fontFamily: "monospace", fontSize: 10 }}>
                  {cat.unit}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
