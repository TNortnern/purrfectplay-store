import Stripe from 'stripe'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { items, successUrl, cancelUrl, vendureOrderCode, vendureToken } = body

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'Cart items are required'
    })
  }

  // Get Stripe secret key from runtime config
  const config = useRuntimeConfig()
  const stripeSecretKey = config.stripeSecretKey || process.env.STRIPE_SECRET_KEY
  if (!stripeSecretKey) {
    throw createError({
      statusCode: 500,
      message: 'Stripe is not configured'
    })
  }

  const stripe = new Stripe(stripeSecretKey)

  // Convert cart items to Stripe line items
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = items.map((item: {
    name: string
    price: number
    quantity: number
    image?: string
  }) => ({
    price_data: {
      currency: 'usd',
      product_data: {
        name: item.name,
        images: item.image ? [item.image] : []
      },
      unit_amount: item.price // Already in cents
    },
    quantity: item.quantity
  }))

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: successUrl || `${getRequestURL(event).origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${getRequestURL(event).origin}/`,
      shipping_address_collection: {
        allowed_countries: ['US', 'CA', 'GB', 'AU']
      },
      billing_address_collection: 'required',
      metadata: {
        vendure_order_code: vendureOrderCode || '',
        vendure_token: vendureToken || ''
      }
    })

    return {
      sessionId: session.id,
      url: session.url
    }
  } catch (error) {
    console.error('Stripe session creation error:', error)
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to create checkout session'
    })
  }
})
