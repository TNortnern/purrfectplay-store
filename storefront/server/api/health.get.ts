export default defineEventHandler(() => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    vendureApiUrl: process.env.VENDURE_API_URL || 'not set'
  }
})
