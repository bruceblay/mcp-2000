import { useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { X, Send, RotateCcw } from 'lucide-react'
import { useChatPanelResize } from '../hooks/use-chat-panel-resize'

type Message = { role: 'user' | 'assistant'; content: string }

type ChatPanelProps = {
  isOpen: boolean
  onClose: () => void
}

export function ChatPanel({ isOpen, onClose }: ChatPanelProps) {
  const { chatWidth, isResizing, startResizing } = useChatPanelResize()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [mounted, setMounted] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (isOpen) {
      setMounted(true)
      setIsClosing(false)
    } else if (mounted) {
      setIsClosing(true)
    }
  }, [isOpen, mounted])

  useEffect(() => {
    if (isOpen && inputRef.current && !matchMedia('(pointer: coarse)').matches) {
      inputRef.current.focus()
    }
  }, [isOpen])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || isStreaming) return

    const userMessage: Message = { role: 'user', content: text }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setIsStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const err = await res.json()
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.error || 'Something went wrong.'}` }])
        setIsStreaming(false)
        return
      }

      const reader = res.body?.getReader()
      if (!reader) {
        setIsStreaming(false)
        return
      }

      const decoder = new TextDecoder()
      let assistantContent = ''
      setMessages(prev => [...prev, { role: 'assistant', content: '' }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value, { stream: true })
        const lines = text.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') break

          try {
            const chunk = JSON.parse(data) as string
            assistantContent += chunk
            setMessages(prev => {
              const updated = [...prev]
              updated[updated.length - 1] = { role: 'assistant', content: assistantContent }
              return updated
            })
          } catch {
            // skip malformed chunks
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Connection lost. Try again.' }])
      }
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }, [input, isStreaming, messages])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  if (!isOpen && !isClosing) return null

  const handleAnimationEnd = () => {
    if (isClosing) {
      setIsClosing(false)
      setMounted(false)
    }
  }

  return (
    <div
      className={`chat-panel${isResizing ? ' is-resizing' : ''}${isClosing ? ' is-closing' : ''}`}
      style={{ width: chatWidth }}
      onAnimationEnd={handleAnimationEnd}
    >
      <div className="chat-panel-resize-handle" onMouseDown={startResizing} />
      <div className="chat-panel-header">
        <span className="chat-panel-title">MCP-2000 Assistant</span>
        <div className="chat-panel-header-actions">
          <button
            type="button"
            className="chat-panel-icon-button"
            onClick={() => { setMessages([]); setInput('') }}
            disabled={messages.length === 0}
            aria-label="Reset chat"
            title="New chat"
          >
            <RotateCcw size={13} />
          </button>
          <button type="button" className="chat-panel-icon-button" onClick={onClose} aria-label="Close chat" title="Close">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="chat-panel-messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="chat-panel-empty">
            <p>Ask me anything about MCP-2000.</p>
            <p className="chat-panel-empty-hint">How do I generate a kit? What effects are available? How does the sequencer work?</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg chat-msg-${msg.role}`}>
            {msg.role === 'user' ? (
              <div className="chat-msg-bubble">
                {msg.content}
              </div>
            ) : (
              <div className="chat-msg-assistant-content">
                {msg.content ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                ) : (
                  isStreaming && i === messages.length - 1 ? '\u2588' : ''
                )}
              </div>
            )}
          </div>
        ))}
        {isStreaming && messages.length > 0 && messages[messages.length - 1].content && (
          <div className="chat-cursor">{'\u2588'}</div>
        )}
      </div>

      <div className="chat-panel-input-area">
        <textarea
          ref={inputRef}
          className="chat-panel-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question..."
          rows={1}
          disabled={isStreaming}
        />
        <button
          type="button"
          className="chat-panel-send"
          onClick={sendMessage}
          disabled={isStreaming || !input.trim()}
          aria-label="Send message"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}
