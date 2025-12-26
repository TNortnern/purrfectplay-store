<script setup lang="ts">
definePageMeta({
  layout: 'checkout'
})

interface SessionData {
  id: string
  status: string
  paymentStatus: string
  orderCode: string | null
  customer: {
    email: string
    name: string
  } | null
  shipping: {
    name: string
    address: {
      line1: string
      city: string
      state: string
      postalCode: string
      country: string
    }
  } | null
  lineItems: Array<{
    name: string
    quantity: number
    amount: number
  }>
  amountTotal: number
  currency: string
}

const route = useRoute()
const sessionId = computed(() => route.query.session_id as string || '')
const { clearStorage } = useCart()

// Fetch session details
const { data: session, status: fetchStatus } = await useFetch<SessionData>(`/api/checkout/session/${sessionId.value}`, {
  key: `session-${sessionId.value}`,
  immediate: !!sessionId.value
})

const { $analytics } = useNuxtApp()

// Clear cart on successful checkout
onMounted(() => {
  clearStorage()
  if (import.meta.client) {
    localStorage.removeItem('vendure-token')

    // Track purchase event for analytics
    if (session.value && $analytics) {
      $analytics.trackPurchase(
        session.value.orderCode || 'unknown',
        (session.value.amountTotal || 0) / 100,
        session.value.currency?.toUpperCase() || 'USD',
        session.value.lineItems.map(item => ({
          name: item.name,
          quantity: item.quantity || 1,
          price: item.amount / 100
        }))
      )
    }
  }
})

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: session.value?.currency?.toUpperCase() || 'USD'
  }).format(amount / 100)
}

const isLoading = computed(() => fetchStatus.value === 'pending')
const hasError = computed(() => fetchStatus.value === 'error' || !session.value)
</script>

<template>
  <div class="min-h-screen bg-gradient-to-b from-teal-50 via-white to-stone-50">
    <!-- Animated confetti background -->
    <div class="absolute inset-0 overflow-hidden pointer-events-none">
      <div class="confetti-container">
        <div v-for="i in 50" :key="i" class="confetti" :style="{
          left: `${Math.random() * 100}%`,
          animationDelay: `${Math.random() * 3}s`,
          animationDuration: `${3 + Math.random() * 2}s`
        }" />
      </div>
    </div>

    <div class="relative z-10 flex items-center justify-center min-h-screen p-4 py-12">
      <!-- Loading State -->
      <div v-if="isLoading" class="text-center">
        <div class="w-16 h-16 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin mx-auto mb-4" />
        <p class="text-stone-600">Loading your order details...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="hasError" class="max-w-md w-full">
        <div class="bg-white rounded-3xl shadow-xl border border-stone-100 p-8 text-center">
          <div class="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <UIcon name="i-lucide-alert-circle" class="w-8 h-8 text-amber-600" />
          </div>
          <h1 class="text-2xl font-bold text-stone-900 mb-2">Order Processing</h1>
          <p class="text-stone-500 mb-6">
            We're still processing your order. Please check your email for confirmation.
          </p>
          <NuxtLink to="/">
            <UButton color="primary" size="lg" block>
              Return Home
            </UButton>
          </NuxtLink>
        </div>
      </div>

      <!-- Success State -->
      <div v-else class="max-w-lg w-full">
        <div class="bg-white rounded-3xl shadow-2xl border border-stone-100 overflow-hidden">
          <!-- Header with celebration -->
          <div class="bg-gradient-to-r from-teal-600 to-teal-500 px-8 py-10 text-center relative overflow-hidden">
            <!-- Decorative circles -->
            <div class="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full" />
            <div class="absolute -bottom-20 -left-10 w-60 h-60 bg-white/5 rounded-full" />

            <div class="relative">
              <div class="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg animate-bounce-slow">
                <UIcon name="i-lucide-check" class="w-10 h-10 text-teal-600" />
              </div>
              <h1 class="text-3xl font-bold text-white mb-2">Thank You!</h1>
              <p class="text-teal-100 text-lg">Your order has been confirmed</p>
            </div>
          </div>

          <!-- Order Details -->
          <div class="p-8">
            <!-- Order Number -->
            <div class="bg-stone-50 rounded-2xl p-5 mb-6 text-center border border-stone-100">
              <p class="text-sm text-stone-500 uppercase tracking-wide mb-1">Order Number</p>
              <p class="text-2xl font-bold text-stone-900 font-mono tracking-wider">
                {{ session?.orderCode || 'Processing...' }}
              </p>
            </div>

            <!-- Customer & Shipping Info -->
            <div v-if="session?.customer || session?.shipping" class="grid gap-4 mb-6">
              <div v-if="session?.customer" class="flex items-start gap-4 p-4 bg-stone-50 rounded-xl">
                <div class="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <UIcon name="i-lucide-mail" class="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <p class="text-sm text-stone-500">Confirmation sent to</p>
                  <p class="font-medium text-stone-900">{{ session.customer.email }}</p>
                </div>
              </div>

              <div v-if="session?.shipping" class="flex items-start gap-4 p-4 bg-stone-50 rounded-xl">
                <div class="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <UIcon name="i-lucide-truck" class="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <p class="text-sm text-stone-500">Shipping to</p>
                  <p class="font-medium text-stone-900">{{ session.shipping.name }}</p>
                  <p class="text-sm text-stone-600">
                    {{ session.shipping.address.line1 }}<br>
                    {{ session.shipping.address.city }}, {{ session.shipping.address.state }} {{ session.shipping.address.postalCode }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Order Summary -->
            <div v-if="session?.lineItems?.length" class="border-t border-stone-200 pt-6 mb-6">
              <h3 class="text-sm font-semibold text-stone-900 uppercase tracking-wide mb-4">Order Summary</h3>
              <div class="space-y-3">
                <div
                  v-for="(item, index) in session.lineItems"
                  :key="index"
                  class="flex justify-between items-center py-2"
                >
                  <div class="flex items-center gap-3">
                    <span class="w-6 h-6 bg-teal-100 text-teal-700 rounded-full flex items-center justify-center text-xs font-medium">
                      {{ item.quantity }}
                    </span>
                    <span class="text-stone-700">{{ item.name }}</span>
                  </div>
                  <span class="font-medium text-stone-900">{{ formatCurrency(item.amount) }}</span>
                </div>
              </div>
              <div class="border-t border-dashed border-stone-200 mt-4 pt-4 flex justify-between items-center">
                <span class="font-semibold text-stone-900">Total</span>
                <span class="text-xl font-bold text-teal-600">{{ formatCurrency(session.amountTotal || 0) }}</span>
              </div>
            </div>

            <!-- Next Steps -->
            <div class="bg-gradient-to-r from-stone-50 to-teal-50 rounded-2xl p-5 mb-6">
              <h3 class="text-sm font-semibold text-stone-900 uppercase tracking-wide mb-3">What's Next?</h3>
              <div class="space-y-3">
                <div class="flex items-center gap-3">
                  <div class="w-6 h-6 bg-teal-600 rounded-full flex items-center justify-center">
                    <UIcon name="i-lucide-check" class="w-3 h-3 text-white" />
                  </div>
                  <span class="text-sm text-stone-600">Order confirmation email sent</span>
                </div>
                <div class="flex items-center gap-3">
                  <div class="w-6 h-6 bg-stone-300 rounded-full flex items-center justify-center">
                    <span class="text-xs font-medium text-white">2</span>
                  </div>
                  <span class="text-sm text-stone-600">Order being prepared for shipment</span>
                </div>
                <div class="flex items-center gap-3">
                  <div class="w-6 h-6 bg-stone-300 rounded-full flex items-center justify-center">
                    <span class="text-xs font-medium text-white">3</span>
                  </div>
                  <span class="text-sm text-stone-600">Tracking number sent via email</span>
                </div>
              </div>
            </div>

            <!-- CTA -->
            <NuxtLink to="/">
              <UButton color="primary" size="xl" block class="py-4">
                Continue Shopping
                <UIcon name="i-lucide-arrow-right" class="w-5 h-5 ml-2" />
              </UButton>
            </NuxtLink>

            <!-- Support -->
            <p class="text-center text-sm text-stone-500 mt-6">
              Questions?
              <a href="mailto:support@catiohaven.com" class="text-teal-600 hover:text-teal-700 font-medium">
                Contact Support
              </a>
            </p>
          </div>
        </div>

        <!-- Trust Badge -->
        <div class="flex items-center justify-center gap-6 mt-8 text-stone-400">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-shield-check" class="w-5 h-5" />
            <span class="text-sm">Secure Payment</span>
          </div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-truck" class="w-5 h-5" />
            <span class="text-sm">Fast Shipping</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes confetti-fall {
  0% {
    transform: translateY(-100vh) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translateY(100vh) rotate(720deg);
    opacity: 0;
  }
}

@keyframes bounce-slow {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

.animate-bounce-slow {
  animation: bounce-slow 2s ease-in-out infinite;
}

.confetti {
  position: absolute;
  width: 10px;
  height: 10px;
  background: linear-gradient(135deg, #14b8a6, #0d9488, #2dd4bf, #f59e0b, #ec4899);
  background-size: 400% 400%;
  animation: confetti-fall 5s linear forwards;
  opacity: 0.8;
}

.confetti:nth-child(odd) {
  border-radius: 50%;
}

.confetti:nth-child(3n) {
  width: 8px;
  height: 8px;
  background: #f59e0b;
}

.confetti:nth-child(5n) {
  width: 6px;
  height: 12px;
  background: #ec4899;
}

.confetti:nth-child(7n) {
  width: 12px;
  height: 6px;
  background: #14b8a6;
}
</style>
