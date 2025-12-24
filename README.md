# Luxury Request Router

AI-powered routing system for luxury concierge requests using **GraphQL + Prisma + GPT-4 + Production Evals**.

## Demo

Please see demo here - https://drive.google.com/file/d/1iMW1iweGzhQTYlLkpzSYs4frbeOW-x-S/view?usp=sharing

## Quick Start

```bash
# 1. Install dependencies
yarn install

# 2. Set up environment
cp .env.example .env
# Add your OPENAI_API_KEY to .env

# 3. Database is already set up! (SQLite in api/db/dev.db)

# 4. Start API server
npm run dev:api

# API runs on http://localhost:8911/graphql
```

## Testing the API

Open http://localhost:8911/graphql in your browser for GraphQL Playground.

**Try this mutation:**
```graphql
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
}
```

**Then test conversation context:**
```graphql
mutation {
  routeRequest(input: {
    conversationId: "YOUR_ID_FROM_ABOVE"
    userInput: "For 12 guests"
  }) {
    routingDecision {
      intent
      riskLevel
      reasoning
      suggested Response
    }
  }
}
```

## Run Production Evals

After you've made some requests via the GraphQL API:

```bash
npm run eval
```

This queries **real routing decisions from the database** and validates:
- Intent classification (IDEATION | INFO | EXECUTION)
- Risk assessment (LOW | MEDIUM | HIGH)
- Confidence ranges (0-1)
- HIGH risk → HUMAN escalation rule
- Reasoning presence

**No hardcoded fixtures** - evals run on actual production data!
