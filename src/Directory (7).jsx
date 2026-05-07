import { useState, useEffect } from "react";
import { getDatabase, ref, onValue, off, set, get, update } from "firebase/database";
import { MASTER_PIN } from "./GroupEntry";

const GOLD = "#f0c040", DARK = "#0d0d0d", RED = "#c1121f";

export const SHOPS = [
  {
    id: "wpg",
    settingsCode: "GA_WPG_SETTINGS",
    walkInPrefix: "WPG",
    name: "Axe Winnipeg",
    city: "Winnipeg, MB",
    color: "#c1121f", accent: "#ff5555", bg: "#1a0000",
    defaultManagerPin: "AXEWPG1",
  },
  {
    id: "yyc",
    settingsCode: "GA_YYC_SETTINGS",
    walkInPrefix: "YYC",
    name: "Axe Calgary",
    city: "Calgary, AB",
    color: "#1d6a96", accent: "#4a90d9", bg: "#00101a",
    defaultManagerPin: "AXEYYC1",
  },
];

// ── MANAGER PANEL ─────────────────────────────────────────────────────────────
function ManagerPanel({ shop, settings, onClose, onRefresh, onJoin }) {
  const db = getDatabase();

  // ALL hooks at the top — React rules
  const [shopName, setShopName] = useState(settings?.shopName || shop.name);
  const [logoUrl, setLogoUrl] = useState(settings?.logoUrl || "");
  const [scorerPin, setScorerPin] = useState(settings?.scorerPin || "");
  const [managerPin, setManagerPin] = useState(settings?.managerPin || shop.defaultManagerPin);
  const [eventName, setEventName] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [leagueName, setLeagueName] = useState("");
  const [leagues, setLeagues] = useState([]);
  const [createdLeagueCode, setCreatedLeagueCode] = useState(null);

  useEffect(() => {
    const leaguesRef = ref(db, `shopLeagues/${shop.settingsCode}`);
    onValue(leaguesRef, snap => {
      const data = snap.val() || {};
      setLeagues(Object.entries(data).map(([id, l]) => ({ id, ...l }))
        .sort((a, b) => b.createdAt - a.createdAt));
    });
    return () => off(leaguesRef);
  }, [shop.settingsCode]);

  const notify = (m) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const saveSettings = async () => {
    setSaving(true);
    await update(ref(db, `shopSettings/${shop.settingsCode}`), {
      shopName, logoUrl, scorerPin, managerPin,
    });
    notify("✅ Settings saved!");
    setSaving(false);
    onRefresh();
  };

  const addEvent = async () => {
    if (!eventName.trim()) return;
    const id = `evt_${Date.now()}`;
    const todayMidnight = new Date();
    todayMidnight.setHours(23, 59, 59, 999);
    await set(ref(db, `shopEvents/${shop.settingsCode}/${id}`), {
      name: eventName.trim(),
      time: eventTime.trim() || "",
      roomCode: `${shop.walkInPrefix}EVT${Date.now().toString().slice(-5)}`,
      createdAt: Date.now(),
      expiresAt: todayMidnight.getTime(),
    });
    setEventName(""); setEventTime("");
    notify("✅ Event added!");
    onRefresh();
  };

  const deleteEvent = async (id) => {
    await set(ref(db, `shopEvents/${shop.settingsCode}/${id}`), null);
    onRefresh();
  };

  const createLeague = async () => {
    if (!leagueName.trim()) return;
    const prefix = shop.walkInPrefix;
    const code = `${prefix}LG${Date.now().toString().slice(-5)}`;
    const id = `league_${Date.now()}`;
    await set(ref(db, `shopLeagues/${shop.settingsCode}/${id}`), {
      name: leagueName.trim(),
      roomCode: code,
      createdAt: Date.now(),
      active: true,
    });
    setLeagueName("");
    setCreatedLeagueCode(code);
    notify(`✅ League room created! Code: ${code}`);
    onRefresh();
  };

  const deleteLeague = async (id) => {
    await set(ref(db, `shopLeagues/${shop.settingsCode}/${id}`), null);
    onRefresh();
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.96)",
      overflowY: "auto", padding: 20 }}>
      <div style={{ maxWidth: 440, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ color: GOLD, fontFamily: "serif", margin: 0 }}>⚙️ {shop.name}</h2>
          <button onClick={onClose} style={{ background: "#333", color: "#fff", border: "none",
            borderRadius: 8, padding: "8px 16px", fontFamily: "monospace", fontWeight: "bold", cursor: "pointer" }}>
            ✕ Close
          </button>
        </div>

        {msg && <div style={{ background: "#1a2a1a", border: "1px solid #4f4", borderRadius: 8,
          padding: "10px 14px", marginBottom: 14, color: "#4f4", fontFamily: "monospace", fontSize: 13 }}>{msg}</div>}

        {/* Shop Identity */}
        <div style={{ background: "#111", border: "1px solid #333", borderRadius: 12, padding: 18, marginBottom: 14 }}>
          <div style={{ color: GOLD, fontFamily: "monospace", fontWeight: "bold", fontSize: 12, marginBottom: 12 }}>🏪 SHOP IDENTITY</div>
          {[
            { label: "Shop Name", val: shopName, set: setShopName, type: "text", ph: "e.g. Axe Winnipeg" },
            { label: "Logo URL", val: logoUrl, set: setLogoUrl, type: "text", ph: "https://imgur.com/..." },
          ].map(f => (
            <div key={f.label} style={{ marginBottom: 10 }}>
              <label style={{ color: "#888", fontFamily: "monospace", fontSize: 11, display: "block", marginBottom: 4 }}>{f.label}</label>
              <input type={f.type} value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph}
                style={{ width: "100%", background: "#1a1a1a", border: "1px solid #444", borderRadius: 8,
                  padding: "10px 12px", color: "#fff", fontFamily: "monospace", fontSize: 13, boxSizing: "border-box" }} />
            </div>
          ))}
          {logoUrl && <img src={logoUrl} alt="preview" onError={e => e.target.style.display="none"}
            style={{ maxWidth: 140, maxHeight: 60, objectFit: "contain", borderRadius: 8, border: "1px solid #333", marginBottom: 10 }} />}
        </div>

        {/* PINs */}
        <div style={{ background: "#111", border: "1px solid #333", borderRadius: 12, padding: 18, marginBottom: 14 }}>
          <div style={{ color: GOLD, fontFamily: "monospace", fontWeight: "bold", fontSize: 12, marginBottom: 12 }}>🔐 ACCESS PINs</div>
          {[
            { label: "⚙️ Manager PIN (your login)", val: managerPin, set: setManagerPin },
            { label: "🪓 Scorer PIN (for staff)", val: scorerPin, set: setScorerPin },
          ].map(f => (
            <div key={f.label} style={{ marginBottom: 10 }}>
              <label style={{ color: "#888", fontFamily: "monospace", fontSize: 11, display: "block", marginBottom: 4 }}>{f.label}</label>
              <input type="text" value={f.val} onChange={e => f.set(e.target.value)}
                style={{ width: "100%", background: "#1a1a1a", border: "1px solid #444", borderRadius: 8,
                  padding: "10px 12px", color: "#fff", fontFamily: "monospace", fontSize: 16,
                  letterSpacing: 3, boxSizing: "border-box" }} />
            </div>
          ))}
        </div>

        <button onClick={saveSettings} disabled={saving}
          style={{ width: "100%", background: GOLD, color: DARK, border: "none", borderRadius: 10,
            padding: "14px", fontFamily: "monospace", fontWeight: "bold", fontSize: 15, cursor: "pointer", marginBottom: 20 }}>
          {saving ? "Saving..." : "💾 Save Settings"}
        </button>

        {/* Today's Events */}
        <div style={{ background: "#111", border: "1px solid #333", borderRadius: 12, padding: 18, marginBottom: 14 }}>
          <div style={{ color: GOLD, fontFamily: "monospace", fontWeight: "bold", fontSize: 12, marginBottom: 12 }}>
            📅 TODAY'S EVENTS <span style={{ color: "#555", fontWeight: "normal" }}>(auto-clear at midnight)</span>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input type="time" value={eventTime} onChange={e => setEventTime(e.target.value)}
              style={{ background: "#1a1a1a", border: "1px solid #444", borderRadius: 8, padding: "10px 8px",
                color: "#fff", fontFamily: "monospace", fontSize: 13, width: 110, flexShrink: 0 }} />
            <input type="text" value={eventName} onChange={e => setEventName(e.target.value)}
              placeholder="Event name..." onKeyDown={e => e.key === "Enter" && addEvent()}
              style={{ flex: 1, background: "#1a1a1a", border: "1px solid #444", borderRadius: 8,
                padding: "10px 12px", color: "#fff", fontFamily: "monospace", fontSize: 13 }} />
            <button onClick={addEvent} style={{ background: "#1a3a1a", border: "1px solid #4f4",
              borderRadius: 8, padding: "10px 14px", color: "#4f4", fontFamily: "monospace",
              fontWeight: "bold", cursor: "pointer" }}>+</button>
          </div>
          {(settings?.events || []).length === 0 && (
            <div style={{ color: "#444", fontFamily: "monospace", fontSize: 12, textAlign: "center", padding: 10 }}>
              No events today. Add one above.
            </div>
          )}
          {(settings?.events || []).map(ev => (
            <div key={ev.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6,
              background: "#0d0d0d", borderRadius: 8, padding: "8px 12px" }}>
              <span style={{ color: GOLD, fontFamily: "monospace", fontSize: 12, minWidth: 50 }}>{ev.time || "--:--"}</span>
              <span style={{ color: "#ccc", fontFamily: "monospace", fontSize: 13, flex: 1 }}>{ev.name}</span>
              <span style={{ color: "#555", fontFamily: "monospace", fontSize: 10 }}>{ev.roomCode}</span>
              <button onClick={() => deleteEvent(ev.id)} style={{ background: "transparent", border: "none",
                color: RED, cursor: "pointer", fontSize: 16, padding: "0 4px" }}>✕</button>
            </div>
          ))}
        </div>

        {/* League Rooms */}
        <div style={{ background: "#111", border: "1px solid #1d6a96", borderRadius: 12, padding: 18, marginBottom: 14 }}>
          <div style={{ color: "#4a90d9", fontFamily: "monospace", fontWeight: "bold", fontSize: 12, marginBottom: 12 }}>
            🏅 LEAGUE ROOMS
          </div>
          <div style={{ color: "#555", fontFamily: "monospace", fontSize: 11, marginBottom: 12, lineHeight: 1.6 }}>
            Create a room for each league season. Share the code with members — it never expires.
          </div>

          {/* Create new league */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input type="text" value={leagueName}
              onChange={e => setLeagueName(e.target.value)}
              placeholder="League name (e.g. Spring 2026)"
              onKeyDown={e => e.key === "Enter" && createLeague()}
              style={{ flex: 1, background: "#1a1a1a", border: "1px solid #1d6a96",
                borderRadius: 8, padding: "10px 12px", color: "#fff",
                fontFamily: "monospace", fontSize: 13 }} />
            <button onClick={createLeague} disabled={!leagueName.trim()}
              style={{ background: leagueName.trim() ? "#1d6a96" : "#111",
                border: "1px solid #1d6a96", borderRadius: 8,
                padding: "10px 14px", color: leagueName.trim() ? "#fff" : "#444",
                fontFamily: "monospace", fontWeight: "bold", cursor: leagueName.trim() ? "pointer" : "not-allowed" }}>
              + Create
            </button>
          </div>

          {/* Newly created code highlight */}
          {createdLeagueCode && (
            <div style={{ background: "#001a2a", border: "1px solid #4a90d9",
              borderRadius: 8, padding: "10px 14px", marginBottom: 12, textAlign: "center" }}>
              <div style={{ color: "#4a90d9", fontFamily: "monospace", fontSize: 11, marginBottom: 4 }}>
                New League Room Code — share with members:
              </div>
              <div style={{ color: "#fff", fontFamily: "monospace", fontSize: 24,
                fontWeight: "bold", letterSpacing: 4 }}>{createdLeagueCode}</div>
              <button onClick={() => setCreatedLeagueCode(null)}
                style={{ background: "transparent", border: "none", color: "#555",
                  fontFamily: "monospace", fontSize: 11, cursor: "pointer", marginTop: 6 }}>
                dismiss
              </button>
            </div>
          )}

          {/* Existing leagues */}
          {leagues.length === 0 && (
            <div style={{ color: "#444", fontFamily: "monospace", fontSize: 12,
              textAlign: "center", padding: 10 }}>
              No league rooms yet.
            </div>
          )}
          {leagues.map(lg => (
            <div key={lg.id} style={{ display: "flex", alignItems: "center", gap: 8,
              marginBottom: 6, background: "#0d0d0d", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#4a90d9", fontFamily: "monospace",
                  fontSize: 13, fontWeight: "bold" }}>{lg.name}</div>
                <div style={{ color: "#555", fontFamily: "monospace", fontSize: 11,
                  letterSpacing: 2, marginTop: 2 }}>{lg.roomCode}</div>
              </div>
              <button onClick={() => onJoin(lg.roomCode)}
                style={{ background: "#1d6a96", border: "none", borderRadius: 6,
                  padding: "6px 12px", color: "#fff", fontFamily: "monospace",
                  fontSize: 11, cursor: "pointer", flexShrink: 0 }}>
                Open →
              </button>
              <button onClick={() => deleteLeague(lg.id)}
                style={{ background: "transparent", border: "none",
                  color: RED, cursor: "pointer", fontSize: 16, padding: "0 4px", flexShrink: 0 }}>
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── SHOP PAGE ─────────────────────────────────────────────────────────────────
function ShopPage({ shop, onJoin, onBack }) {
  const db = getDatabase();
  const [settings, setSettings] = useState(null);
  const [events, setEvents] = useState([]);
  const [view, setView] = useState("main"); // main | manager_login | league_login
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [showManager, setShowManager] = useState(false);
  const [leagueCode, setLeagueCode] = useState("");
  const [leagues, setLeagues] = useState([]);

  useEffect(() => {
    const leaguesRef = ref(db, `shopLeagues/${shop.settingsCode}`);
    onValue(leaguesRef, snap => {
      const data = snap.val() || {};
      setLeagues(Object.entries(data).map(([id, l]) => ({ id, ...l }))
        .sort((a, b) => b.createdAt - a.createdAt));
    });
    return () => {
      off(ref(db, `shopLeagues/${shop.settingsCode}`));
    };
  }, [shop.settingsCode]);
  const [entering, setEntering] = useState(null);

  const loadData = () => {
    // Load shop settings
    const settingsRef = ref(db, `shopSettings/${shop.settingsCode}`);
    onValue(settingsRef, snap => {
      setSettings(snap.val() || {});
    });
    // Load today's events
    const eventsRef = ref(db, `shopEvents/${shop.settingsCode}`);
    onValue(eventsRef, snap => {
      const data = snap.val() || {};
      const now = Date.now();
      const todayEvents = Object.entries(data)
        .filter(([, ev]) => ev.expiresAt > now)
        .map(([id, ev]) => ({ id, ...ev }))
        .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
      setEvents(todayEvents);
    });
  };

  useEffect(() => {
    loadData();
    return () => {
      off(ref(db, `shopSettings/${shop.settingsCode}`));
      off(ref(db, `shopEvents/${shop.settingsCode}`));
    };
  }, [shop.settingsCode]);

  const handleManagerLogin = () => {
    const managerPin = settings?.managerPin || shop.defaultManagerPin;
    if (pinInput === MASTER_PIN || pinInput === managerPin) {
      setPinError("");
      setPinInput("");
      setView("main");
      setShowManager(true);
    } else {
      setPinError("Wrong PIN.");
    }
  };

  const handleWalkIn = async () => {
    const snap = await get(ref(db, `shopWalkInCounter/${shop.settingsCode}`));
    const next = (snap.val() || 0) + 1;
    await set(ref(db, `shopWalkInCounter/${shop.settingsCode}`), next);
    const code = `${shop.walkInPrefix}${String(next).padStart(3, "0")}`;

    // Save walk-in room to today's event list so guests can rejoin if they leave
    const id = `walkin_${code}`;
    const todayMidnight = new Date();
    todayMidnight.setHours(23, 59, 59, 999);
    await set(ref(db, `shopEvents/${shop.settingsCode}/${id}`), {
      name: `Walk-in Session #${next}`,
      time: new Date().toTimeString().slice(0, 5), // current time HH:MM
      roomCode: code,
      createdAt: Date.now(),
      expiresAt: todayMidnight.getTime(),
      isWalkIn: true,
    });

    onJoin(code);
  };

  const handleEventJoin = (ev) => {
    setEntering(ev.id);
    setTimeout(() => { onJoin(ev.roomCode); }, 350);
  };

  const displayName = settings?.shopName || shop.name;
  const logoUrl = settings?.logoUrl || null;

  return (
    <div style={{ minHeight: "100vh", background: DARK, color: "#fff",
      display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 20px 60px" }}>

      {showManager && (
        <ManagerPanel shop={shop} settings={{ ...settings, events }}
          onClose={() => setShowManager(false)} onRefresh={loadData} onJoin={onJoin} />
      )}

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 28, width: "100%", maxWidth: 440 }}>
        <button onClick={onBack} style={{ background: "transparent", border: "none",
          color: "#555", fontFamily: "monospace", fontSize: 13, cursor: "pointer",
          display: "block", marginBottom: 16, textAlign: "left" }}>← All Locations</button>
        {logoUrl
          ? <img src={logoUrl} alt={displayName} onError={e => e.target.style.display="none"}
              style={{ maxWidth: 180, maxHeight: 80, objectFit: "contain", borderRadius: 10, marginBottom: 10 }} />
          : <div style={{ fontSize: 48, marginBottom: 8 }}>🪓</div>}
        <h1 style={{ color: shop.accent, fontFamily: "Georgia, serif", fontSize: 26,
          margin: "0 0 4px", letterSpacing: 2 }}>{displayName}</h1>
        <div style={{ color: "#555", fontFamily: "monospace", fontSize: 12 }}>📍 {shop.city}</div>
      </div>

      <div style={{ width: "100%", maxWidth: 440 }}>

        {/* Today's Events */}
        {events.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ color: "#888", fontFamily: "monospace", fontSize: 11,
              letterSpacing: 2, marginBottom: 10 }}>📅 TODAY'S EVENTS & SESSIONS</div>
            {events.map(ev => {
              const isWalkIn = ev.isWalkIn;
              const tileColor = isWalkIn ? "#39ff14" : "#f0c040";
              const tileBg = isWalkIn ? "#0a1a0a" : "#0d0a00";
              return (
                <div key={ev.id} onClick={() => handleEventJoin(ev)} style={{
                  background: entering === ev.id ? (isWalkIn ? "#0a2a0a" : "#1a1500") : tileBg,
                  border: `2px solid ${tileColor}`,
                  borderRadius: 14, padding: "16px 20px", marginBottom: 10, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 14,
                  transform: entering === ev.id ? "scale(0.97)" : "scale(1)",
                  boxShadow: entering === ev.id ? `0 0 20px ${tileColor}44` : "none",
                  transition: "all 0.2s",
                }}>
                  <div style={{ flexShrink: 0, textAlign: "center", minWidth: 54 }}>
                    <div style={{ color: tileColor, fontFamily: "monospace", fontWeight: "bold", fontSize: 14 }}>
                      {ev.time ? ev.time.slice(0,5) : "--:--"}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: entering === ev.id ? "#fff" : tileColor,
                      fontFamily: "monospace", fontWeight: "bold", fontSize: 16 }}>
                      {isWalkIn ? "🚶 " : "📅 "}{ev.name}
                    </div>
                    {isWalkIn && (
                      <div style={{ color: "#446644", fontFamily: "monospace", fontSize: 10, marginTop: 2 }}>
                        Tap to rejoin this session
                      </div>
                    )}
                  </div>
                  <div style={{ color: tileColor, fontSize: 22 }}>
                    {entering === ev.id ? "⏳" : "›"}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Walk-ins */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ color: "#888", fontFamily: "monospace", fontSize: 11,
            letterSpacing: 2, marginBottom: 10 }}>🚶 WALK-INS</div>
          <div onClick={handleWalkIn} style={{
            background: "#0a1a0a", border: "2px solid #39ff14", borderRadius: 14,
            padding: "18px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14,
          }}>
            <span style={{ fontSize: 36 }}>🚶</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#39ff14", fontFamily: "monospace", fontWeight: "bold", fontSize: 16 }}>Walk-in Session</div>
              <div style={{ color: "#446644", fontFamily: "monospace", fontSize: 11, marginTop: 3 }}>
                Creates a fresh room for your group
              </div>
            </div>
            <div style={{ color: "#39ff14", fontSize: 22 }}>›</div>
          </div>
        </div>

        {/* League + Manager buttons */}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={() => setView("league_login")} style={{
            flex: 1, background: "#0a0a1a", border: "1px solid #1d6a96", borderRadius: 12,
            padding: "14px", fontFamily: "monospace", fontSize: 13, color: "#4a90d9", cursor: "pointer",
          }}>🏅 League Login</button>
          <button onClick={() => setView("manager_login")} style={{
            flex: 1, background: "#1a1500", border: "1px solid #555", borderRadius: 12,
            padding: "14px", fontFamily: "monospace", fontSize: 13, color: "#888", cursor: "pointer",
          }}>🔑 Manager</button>
        </div>

        {/* Manager Login */}
        {view === "manager_login" && (
          <div style={{ background: "#111", border: `1px solid ${GOLD}`, borderRadius: 12,
            padding: 18, marginTop: 12 }}>
            <div style={{ color: GOLD, fontFamily: "monospace", fontWeight: "bold",
              fontSize: 12, marginBottom: 12 }}>🔑 MANAGER LOGIN</div>
            <input type="password" value={pinInput} autoFocus
              onChange={e => { setPinInput(e.target.value); setPinError(""); }}
              onKeyDown={e => e.key === "Enter" && handleManagerLogin()}
              placeholder="Enter manager PIN"
              style={{ width: "100%", background: "#1a1a1a",
                border: `2px solid ${pinError ? RED : "#444"}`,
                borderRadius: 8, padding: "12px", color: "#fff", fontFamily: "monospace",
                fontSize: 18, letterSpacing: 4, textAlign: "center", outline: "none",
                boxSizing: "border-box", marginBottom: 8 }} />
            {pinError && <div style={{ color: RED, fontFamily: "monospace", fontSize: 12,
              textAlign: "center", marginBottom: 8 }}>{pinError}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setView("main"); setPinInput(""); setPinError(""); }}
                style={{ flex: 1, background: "#222", color: "#888", border: "1px solid #333",
                  borderRadius: 8, padding: "12px", fontFamily: "monospace", cursor: "pointer" }}>Cancel</button>
              <button onClick={handleManagerLogin}
                style={{ flex: 2, background: GOLD, color: DARK, border: "none",
                  borderRadius: 8, padding: "12px", fontFamily: "monospace",
                  fontWeight: "bold", fontSize: 14, cursor: "pointer" }}>🔓 Login</button>
            </div>
          </div>
        )}

        {/* League Login */}
        {view === "league_login" && (
          <div style={{ background: "#111", border: "1px solid #1d6a96", borderRadius: 12,
            padding: 18, marginTop: 12 }}>
            <div style={{ color: "#4a90d9", fontFamily: "monospace", fontWeight: "bold",
              fontSize: 12, marginBottom: 12 }}>🏅 LEAGUE ROOMS</div>

            {/* Tap a league to join */}
            {leagues.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                {leagues.map(lg => (
                  <div key={lg.id} onClick={() => onJoin(lg.roomCode)} style={{
                    background: "#0a1020", border: "1px solid #1d6a96",
                    borderRadius: 10, padding: "12px 16px", marginBottom: 8,
                    cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <div>
                      <div style={{ color: "#4a90d9", fontFamily: "monospace", fontWeight: "bold", fontSize: 14 }}>
                        {lg.name}
                      </div>
                      <div style={{ color: "#555", fontFamily: "monospace", fontSize: 11, letterSpacing: 2, marginTop: 2 }}>
                        {lg.roomCode}
                      </div>
                    </div>
                    <div style={{ color: "#4a90d9", fontSize: 20 }}>›</div>
                  </div>
                ))}
              </div>
            )}
            {leagues.length === 0 && (
              <div style={{ color: "#444", fontFamily: "monospace", fontSize: 12, textAlign: "center", marginBottom: 12 }}>
                No league rooms set up yet. Ask your manager.
              </div>
            )}

            {/* Manual code entry fallback */}
            <div style={{ color: "#555", fontFamily: "monospace", fontSize: 11, marginBottom: 8 }}>
              Or enter a code manually:
            </div>
            <input type="text" value={leagueCode}
              onChange={e => setLeagueCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              onKeyDown={e => e.key === "Enter" && leagueCode.length >= 2 && onJoin(leagueCode)}
              placeholder="ROOM CODE" maxLength={12}
              style={{ width: "100%", background: "#1a1a1a",
                border: `2px solid ${leagueCode.length >= 2 ? "#1d6a96" : "#444"}`,
                borderRadius: 8, padding: "12px", color: "#fff", fontFamily: "monospace",
                fontSize: 20, letterSpacing: 4, textAlign: "center", outline: "none",
                boxSizing: "border-box", marginBottom: 8 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setView("main"); setLeagueCode(""); }}
                style={{ flex: 1, background: "#222", color: "#888", border: "1px solid #333",
                  borderRadius: 8, padding: "12px", fontFamily: "monospace", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={() => leagueCode.length >= 2 && onJoin(leagueCode)}
                disabled={leagueCode.length < 2}
                style={{ flex: 2, background: leagueCode.length >= 2 ? "#1d6a96" : "#222",
                  color: leagueCode.length >= 2 ? "#fff" : "#555", border: "none",
                  borderRadius: 8, padding: "12px", fontFamily: "monospace",
                  fontWeight: "bold", fontSize: 14, cursor: leagueCode.length < 2 ? "not-allowed" : "pointer" }}>
                🏅 Enter Room
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── MAIN DIRECTORY ────────────────────────────────────────────────────────────
export default function Directory({ onJoin }) {
  const [selectedShop, setSelectedShop] = useState(null);
  const [entering, setEntering] = useState(null);

  if (selectedShop) {
    return <ShopPage shop={selectedShop} onJoin={onJoin}
      onBack={() => setSelectedShop(null)} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: DARK, color: "#fff",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "40px 20px 60px" }}>
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <div style={{ fontSize: 64, marginBottom: 10 }}>🪓</div>
        <h1 style={{ color: GOLD, fontFamily: "Georgia, serif", fontSize: 30,
          margin: "0 0 6px", letterSpacing: 3, textTransform: "uppercase" }}>Golden Axe</h1>
        <div style={{ color: "#555", fontFamily: "monospace", fontSize: 12, letterSpacing: 2 }}>GAME CENTER</div>
      </div>

      <div style={{ width: "100%", maxWidth: 440 }}>
        <div style={{ color: "#444", fontFamily: "monospace", fontSize: 11,
          letterSpacing: 2, marginBottom: 14, textAlign: "center" }}>SELECT YOUR LOCATION</div>

        {SHOPS.map(shop => {
          const isEntering = entering === shop.id;
          return (
            <div key={shop.id} onClick={() => setSelectedShop(shop)} style={{
              background: shop.bg, border: `2px solid ${shop.color}`,
              borderRadius: 16, padding: "22px 24px", marginBottom: 14,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 18,
              transition: "all 0.2s",
            }}>
              <div style={{ flexShrink: 0, width: 68, height: 68, borderRadius: 12,
                background: `${shop.color}22`, border: `1px solid ${shop.color}44`,
                display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 34 }}>🪓</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: shop.accent, fontFamily: "Georgia, serif",
                  fontSize: 21, fontWeight: "bold", marginBottom: 4 }}>{shop.name}</div>
                <div style={{ color: "#666", fontFamily: "monospace", fontSize: 12 }}>📍 {shop.city}</div>
              </div>
              <div style={{ fontSize: 26, color: shop.color }}>›</div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 32, color: "#2a2a2a", fontFamily: "monospace", fontSize: 10, letterSpacing: 1 }}>
        GOLDEN AXE GAME CENTER © 2026
      </div>
    </div>
  );
}
