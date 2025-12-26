import { loadStripe, type Stripe, type StripeElements, type StripeCardElement, type StripeAddressElement, type StripePaymentElement } from '@stripe/stripe-js'

export const useStripe = () => {
  const config = useRuntimeConfig()
  const stripe = ref<Stripe | null>(null)
  const elements = ref<StripeElements | null>(null)
  const cardElement = ref<StripeCardElement | null>(null)
  const paymentElement = ref<StripePaymentElement | null>(null)
  const addressElement = ref<StripeAddressElement | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const clientSecret = ref<string | null>(null)

  // Initialize Stripe
  const initStripe = async () => {
    if (stripe.value) return stripe.value

    const stripeKey = config.public.stripePublishableKey
    if (!stripeKey) {
      error.value = 'Stripe publishable key not configured'
      return null
    }

    try {
      const stripeInstance = await loadStripe(stripeKey)
      stripe.value = stripeInstance
      return stripeInstance
    } catch (e) {
      error.value = 'Failed to load Stripe'
      console.error('Stripe init error:', e)
      return null
    }
  }

  // Create payment intent via Vendure and get client secret
  const createStripePaymentIntent = async () => {
    const { query } = useVendure()

    try {
      const result = await query<{ createStripePaymentIntent: string }>(`
        mutation {
          createStripePaymentIntent
        }
      `)
      clientSecret.value = result.createStripePaymentIntent
      return result.createStripePaymentIntent
    } catch (e) {
      console.error('Failed to create payment intent:', e)
      throw e
    }
  }

  // Create Payment Element (supports ALL payment methods: cards, Klarna, Link, Apple Pay, etc.)
  const createPaymentElement = async (elementId: string, orderCode: string) => {
    const stripeInstance = await initStripe()
    if (!stripeInstance) return null

    // Get client secret for the payment intent
    const secret = await createStripePaymentIntent()
    if (!secret) {
      error.value = 'Failed to create payment intent'
      return null
    }

    // Create elements with the client secret - this enables Payment Element
    elements.value = stripeInstance.elements({
      clientSecret: secret,
      appearance: {
        theme: 'stripe',
        variables: {
          colorPrimary: '#f97316', // Orange-500
          colorBackground: '#ffffff',
          colorText: '#1c1917',
          colorDanger: '#ef4444',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          borderRadius: '12px',
          spacingUnit: '4px'
        },
        rules: {
          '.Input': {
            border: '1px solid #d6d3d1',
            boxShadow: 'none'
          },
          '.Input:focus': {
            border: '1px solid #f97316',
            boxShadow: '0 0 0 2px rgba(249, 115, 22, 0.2)'
          }
        }
      }
    })

    // Create the Payment Element - automatically shows all enabled payment methods
    paymentElement.value = elements.value.create('payment', {
      layout: {
        type: 'tabs',
        defaultCollapsed: false
      },
      wallets: {
        applePay: 'auto',
        googlePay: 'auto'
      },
      fields: {
        billingDetails: {
          address: {
            country: 'auto'
          }
        }
      }
    })

    const container = document.getElementById(elementId)
    if (container) {
      paymentElement.value.mount(`#${elementId}`)
    }

    return paymentElement.value
  }

  // Create card element (legacy - kept for backward compatibility)
  const createCardElement = async (elementId: string) => {
    const stripeInstance = await initStripe()
    if (!stripeInstance) return null

    elements.value = stripeInstance.elements()
    cardElement.value = elements.value.create('card', {
      style: {
        base: {
          'fontSize': '16px',
          'color': '#1c1917',
          'fontFamily': 'system-ui, -apple-system, sans-serif',
          '::placeholder': {
            color: '#a8a29e'
          }
        },
        invalid: {
          color: '#ef4444'
        }
      }
    })

    const container = document.getElementById(elementId)
    if (container) {
      cardElement.value.mount(`#${elementId}`)
    }

    return cardElement.value
  }

  // Process payment with Payment Element (supports redirects for Klarna, etc.)
  const processPaymentWithElement = async (returnUrl: string) => {
    if (!stripe.value || !elements.value) {
      error.value = 'Stripe not initialized'
      return { success: false, error: 'Stripe not initialized', requiresRedirect: false }
    }

    isLoading.value = true
    error.value = null

    try {
      // Confirm the payment - this handles all payment methods
      const { error: stripeError, paymentIntent } = await stripe.value.confirmPayment({
        elements: elements.value,
        confirmParams: {
          return_url: returnUrl
        },
        redirect: 'if_required' // Only redirect if the payment method requires it (e.g., Klarna, iDEAL)
      })

      if (stripeError) {
        error.value = stripeError.message || 'Payment failed'
        return { success: false, error: stripeError.message, requiresRedirect: false }
      }

      // Check payment intent status
      if (paymentIntent?.status === 'succeeded') {
        return { success: true, paymentIntentId: paymentIntent.id, requiresRedirect: false }
      } else if (paymentIntent?.status === 'requires_action' || paymentIntent?.status === 'processing') {
        // Payment is processing (redirect happened or 3DS required)
        return { success: true, paymentIntentId: paymentIntent.id, requiresRedirect: true, status: paymentIntent.status }
      }

      return { success: false, error: 'Payment not completed', requiresRedirect: false }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Payment failed'
      error.value = errorMessage
      return { success: false, error: errorMessage, requiresRedirect: false }
    } finally {
      isLoading.value = false
    }
  }

  // Process payment (legacy card-only method)
  const processPayment = async () => {
    if (!stripe.value || !cardElement.value) {
      error.value = 'Stripe not initialized'
      return { success: false, error: 'Stripe not initialized' }
    }

    isLoading.value = true
    error.value = null

    try {
      // Get client secret from Vendure
      const secret = await createStripePaymentIntent()

      // Confirm card payment
      const { error: stripeError, paymentIntent } = await stripe.value.confirmCardPayment(secret, {
        payment_method: {
          card: cardElement.value
        }
      })

      if (stripeError) {
        error.value = stripeError.message || 'Payment failed'
        return { success: false, error: stripeError.message }
      }

      if (paymentIntent?.status === 'succeeded') {
        return { success: true, paymentIntentId: paymentIntent.id }
      }

      return { success: false, error: 'Payment not completed' }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Payment failed'
      error.value = errorMessage
      return { success: false, error: errorMessage }
    } finally {
      isLoading.value = false
    }
  }

  // Create address element for autocomplete
  const createAddressElement = async (elementId: string, defaultValues?: { firstName?: string, lastName?: string, address?: { line1?: string, line2?: string, city?: string, postal_code?: string, country?: string } }) => {
    const stripeInstance = await initStripe()
    if (!stripeInstance) return null

    if (!elements.value) {
      elements.value = stripeInstance.elements()
    }

    // Use Google Maps API for autocomplete if key is available
    const googleMapsApiKey = config.public.googleMapsApiKey as string
    const autocompleteConfig = googleMapsApiKey
      ? { mode: 'google_maps_api' as const, apiKey: googleMapsApiKey }
      : { mode: 'automatic' as const }

    // @ts-expect-error - Stripe Address Element type not in @stripe/stripe-js types
    addressElement.value = elements.value.create('address', {
      mode: 'shipping',
      autocomplete: autocompleteConfig,
      defaultValues: defaultValues || {},
      fields: {
        phone: 'never'
      },
      display: {
        name: 'split'
      }
    })

    const container = document.getElementById(elementId)
    if (container) {
      addressElement.value.mount(`#${elementId}`)
    }

    return addressElement.value
  }

  // Get address from Stripe Address Element
  const getAddressFromElement = async () => {
    if (!addressElement.value) return null
    const { complete, value } = await addressElement.value.getValue()
    if (!complete) return null
    return value
  }

  // Cleanup
  const destroyCardElement = () => {
    if (cardElement.value) {
      cardElement.value.destroy()
      cardElement.value = null
    }
  }

  const destroyPaymentElement = () => {
    if (paymentElement.value) {
      paymentElement.value.destroy()
      paymentElement.value = null
    }
    elements.value = null
    clientSecret.value = null
  }

  const destroyAddressElement = () => {
    if (addressElement.value) {
      addressElement.value.destroy()
      addressElement.value = null
    }
  }

  return {
    stripe,
    elements,
    cardElement,
    paymentElement,
    addressElement,
    isLoading,
    error,
    clientSecret,
    initStripe,
    createCardElement,
    createPaymentElement,
    createAddressElement,
    getAddressFromElement,
    processPayment,
    processPaymentWithElement,
    destroyCardElement,
    destroyPaymentElement,
    destroyAddressElement
  }
}
