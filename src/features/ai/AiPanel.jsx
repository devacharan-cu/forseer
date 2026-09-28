import { useState } from 'react'
import Button from '../../components/ui/Button.jsx'
import Icon from '../../components/ui/Icon.jsx'
import Spinner from '../../components/ui/Spinner.jsx'
import { aiErrorMessage, getAiProvider } from './aiProvider.js'
import './AiPanel.css'

// Runs one AI function on demand. The engine results on the page never depend on it.
export default function AiPanel({ title, description, actionLabel = 'Explain with AI', run, render }) {
  const [status, setStatus] = useState('idle')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function start() {
    setStatus('running')
    setError(null)
    try {
      setResult(await run(getAiProvider()))
      setStatus('done')
    } catch (runError) {
      setError(runError)
      setStatus('error')
    }
  }

  return (
    <div className="fs-ai">
      <div className="fs-ai__head">
        <span className="fs-ai__icon">
          <Icon name="sparkles" size={16} />
        </span>
        <div className="fs-ai__heading">
          <strong>{title}</strong>
          <span>{description}</span>
        </div>
        <Button size="sm" variant={status === 'done' ? 'ghost' : 'secondary'} onClick={start} disabled={status === 'running'}>
          {status === 'running' ? <Spinner size={14} /> : null}
          {status === 'done' ? 'Run again' : actionLabel}
        </Button>
      </div>
      {status === 'error' ? (
        <div className="fs-ai__error">
          <Icon name="info" size={15} />
          <div>
            <p>{aiErrorMessage(error)}</p>
            {error?.issues?.length ? (
              <ul>
                {error.issues.slice(0, 4).map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : null}
            <p className="fs-ai__note">Every number on this page comes from the deterministic engine and is unaffected.</p>
          </div>
        </div>
      ) : null}
      {status === 'done' && result ? <div className="fs-ai__body">{render(result)}</div> : null}
      <p className="fs-ai__footer">AI interprets engine results; it never produces FORSEER’s numbers. Replies are validated before display.</p>
    </div>
  )
}
