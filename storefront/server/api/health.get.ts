import { readFileSync, existsSync } from 'fs'

export default defineEventHandler(() => {
  let vendureLog = 'No log file found'
  try {
    if (existsSync('/tmp/vendure.log')) {
      vendureLog = readFileSync('/tmp/vendure.log', 'utf-8')
    }
  } catch (e) {
    vendureLog = `Error reading log: ${e}`
  }

  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    vendureApiUrl: process.env.VENDURE_API_URL || 'not set',
    vendureLog: vendureLog.slice(-2000) // Last 2000 chars
  }
})
