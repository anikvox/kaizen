import { useEffect, useState } from "react"
import { createApiClient } from "@kaizen/api-client"

const apiUrl = process.env.PLASMO_PUBLIC_KAIZEN_API_URL || "http://localhost:60092"

function IndexPopup() {
  const [message, setMessage] = useState("")
  const [health, setHealth] = useState("")

  useEffect(() => {
    const api = createApiClient(apiUrl)

    api.health.getMessage().then((res) => setMessage(res.message))
    api.health.check().then((res) => setHealth(res.status))
  }, [])

  return (
    <div
      style={{
        padding: 16,
        minWidth: 300
      }}>
      <h2>Kaizen Extension</h2>
      <p>API: {message}</p>
      <p>Health: {health}</p>
    </div>
  )
}

export default IndexPopup
