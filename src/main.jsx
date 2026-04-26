import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import GoldenAxeApp from './GoldenAxeApp'
import Directory from './Directory'

function Root() {
  const [groupCode, setGroupCode] = useState(null);

  const handleJoin = (code) => setGroupCode(code);
  const handleLeave = () => setGroupCode(null);

  if (!groupCode) return <Directory onJoin={handleJoin} />;
  return <GoldenAxeApp groupCode={groupCode} onLeaveGroup={handleLeave} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><Root /></React.StrictMode>
)
