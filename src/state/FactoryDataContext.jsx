import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { deriveFactoryView, loadFactorySnapshot } from './factoryData.js'

const FactoryDataContext = createContext(null)

const supabaseConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)

async function fetchLive() {
  const { getFactorySnapshot } = await import('../api/factory.js')
  return getFactorySnapshot()
}

async function loadEverything() {
  const loaded = await loadFactorySnapshot({ supabaseConfigured, fetchLive })
  return { ...loaded, view: deriveFactoryView(loaded.rows, loaded.asOf), loadedAt: new Date().toISOString() }
}

export function FactoryDataProvider({ children }) {
  const [snapshot, setSnapshot] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    loadEverything()
      .then((loaded) => !cancelled && setSnapshot(loaded))
      .catch((loadError) => !cancelled && setError(loadError))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setSnapshot(await loadEverything())
    } catch (loadError) {
      setError(loadError)
    } finally {
      setLoading(false)
    }
  }, [])

  const value = useMemo(
    () => ({
      loading,
      error,
      source: snapshot?.source ?? null,
      warning: snapshot?.warning ?? null,
      loadedAt: snapshot?.loadedAt ?? null,
      supabaseConfigured,
      view: snapshot?.view ?? null,
      state: snapshot?.view.state ?? null,
      reload,
    }),
    [loading, error, snapshot, reload],
  )

  return <FactoryDataContext.Provider value={value}>{children}</FactoryDataContext.Provider>
}

export function useFactoryData() {
  const context = useContext(FactoryDataContext)
  if (!context) throw new Error('useFactoryData must be used within a FactoryDataProvider')
  return context
}
