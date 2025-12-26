import { readFileSync, existsSync, readdirSync } from 'fs'
import { execSync } from 'child_process'

const BUILD_VERSION = '2025-12-26-v5-debug'

export default defineEventHandler(() => {
  let vendureLog = 'No log file found'
  let startShExists = false
  let startShContent = ''
  let vendureDistFiles = ''
  let processes = ''

  try {
    startShExists = existsSync('/app/start.sh')
    if (startShExists) {
      startShContent = readFileSync('/app/start.sh', 'utf-8')
    }
  } catch (e) {
    startShContent = `Error: ${e}`
  }

  try {
    if (existsSync('/app/vendure/dist')) {
      vendureDistFiles = readdirSync('/app/vendure/dist').join(', ')
    }
  } catch (e) {
    vendureDistFiles = `Error: ${e}`
  }

  try {
    if (existsSync('/tmp/vendure.log')) {
      vendureLog = readFileSync('/tmp/vendure.log', 'utf-8')
    }
  } catch (e) {
    vendureLog = `Error reading log: ${e}`
  }

  try {
    processes = execSync('ps aux', { encoding: 'utf-8' })
  } catch (e) {
    processes = `Error: ${e}`
  }

  return {
    status: 'ok',
    buildVersion: BUILD_VERSION,
    timestamp: new Date().toISOString(),
    vendureApiUrl: process.env.VENDURE_API_URL || 'not set',
    startShExists,
    startShContent: startShContent.slice(0, 500),
    vendureDistFiles,
    processes: processes.slice(-1500),
    vendureLog: vendureLog.slice(-1000)
  }
})
