import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { ChatPanel } from '@/components/ai/chat-panel'
import { listConversations } from '@/services/ai.service'
import { isAIConfigured } from '@/lib/ai'

export const metadata = { title: 'AI Chat | Kawman ExAct' }

export default async function AIChatPage() {
  const conversations = await listConversations()

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader title="AI Chat" subtitle="Ask questions about your leads, deals, and pipeline" />
        <ChatPanel initialConversations={conversations} aiConfigured={isAIConfigured()} />
      </div>
    </MainLayout>
  )
}
