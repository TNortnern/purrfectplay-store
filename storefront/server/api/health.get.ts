import { readFileSync, existsSync } from 'fs'

const BUILD_VERSION = '2025-12-26-v3'

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
    buildVersion: BUILD_VERSION,
    timestamp: new Date().toISOString(),
    vendureApiUrl: process.env.VENDURE_API_URL || 'not set',
    vendureLog: vendureLog.slice(-2000) // Last 2000 chars
  }
})
