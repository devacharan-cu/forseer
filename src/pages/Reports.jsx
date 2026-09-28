import Badge from '../components/ui/Badge.jsx'
import Button from '../components/ui/Button.jsx'
import Card from '../components/ui/Card.jsx'
import Icon from '../components/ui/Icon.jsx'
import { formatDate, openIncidents, openOrders, riskTone } from '../features/factory/model.js'
import { METRIC_DEFS } from '../features/scenario/scenarioFormat.js'
import { useAppState } from '../state/AppStateContext.jsx'
import { useFactoryData } from '../state/FactoryDataContext.jsx'
import './Workspaces.css'

const REPORT_METRICS = METRIC_DEFS.filter((d) => ['totalDowntimeHours', 'capacityLossLineHours', 'ordersAtRisk', 'deadlineBreaches', 'newDeadlineBreaches', 'secondaryRisks'].includes(d.key))

// A shareable, on-screen summary built entirely from the engine's own numbers:
// current risk, current capacity, and every scenario simulated this session.
export default function Reports() {
  const { state, view, source } = useFactoryData()
  const { navigate, scenarioRuns, setActiveRunId } = useAppState()

  const risky = view.risks.filter((r) => r.level !== 'LOW')

  return (
    <div className="fs-page fs-page--wide fs-ws">
      <div className="fs-ws__header">
        <div>
          <h2 className="fs-page__title">
            <Icon name="fileText" size={20} /> Reports
          </h2>
          <p className="fs-page__subtitle">
            Risk, capacity and scenario outcomes as of {formatDate(state.asOf, { withTime: true })}
            {source === 'seed' ? ' · seed snapshot' : ' · live Supabase data'}.
          </p>
        </div>
        <Button className="fs-ws__no-print" variant="secondary" icon={<Icon name="fileText" size={14} />} onClick={() => window.print()}>
          Print / save as PDF
        </Button>
      </div>

      <Card title="Operational risk snapshot" description="Every machine at MODERATE risk or above, by FORSEER's operational risk points" padding="sm">
        {risky.length === 0 ? (
          <div className="fs-ws__empty">
            <Icon name="check" size={18} />
            Every machine is classified LOW operational risk.
          </div>
        ) : (
          <div className="fs-table-wrap">
            <table className="fs-table fs-table--static">
              <thead>
                <tr>
                  <th>Machine</th>
                  <th>Risk</th>
                  <th>Points</th>
                  <th>Top signal</th>
                </tr>
              </thead>
              <tbody>
                {risky.map((risk) => (
                  <tr key={risk.machineId}>
                    <td>
                      <strong>{risk.code}</strong> <span className="fs-muted">{risk.name}</span>
                    </td>
                    <td>
                      <Badge size="sm" variant={riskTone(risk.level)}>
                        {risk.level}
                      </Badge>
                    </td>
                    <td>{risk.points}</td>
                    <td>{[...risk.signals].sort((a, b) => b.points - a.points)[0]?.signal.replaceAll('_', ' ') ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Production capacity snapshot" description="Current vs. nominal capacity per line, from the deterministic engine" padding="sm">
        <div className="fs-table-wrap">
          <table className="fs-table fs-table--static">
            <thead>
              <tr>
                <th>Line</th>
                <th>Nominal</th>
                <th>Current</th>
                <th>Ratio</th>
                <th>Open orders</th>
              </tr>
            </thead>
            <tbody>
              {view.capacity.productionLines.map((line) => (
                <tr key={line.productionLineId}>
                  <td>
                    <strong>{line.code}</strong>
                  </td>
                  <td>{line.nominalCapacityPerHour}/h</td>
                  <td>{line.currentCapacityPerHour}/h</td>
                  <td className={line.capacityRatio < 0.999 ? 'fs-text-warning' : 'fs-text-success'}>{Math.round(line.capacityRatio * 100)}%</td>
                  <td>{openOrders(state).filter((o) => o.productionLineId === line.productionLineId).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fs-muted" style={{ marginTop: 8 }}>
          {openIncidents(state).length} open incident{openIncidents(state).length === 1 ? '' : 's'} · {openOrders(state).length} open orders factory-wide.
        </p>
      </Card>

      <Card title="Scenario outcomes this session" description="Every simulation run in Scenario Lab, with the engine's own metrics" padding="sm">
        {scenarioRuns.length === 0 ? (
          <div className="fs-ws__empty">
            <Icon name="flask" size={18} />
            No scenario has been simulated yet this session.
            <Button className="fs-ws__no-print" size="sm" variant="secondary" onClick={() => navigate('scenario-lab')}>
              Open Scenario Lab
            </Button>
          </div>
        ) : (
          <div className="fs-table-wrap">
            <table className="fs-table">
              <thead>
                <tr>
                  <th>Scenario</th>
                  {REPORT_METRICS.map((m) => (
                    <th key={m.key}>{m.label}</th>
                  ))}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {scenarioRuns.map((run) => (
                  <tr
                    key={run.id}
                    onClick={() => {
                      setActiveRunId(run.id)
                      navigate('scenario-lab')
                    }}
                  >
                    <td>
                      <strong>#{run.seq}</strong> {run.result.scenarioName}
                    </td>
                    {REPORT_METRICS.map((m) => (
                      <td key={m.key} className={run.result.metrics[m.key] > 0 && m.key !== 'machinesAffected' ? 'fs-text-warning' : ''}>
                        {run.result.metrics[m.key]}
                        {m.unit ? ` ${m.unit}` : ''}
                      </td>
                    ))}
                    <td className="fs-ws__no-print">
                      <Button size="sm" variant="ghost">
                        Open
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
