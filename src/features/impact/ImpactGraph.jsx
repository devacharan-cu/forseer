import { Background, Controls, Handle, Position, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { memo, useEffect, useMemo, useState } from 'react'
import { useTheme } from '../../context/ThemeContext.jsx'
import { DEFAULT_ENGINE_CONFIG } from '../../engine/index.js'
import { useFactoryData } from '../../state/FactoryDataContext.jsx'
import { formatDate, riskTone, STATE_LABEL } from '../factory/model.js'
import { buildImpactGraph } from './buildImpactGraph.js'
import './ImpactGraph.css'

const fmt = (value, digits = 1) => (value === null || value === undefined ? '—' : Number(value).toFixed(digits).replace(/\.0+$/, ''))

const MachineNode = memo(function MachineNode({ data, selected }) {
  const tone = data.engineState === 'failed' ? 'danger' : riskTone(data.riskLevel)
  return (
    <div className={['fs-gnode', 'fs-gnode--machine', `fs-gnode--${tone}`, data.dimmed ? 'is-dimmed' : '', selected ? 'is-selected' : '', data.impact ? 'is-impacted' : ''].join(' ')}>
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Right} />
      <Handle type="target" position={Position.Left} id="left-in" />
      <Handle type="source" position={Position.Left} id="left-out" />
      <div className="fs-gnode__row">
        <span className="fs-gnode__dot" />
        <strong>{data.code}</strong>
        <span className="fs-gnode__muted">{data.name}</span>
      </div>
      <div className="fs-gnode__meta">
        {data.impact ? (
          <>
            {data.impact.downtimeHours > 0 ? <span className="fs-gnode__chip fs-gnode__chip--danger">down {fmt(data.impact.downtimeHours)} h</span> : null}
            {data.impact.upstreamLimitedHours > 0 ? <span className="fs-gnode__chip fs-gnode__chip--warning">starved {fmt(data.impact.upstreamLimitedHours)} h</span> : null}
            {data.secondaryRisk ? <span className="fs-gnode__chip fs-gnode__chip--warning">{Math.round(data.secondaryRisk.scenarioPeakUtilization * 100)}% load</span> : null}
            {!data.impact.downtimeHours && !data.impact.upstreamLimitedHours && !data.secondaryRisk ? <span>{data.impact.causes.join(', ').replaceAll('_', ' ')}</span> : null}
          </>
        ) : (
          <>
            <span>{STATE_LABEL[data.engineState]}</span>
            <span className={`fs-gnode__risk fs-gnode__risk--${tone}`}>{data.riskLevel}</span>
          </>
        )}
      </div>
    </div>
  )
})

const LineNode = memo(function LineNode({ data }) {
  return (
    <div className={['fs-gnode', 'fs-gnode--line', data.dimmed ? 'is-dimmed' : '', data.impact ? 'is-impacted' : ''].join(' ')}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="fs-gnode__row">
        <strong>{data.code}</strong>
        <span className="fs-gnode__muted">{data.name.replace(/^Line \d+\s*—\s*/, '')}</span>
      </div>
      <div className="fs-gnode__meta">
        {data.impact ? (
          <>
            <span className="fs-gnode__chip fs-gnode__chip--danger">−{fmt(data.impact.lostProductionLineHours, 2)} line-h</span>
            <span>min {fmt(data.impact.minCapacityPerHour, 0)}/{fmt(data.impact.nominalCapacityPerHour, 0)} per h</span>
          </>
        ) : (
          <>
            <span>
              {fmt(data.current, 0)}/{fmt(data.nominal, 0)} per h
            </span>
            <span>{data.openOrders} open orders</span>
          </>
        )}
      </div>
    </div>
  )
})

const STATUS_TONE = { SAFE: 'success', WARNING: 'warning', CRITICAL: 'danger', BREACHED: 'danger' }

const OrderNode = memo(function OrderNode({ data, selected }) {
  const tone = STATUS_TONE[data.status]
  return (
    <div className={['fs-gnode', 'fs-gnode--order', `fs-gnode--${tone}`, data.dimmed ? 'is-dimmed' : '', selected ? 'is-selected' : '', data.statusChanged ? 'is-impacted' : ''].join(' ')}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="fs-gnode__row">
        <strong>{data.orderNumber}</strong>
        {data.priority === 'critical' || data.priority === 'high' ? <span className={`fs-gnode__prio fs-gnode__prio--${data.priority}`}>{data.priority}</span> : null}
        <span className="fs-gnode__muted">due {formatDate(data.deadline)}</span>
      </div>
      <div className="fs-gnode__meta">
        <span className={`fs-gnode__risk fs-gnode__risk--${tone}`}>
          {data.statusChanged ? `${data.baselineStatus} → ${data.status}` : data.status}
        </span>
        <span>{data.slackHours === null ? 'cannot finish' : `slack ${fmt(data.slackHours)} h`}</span>
        {data.delayHours ? <span className="fs-gnode__chip fs-gnode__chip--danger">+{fmt(data.delayHours)} h</span> : null}
      </div>
    </div>
  )
})

const OrderGroupNode = memo(function OrderGroupNode({ data }) {
  const tone = STATUS_TONE[data.status]
  return (
    <div className={['fs-gnode', 'fs-gnode--order', 'fs-gnode--group', `fs-gnode--${tone}`, data.dimmed ? 'is-dimmed' : ''].join(' ')} title={data.orderNumbers.join(', ')}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="fs-gnode__row">
        <strong>
          {data.count} more {data.count === 1 ? 'order' : 'orders'}
        </strong>
        <span className="fs-gnode__muted">{data.lineCode}</span>
      </div>
      <div className="fs-gnode__meta">
        <span className={`fs-gnode__risk fs-gnode__risk--${tone}`}>{data.status === 'SAFE' ? 'all on track' : data.status}</span>
        <span>{data.units.toLocaleString()} units</span>
      </div>
    </div>
  )
})

const { criticalSlackHours, warningSlackHours } = DEFAULT_ENGINE_CONFIG.deadlineThresholds
const OUTCOME_COPY = {
  BREACHED: 'Deadline missed',
  CRITICAL: `Under ${criticalSlackHours} h slack`,
  WARNING: `Under ${warningSlackHours} h slack`,
  SAFE: 'On track',
}

const OutcomeNode = memo(function OutcomeNode({ data }) {
  const tone = STATUS_TONE[data.status]
  return (
    <div className={['fs-gnode', 'fs-gnode--outcome', `fs-gnode--${tone}`, data.dimmed ? 'is-dimmed' : ''].join(' ')}>
      <Handle type="target" position={Position.Left} />
      <div className="fs-gnode__row">
        <strong>{data.status}</strong>
        <span className="fs-gnode__muted">{OUTCOME_COPY[data.status]}</span>
      </div>
      <div className="fs-gnode__big">{data.count}</div>
      <div className="fs-gnode__meta">
        <span>{data.count === 1 ? 'order' : 'orders'}</span>
        <span>{data.units.toLocaleString()} units</span>
        {data.criticalOrders ? <span className="fs-gnode__chip fs-gnode__chip--danger">{data.criticalOrders} critical-priority</span> : null}
      </div>
    </div>
  )
})

const NODE_TYPES = { machine: MachineNode, line: LineNode, order: OrderNode, orderGroup: OrderGroupNode, outcome: OutcomeNode }

const OUTCOME_STROKE = { SAFE: 'var(--fs-success)', WARNING: 'var(--fs-warning)', CRITICAL: 'var(--fs-danger)', BREACHED: 'var(--fs-danger)' }

function styleEdge(edge, hasFocus) {
  const { kind, impact, highlighted, status, label } = edge.data
  const dim = hasFocus && !highlighted
  let stroke = 'var(--fs-border-strong)'
  let width = 1.3
  let dash
  if (kind === 'feeds') stroke = 'var(--fs-text-tertiary)'
  if (kind === 'backup') {
    stroke = 'var(--fs-accent)'
    dash = '5 5'
  }
  if (kind === 'transfer') {
    stroke = 'var(--fs-accent)'
    width = 2.4
  }
  if (kind === 'outcome') stroke = OUTCOME_STROKE[status]
  if (impact) {
    stroke = kind === 'transfer' ? 'var(--fs-accent)' : 'var(--fs-danger)'
    width = 2.6
  }
  if (highlighted && !impact && kind !== 'outcome') {
    stroke = 'var(--fs-accent)'
    width = 2
  }
  return {
    ...edge,
    type: kind === 'feeds' ? 'smoothstep' : 'default',
    animated: impact || kind === 'transfer',
    label: kind === 'backup' ? 'backup' : kind === 'transfer' ? label : highlighted && kind === 'assigned' ? label : undefined,
    labelStyle: { fontSize: 10, fill: 'var(--fs-text-secondary)' },
    labelBgStyle: { fill: 'var(--fs-surface-raised)' },
    style: { stroke, strokeWidth: width, strokeDasharray: dash, opacity: dim ? 0.12 : 1 },
    zIndex: impact || highlighted ? 2 : 0,
  }
}

function GraphInner({ height, result, focusMachineId, focusOrderId, onSelectMachine, onSelectOrder, onClear }) {
  const { state, view } = useFactoryData()
  const { theme } = useTheme()
  const flow = useReactFlow()
  const [expandAll, setExpandAll] = useState(false)

  const graph = useMemo(
    () => buildImpactGraph({ state, view, result, focusMachineId, focusOrderId, expandAll }),
    [state, view, result, focusMachineId, focusOrderId, expandAll],
  )
  const hasFocus = graph.nodes.some((n) => n.data.dimmed)
  const nodes = useMemo(
    () =>
      graph.nodes.map((n) => ({
        ...n,
        selected: (n.type === 'machine' && n.data.entityId === focusMachineId) || (n.type === 'order' && n.data.entityId === focusOrderId),
        draggable: false,
      })),
    [graph, focusMachineId, focusOrderId],
  )
  const edges = useMemo(() => graph.edges.map((e) => styleEdge(e, hasFocus)), [graph, hasFocus])

  useEffect(() => {
    const focused = graph.nodes.filter((n) => hasFocus && !n.data.dimmed).map((n) => ({ id: n.id }))
    const id = requestAnimationFrame(() => flow.fitView({ nodes: focused.length ? focused : undefined, padding: 0.18, duration: 450 }))
    return () => cancelAnimationFrame(id)
  }, [graph, hasFocus, flow])

  return (
    <div className="fs-graph" style={{ height }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        colorMode={theme === 'dark' ? 'dark' : 'light'}
        fitView
        minZoom={0.2}
        maxZoom={1.8}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => {
          if (node.type === 'machine') onSelectMachine?.(node.data.entityId)
          else if (node.type === 'order') onSelectOrder?.(node.data.entityId)
        }}
        onPaneClick={() => onClear?.()}
      >
        <Background gap={22} size={1} color="var(--fs-border)" />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
      <div className="fs-graph__legend">
        <span className="fs-graph__col">Machines</span>
        <span className="fs-graph__col">Production lines</span>
        <span className="fs-graph__col">Open orders</span>
        <span className="fs-graph__col">Deadline outcome</span>
      </div>
      <button type="button" className="fs-graph__toggle" onClick={() => setExpandAll((v) => !v)} aria-pressed={expandAll}>
        {expandAll ? 'Collapse on-track orders' : 'Show all orders'}
      </button>
    </div>
  )
}

export default function ImpactGraph(props) {
  return (
    <ReactFlowProvider>
      <GraphInner {...props} />
    </ReactFlowProvider>
  )
}
