import { useCallback } from 'react'

export default function useAPI() {
  const get = useCallback(async (url) => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`GET ${url}: ${res.status}`)
    return res.json()
  }, [])

  const post = useCallback(async (url, body) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`POST ${url}: ${res.status}`)
    return res.json()
  }, [])

  const put = useCallback(async (url, body) => {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`PUT ${url}: ${res.status}`)
    return res.json()
  }, [])

  return { get, post, put }
}
