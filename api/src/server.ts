import 'dotenv/config'
import { createYoga } from 'graphql-yoga'
import { createServer } from 'http'
import { makeExecutableSchema } from '@graphql-tools/schema'
import * as router from './services/router/router.js'

const typeDefs = `#graphql
  scalar JSON
  scalar DateTime

  type Conversation {
    id: String!
    createdAt: DateTime!
    messages: [Message!]!
    routingDecisions: [RoutingDecision!]!
  }

  type Message {
    id: String!
    role: String!
    content: String!
    createdAt: DateTime!
  }

  type RoutingDecision {
    id: String!
    userInput: String!
    intent: String!
    riskLevel: String!
    confidence: Float!
    nextAction: String!
    reasoning: String!
    suggestedResponse: String
    toolCalls: JSON
    createdAt: DateTime!
  }

  type RouteResponse {
    routingDecision: RoutingDecision!
    conversation: Conversation!
  }

  input RouteRequestInput {
    conversationId: String
    userInput: String!
  }

  type Query {
    conversations: [Conversation!]!
    recentRoutingDecisions(limit: Int): [RoutingDecision!]!
  }

  type Mutation {
    routeRequest(input: RouteRequestInput!): RouteResponse!
  }
`

const resolvers = {
  Query: {
    conversations: router.conversations,
    recentRoutingDecisions: (_, args) => router.recentRoutingDecisions(args),
  },
  Mutation: {
    routeRequest: (_, args) => router.routeRequest(args),
  },
}

const schema = makeExecutableSchema({ typeDefs, resolvers })

const yoga = createYoga({
  schema,
  cors: {
    origin: '*',
    credentials: true,
  },
  graphiql: {
    title: 'Luxury Request Router API',
    defaultQuery: `# Welcome to the Luxury Request Router API
# Try this mutation to test routing:

mutation {
  routeRequest(input: {
    userInput: "I need a villa in Santorini this weekend"
  }) {
    routingDecision {
      intent
      riskLevel
      confidence
      nextAction
      reasoning
      suggestedResponse
    }
    conversation {
      id
    }
  }
}`,
  },
})

const server = createServer(yoga)

const PORT = 8911

server.listen(PORT, () => {
  console.log(`✅ GraphQL API running on http://localhost:${PORT}/graphql`)
})
