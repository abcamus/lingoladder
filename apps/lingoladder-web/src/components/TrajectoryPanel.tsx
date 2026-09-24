/**
 * DSH Trajectory Panel for lingoladder-web.
 * Connects to a live DSH backend and renders session trajectory data.
 */
import { useState, useCallback } from 'react'
import { useDshTrajectory } from '../lib/use-dsh-trajectory'
import type { TrajectorySnapshot } from '../lib/trajectory-builder'

// Auto-detect DSH server URL from current page location
const DEFAULT_DSH_URL = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4000'

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function KindIcon({ kind }: { kind: string }) {
  switch (kind) {
    case 'user': return <span className="traj-icon traj-icon-user">👤</span>
    case 'message': return <span className="traj-icon traj-icon-assistant">✨</span>
    case 'tool': return <span className="traj-icon traj-icon-tool">🔧</span>
    case 'system': return <span className="traj-icon traj-icon-system">⚙️</span>
    default: return <span className="traj-icon traj-icon-system">❓</span>
  }
}

function KindLabel({ kind }: { kind: string }) {
  switch (kind) {
    case 'user': return 'User'
    case 'message': return 'Assistant'
    case 'tool': return 'Tool'
    case 'system': return 'System'
    default: return kind
  }
}

interface StatusBarProps {
  connected: boolean
  streaming: boolean
  error: string | null
  reconnectCount: number
}

function StatusBar({ connected, streaming, error, reconnectCount }: StatusBarProps) {
  return (
    <div className="traj-status-bar">
      <span className={`traj-status-dot ${connected ? 'traj-status-connected' : 'traj-status-disconnected'}`} />
      <span className="traj-status-text">
        {connected ? (streaming ? 'Streaming' : 'Connected') : 'Disconnected'}
      </span>
      {reconnectCount > 0 && (
        <span className="traj-retry">Retry #{reconnectCount}</span>
      )}
      {error && (
        <span className="traj-error">{error}</span>
      )}
    </div>
  )
}

interface SessionListProps {
  sessions: Array<{ sessionId: string; updatedAt: number; running?: boolean }>
  titles: Record<string, string | null>
  selectedId: string | null
  onSelect: (id: string) => void
  onRefresh: () => void
}

function SessionList({ sessions, titles, selectedId, onSelect, onRefresh }: SessionListProps) {
  return (
    <div className="traj-session-list">
      <div className="traj-session-header">
        <span>Sessions ({sessions.length})</span>
        <button className="traj-toolbar-btn" onClick={onRefresh}>Refresh</button>
      </div>
      <div className="traj-session-items">
        {sessions.length === 0 && (
          <div className="traj-session-empty">No sessions found</div>
        )}
        {sessions.map(s => (
          <button
            key={s.sessionId}
            className={`traj-session-item ${selectedId === s.sessionId ? 'traj-session-selected' : ''}`}
            onClick={() => { onSelect(s.sessionId) }}
            title={s.sessionId}
          >
            <span className="traj-session-title">{titles[s.sessionId] ?? s.sessionId.slice(0, 8)}</span>
            <span className="traj-session-meta">
              {s.running && <span>running</span>}
              <span>{new Date(s.updatedAt).toLocaleTimeString()}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

interface TurnViewProps {
  snapshot: TrajectorySnapshot
  collapsedTurns: Set<number>
  selectedCell: number | null
  onToggleTurn: (turn: number) => void
  onSelectCell: (index: number) => void
}

function TurnView({ snapshot, collapsedTurns, selectedCell, onToggleTurn, onSelectCell }: TurnViewProps) {
  return (
    <>
      <div className="traj-toolbar">
        <span className="traj-toolbar-info">
          {snapshot.turns.length} turns · {snapshot.totalCells} events · {formatDuration(snapshot.totalDuration * 1000)}
        </span>
        <div className="traj-toolbar-actions">
          <button
            className="traj-toolbar-btn"
            onClick={() => { collapsedTurns.clear() }}
          >
            Expand All
          </button>
        </div>
      </div>

      <div className="traj-timeline">
        {snapshot.turns.map((t) => {
          const cells = t.groups.flatMap(g => g.cells)
          return cells.map(cell => (
            <div
              key={cell.index}
              className={`traj-timeline-span traj-span-${cell.kind}`}
              style={{ flex: 1 }}
              title={`${cell.kind}: ${cell.text.slice(0, 40)}...`}
            />
          ))
        })}
      </div>

      <div className="traj-ledger">
        {snapshot.turns.map((t) => {
          const isCollapsed = t.turn !== null && collapsedTurns.has(t.turn)
          const cells = t.groups.flatMap(g => g.cells)
          const turn = t.turn
          return (
            <div key={t.turn ?? 'null'} className="traj-turn">
              {turn !== null && (
                <button
                  className="traj-turn-header"
                  onClick={() => { onToggleTurn(turn) }}
                >
                  <span className="traj-turn-chevron">{isCollapsed ? '▶' : '▼'}</span>
                  <span className="traj-turn-label">Turn {t.turn}</span>
                  {t.groups[0]?.description && (
                    <span className="traj-turn-desc">{t.groups[0].description}</span>
                  )}
                </button>
              )}
              {!isCollapsed && (
                <div className="traj-cells">
                  {cells.map(cell => (
                    <div
                      key={cell.index}
                      className={`traj-cell traj-cell-${cell.kind} ${selectedCell === cell.index ? 'traj-cell-selected' : ''}`}
                      onClick={() => { onSelectCell(cell.index) }}
                      role="row"
                      aria-selected={selectedCell === cell.index}
                    >
                      <div className="traj-cell-header">
                        <span className="traj-cell-kind">
                          <KindIcon kind={cell.kind} />
                          <KindLabel kind={cell.kind} />
                        </span>
                        <span className="traj-cell-meta">
                          {cell.timeSeconds != null && cell.timeSeconds > 0 && (
                            <span className="traj-cell-duration">{formatDuration(cell.timeSeconds * 1000)}</span>
                          )}
                          {cell.toolName && (
                            <span className="traj-tool-label">{cell.toolName}</span>
                          )}
                          {cell.isError && <span className="traj-error-badge">error</span>}
                          <span className="traj-cell-index">#{cell.index}</span>
                        </span>
                      </div>
                      <div className="traj-cell-content">
                        <pre className="traj-cell-text">{cell.text}</pre>
                      </div>
                      {(cell.input != null || cell.output != null) && (
                        <div className="traj-cell-tokens">
                          {cell.input != null && <span className="traj-token">↓ {cell.input}</span>}
                          {cell.output != null && <span className="traj-token">↑ {cell.output}</span>}
                          {cell.think != null && <span className="traj-token">💭 {cell.think}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

export function TrajectoryPanel() {
  const [dshUrl, setDshUrl] = useState(DEFAULT_DSH_URL)
  const [urlInput, setUrlInput] = useState(DEFAULT_DSH_URL)
  const [collapsedTurns, setCollapsedTurns] = useState<Set<number>>(new Set())
  const [selectedCell, setSelectedCell] = useState<number | null>(null)

  const [state, actions] = useDshTrajectory({ baseUrl: dshUrl })

  const toggleTurn = useCallback((turn: number) => {
    setCollapsedTurns((prev) => {
      const next = new Set(prev)
      if (next.has(turn)) next.delete(turn)
      else next.add(turn)
      return next
    })
  }, [])

  const handleConnect = useCallback(() => {
    setDshUrl(urlInput)
  }, [urlInput])

  const handleDisconnect = useCallback(() => {
    actions.disconnect()
    setCollapsedTurns(new Set())
    setSelectedCell(null)
  }, [actions])

  return (
    <div className="traj-root">
      {/* Connection controls */}
      <div className="traj-connect-bar">
        <input
          className="traj-url-input"
          type="text"
          value={urlInput}
          onChange={(e) => { setUrlInput(e.target.value) }}
          placeholder="DSH server URL (e.g. http://localhost:3000)"
          disabled={state.connected}
        />
        {!state.connected ? (
          <button className="traj-toolbar-btn" onClick={handleConnect}>
            Connect
          </button>
        ) : (
          <button className="traj-toolbar-btn" onClick={handleDisconnect}>
            Disconnect
          </button>
        )}
      </div>

      <StatusBar
        connected={state.connected}
        streaming={state.streaming}
        error={state.error}
        reconnectCount={state.reconnectCount}
      />

      {state.connected && (
        <SessionList
          sessions={state.sessions}
          titles={state.titles}
          selectedId={state.selectedSessionId}
          onSelect={actions.selectSession}
          onRefresh={() => { void actions.refreshSessions() }}
        />
      )}

      {state.snapshot && (
        <TurnView
          snapshot={state.snapshot}
          collapsedTurns={collapsedTurns}
          selectedCell={selectedCell}
          onToggleTurn={toggleTurn}
          onSelectCell={setSelectedCell}
        />
      )}

      {state.connected && !state.selectedSessionId && (
        <div className="traj-placeholder">
          Select a session to view its trajectory
        </div>
      )}

      {!state.connected && (
        <div className="traj-placeholder">
          {state.error ? (
            <div>
              <div style={{ marginBottom: '8px', fontWeight: 600 }}>Connection unavailable</div>
              <div style={{ fontSize: '12px', color: 'var(--tx3)' }}>{state.error}</div>
              {state.error.includes('Authentication') && (
                <div style={{ fontSize: '12px', color: 'var(--tx3)', marginTop: '8px' }}>
                  <strong>How to authenticate:</strong>
                  <ol style={{ margin: '8px 0', paddingLeft: '20px' }}>
                    <li>Visit the root URL with the token (printed in the terminal)</li>
                    <li>Example: <code>http://127.0.0.1:4000/?token=&lt;launch-token&gt;</code></li>
                    <li>You'll be redirected to <code>http://127.0.0.1:4000/</code></li>
                    <li>Then navigate to Settings → Trajectory</li>
                  </ol>
                </div>
              )}
              {state.error.includes('Session controller') && (
                <div style={{ fontSize: '12px', color: 'var(--tx3)', marginTop: '8px' }}>
                  <strong>Session controller is required for trajectory tracking.</strong>
                  <br />Please restart the DSH server with the updated lingoladder profile.
                </div>
              )}
              {!state.error.includes('Authentication') && !state.error.includes('Session controller') && (
                <div style={{ fontSize: '12px', color: 'var(--tx3)', marginTop: '8px' }}>
                  Trajectory tracking requires the DSH connection plugin.
                  <br />Use a full DSH profile with <code>@deepseek-ai/dsh-client-connection</code>.
                </div>
              )}
            </div>
          ) : (
            'Connect to a DSH server to view session trajectories'
          )}
        </div>
      )}
    </div>
  )
}
