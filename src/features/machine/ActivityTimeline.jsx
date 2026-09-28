import { useMemo, useState } from 'react'
import { formatDate } from '../factory/model.js'
import './ActivityTimeline.css'

const DAY_MS = 86_400_000
const SEVERITY_RANK = { low: 1, medium: 2, high: 3, critical: 4 }

// Real incident and maintenance records for one machine on a date axis.
// Incidents sit above the axis (height = severity), maintenance below.
export default function ActivityTimeline({ incidents, maintenance, asOf, days = 180 }) {
  const [hover, setHover] = useState(null)
  const end = Date.parse(asOf)
  const start = end - days * DAY_MS
  const width = 1000
  const x = (iso) => ((Date.parse(iso) - start) / (end - start)) * width

  const events = useMemo(() => {
    const inRange = (iso) => Date.parse(iso) >= start && Date.parse(iso) <= end
    return [
      ...incidents.filter((i) => inRange(i.detectedAt)).map((i) => ({ kind: 'incident', id: i.id, at: i.detectedAt, label: i.description, meta: `${i.severity} · ${i.status}`, level: SEVERITY_RANK[i.severity] ?? 1, open: i.status === 'open' || i.status === 'investigating' })),
      ...maintenance.filter((m) => inRange(m.occurredAt)).map((m) => ({ kind: 'maintenance', id: m.id, at: m.occurredAt, label: m.description ?? m.eventType, meta: `${m.eventType}${m.durationHours ? ` · ${m.durationHours} h` : ''}${m.outcome ? ` · ${m.outcome.replaceAll('_', ' ')}` : ''}`, type: m.eventType })),
    ]
  }, [incidents, maintenance, start, end])

  const ticks = []
  for (let d = 0; d <= days; d += 30) ticks.push(new Date(start + d * DAY_MS).toISOString())

  return (
    <div className="fs-timeline">
      <svg viewBox={`0 0 ${width} 140`} preserveAspectRatio="none" className="fs-timeline__svg" role="img" aria-label={`Incidents and maintenance over the last ${days} days`}>
        <line x1="0" x2={width} y1="80" y2="80" className="fs-timeline__axis" />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1="76" y2="84" className="fs-timeline__tick" />
          </g>
        ))}
        {events.map((e) =>
          e.kind === 'incident' ? (
            <g key={e.id} onMouseEnter={() => setHover(e)} onMouseLeave={() => setHover(null)} className="fs-timeline__event">
              <line x1={x(e.at)} x2={x(e.at)} y1="80" y2={80 - e.level * 15} className={`fs-timeline__stem fs-timeline__stem--sev${e.level}`} />
              <circle cx={x(e.at)} cy={80 - e.level * 15} r={e.open ? 7 : 5.5} className={`fs-timeline__dot fs-timeline__dot--sev${e.level} ${e.open ? 'is-open' : ''}`} />
            </g>
          ) : (
            <g key={e.id} onMouseEnter={() => setHover(e)} onMouseLeave={() => setHover(null)} className="fs-timeline__event">
              <line x1={x(e.at)} x2={x(e.at)} y1="80" y2="108" className="fs-timeline__stem" />
              <rect x={x(e.at) - 5.5} y="106" width="11" height="11" rx="2" className={`fs-timeline__mnt fs-timeline__mnt--${e.type}`} />
            </g>
          ),
        )}
      </svg>
      <div className="fs-timeline__labels">
        {ticks.map((t) => (
          <span key={t} style={{ left: `${(x(t) / width) * 100}%` }}>
            {formatDate(t)}
          </span>
        ))}
      </div>
      <div className="fs-timeline__legend">
        <span>
          <i className="fs-timeline__key fs-timeline__key--incident" /> Incident (height = severity)
        </span>
        <span>
          <i className="fs-timeline__key fs-timeline__key--repair" /> Repair
        </span>
        <span>
          <i className="fs-timeline__key fs-timeline__key--preventive" /> Preventive
        </span>
        <span>
          <i className="fs-timeline__key fs-timeline__key--inspection" /> Inspection / calibration
        </span>
      </div>
      <div className="fs-timeline__detail">
        {hover ? (
          <>
            <strong>{formatDate(hover.at)}</strong> · {hover.meta} — {hover.label}
          </>
        ) : (
          `${events.length} records in the last ${days} days · hover a marker for details`
        )}
      </div>
    </div>
  )
}
