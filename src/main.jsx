import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import GoldenAxeApp from './GoldenAxeApp'
import Directory from './Directory'

function Root() {
  const [groupCode, setGroupCode] = useState(() => {
    try { return localStorage.getItem("ga_group_code") || null; } catch { return null; }
  });

  const handleJoin = (code) => {
    try { localStorage.setItem("ga_group_code", code); } catch {}
    setGroupCode(code);
  };

  const handleLeave = () => {
    try { localStorage.removeItem("ga_group_code"); } catch {}
    setGroupCode(null);
  };

  // Always show Directory first — shop tiles handle routing automatically
  if (!groupCode) return <Directory onJoin={handleJoin} />;
  return <GoldenAxeApp groupCode={groupCode} onLeaveGroup={handleLeave} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
