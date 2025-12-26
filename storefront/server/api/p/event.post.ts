// Proxy Plausible event API through our domain to avoid adblockers
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const plausibleHost = config.plausibleApiHost || 'http://localhost:8000'

  try {
    // Read the raw body
    const body = await readRawBody(event)

    // Forward to Plausible
    const response = await fetch(`${plausibleHost}/api/event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': getHeader(event, 'user-agent') || '',
        'X-Forwarded-For': getHeader(event, 'x-forwarded-for') || getHeader(event, 'cf-connecting-ip') || ''
      },
      body: body || ''
    })

    // Return the response status
    setResponseStatus(event, response.status)

    if (response.ok) {
      return { ok: true }
    }

    const errorText = await response.text()
    console.error('Plausible API error:', errorText)
    return { ok: false }
  } catch (error) {
    console.error('Error proxying Plausible event:', error)
    setResponseStatus(event, 500)
    return { ok: false }
  }
})
