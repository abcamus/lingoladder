import { useEffect, useRef } from 'react'
import type { ChatMessage } from '../types'
import { PlacementResult } from './PlacementResult'

interface ChatTranscriptProps {
  messages: ChatMessage[]
  /** Shown when no message has arrived yet; defaults to the assistant greeting. */
  emptyHint?: string | undefined
}

/** The scrollable message flow shared by the floating chat and the assessment view; result messages render as cards. */
export function ChatTranscript({ messages, emptyHint }: ChatTranscriptProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="ai-chat-messages">
      {messages.length === 0 && (
        <div className="ai-msg">
          <div className="ai-msg-icon">💡</div>
          <div className="ai-msg-text">
            {emptyHint ?? '你好！我是你的 AI 学习助手。你可以问我任何英语学习相关的问题，或者让我帮你找学习资料。'}
          </div>
        </div>
      )}
      {messages.map(msg => (
        msg.placementResult !== undefined ? (
          <PlacementResult key={msg.id} profile={msg.placementResult} compact />
        ) : (
          <div key={msg.id} className={`ai-msg ${msg.role}`}>
            <div className="ai-msg-icon">{msg.role === 'user' ? '👤' : '🤖'}</div>
            <div className={`ai-msg-text ${msg.streaming ? 'streaming' : ''}`}>
              {msg.text}
            </div>
          </div>
        )
      ))}
      <div ref={messagesEndRef} />
    </div>
  )
}
