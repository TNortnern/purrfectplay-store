import Stripe from 'stripe'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const stripeSecretKey = config.stripeSecretKey || process.env.STRIPE_SECRET_KEY
  const webhookSecret = config.stripeWebhookSecret || process.env.STRIPE_WEBHOOK_SECRET

  if (!stripeSecretKey) {
    throw createError({
      statusCode: 500,
      message: 'Stripe is not configured'
    })
  }

  const stripe = new Stripe(stripeSecretKey)

  // Get the raw body for signature verification
  const body = await readRawBody(event)
  if (!body) {
    throw createError({
      statusCode: 400,
      message: 'Missing request body'
    })
  }

  // Get Stripe signature header
  const signature = getHeader(event, 'stripe-signature')
  if (!signature) {
    throw createError({
      statusCode: 400,
      message: 'Missing Stripe signature'
    })
  }

  let stripeEvent: Stripe.Event

  // Verify webhook signature
  try {
    if (webhookSecret) {
      stripeEvent = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    } else {
      // In development without webhook secret, parse directly (not recommended for production)
      console.warn('STRIPE_WEBHOOK_SECRET not set - skipping signature verification')
      stripeEvent = JSON.parse(body) as Stripe.Event
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    throw createError({
      statusCode: 400,
      message: 'Webhook signature verification failed'
    })
  }

  // Handle the event
  switch (stripeEvent.type) {
    case 'checkout.session.completed': {
      const session = stripeEvent.data.object as Stripe.Checkout.Session
      await handleCheckoutComplete(session, config)
      break
    }
    default:
      console.log(`Unhandled event type: ${stripeEvent.type}`)
  }

  return { received: true }
})

async function handleCheckoutComplete(
  session: Stripe.Checkout.Session,
  config: ReturnType<typeof useRuntimeConfig>
) {
  console.log('Processing checkout.session.completed:', session.id)

  // Get order info from metadata
  const vendureOrderCode = session.metadata?.vendure_order_code

  if (!vendureOrderCode) {
    console.error('No vendure_order_code in session metadata')
    return
  }

  console.log('Vendure order code:', vendureOrderCode)

  const vendureUrl = config.vendureApiUrl || 'http://localhost:3000'

  try {
    // First, authenticate to Admin API to get a token
    const loginResponse = await fetch(`${vendureUrl}/admin-api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          mutation Login($username: String!, $password: String!) {
            login(username: $username, password: $password) {
              ... on CurrentUser {
                id
                identifier
              }
              ... on InvalidCredentialsError {
                errorCode
                message
              }
            }
          }
        `,
        variables: {
          username: process.env.SUPERADMIN_USERNAME || 'superadmin',
          password: process.env.SUPERADMIN_PASSWORD || 'superadmin123'
        }
      })
    })

    // Get the auth token from the response headers
    const authToken = loginResponse.headers.get('vendure-auth-token')
    const loginData = await loginResponse.json()

    // Debug logging (can be removed in production)
    // console.log('Login response headers:', Array.from(loginResponse.headers.entries()))
    // console.log('Login data:', JSON.stringify(loginData))
    // console.log('Auth token from header:', authToken)

    if (!authToken || loginData.errors) {
      console.error('Admin login failed:', JSON.stringify(loginData))
      return
    }

    // Check if login returned InvalidCredentialsError
    if (loginData.data?.login?.errorCode) {
      console.error('Login error:', loginData.data.login.errorCode, loginData.data.login.message)
      return
    }

    console.log('Admin login successful, token received:', authToken?.substring(0, 20) + '...')

    // Get session cookies from login response for subsequent requests
    // Use getSetCookie() if available, otherwise extract from entries
    const setCookies = (loginResponse.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ||
      Array.from(loginResponse.headers.entries())
        .filter(([key]) => key.toLowerCase() === 'set-cookie')
        .map(([, value]) => value)
    const cookies = setCookies.map(c => c.split(';')[0]).join('; ')
    console.log('Session cookies:', cookies)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'vendure-auth-token': authToken,
      'Cookie': cookies
    }

    // Get order via Admin API
    const orderResponse = await fetch(`${vendureUrl}/admin-api`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query: `
          query GetOrderByCode($code: String!) {
            orders(options: { filter: { code: { eq: $code } } }) {
              items {
                id
                code
                state
                totalWithTax
              }
            }
          }
        `,
        variables: { code: vendureOrderCode }
      })
    })

    const orderData = await orderResponse.json()
    console.log('Admin API order response:', JSON.stringify(orderData))

    const order = orderData?.data?.orders?.items?.[0]

    if (!order) {
      console.error('Order not found via Admin API:', vendureOrderCode)
      return
    }

    console.log('Found order:', order.code, 'State:', order.state)

    // Use Admin API to transition and settle the order
    if (order.state === 'AddingItems' || order.state === 'ArrangingPayment') {
      // First, set customer details from Stripe session if order is in AddingItems
      if (order.state === 'AddingItems') {
        const customerDetails = session.customer_details
        // Stripe types don't include all fields - use type assertion for shipping_details
        const shippingDetails = (session as unknown as { collected_information?: { shipping_details?: { name?: string; address?: { line1?: string; line2?: string; city?: string; postal_code?: string; country?: string } } }; shipping_details?: { name?: string; address?: { line1?: string; line2?: string; city?: string; postal_code?: string; country?: string } } }).collected_information?.shipping_details || (session as unknown as { shipping_details?: { name?: string; address?: { line1?: string; line2?: string; city?: string; postal_code?: string; country?: string } } }).shipping_details

        // Create or set customer on the order
        const setCustomerResponse = await fetch(`${vendureUrl}/admin-api`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            query: `
              mutation SetCustomerForDraftOrder($orderId: ID!, $input: CreateCustomerInput!) {
                setCustomerForDraftOrder(orderId: $orderId, input: $input) {
                  ... on Order {
                    id
                    customer { id emailAddress }
                  }
                  ... on EmailAddressConflictError {
                    errorCode
                    message
                  }
                }
              }
            `,
            variables: {
              orderId: order.id,
              input: {
                emailAddress: customerDetails?.email || 'guest@example.com',
                firstName: customerDetails?.name?.split(' ')[0] || 'Guest',
                lastName: customerDetails?.name?.split(' ').slice(1).join(' ') || 'Customer'
              }
            }
          })
        })

        const customerData = await setCustomerResponse.json()
        console.log('Set customer result:', JSON.stringify(customerData))

        // Set shipping address on the order (using Draft Order mutations)
        if (shippingDetails?.address) {
          const setShippingResponse = await fetch(`${vendureUrl}/admin-api`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              query: `
                mutation SetDraftOrderShipping($orderId: ID!, $input: CreateAddressInput!) {
                  setDraftOrderShippingAddress(orderId: $orderId, input: $input) {
                    ... on Order {
                      id
                      shippingAddress { fullName streetLine1 city postalCode country }
                    }
                  }
                }
              `,
              variables: {
                orderId: order.id,
                input: {
                  fullName: shippingDetails.name || customerDetails?.name || 'Guest Customer',
                  streetLine1: shippingDetails.address.line1 || '',
                  streetLine2: shippingDetails.address.line2 || '',
                  city: shippingDetails.address.city || '',
                  postalCode: shippingDetails.address.postal_code || '',
                  countryCode: shippingDetails.address.country || 'US'
                }
              }
            })
          })

          const shippingData = await setShippingResponse.json()
          console.log('Set shipping result:', JSON.stringify(shippingData))
        }

        // First, query eligible shipping methods for this order
        const eligibleMethodsResponse = await fetch(`${vendureUrl}/admin-api`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            query: `
              query GetEligibleShippingMethods($orderId: ID!) {
                eligibleShippingMethodsForDraftOrder(orderId: $orderId) {
                  id
                  name
                  price
                  priceWithTax
                }
              }
            `,
            variables: { orderId: order.id }
          })
        })

        const eligibleData = await eligibleMethodsResponse.json()
        console.log('Eligible shipping methods:', JSON.stringify(eligibleData))

        const eligibleMethods = eligibleData.data?.eligibleShippingMethodsForDraftOrder || []

        if (eligibleMethods.length > 0) {
          // Use the first available shipping method
          const shippingMethodId = eligibleMethods[0].id
          console.log('Using shipping method:', shippingMethodId, eligibleMethods[0].name)

          const setShippingMethodResponse = await fetch(`${vendureUrl}/admin-api`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              query: `
                mutation SetDraftOrderShippingMethod($orderId: ID!, $shippingMethodId: ID!) {
                  setDraftOrderShippingMethod(orderId: $orderId, shippingMethodId: $shippingMethodId) {
                    ... on Order {
                      id
                      state
                      shipping
                      shippingLines { shippingMethod { name } }
                    }
                    ... on OrderModificationError {
                      errorCode
                      message
                    }
                    ... on IneligibleShippingMethodError {
                      errorCode
                      message
                    }
                  }
                }
              `,
              variables: {
                orderId: order.id,
                shippingMethodId
              }
            })
          })

          const shippingMethodData = await setShippingMethodResponse.json()
          console.log('Set shipping method result:', JSON.stringify(shippingMethodData))
        } else {
          console.log('No eligible shipping methods found for this order')
        }

        // Now transition to ArrangingPayment
        const transitionResponse = await fetch(`${vendureUrl}/admin-api`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            query: `
              mutation TransitionOrder($id: ID!) {
                transitionOrderToState(id: $id, state: "ArrangingPayment") {
                  ... on Order {
                    id
                    state
                  }
                  ... on OrderStateTransitionError {
                    errorCode
                    message
                    transitionError
                  }
                }
              }
            `,
            variables: { id: order.id }
          })
        })

        const transitionData = await transitionResponse.json()
        console.log('Transition to ArrangingPayment:', JSON.stringify(transitionData))
      }

      // Add payment via Admin API - settlePayment
      const addPaymentResponse = await fetch(`${vendureUrl}/admin-api`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: `
            mutation AddManualPayment($input: ManualPaymentInput!) {
              addManualPaymentToOrder(input: $input) {
                ... on Order {
                  id
                  state
                  code
                  payments {
                    id
                    state
                    method
                  }
                }
                ... on ManualPaymentStateError {
                  errorCode
                  message
                }
              }
            }
          `,
          variables: {
            input: {
              orderId: order.id,
              method: 'stripe-checkout',
              transactionId: session.payment_intent as string || session.id,
              metadata: {
                stripeSessionId: session.id,
                stripePaymentIntent: session.payment_intent,
                amount: session.amount_total
              }
            }
          }
        })
      })

      const paymentData = await addPaymentResponse.json()
      console.log('Manual payment added:', JSON.stringify(paymentData))

      // Check if payment was added successfully
      if (paymentData.data?.addManualPaymentToOrder?.state === 'PaymentSettled') {
        console.log('Order successfully processed and payment settled:', order.code)
      } else if (paymentData.data?.addManualPaymentToOrder?.errorCode) {
        console.error('Payment error:', paymentData.data.addManualPaymentToOrder.message)
      }
    }
  } catch (error) {
    console.error('Error processing webhook:', error)
    throw error
  }
}
