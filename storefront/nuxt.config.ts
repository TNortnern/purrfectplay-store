// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  // Runtime config for API endpoints
  runtimeConfig: {
    vendureApiUrl: process.env.VENDURE_API_URL || 'http://localhost:3000',
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    // Plausible API host for server-side proxy (internal docker network or localhost)
    plausibleApiHost: process.env.PLAUSIBLE_API_HOST || 'http://localhost:8000',
    public: {
      vendureShopApi: '/shop-api',
      vendureAdminApi: '/admin-api',
      stripePublishableKey: process.env.NUXT_PUBLIC_STRIPE_KEY || '',
      googleMapsApiKey: process.env.NUXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
      // Analytics
      // Plausible domain to track (e.g., 'catiohaven.com')
      plausibleDomain: process.env.NUXT_PUBLIC_PLAUSIBLE_DOMAIN || '',
      // Optional: external host for Plausible proxy (empty = use relative paths)
      plausibleHost: process.env.NUXT_PUBLIC_PLAUSIBLE_HOST || '',
      // PostHog
      posthogKey: process.env.NUXT_PUBLIC_POSTHOG_KEY || '',
      posthogHost: process.env.NUXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'
    }
  },

  routeRules: {
    '/': { prerender: true }
  },

  // Development server port
  devServer: {
    port: 3015
  },

  compatibilityDate: '2025-01-15',

  // Nitro server configuration with proxy to Vendure
  nitro: {
    devProxy: {
      '/shop-api': {
        target: 'http://localhost:3000/shop-api',
        changeOrigin: true
      },
      '/admin-api': {
        target: 'http://localhost:3000/admin-api',
        changeOrigin: true
      },
      '/dashboard': {
        target: 'http://localhost:3000/dashboard',
        changeOrigin: true,
        ws: true
      },
      '/assets': {
        target: 'http://localhost:3000/assets',
        changeOrigin: true
      },
      '/mailbox': {
        target: 'http://localhost:3000/mailbox',
        changeOrigin: true
      },
      '/graphiql': {
        target: 'http://localhost:3000/graphiql',
        changeOrigin: true
      },
      '/payments': {
        target: 'http://localhost:3000/payments',
        changeOrigin: true
      }
    },
    routeRules: {
      '/shop-api/**': { proxy: 'http://localhost:3000/shop-api/**' },
      '/admin-api/**': { proxy: 'http://localhost:3000/admin-api/**' },
      '/dashboard': { proxy: 'http://localhost:3000/dashboard' },
      '/dashboard/**': { proxy: 'http://localhost:3000/dashboard/**' },
      '/assets/**': { proxy: 'http://localhost:3000/assets/**' },
      '/mailbox/**': { proxy: 'http://localhost:3000/mailbox/**' },
      '/graphiql/**': { proxy: 'http://localhost:3000/graphiql/**' },
      '/payments/**': { proxy: 'http://localhost:3000/payments/**' }
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
