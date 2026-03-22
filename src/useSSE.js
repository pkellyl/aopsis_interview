import { useState, useEffect, useRef } from 'react'

export default function useSSE(url) {
  const [events, setEvents] = useState([])
  const esRef = useRef(null)

  useEffect(() => {
    const es = new EventSource(url)
    esRef.current = es

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        setEvents(prev => [...prev, data])
      } catch {
        // ignore parse errors
      }
    }

    es.onerror = () => {
      // EventSource auto-reconnects
    }

    return () => {
      es.close()
      esRef.current = null
    }
  }, [url])

  return events
}
