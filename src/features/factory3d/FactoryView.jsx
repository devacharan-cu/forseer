import { useProgress } from '@react-three/drei'
import { useMemo, useRef, useState } from 'react'
import Badge from '../../components/ui/Badge.jsx'
import Button from '../../components/ui/Button.jsx'
import ErrorBoundary from '../../components/ui/ErrorBoundary.jsx'
import Icon from '../../components/ui/Icon.jsx'
import Tooltip from '../../components/ui/Tooltip.jsx'
import { useTheme } from '../../context/ThemeContext.jsx'
import { useAppState } from '../../state/AppStateContext.jsx'
import { useFactoryData } from '../../state/FactoryDataContext.jsx'
import {
  exposureOf,
  linesForMachine,
  openIncidents,
  riskTone,
  STATE_LABEL,
  stateTone,
} from '../factory/model.js'
import FactoryCanvas from './FactoryCanvas.jsx'
import { computeFactoryLayout } from './layout.js'
import './FactoryView.css'

function LoadingOverlay() {
  const { active, progress } = useProgress()
  if (!active && progress >= 100) return null
  return (
    <div className="fs-factory__loading">
      <div className="fs-factory__loading-bar">
        <span style={{ width: `${Math.max(6, progress)}%` }} />
      </div>
      <span>Loading factory models… {Math.round(progress)}%</span>
    </div>
  )
}

function Inspector({ machineId, onClose }) {
  const { state, view } = useFactoryData()
  const { openMachine, requestScenario } = useAppState()
  const machine = state.machines.find((m) => m.id === machineId)
  if (!machine) return null
  const risk = view.riskById.get(machine.id)
  const capacity = view.capacityByMachineId.get(machine.id)
  const lines = linesForMachine(state, machine.id)
  const exposure = exposureOf(state, view, machine.id)
  const incidents = openIncidents(state).filter((incident) => incident.machineId === machine.id)
  const atRiskOrders = exposure.orders.filter((o) => o.outlook && o.outlook.baseline.status !== 'SAFE')

  return (
    <aside className="fs-inspector" aria-label={`${machine.code} details`}>
      <div className="fs-inspector__header">
        <div>
          <div className="fs-inspector__code">{machine.code}</div>
          <div className="fs-inspector__name">
            {machine.name} · {machine.machineType}
          </div>
        </div>
        <Button variant="ghost" size="sm" iconOnly icon={<Icon name="x" size={15} />} onClick={onClose} aria-label="Close machine details" />
      </div>
      <div className="fs-inspector__badges">
        <Badge variant={stateTone(machine.baselineState)} dot>
          {STATE_LABEL[machine.baselineState]}
        </Badge>
        <Badge variant={riskTone(risk.level)}>{risk.level} risk · {risk.points} pts</Badge>
      </div>
      <dl className="fs-inspector__facts">
        <div>
          <dt>Line</dt>
          <dd>{lines.map((l) => l.code).join(', ') || '—'}</dd>
        </div>
        <div>
          <dt>Load / usable capacity</dt>
          <dd>
            {capacity.assignedLoadPerHour} / {capacity.usableCapacityPerHour} per h
          </dd>
        </div>
        <div>
          <dt>Utilization</dt>
          <dd>{capacity.utilization === null ? 'Unavailable' : `${Math.round(capacity.utilization * 100)}%`}</dd>
        </div>
        <div>
          <dt>Downstream machines</dt>
          <dd>{exposure.downstream.map((m) => m.code).join(', ') || 'None'}</dd>
        </div>
        <div>
          <dt>Open incidents</dt>
          <dd>{incidents.length}</dd>
        </div>
        <div>
          <dt>Orders not safe on its line</dt>
          <dd>{atRiskOrders.map((o) => o.order.orderNumber).join(', ') || 'None'}</dd>
        </div>
      </dl>
      {risk.signals.length > 0 ? (
        <ul className="fs-inspector__signals">
          {risk.signals.slice(0, 3).map((signal) => (
            <li key={signal.signal}>
              <span>{signal.signal.replaceAll('_', ' ')}</span>
              <span>+{signal.points}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="fs-inspector__actions">
        <Button variant="primary" size="sm" onClick={() => openMachine(machine.id)} icon={<Icon name="cpu" size={15} />}>
          Machine intelligence
        </Button>
        <Button variant="secondary" size="sm" onClick={() => requestScenario({ kind: 'failure', machineId: machine.id })} icon={<Icon name="flask" size={15} />}>
          Run what-if
        </Button>
      </div>
    </aside>
  )
}

function Legend() {
  return (
    <div className="fs-factory__legend" aria-label="Legend">
      <span>
        <i style={{ background: '#ef4444' }} /> Critical / failed
      </span>
      <span>
        <i style={{ background: '#f59e0b' }} /> Elevated risk
      </span>
      <span>
        <i style={{ background: '#22c55e' }} /> Low risk
      </span>
      <span>
        <i style={{ background: '#3b82f6' }} /> Selected
      </span>
    </div>
  )
}

export default function FactoryView({ height = 520, showInspector = true }) {
  const { state, view } = useFactoryData()
  const { theme } = useTheme()
  const { selectedMachineId, selectMachine, openMachine } = useAppState()
  const [showLabels, setShowLabels] = useState(true)
  const [showProps, setShowProps] = useState(true)
  const [hovered, setHovered] = useState(null)
  const canvasRef = useRef(null)

  const layout = useMemo(() => computeFactoryLayout(state), [state])
  const machineInfo = useMemo(
    () =>
      new Map(
        state.machines.map((m) => {
          const risk = view.riskById.get(m.id)
          return [m.id, { id: m.id, code: m.code, engineState: m.baselineState, riskLevel: risk?.level ?? 'LOW' }]
        }),
      ),
    [state, view],
  )
  const top = view.risks[0]
  const heroId = top && ['HIGH', 'CRITICAL'].includes(top.level) ? top.machineId : null

  const setCursor = (id) => {
    setHovered(id)
    document.body.style.cursor = id ? 'pointer' : ''
  }

  return (
    <div className="fs-factory" style={{ height }}>
      <ErrorBoundary
        fallback={(error) => (
          <div className="fs-factory__error">
            <Icon name="alertTriangle" size={22} />
            <p>The 3D view could not start ({error.message}). The impact graph and machine list still work.</p>
          </div>
        )}
      >
        <FactoryCanvas
          ref={canvasRef}
          layout={layout}
          machineInfo={machineInfo}
          selectedId={selectedMachineId}
          heroId={heroId}
          theme={theme}
          showLabels={showLabels}
          showProps={showProps}
          onSelect={selectMachine}
          onOpen={openMachine}
          onHover={setCursor}
        />
      </ErrorBoundary>
      <LoadingOverlay />

      <div className="fs-factory__toolbar">
        <Tooltip content="Reset view">
          <Button variant="secondary" size="sm" iconOnly icon={<Icon name="reset" size={15} />} onClick={() => canvasRef.current?.reset()} aria-label="Reset view" />
        </Tooltip>
        <Tooltip content="Focus selected machine">
          <Button
            variant="secondary"
            size="sm"
            iconOnly
            disabled={!selectedMachineId}
            icon={<Icon name="target" size={15} />}
            onClick={() => canvasRef.current?.focus(selectedMachineId)}
            aria-label="Focus selected machine"
          />
        </Tooltip>
        <Button variant={showLabels ? 'secondary' : 'ghost'} size="sm" onClick={() => setShowLabels((v) => !v)} aria-pressed={showLabels}>
          Labels
        </Button>
        <Button variant={showProps ? 'secondary' : 'ghost'} size="sm" onClick={() => setShowProps((v) => !v)} aria-pressed={showProps}>
          Set dressing
        </Button>
      </div>

      <div className="fs-factory__hint">
        {hovered ? `${machineInfo.get(hovered)?.code} · click to select, double-click for intelligence` : 'Drag to orbit · right-drag to pan · scroll to zoom'}
      </div>
      <Legend />

      {showInspector && selectedMachineId ? <Inspector machineId={selectedMachineId} onClose={() => selectMachine(null)} /> : null}
    </div>
  )
}
