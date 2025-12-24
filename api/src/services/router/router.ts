import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import type { CoreMessage } from 'ai'
import { db } from '../../lib/db.js'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load system prompt
const SYSTEM_PROMPT = readFileSync(
  join(__dirname, '../../prompts/router-system-prompt.md'),
  'utf-8'
) + `\n\n## Conversation Context

When analyzing requests in a multi-turn conversation:
- Consider all previous exchanges in the conversation history
- If the current message provides additional details, treat it as clarification
- Maintain context about what the member originally asked for
- Update your routing decision based on the combined information from all turns`

const model = process.env.OPENAI_MODEL || 'gpt-4o'
const temperature = 0.3

interface RouteRequestInput {
  conversationId?: string
  userInput: string
}

export const routeRequest = async ({ input }: { input: RouteRequestInput }) => {
  const { conversationId, userInput } = input

  // Get or create conversation
  let conversation
  if (conversationId) {
    conversation = await db.conversation.findUnique({
      where: { id: conversationId },
      include: { messages: { orderBy: { createdAt: 'asc' } } }
    })
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`)
    }
  } else {
    conversation = await db.conversation.create({
      data: {},
      include: { messages: true }
    })
  }

  // Build conversation history for GPT-4
  const messages: CoreMessage[] = conversation.messages.map(msg => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content
  }))

  // Add current user message
  const userPrompt = messages.length > 0
    ? `Member follow-up: "${userInput}"\n\nConsider the conversation history above. If this is additional information for a previous request, factor that context into your routing decision. Analyze and return the routing decision as JSON.`
    : `Member request: "${userInput}"\n\nPlease analyze this request and return the routing decision as JSON.`

  messages.push({
    role: 'user',
    content: userPrompt
  })

  // Call GPT-4 via Vercel AI SDK
  const { text } = await generateText({
    model: openai(model),
    system: SYSTEM_PROMPT,
    messages,
    temperature,
    maxTokens: 1000,
  })

  // Parse JSON response
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('No valid JSON in GPT-4 response')
  }

  const output = JSON.parse(jsonMatch[0])

  // Validate output structure
  if (!output.intent || !output.risk_level || !output.next_action || !output.reasoning) {
    throw new Error('Invalid response structure from GPT-4')
  }

  // Save user message to DB
  await db.message.create({
    data: {
      conversationId: conversation.id,
      role: 'user',
      content: userInput
    }
  })

  // Save routing decision to DB
  const routingDecision = await db.routingDecision.create({
    data: {
      conversationId: conversation.id,
      userInput,
      intent: output.intent,
      riskLevel: output.risk_level,
      confidence: output.confidence || 0.0,
      nextAction: output.next_action,
      reasoning: output.reasoning,
      suggestedResponse: output.suggested_response || null,
      toolCalls: output.tool_calls ? JSON.stringify(output.tool_calls) : null,
      category: output.category || null,
      model,
      temperature
    }
  })

  // Save assistant response to conversation history
  const assistantContent = `Routing analysis: Intent=${output.intent}, Risk=${output.risk_level}, Action=${output.next_action}. ${output.reasoning}${output.suggested_response ? ' Response: ' + output.suggested_response : ''}`

  await db.message.create({
    data: {
      conversationId: conversation.id,
      role: 'assistant',
      content: assistantContent
    }
  })

  // Return response
  return {
    routingDecision: {
      ...routingDecision,
      toolCalls: routingDecision.toolCalls ? JSON.parse(routingDecision.toolCalls) : null
    },
    conversation: await db.conversation.findUnique({
      where: { id: conversation.id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        routingDecisions: { orderBy: { createdAt: 'asc' } }
      }
    })
  }
}

export const conversation = async ({ id }: { id: string }) => {
  return db.conversation.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      routingDecisions: { orderBy: { createdAt: 'asc' } }
    }
  })
}

export const conversations = async () => {
  return db.conversation.findMany({
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      routingDecisions: { orderBy: { createdAt: 'asc' } }
    },
    orderBy: { createdAt: 'desc' }
  })
}

export const recentRoutingDecisions = async ({ limit = 15 }: { limit?: number }) => {
  const decisions = await db.routingDecision.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit
  })

  return decisions.map(d => ({
    ...d,
    toolCalls: d.toolCalls ? JSON.parse(d.toolCalls) : null
  }))
}
