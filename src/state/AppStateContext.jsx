import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const AppStateContext = createContext(null)

// UI-wide state: which page is open, which machine is selected everywhere
// (3D view, graph, intelligence page), and the scenario runs made this session.
export function AppStateProvider({ children }) {
  const [activeId, setActiveId] = useState('command-center')
  const [selectedMachineId, setSelectedMachineId] = useState(null)
  const [focusedOrderId, setFocusedOrderId] = useState(null)
  const [floorView, setFloorView] = useState('3d')
  const [scenarioRuns, setScenarioRuns] = useState([])
  const [activeRunId, setActiveRunId] = useState(null)
  const [scenarioRequest, setScenarioRequest] = useState(null)

  const navigate = useCallback((id) => setActiveId(id), [])

  const selectMachine = useCallback((id) => {
    setSelectedMachineId(id)
    if (id) setFocusedOrderId(null)
  }, [])

  const openMachine = useCallback((id) => {
    setSelectedMachineId(id)
    setActiveId('machine-intelligence')
  }, [])

  const showOnFloor = useCallback((id) => {
    setSelectedMachineId(id)
    setFloorView('3d')
    setActiveId('command-center')
  }, [])

  const focusOrder = useCallback((id) => {
    setFocusedOrderId(id)
    setSelectedMachineId(null)
    setFloorView('graph')
    setActiveId('command-center')
  }, [])

  const addScenarioRun = useCallback((run) => {
    setScenarioRuns((runs) => [run, ...runs.filter((r) => r.id !== run.id)])
    setActiveRunId(run.id)
  }, [])

  const removeScenarioRun = useCallback((id) => {
    setScenarioRuns((runs) => runs.filter((run) => run.id !== id))
    setActiveRunId((current) => (current === id ? null : current))
  }, [])

  // Another page asks Scenario Lab to open with a prepared scenario.
  const requestScenario = useCallback((request) => {
    setScenarioRequest({ ...request, requestedAt: Date.now() })
    setActiveId('scenario-lab')
  }, [])

  const clearScenarioRequest = useCallback(() => setScenarioRequest(null), [])

  const value = useMemo(
    () => ({
      activeId,
      navigate,
      selectedMachineId,
      selectMachine,
      openMachine,
      showOnFloor,
      focusedOrderId,
      focusOrder,
      floorView,
      setFloorView,
      scenarioRuns,
      addScenarioRun,
      removeScenarioRun,
      activeRunId,
      setActiveRunId,
      scenarioRequest,
      clearScenarioRequest,
      requestScenario,
    }),
    [
      activeId,
      navigate,
      selectedMachineId,
      selectMachine,
      openMachine,
      showOnFloor,
      focusedOrderId,
      focusOrder,
      floorView,
      scenarioRuns,
      addScenarioRun,
      removeScenarioRun,
      activeRunId,
      scenarioRequest,
      clearScenarioRequest,
      requestScenario,
    ],
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState() {
  const context = useContext(AppStateContext)
  if (!context) throw new Error('useAppState must be used within an AppStateProvider')
  return context
}
