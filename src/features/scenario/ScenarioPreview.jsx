import Badge from '../../components/ui/Badge.jsx'
import Button from '../../components/ui/Button.jsx'
import Icon from '../../components/ui/Icon.jsx'
import { deadlineTone } from '../factory/model.js'
import { MetricGrid } from './ResultView.jsx'

// Live engine preview of a scenario before it is saved as a run. `preview` is
// { result } or { error } from simulateScenario; nothing here is estimated.
export default function ScenarioPreview({ scenario, preview, onRun }) {
  if (!scenario) {
    return (
      <div className="fs-sl-preview fs-sl-preview--empty">
        <Icon name="flask" size={22} />
        <p>Pick a quick scenario or describe one to see its expected impact.</p>
      </div>
    )
  }
  const { result, error } = preview ?? {}
  return (
    <div className="fs-sl-preview">
      <div className="fs-sl-preview__head">
        <span className="fs-sl-preview__eyebrow">Expected impact · engine preview</span>
        <h3>{scenario.name}</h3>
        {scenario.description ? <p className="fs-muted">{scenario.description}</p> : null}
      </div>
      {error ? (
        <div className="fs-sl-error">
          <strong>The engine cannot run this scenario yet</strong>
          <ul>
            {(error.issues?.length ? error.issues : [error.message]).map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {result ? (
        <>
          <MetricGrid metrics={result.metrics} compact />
          {result.deadlineImpacts.length ? (
            <ul className="fs-sl-preview__orders">
              {result.deadlineImpacts.slice(0, 5).map((d) => (
                <li key={d.orderId}>
                  <strong>{d.orderNumber}</strong>
                  <Badge size="sm" variant={deadlineTone(d.from)}>
                    {d.from}
                  </Badge>
                  <Icon name="arrowRight" size={12} />
                  <Badge size="sm" variant={deadlineTone(d.to)}>
                    {d.to}
                  </Badge>
                  <span className="fs-muted">
                    {d.baselineSlackHours ?? '—'} h → {d.scenarioSlackHours ?? '—'} h slack
                  </span>
                </li>
              ))}
              {result.deadlineImpacts.length > 5 ? <li className="fs-muted">+{result.deadlineImpacts.length - 5} more in the full result</li> : null}
            </ul>
          ) : (
            <p className="fs-muted fs-sl-preview__none">No order changes deadline status.</p>
          )}
        </>
      ) : null}
      <Button variant="primary" icon={<Icon name="play" size={14} />} onClick={onRun} disabled={!result}>
        Run simulation
      </Button>
    </div>
  )
}
