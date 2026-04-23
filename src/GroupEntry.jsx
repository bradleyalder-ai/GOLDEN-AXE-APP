import { useState } from "react";
import { sanitizeCode } from "./firebase";

const GOLD = "#f0c040", DARK = "#0d0d0d", RED = "#c1121f";

// MASTER PIN — hardcoded, works in every room
export const MASTER_PIN = "GOLDEN88";

export default function GroupEntry({ onJoin }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleJoin = () => {
    const clean = sanitizeCode(code);
    if (clean.length < 3) { setError("Code must be at least 3 characters."); return; }
    setLoading(true);
    setError("");
    setTimeout(() => { setLoading(false); onJoin(clean); }, 600);
  };

  return (
    <div style={{ minHeight: "100vh", background: DARK, color: "#fff",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ fontSize: 72, marginBottom: 12 }}>🪓</div>
      <h1 style={{ color: GOLD, fontFamily: "Georgia, serif", fontSize: 32, margin: "0 0 6px",
        letterSpacing: 3, textTransform: "uppercase" }}>Golden Axe</h1>
      <div style={{ color: "#555", fontFamily: "monospace", fontSize: 13, letterSpacing: 2, marginBottom: 40 }}>
        GAME CENTER
      </div>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ background: "#111", border: "1px solid #333", borderRadius: 14, padding: 28 }}>
          <div style={{ color: GOLD, fontFamily: "monospace", fontSize: 13, fontWeight: "bold", marginBottom: 6, letterSpacing: 1 }}>
            ROOM CODE
          </div>
          <div style={{ color: "#666", fontFamily: "monospace", fontSize: 11, marginBottom: 16, lineHeight: 1.6 }}>
            Enter your group's room code to join.<br/>
            Guests can view scores and play mini games.
          </div>
          <input value={code}
            onChange={e => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")); setError(""); }}
            onKeyDown={e => e.key === "Enter" && handleJoin()}
            placeholder="e.g. GOLDAXE" maxLength={12} autoCapitalize="characters"
            style={{ width: "100%", background: "#1a1a1a",
              border: `2px solid ${error ? RED : code.length >= 3 ? GOLD : "#333"}`,
              borderRadius: 10, padding: "14px 16px", color: "#fff", fontFamily: "monospace",
              fontSize: 22, letterSpacing: 4, textAlign: "center", outline: "none",
              boxSizing: "border-box", marginBottom: 8 }} />
          {error && <div style={{ color: RED, fontFamily: "monospace", fontSize: 12, marginBottom: 12, textAlign: "center" }}>{error}</div>}
          <button onClick={handleJoin} disabled={loading || code.length < 3}
            style={{ width: "100%", background: code.length >= 3 ? GOLD : "#222",
              color: code.length >= 3 ? DARK : "#555", border: "none", borderRadius: 10,
              padding: "14px", fontFamily: "monospace", fontWeight: "bold", fontSize: 16,
              cursor: code.length < 3 ? "not-allowed" : "pointer" }}>
            {loading ? "⏳ Connecting..." : "🪓 Enter Room"}
          </button>
          <div style={{ borderTop: "1px solid #222", marginTop: 20, paddingTop: 16 }}>
            <div style={{ color: "#444", fontFamily: "monospace", fontSize: 11, textAlign: "center", lineHeight: 1.8 }}>
              New room? Just invent a code and share it.<br/>
              Ask your organizer for the room code.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
