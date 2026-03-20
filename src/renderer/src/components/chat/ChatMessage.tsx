import ReactMarkdown from 'react-markdown'
import type { ChatMessage as ChatMessageType, ToolCallInfo } from '../../stores/chat-store'

function ToolCallBadge({ toolCall }: { toolCall: ToolCallInfo }): JSX.Element {
  const statusColors = {
    pending: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
    executing: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    success: 'text-green-500 bg-green-500/10 border-green-500/20',
    error: 'text-red-500 bg-red-500/10 border-red-500/20'
  }

  const statusIcons = {
    pending: '○',
    executing: '◌',
    success: '✓',
    error: '✗'
  }

  const friendlyName = toolCall.name.replace(/_/g, ' ')

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border mt-1 mr-1 ${statusColors[toolCall.status]}`}
    >
      <span>{statusIcons[toolCall.status]}</span>
      <span>{friendlyName}</span>
      {toolCall.result && toolCall.status !== 'executing' && (
        <span className="opacity-70 max-w-[150px] truncate">— {toolCall.result}</span>
      )}
    </div>
  )
}

export function ChatMessageComponent({ message }: { message: ChatMessageType }): JSX.Element {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        data-chat-role={message.role}
        className={`max-w-[90%] rounded-2xl px-3.5 py-2 ${
          isUser
            ? 'bg-gray-900 text-white'
            : 'text-gray-300'
        }`}
      >
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <>
            {message.content && (
              <div className="prose prose-invert prose-sm max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0 [&_pre]:my-2 [&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-xs">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            )}
            {message.toolCalls && message.toolCalls.length > 0 && (
              <div className="flex flex-wrap mt-1">
                {message.toolCalls.map((tc) => (
                  <ToolCallBadge key={tc.id} toolCall={tc} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
