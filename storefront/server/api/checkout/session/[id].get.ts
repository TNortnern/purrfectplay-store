import Stripe from 'stripe'

export default defineEventHandler(async (event) => {
  const sessionId = getRouterParam(event, 'id')

  if (!sessionId) {
    throw createError({
      statusCode: 400,
      message: 'Session ID is required'
    })
  }

  const config = useRuntimeConfig()
  const stripeSecretKey = config.stripeSecretKey || process.env.STRIPE_SECRET_KEY

  if (!stripeSecretKey) {
    throw createError({
      statusCode: 500,
      message: 'Stripe is not configured'
    })
  }

  const stripe = new Stripe(stripeSecretKey)

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items', 'customer_details', 'payment_intent']
    })

    // Type for shipping details (not fully typed in Stripe SDK)
    type ShippingDetails = {
      name?: string
      address?: {
        line1?: string
        line2?: string
        city?: string
        state?: string
        postal_code?: string
        country?: string
      }
    }

    // Extract shipping info with type assertion (Stripe types incomplete)
    const sessionWithShipping = session as unknown as {
      collected_information?: { shipping_details?: ShippingDetails }
      shipping_details?: ShippingDetails
    }
    const shippingInfo = sessionWithShipping.collected_information?.shipping_details || sessionWithShipping.shipping_details

    // Only return safe, non-sensitive data
    return {
      id: session.id,
      status: session.status,
      paymentStatus: session.payment_status,
      orderCode: session.metadata?.vendure_order_code || null,
      customer: session.customer_details
        ? {
            email: session.customer_details.email,
            name: session.customer_details.name
          }
        : null,
      shipping: shippingInfo
        ? {
            name: shippingInfo.name,
            address: {
              line1: shippingInfo.address?.line1,
              city: shippingInfo.address?.city,
              state: shippingInfo.address?.state,
              postalCode: shippingInfo.address?.postal_code,
              country: shippingInfo.address?.country
            }
          }
        : null,
      lineItems: session.line_items?.data.map(item => ({
        name: item.description,
        quantity: item.quantity,
        amount: item.amount_total
      })) || [],
      amountTotal: session.amount_total,
      currency: session.currency
    }
  } catch (error) {
    console.error('Error retrieving Stripe session:', error)
    throw createError({
      statusCode: 404,
      message: 'Session not found or expired'
    })
  }
})
