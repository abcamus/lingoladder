import { useEffect, useState } from 'react'
import type { ChatMessage, SSEStatus } from '../types'
import { ChatInput } from './ChatInput'
import { ChatTranscript } from './ChatTranscript'

interface AIChatProps {
  messages: ChatMessage[]
  status: SSEStatus
  /** Whether a placement assessment is streaming; shows the entry banner into the full-screen view. */
  placementActive: boolean
  onSend: (text: string) => void | Promise<void>
  onEnterAssessment: () => void
}

export function AIChat({ messages, status, placementActive, onSend, onEnterAssessment }: AIChatProps) {
  const [open, setOpen] = useState(false)

  // Programmatic sends (assessment start, material analysis, practice) arrive while the
  // panel is collapsed; open it whenever a user message lands.
  useEffect(() => {
    const last = messages[messages.length - 1]
    if (last !== undefined && last.role === 'user') setOpen(true)
  }, [messages])

  return (
    <div className="ai-float">
      <button className="ai-btn" onClick={() => { setOpen(!open) }}>🤖</button>
      <div className={`ai-chat ${open ? 'open' : 'closed'}`}>
        <div className="ai-chat-header">
          <div className="ai-chat-avatar">🤖</div>
          <div className="ai-chat-title">AI 学习助手</div>
          <div className="ai-chat-status">{statusLabel(status)}</div>
        </div>

        {placementActive && (
          <button className="ai-assess-banner" onClick={onEnterAssessment}>
            <span>📐 定级测评进行中</span>
            <span className="ai-assess-banner-link">进入测评视图 →</span>
          </button>
        )}

        <ChatTranscript messages={messages} />
        <ChatInput status={status} onSend={onSend} />

        <div className="ai-suggestions">
          <span className="ai-sug" onClick={() => { void onSend('帮我找一些 B1 级别的听力材料') }}>找资料</span>
          <span className="ai-sug" onClick={() => { void onSend('制定今日学习计划') }}>今日计划</span>
          <span className="ai-sug" onClick={() => { void onSend('复习今天学的单词') }}>词汇复习</span>
          <span className="ai-sug" onClick={() => { void onSend('模拟一段日常对话') }}>模拟对话</span>
        </div>
      </div>
    </div>
  )
}

function statusLabel(status: SSEStatus): string {
  return status === 'connected' ? '在线' : status === 'connecting' ? '连接中...' : '离线'
}
