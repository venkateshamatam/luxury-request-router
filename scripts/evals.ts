import 'dotenv/config'
import { db } from '../api/src/lib/db.js'

interface EvalResult {
  pass: boolean
  message: string
}

const validIntents = ['IDEATION', 'INFO', 'EXECUTION']
const validRiskLevels = ['LOW', 'MEDIUM', 'HIGH']
const validNextActions = ['RESPOND', 'ASK_FOLLOWUP', 'TOOL', 'HUMAN']

async function evalIntentClassification(): Promise<EvalResult[]> {
  const decisions = await db.routingDecision.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50
  })

  return decisions.map(d => ({
    pass: validIntents.includes(d.intent),
    message: `Intent for "${d.userInput.slice(0, 40)}..." → ${d.intent}`
  }))
}

async function evalRiskAssessment(): Promise<EvalResult[]> {
  const decisions = await db.routingDecision.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50
  })

  return decisions.map(d => ({
    pass: validRiskLevels.includes(d.riskLevel),
    message: `Risk for "${d.userInput.slice(0, 40)}..." → ${d.riskLevel}`
  }))
}

async function evalConfidenceRange(): Promise<EvalResult[]> {
  const decisions = await db.routingDecision.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50
  })

  return decisions.map(d => ({
    pass: d.confidence >= 0 && d.confidence <= 1,
    message: `Confidence for "${d.userInput.slice(0, 40)}..." → ${(d.confidence * 100).toFixed(0)}%`
  }))
}

async function evalHighRiskEscalation(): Promise<EvalResult[]> {
  const highRiskDecisions = await db.routingDecision.findMany({
    where: { riskLevel: 'HIGH' },
    orderBy: { createdAt: 'desc' },
    take: 20
  })

  return highRiskDecisions.map(d => ({
    pass: d.nextAction === 'HUMAN',
    message: `HIGH risk "${d.userInput.slice(0, 40)}..." → ${d.nextAction} ${d.nextAction === 'HUMAN' ? '✓' : '✗'}`
  }))
}

async function evalReasoningPresent(): Promise<EvalResult[]> {
  const decisions = await db.routingDecision.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50
  })

  return decisions.map(d => ({
    pass: d.reasoning && d.reasoning.length > 10,
    message: `Reasoning for "${d.userInput.slice(0, 40)}..." → ${d.reasoning ? '✓' : '✗'}`
  }))
}

async function main() {
  console.log('\n' + '='.repeat(70))
  console.log('🧪 Production Evals on Real DB Data')
  console.log('='.repeat(70) + '\n')

  const totalDecisions = await db.routingDecision.count()
  const totalConversations = await db.conversation.count()

  console.log(`📊 Database Stats:`)
  console.log(`   ${totalConversations} conversations`)
  console.log(`   ${totalDecisions} routing decisions\n`)

  if (totalDecisions === 0) {
    console.log('⚠️  No routing decisions in DB yet.')
    console.log('   Use the GraphQL API at http://localhost:8911/graphql to create conversations.\n')
    return
  }

  const evals = [
    { name: 'Intent Classification', fn: evalIntentClassification },
    { name: 'Risk Assessment', fn: evalRiskAssessment },
    { name: 'Confidence Range', fn: evalConfidenceRange },
    { name: 'HIGH Risk → HUMAN', fn: evalHighRiskEscalation },
    { name: 'Reasoning Present', fn: evalReasoningPresent },
  ]

  let totalTests = 0
  let totalPassed = 0

  for (const evalDef of evals) {
    console.log(`\n${evalDef.name}`)
    console.log('─'.repeat(70))

    const results = await evalDef.fn()

    for (const result of results) {
      totalTests++
      if (result.pass) {
        totalPassed++
        console.log(`  ✅ ${result.message}`)
      } else {
        console.log(`  ❌ ${result.message}`)
      }
    }
  }

  console.log('\n' + '='.repeat(70))
  console.log(`📈 Results: ${totalPassed}/${totalTests} passed (${((totalPassed / totalTests) * 100).toFixed(1)}%)`)
  console.log('='.repeat(70) + '\n')

  if (totalPassed === totalTests) {
    console.log('🎉 All evals passed!\n')
  } else {
    console.log('⚠️  Some evals failed.\n')
  }

  await db.$disconnect()
}

main().catch(console.error)
