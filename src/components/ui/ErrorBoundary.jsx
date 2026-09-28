import { Component } from 'react'

// Contains a render failure (e.g. no WebGL) to the panel that caused it.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('FORSEER panel failed to render', error, info?.componentStack)
  }

  render() {
    if (this.state.error) return this.props.fallback?.(this.state.error, () => this.setState({ error: null })) ?? null
    return this.props.children
  }
}
