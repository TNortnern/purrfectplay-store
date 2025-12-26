export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()

  // Only load in production or if explicitly enabled
  const isDev = process.env.NODE_ENV === 'development'

  // Plausible Analytics (self-hosted, proxied through our domain to avoid adblockers)
  const plausibleDomain = config.public.plausibleDomain as string
  if (plausibleDomain) {
    const script = document.createElement('script')
    script.defer = true
    script.dataset.domain = plausibleDomain

    // Use proxied endpoints to avoid adblockers
    // Script is served from /api/p/script.js
    // Events are sent to /api/p/event
    const plausibleHost = config.public.plausibleHost as string
    script.src = plausibleHost ? `${plausibleHost}/api/p/script.js` : '/api/p/script.js'
    script.dataset.api = plausibleHost ? `${plausibleHost}/api/p/event` : '/api/p/event'

    document.head.appendChild(script)

    // Add plausible function for custom events
    window.plausible = window.plausible || function(...args: unknown[]) {
      (window.plausible.q = window.plausible.q || []).push(args)
    }

    if (isDev) {
      console.log('[Analytics] Plausible loaded for domain:', plausibleDomain, 'via proxy')
    }
  }

  // PostHog Analytics
  const posthogKey = config.public.posthogKey as string
  const posthogHost = (config.public.posthogHost as string) || 'https://us.i.posthog.com'

  if (posthogKey) {
    // Load PostHog script
    const loadPostHog = () => {
      // @ts-expect-error - PostHog global
      !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

      // Initialize PostHog
      window.posthog.init(posthogKey, {
        api_host: posthogHost,
        person_profiles: 'identified_only',
        capture_pageview: true,
        capture_pageleave: true,
        autocapture: true,
        // Session recording
        session_recording: {
          maskAllInputs: true,
          maskInputOptions: {
            password: true
          }
        }
      })

      if (isDev) {
        console.log('[Analytics] PostHog loaded with key:', posthogKey.substring(0, 10) + '...')
      }
    }

    // Load immediately
    loadPostHog()
  }

  // Provide analytics helper
  return {
    provide: {
      analytics: {
        // Track custom event for Plausible
        trackEvent(name: string, props?: Record<string, unknown>, revenue?: { currency: string; amount: number }) {
          if (window.plausible) {
            window.plausible(name, { props, revenue })
          }
          if (window.posthog) {
            window.posthog.capture(name, props)
          }
        },

        // Track page view
        trackPageView(url?: string) {
          if (window.posthog) {
            window.posthog.capture('$pageview', { $current_url: url })
          }
        },

        // Identify user
        identify(userId: string, traits?: Record<string, unknown>) {
          if (window.posthog) {
            window.posthog.identify(userId, traits)
          }
        },

        // Track purchase (ecommerce)
        trackPurchase(orderCode: string, total: number, currency: string, items: Array<{ name: string; quantity: number; price: number }>) {
          // Plausible with revenue
          if (window.plausible) {
            window.plausible('Purchase', {
              props: { orderCode, itemCount: items.length },
              revenue: { currency, amount: total }
            })
          }

          // PostHog
          if (window.posthog) {
            window.posthog.capture('purchase_completed', {
              order_code: orderCode,
              total,
              currency,
              items
            })
          }
        }
      }
    }
  }
})

// Type declarations
declare global {
  interface Window {
    plausible: {
      (...args: unknown[]): void
      q?: unknown[][]
    }
    posthog: {
      init: (key: string, config: Record<string, unknown>) => void
      capture: (event: string, properties?: Record<string, unknown>) => void
      identify: (userId: string, properties?: Record<string, unknown>) => void
    }
  }
}
