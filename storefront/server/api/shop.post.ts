// Server route for Vendure Shop API that properly forwards auth token headers
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event)

  // Get authorization header if present
  const authHeader = getHeader(event, 'authorization')

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (authHeader) {
    headers['Authorization'] = authHeader
  }

  // Forward request to Vendure
  const vendureUrl = config.vendureApiUrl || 'http://localhost:3000'
  const response = await fetch(`${vendureUrl}/shop-api`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })

  // Get the auth token from Vendure response
  const vendureToken = response.headers.get('vendure-auth-token')

  // Set response headers to forward the token to the client
  if (vendureToken) {
    setHeader(event, 'vendure-auth-token', vendureToken)
    // Also set as access-control-expose-headers to make it accessible
    setHeader(event, 'access-control-expose-headers', 'vendure-auth-token')
  }

  const data = await response.json()
  return data
})
