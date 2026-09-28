import { useMemo, useRef, useState } from 'react'
import { useAppState } from '../../state/AppStateContext.jsx'
import { useFactoryData } from '../../state/FactoryDataContext.jsx'
import Badge from '../ui/Badge.jsx'
import Icon from '../ui/Icon.jsx'
import Input from '../ui/Input.jsx'
import './SearchBox.css'

const MAX_RESULTS = 8

function matches(query, ...fields) {
  const q = query.trim().toLowerCase()
  return fields.some((field) => field?.toLowerCase().includes(q))
}

export default function SearchBox() {
  const { state, view } = useFactoryData()
  const { openMachine, focusOrder, setFloorView, navigate } = useAppState()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const blurTimer = useRef(null)

  const results = useMemo(() => {
    if (!state || query.trim().length === 0) return []
    const machines = state.machines
      .filter((m) => matches(query, m.code, m.name, m.machineType))
      .map((m) => ({ key: `m-${m.id}`, kind: 'Machine', label: m.code, detail: `${m.name} · ${m.machineType}`, level: view.riskById.get(m.id)?.level, go: () => openMachine(m.id) }))
    const orders = state.orders
      .filter((o) => matches(query, o.orderNumber))
      .map((o) => ({ key: `o-${o.id}`, kind: 'Order', label: o.orderNumber, detail: `${o.priority} priority · ${o.status.replace('_', ' ')}`, go: () => focusOrder(o.id) }))
    const lines = state.productionLines
      .filter((l) => matches(query, l.code, l.name))
      .map((l) => ({
        key: `l-${l.id}`,
        kind: 'Line',
        label: l.code,
        detail: l.name,
        go: () => {
          setFloorView('graph')
          navigate('command-center')
        },
      }))
    return [...machines, ...orders, ...lines].slice(0, MAX_RESULTS)
  }, [state, view, query, openMachine, focusOrder, setFloorView, navigate])

  function choose(result) {
    result.go()
    setQuery('')
    setOpen(false)
  }

  function handleKeyDown(event) {
    if (!open || results.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((i) => (i + 1) % results.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => (i - 1 + results.length) % results.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(results[Math.min(active, results.length - 1)])
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="fs-search">
      <Input
        icon={<Icon name="search" size={16} />}
        placeholder={state ? 'Search machines, orders, lines… (e.g. "M4", "ORD-0482")' : 'Loading factory data…'}
        aria-label="Search machines, orders and lines"
        value={query}
        disabled={!state}
        onChange={(event) => {
          setQuery(event.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 150)
        }}
        onKeyDown={handleKeyDown}
      />
      {open && query.trim() ? (
        <div className="fs-search__results" role="listbox" onMouseDown={() => clearTimeout(blurTimer.current)}>
          {results.length === 0 ? (
            <div className="fs-search__empty">No machine, order or line matches "{query}"</div>
          ) : (
            results.map((result, index) => (
              <button
                key={result.key}
                type="button"
                role="option"
                aria-selected={index === active}
                className={`fs-search__result ${index === active ? 'fs-search__result--active' : ''}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(result)}
              >
                <span className="fs-search__kind">{result.kind}</span>
                <span className="fs-search__label">{result.label}</span>
                <span className="fs-search__detail">{result.detail}</span>
                {result.level && result.level !== 'LOW' ? (
                  <Badge size="sm" variant={result.level === 'CRITICAL' ? 'danger' : 'warning'}>
                    {result.level}
                  </Badge>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
