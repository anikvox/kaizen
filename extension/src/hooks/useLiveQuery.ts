// Custom hook to replace dexie-react-hooks useLiveQuery
// This provides a simple polling mechanism for the mock database

import { useEffect, useState } from "react"

export function useLiveQuery<T>(
  querier: () => Promise<T> | T,
  deps: any[] = []
): T | undefined {
  const [result, setResult] = useState<T | undefined>(undefined)

  useEffect(() => {
    let mounted = true

    const runQuery = async () => {
      try {
        const data = await Promise.resolve(querier())
        if (mounted) {
          setResult(data)
        }
      } catch (error) {
        console.error("useLiveQuery error:", error)
      }
    }

    runQuery()

    // Poll every second to simulate live updates
    const interval = setInterval(runQuery, 1000)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, deps)

  return result
}
