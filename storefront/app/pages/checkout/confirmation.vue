<script setup lang="ts">
definePageMeta({
  layout: 'checkout'
})

const route = useRoute()
const orderCode = computed(() => route.query.order as string || '')
</script>

<template>
  <div class="min-h-screen bg-stone-50 flex items-center justify-center p-4">
    <div class="max-w-md w-full">
      <div class="bg-white rounded-2xl border border-stone-200 p-8 text-center">
        <!-- Success Icon -->
        <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <UIcon
            name="i-lucide-check"
            class="w-8 h-8 text-green-600"
          />
        </div>

        <h1 class="text-2xl font-bold text-stone-900 mb-2">
          Order Confirmed!
        </h1>
        <p class="text-stone-500 mb-6">
          Thank you for your purchase. Your order has been received and is being processed.
        </p>

        <div
          v-if="orderCode"
          class="bg-stone-50 rounded-lg p-4 mb-6"
        >
          <p class="text-sm text-stone-500 mb-1">
            Order Number
          </p>
          <p class="font-mono text-lg font-semibold text-stone-900">
            {{ orderCode }}
          </p>
        </div>

        <p class="text-sm text-stone-500 mb-6">
          A confirmation email has been sent to your email address with order details and tracking information.
        </p>

        <NuxtLink to="/">
          <UButton
            color="primary"
            size="lg"
            block
          >
            Continue Shopping
            <UIcon
              name="i-lucide-arrow-right"
              class="w-4 h-4 ml-2"
            />
          </UButton>
        </NuxtLink>

        <p class="text-xs text-stone-400 mt-6">
          Questions about your order? Contact us at support@purrfectplay.com
        </p>
      </div>
    </div>
  </div>
</template>
