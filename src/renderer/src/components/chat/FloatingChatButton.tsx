import { useChatStore } from '../../stores/chat-store'
import { useUIStore } from '../../stores/ui-store'

export function FloatingChatButton(): JSX.Element {
  const { isSidebarOpen, toggleSidebar } = useChatStore()
  const { isPresenting } = useUIStore()

  if (isPresenting) return <></>

  return (
    <button
      onClick={toggleSidebar}
      className={`fixed bottom-12 right-4 z-50 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 ${
        isSidebarOpen
          ? 'bg-gray-700 text-white scale-90'
          : 'bg-indigo-600 hover:bg-indigo-500 text-white hover:scale-105'
      }`}
      title="Chat with Lecta AI (Cmd+/)"
    >
      {isSidebarOpen ? (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
        </svg>
      )}
    </button>
  )
}
