import { useState } from 'react'
import type { SSEStatus } from '../types'

interface ChatInputProps {
  status: SSEStatus
  onSend: (text: string) => void | Promise<void>
  placeholder?: string
}

/** The message input row shared by the floating chat and the assessment view. */
export function ChatInput({ status, onSend, placeholder = '输入消息...' }: ChatInputProps) {
  const [input, setInput] = useState('')

  const handleSubmit = () => {
    if (input.trim() === '' || status !== 'connected') return
    void onSend(input.trim())
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="ai-chat-input">
      <input
        type="text"
        value={input}
        onChange={(e) => { setInput(e.target.value) }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={status !== 'connected'}
      />
      <button onClick={handleSubmit} disabled={status !== 'connected' || input.trim() === ''}>
        发送
      </button>
    </div>
  )
}
