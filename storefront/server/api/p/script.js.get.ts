// Proxy Plausible analytics script through our domain to avoid adblockers
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const plausibleHost = config.plausibleApiHost || 'http://localhost:8001'

  try {
    const response = await fetch(`${plausibleHost}/js/script.js`)

    if (!response.ok) {
      throw new Error(`Failed to fetch Plausible script: ${response.status}`)
    }

    const script = await response.text()

    // Set appropriate headers
    setHeader(event, 'Content-Type', 'application/javascript')
    setHeader(event, 'Cache-Control', 'public, max-age=86400') // Cache for 24 hours

    return script
  } catch (error) {
    console.error('Error proxying Plausible script:', error)
    // Return empty script on error to not break the page
    setHeader(event, 'Content-Type', 'application/javascript')
    return '// Plausible script unavailable'
  }
})
