import { init as initPlausible, track as trackPlausible } from '@plausible-analytics/tracker'
import posthog from 'posthog-js'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const isDev = import.meta.dev

  // Plausible Analytics (self-hosted, proxied through our domain)
  const plausibleDomain = config.public.plausibleDomain as string
  let plausibleEnabled = false

  if (plausibleDomain) {
    // Initialize Plausible with proxied endpoints to bypass adblockers
    initPlausible({
      domain: plausibleDomain,
      // Use our proxy endpoint - looks like first-party request
      endpoint: '/api/event',
      // Track localhost in dev mode
      captureOnLocalhost: isDev,
      // Auto-capture pageviews
      autoCapturePageviews: true,
      // Enable outbound link and file download tracking
      outboundLinks: true,
      fileDownloads: true
    })

    plausibleEnabled = true

    if (isDev) {
      console.log('[Analytics] Plausible initialized for:', plausibleDomain)
    }
  }

  // PostHog Analytics (using official posthog-js package)
  const posthogKey = config.public.posthogKey as string
  const posthogHost = (config.public.posthogHost as string) || 'https://us.i.posthog.com'
  const posthogInitialized = !!(posthogKey && typeof window !== 'undefined')

  if (posthogInitialized) {
    // Always log initialization in production too for debugging
    console.log('[Analytics] PostHog initializing with key:', posthogKey.substring(0, 15) + '...')

    posthog.init(posthogKey, {
      api_host: posthogHost,
      person_profiles: 'identified_only',
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: true,
      debug: true, // Enable debug mode to see what's happening
      session_recording: {
        maskAllInputs: true,
        maskInputOptions: { password: true }
      },
      loaded: (ph) => {
        console.log('[Analytics] PostHog loaded! distinct_id:', ph.get_distinct_id())
      }
    })
  } else {
    console.log('[Analytics] PostHog NOT initialized - key:', posthogKey ? 'present' : 'missing', 'window:', typeof window)
  }

  // Analytics helper API
  return {
    provide: {
      analytics: {
        /**
         * Track a custom event
         */
        trackEvent(
          name: string,
          props?: Record<string, string | number | boolean>,
          revenue?: { currency: string, amount: number }
        ) {
          // Plausible (requires string values for props)
          if (plausibleEnabled) {
            const plausibleProps = props
              ? Object.fromEntries(Object.entries(props).map(([k, v]) => [k, String(v)]))
              : undefined
            trackPlausible(name, { props: plausibleProps, revenue })
          }

          // PostHog (library queues events if not fully loaded yet)
          if (posthogInitialized) {
            posthog.capture(name, { ...props, ...(revenue ? { revenue_amount: revenue.amount, revenue_currency: revenue.currency } : {}) })
          }

          if (isDev) {
            console.log('[Analytics] Event:', name, props, revenue)
          }
        },

        /**
         * Track a page view (automatic with autoCapturePageviews, but can be called manually for SPAs)
         */
        trackPageView(url?: string) {
          if (plausibleEnabled) {
            trackPlausible('pageview', { url })
          }
          if (posthogInitialized) {
            posthog.capture('$pageview', { $current_url: url })
          }
        },

        /**
         * Track a purchase/conversion with revenue
         */
        trackPurchase(
          orderCode: string,
          total: number,
          currency: string,
          items: Array<{ name: string, quantity: number, price: number }>
        ) {
          // Plausible with revenue tracking
          if (plausibleEnabled) {
            trackPlausible('Purchase', {
              props: {
                order_code: orderCode,
                item_count: String(items.length),
                items: items.map(i => i.name).join(', ')
              },
              revenue: { currency, amount: total }
            })
          }

          // PostHog
          if (posthogInitialized) {
            posthog.capture('purchase_completed', {
              order_code: orderCode,
              total,
              currency,
              items,
              item_count: items.length
            })
          }

          if (isDev) {
            console.log('[Analytics] Purchase:', { orderCode, total, currency, items })
          }
        },

        /**
         * Track add to cart
         */
        trackAddToCart(
          productName: string,
          variantName: string,
          price: number,
          quantity: number = 1
        ) {
          this.trackEvent('Add to Cart', {
            product: productName,
            variant: variantName,
            quantity,
            value: price * quantity
          })
        },

        /**
         * Track checkout started
         */
        trackCheckoutStarted(cartTotal: number, itemCount: number) {
          this.trackEvent('Checkout Started', {
            cart_total: cartTotal,
            item_count: itemCount
          })
        },

        /**
         * Track checkout step completion
         */
        trackCheckoutStep(step: 'shipping' | 'payment' | 'review', cartTotal: number) {
          this.trackEvent('Checkout Step', {
            step,
            cart_total: cartTotal
          })
        },

        /**
         * Identify a user (PostHog only - Plausible is privacy-focused)
         */
        identify(userId: string, traits?: Record<string, unknown>) {
          if (posthogInitialized) {
            posthog.identify(userId, traits)
          }
          if (isDev) {
            console.log('[Analytics] Identify:', userId, traits)
          }
        },

        /**
         * Track outbound link click
         */
        trackOutboundLink(url: string) {
          this.trackEvent('Outbound Link', { url })
        },

        /**
         * Track file download
         */
        trackDownload(fileName: string, fileType: string) {
          this.trackEvent('File Download', { file_name: fileName, file_type: fileType })
        },

        /**
         * Track search
         */
        trackSearch(query: string, resultsCount: number) {
          this.trackEvent('Search', { query, results_count: resultsCount })
        },

        /**
         * Track 404 error
         */
        track404(path: string) {
          this.trackEvent('404', { path })
        },

        /**
         * Track form submission
         */
        trackFormSubmit(formName: string, success: boolean = true) {
          this.trackEvent('Form Submit', { form_name: formName, success })
        },

        /**
         * Track CTA click
         */
        trackCTA(ctaName: string, ctaLocation: string) {
          this.trackEvent('CTA Click', { cta_name: ctaName, cta_location: ctaLocation })
        }
      }
    }
  }
})
