import { init as initPlausible, track as trackPlausible } from '@plausible-analytics/tracker'

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

  // PostHog Analytics (optional)
  const posthogKey = config.public.posthogKey as string
  const posthogHost = (config.public.posthogHost as string) || 'https://us.i.posthog.com'

  if (posthogKey) {
    const loadPostHog = () => {
      // @ts-expect-error - PostHog global
      !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

      window.posthog.init(posthogKey, {
        api_host: posthogHost,
        person_profiles: 'identified_only',
        capture_pageview: true,
        capture_pageleave: true,
        autocapture: true,
        session_recording: {
          maskAllInputs: true,
          maskInputOptions: { password: true }
        }
      })

      if (isDev) {
        console.log('[Analytics] PostHog initialized')
      }
    }

    loadPostHog()
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
          revenue?: { currency: string; amount: number }
        ) {
          // Plausible
          if (plausibleEnabled) {
            trackPlausible(name, { props, revenue })
          }

          // PostHog
          if (window.posthog) {
            window.posthog.capture(name, { ...props, ...(revenue ? { revenue_amount: revenue.amount, revenue_currency: revenue.currency } : {}) })
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
          if (window.posthog) {
            window.posthog.capture('$pageview', { $current_url: url })
          }
        },

        /**
         * Track a purchase/conversion with revenue
         */
        trackPurchase(
          orderCode: string,
          total: number,
          currency: string,
          items: Array<{ name: string; quantity: number; price: number }>
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
          if (window.posthog) {
            window.posthog.capture('purchase_completed', {
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
          if (window.posthog) {
            window.posthog.identify(userId, traits)
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

// Type declarations
declare global {
  interface Window {
    posthog: {
      init: (key: string, config: Record<string, unknown>) => void
      capture: (event: string, properties?: Record<string, unknown>) => void
      identify: (userId: string, properties?: Record<string, unknown>) => void
    }
  }
}
