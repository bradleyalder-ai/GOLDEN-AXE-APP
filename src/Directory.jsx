import { useState } from "react";
import { sanitizeCode } from "./firebase";

const GOLD = "#f0c040", DARK = "#0d0d0d", RED = "#c1121f";

export const SHOPS = [
  {
    roomCode: "GA_WPG_01",
    name: "Axe Winnipeg",
    city: "Winnipeg, MB",
    color: "#c1121f",
    accent: "#ff5555",
    bg: "#1a0000",
    logo: null,
    tagline: "Winnipeg's Premier Axe Throwing",
  },
  {
    roomCode: "GA_YYC_01",
    name: "Axe Calgary",
    city: "Calgary, AB",
    color: "#1d6a96",
    accent: "#4a90d9",
    bg: "#00101a",
    logo: null,
    tagline: "Calgary's Premier Axe Throwing",
  },
];

export default function Directory({ onJoin }) {
  const [mode, setMode] = useState("home"); // home | event
  const [eventCode, setEventCode] = useState("");
  const [error, setError] = useState("");
  const [entering, setEntering] = useState(null);

  const handleShopTap = (shop) => {
    setEntering(shop.roomCode);
    setTimeout(() => { onJoin(shop.roomCode); setEntering(null); }, 350);
  };

  const handleEventJoin = () => {
    const clean = sanitizeCode(eventCode);
    if (clean.length < 3) { setError("Code must be at least 3 characters."); return; }
    onJoin(clean);
  };

  return (
    <div style={{ minHeight: "100vh", background: DARK, color: "#fff",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "40px 20px 60px" }}>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <div style={{ fontSize: 64, marginBottom: 10 }}>🪓</div>
        <h1 style={{ color: GOLD, fontFamily: "Georgia, serif", fontSize: 30,
          margin: "0 0 6px", letterSpacing: 3, textTransform: "uppercase" }}>
          Golden Axe
        </h1>
        <div style={{ color: "#555", fontFamily: "monospace", fontSize: 12, letterSpacing: 2 }}>
          GAME CENTER
        </div>
      </div>

      <div style={{ width: "100%", maxWidth: 440 }}>

        {mode === "home" && (<>
          {/* Tab row */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {[
              { key: "home", label: "🏪 Our Locations" },
              { key: "event", label: "🎟️ Join Event" },
            ].map(tab => (
              <button key={tab.key} onClick={() => setMode(tab.key)} style={{
                flex: 1, background: mode === tab.key ? "#1a1a1a" : "transparent",
                border: `1px solid ${mode === tab.key ? GOLD : "#333"}`,
                borderRadius: 10, padding: "10px", fontFamily: "monospace",
                fontSize: 13, color: mode === tab.key ? GOLD : "#555", cursor: "pointer",
              }}>{tab.label}</button>
            ))}
          </div>

          {/* Shop tiles */}
          <div style={{ color: "#444", fontFamily: "monospace", fontSize: 11,
            letterSpacing: 2, marginBottom: 14, textAlign: "center" }}>
            LEAGUE MEMBERS — SELECT YOUR LOCATION
          </div>

          {SHOPS.map(shop => {
            const isEntering = entering === shop.roomCode;
            return (
              <div key={shop.roomCode} onClick={() => handleShopTap(shop)} style={{
                background: isEntering ? shop.color : shop.bg,
                border: `2px solid ${isEntering ? shop.accent : shop.color}`,
                borderRadius: 16, padding: "22px 24px", marginBottom: 14,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 18,
                transform: isEntering ? "scale(0.97)" : "scale(1)",
                boxShadow: isEntering ? `0 0 28px ${shop.color}55` : "none",
                transition: "all 0.2s",
              }}>
                <div style={{ flexShrink: 0, width: 68, height: 68, borderRadius: 12,
                  background: `${shop.color}22`, border: `1px solid ${shop.color}44`,
                  display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {shop.logo
                    ? <img src={shop.logo} alt={shop.name}
                        style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    : <span style={{ fontSize: 34 }}>🪓</span>}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: isEntering ? "#fff" : shop.accent,
                    fontFamily: "Georgia, serif", fontSize: 21, fontWeight: "bold", marginBottom: 4 }}>
                    {shop.name}
                  </div>
                  <div style={{ color: isEntering ? "#ffaaaa" : "#666",
                    fontFamily: "monospace", fontSize: 12 }}>
                    📍 {shop.city}
                  </div>
                </div>
                <div style={{ fontSize: 26, color: isEntering ? "#fff" : shop.color, flexShrink: 0 }}>
                  {isEntering ? "⏳" : "›"}
                </div>
              </div>
            );
          })}

          {/* Join event button */}
          <button onClick={() => setMode("event")} style={{
            width: "100%", marginTop: 8,
            background: "#0a1a0a", border: "2px solid #39ff14",
            borderRadius: 14, padding: "18px 24px", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 14, textAlign: "left",
          }}>
            <span style={{ fontSize: 32, flexShrink: 0 }}>🎟️</span>
            <div>
              <div style={{ color: "#39ff14", fontFamily: "monospace", fontWeight: "bold", fontSize: 15 }}>
                Join Tonight's Event
              </div>
              <div style={{ color: "#446644", fontFamily: "monospace", fontSize: 11, marginTop: 3 }}>
                Got an event code? Tap here to join
              </div>
            </div>
            <div style={{ color: "#39ff14", fontSize: 22, marginLeft: "auto" }}>›</div>
          </button>
        </>)}

        {mode === "event" && (<>
          <button onClick={() => { setMode("home"); setEventCode(""); setError(""); }}
            style={{ background: "transparent", border: "none", color: "#888",
              fontFamily: "monospace", fontSize: 13, cursor: "pointer", marginBottom: 20,
              display: "flex", alignItems: "center", gap: 6 }}>
            ← Back
          </button>

          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontSize: 48, marginBottom: 10 }}>🎟️</div>
            <div style={{ color: GOLD, fontFamily: "Georgia, serif", fontSize: 20,
              fontWeight: "bold", marginBottom: 8 }}>Join Tonight's Event</div>
            <div style={{ color: "#666", fontFamily: "monospace", fontSize: 12, lineHeight: 1.7 }}>
              Ask your organizer for the event code.<br/>
              It changes each event night.
            </div>
          </div>

          <input value={eventCode}
            onChange={e => { setEventCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")); setError(""); }}
            onKeyDown={e => e.key === "Enter" && handleEventJoin()}
            placeholder="EVENT CODE" maxLength={12} autoCapitalize="characters"
            style={{ width: "100%", background: "#1a1a1a",
              border: `2px solid ${error ? RED : eventCode.length >= 3 ? GOLD : "#333"}`,
              borderRadius: 12, padding: "18px", color: "#fff", fontFamily: "monospace",
              fontSize: 26, letterSpacing: 6, textAlign: "center", outline: "none",
              boxSizing: "border-box", marginBottom: 8 }} />

          {error && <div style={{ color: RED, fontFamily: "monospace", fontSize: 12,
            marginBottom: 10, textAlign: "center" }}>{error}</div>}

          <button onClick={handleEventJoin} disabled={eventCode.length < 3} style={{
            width: "100%", background: eventCode.length >= 3 ? "#39ff14" : "#222",
            color: eventCode.length >= 3 ? "#000" : "#555",
            border: "none", borderRadius: 12, padding: "16px",
            fontFamily: "monospace", fontWeight: "bold", fontSize: 16,
            cursor: eventCode.length < 3 ? "not-allowed" : "pointer",
          }}>
            🎟️ Join Event
          </button>

          <div style={{ marginTop: 20, background: "#0a0a0a", border: "1px solid #222",
            borderRadius: 10, padding: 14 }}>
            <div style={{ color: "#444", fontFamily: "monospace", fontSize: 11, lineHeight: 1.8 }}>
              💡 Event codes are created by your organizer for each night.<br/>
              They might look like: <span style={{ color: "#666" }}>WPGFRI · PARTY01 · OPEN24</span>
            </div>
          </div>
        </>)}
      </div>

      <div style={{ marginTop: 40, color: "#2a2a2a", fontFamily: "monospace", fontSize: 10, letterSpacing: 1 }}>
        GOLDEN AXE GAME CENTER © 2026
      </div>
    </div>
  );
}
