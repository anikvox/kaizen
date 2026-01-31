// Simple debug version to test if basic rendering works

function DebugPanel() {
  console.log("DebugPanel component rendering")

  return (
    <div style={{ padding: "20px", background: "#1a1a1a", color: "white", minHeight: "100vh" }}>
      <h1>Sidepanel Debug Test</h1>
      <p>If you see this, React is rendering!</p>
      <p>Timestamp: {new Date().toISOString()}</p>
    </div>
  )
}

export default DebugPanel
