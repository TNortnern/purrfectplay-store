<script setup lang="ts">
definePageMeta({
  layout: 'checkout'
})

const router = useRouter()
const { cartItems, cartTotal, cartQuantity, clearStorage } = useCart()
const { setCustomerForOrder, setShippingAddress, getShippingMethods, setShippingMethod, transitionToArrangingPayment, getActiveOrder } = useVendure()
const { initStripe, createPaymentElement, createAddressElement, getAddressFromElement, processPaymentWithElement, destroyPaymentElement, destroyAddressElement, isLoading: isStripeLoading, error: stripeError } = useStripe()

const step = ref(1)
const isProcessing = ref(false)
const checkoutError = ref('')
const orderCode = ref('')

// Customer form
const customerForm = ref({
  firstName: '',
  lastName: '',
  email: ''
})

// Shipping
const shippingMethods = ref<Array<{ id: string; name: string; priceWithTax: number }>>([])
const selectedShippingMethod = ref('')

// Redirect if cart is empty
onMounted(async () => {
  if (cartItems.value.length === 0) {
    // Check if there's an active order
    const result = await getActiveOrder()
    if (!result.activeOrder || result.activeOrder.lines.length === 0) {
      router.push('/')
    }
  }

  // Initialize address element for step 2
  await initStripe()
})

// Step 1: Save customer info
const saveCustomer = async () => {
  if (!customerForm.value.firstName || !customerForm.value.lastName || !customerForm.value.email) {
    checkoutError.value = 'Please fill in all fields'
    return
  }

  isProcessing.value = true
  checkoutError.value = ''

  try {
    const result = await setCustomerForOrder({
      firstName: customerForm.value.firstName,
      lastName: customerForm.value.lastName,
      emailAddress: customerForm.value.email
    })

    if ('errorCode' in result.setCustomerForOrder) {
      throw new Error(result.setCustomerForOrder.message)
    }

    step.value = 2

    // Create address element after step transition
    nextTick(() => {
      createAddressElement('address-element', {
        firstName: customerForm.value.firstName,
        lastName: customerForm.value.lastName
      })
    })
  } catch (error) {
    checkoutError.value = error instanceof Error ? error.message : 'Failed to save customer info'
  } finally {
    isProcessing.value = false
  }
}

// Step 2: Save shipping address and method
const saveShipping = async () => {
  isProcessing.value = true
  checkoutError.value = ''

  try {
    // Get address from Stripe element
    const stripeAddress = await getAddressFromElement()
    if (!stripeAddress) {
      throw new Error('Please complete the shipping address')
    }

    // Set shipping address in Vendure
    const result = await setShippingAddress({
      fullName: stripeAddress.name || `${customerForm.value.firstName} ${customerForm.value.lastName}`,
      streetLine1: stripeAddress.address.line1,
      streetLine2: stripeAddress.address.line2 || '',
      city: stripeAddress.address.city,
      postalCode: stripeAddress.address.postal_code,
      countryCode: stripeAddress.address.country
    })

    if ('errorCode' in result.setOrderShippingAddress) {
      throw new Error(result.setOrderShippingAddress.message)
    }

    // Destroy address element
    destroyAddressElement()

    // Get and set shipping method
    const methods = await getShippingMethods()
    shippingMethods.value = methods.eligibleShippingMethods

    if (shippingMethods.value.length > 0) {
      selectedShippingMethod.value = shippingMethods.value[0].id
      const shippingResult = await setShippingMethod(selectedShippingMethod.value)
      if ('errorCode' in shippingResult.setOrderShippingMethod) {
        throw new Error(shippingResult.setOrderShippingMethod.message)
      }
    }

    // Transition to arranging payment
    const transitionResult = await transitionToArrangingPayment()
    if ('errorCode' in transitionResult.transitionOrderToState) {
      throw new Error(transitionResult.transitionOrderToState.message)
    }

    if ('code' in transitionResult.transitionOrderToState) {
      orderCode.value = transitionResult.transitionOrderToState.code
    }

    step.value = 3

    // Create payment element after step transition
    nextTick(async () => {
      await createPaymentElement('payment-element', orderCode.value)
    })
  } catch (error) {
    checkoutError.value = error instanceof Error ? error.message : 'Failed to save shipping info'
  } finally {
    isProcessing.value = false
  }
}

// Step 3: Process payment
const processPayment = async () => {
  isProcessing.value = true
  checkoutError.value = ''

  try {
    const returnUrl = `${window.location.origin}/checkout/confirmation?order=${orderCode.value}`
    const paymentResult = await processPaymentWithElement(returnUrl)

    if (!paymentResult.success) {
      throw new Error(paymentResult.error || 'Payment failed')
    }

    if (paymentResult.requiresRedirect) {
      return // Stripe handles redirect
    }

    // Poll for order completion
    let attempts = 0
    const maxAttempts = 10
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      const orderResult = await getActiveOrder()

      if (!orderResult.activeOrder) {
        // Order completed
        clearStorage()
        destroyPaymentElement()
        router.push(`/checkout/confirmation?order=${orderCode.value}`)
        return
      }
      attempts++
    }

    // If we get here, order should be complete
    clearStorage()
    destroyPaymentElement()
    router.push(`/checkout/confirmation?order=${orderCode.value}`)
  } catch (error) {
    checkoutError.value = error instanceof Error ? error.message : 'Payment failed'
  } finally {
    isProcessing.value = false
  }
}

const formatPrice = (cents: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}
</script>

<template>
  <div class="min-h-screen bg-stone-50">
    <!-- Header -->
    <header class="bg-white border-b border-stone-200">
      <div class="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
        <NuxtLink to="/" class="flex items-center gap-2 text-stone-800 hover:text-orange-500 transition-colors">
          <UIcon name="i-lucide-arrow-left" class="w-5 h-5" />
          <span class="font-medium">Back to Shop</span>
        </NuxtLink>
        <h1 class="text-xl font-semibold text-stone-900">Checkout</h1>
        <div class="w-24" />
      </div>
    </header>

    <main class="max-w-4xl mx-auto px-4 py-8">
      <div class="grid md:grid-cols-5 gap-8">
        <!-- Checkout Form -->
        <div class="md:col-span-3">
          <!-- Progress Steps -->
          <div class="flex items-center gap-2 mb-8">
            <div class="flex items-center gap-2">
              <div :class="[
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                step >= 1 ? 'bg-orange-500 text-white' : 'bg-stone-200 text-stone-500'
              ]">
                1
              </div>
              <span class="text-sm font-medium" :class="step >= 1 ? 'text-stone-900' : 'text-stone-400'">Contact</span>
            </div>
            <div class="flex-1 h-0.5" :class="step >= 2 ? 'bg-orange-500' : 'bg-stone-200'" />
            <div class="flex items-center gap-2">
              <div :class="[
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                step >= 2 ? 'bg-orange-500 text-white' : 'bg-stone-200 text-stone-500'
              ]">
                2
              </div>
              <span class="text-sm font-medium" :class="step >= 2 ? 'text-stone-900' : 'text-stone-400'">Shipping</span>
            </div>
            <div class="flex-1 h-0.5" :class="step >= 3 ? 'bg-orange-500' : 'bg-stone-200'" />
            <div class="flex items-center gap-2">
              <div :class="[
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                step >= 3 ? 'bg-orange-500 text-white' : 'bg-stone-200 text-stone-500'
              ]">
                3
              </div>
              <span class="text-sm font-medium" :class="step >= 3 ? 'text-stone-900' : 'text-stone-400'">Payment</span>
            </div>
          </div>

          <!-- Error Alert -->
          <UAlert
            v-if="checkoutError"
            color="error"
            variant="soft"
            :title="checkoutError"
            class="mb-6"
            :close-button="{ icon: 'i-lucide-x', color: 'error', variant: 'link' }"
            @close="checkoutError = ''"
          />

          <!-- Step 1: Contact -->
          <div v-if="step === 1" class="bg-white rounded-xl border border-stone-200 p-6">
            <h2 class="text-lg font-semibold text-stone-900 mb-4">Contact Information</h2>
            <p class="text-sm text-stone-500 mb-6">We'll use this to send your order confirmation.</p>

            <form @submit.prevent="saveCustomer" class="space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <UFormField label="First Name" required>
                  <UInput
                    v-model="customerForm.firstName"
                    placeholder="John"
                    size="lg"
                    :disabled="isProcessing"
                  />
                </UFormField>
                <UFormField label="Last Name" required>
                  <UInput
                    v-model="customerForm.lastName"
                    placeholder="Doe"
                    size="lg"
                    :disabled="isProcessing"
                  />
                </UFormField>
              </div>

              <UFormField label="Email Address" required>
                <UInput
                  v-model="customerForm.email"
                  type="email"
                  placeholder="john@example.com"
                  size="lg"
                  :disabled="isProcessing"
                />
              </UFormField>

              <UButton
                type="submit"
                color="primary"
                size="lg"
                block
                :loading="isProcessing"
              >
                Continue to Shipping
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 ml-2" />
              </UButton>
            </form>
          </div>

          <!-- Step 2: Shipping -->
          <div v-if="step === 2" class="bg-white rounded-xl border border-stone-200 p-6">
            <h2 class="text-lg font-semibold text-stone-900 mb-4">Shipping Address</h2>
            <p class="text-sm text-stone-500 mb-6">Where should we send your order?</p>

            <div id="address-element" class="min-h-[200px] mb-6" />

            <div class="flex gap-4">
              <UButton
                color="neutral"
                variant="outline"
                size="lg"
                @click="step = 1; destroyAddressElement()"
                :disabled="isProcessing"
              >
                Back
              </UButton>
              <UButton
                color="primary"
                size="lg"
                class="flex-1"
                :loading="isProcessing"
                @click="saveShipping"
              >
                Continue to Payment
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 ml-2" />
              </UButton>
            </div>
          </div>

          <!-- Step 3: Payment -->
          <div v-if="step === 3" class="bg-white rounded-xl border border-stone-200 p-6">
            <h2 class="text-lg font-semibold text-stone-900 mb-4">Payment</h2>
            <p class="text-sm text-stone-500 mb-6">Choose your preferred payment method.</p>

            <div id="payment-element" class="min-h-[200px] mb-6" />

            <div class="flex gap-4">
              <UButton
                color="neutral"
                variant="outline"
                size="lg"
                @click="step = 2; destroyPaymentElement(); nextTick(() => createAddressElement('address-element'))"
                :disabled="isProcessing"
              >
                Back
              </UButton>
              <UButton
                color="primary"
                size="lg"
                class="flex-1"
                :loading="isProcessing || isStripeLoading"
                @click="processPayment"
              >
                <UIcon name="i-lucide-lock" class="w-4 h-4 mr-2" />
                Pay {{ formatPrice(cartTotal) }}
              </UButton>
            </div>

            <p class="text-xs text-stone-400 text-center mt-4 flex items-center justify-center gap-1">
              <UIcon name="i-lucide-shield-check" class="w-4 h-4" />
              Your payment is secure and encrypted by Stripe
            </p>
          </div>
        </div>

        <!-- Order Summary -->
        <div class="md:col-span-2">
          <div class="bg-white rounded-xl border border-stone-200 p-6 sticky top-8">
            <h3 class="font-semibold text-stone-900 mb-4">Order Summary</h3>

            <!-- Items -->
            <div class="space-y-4 mb-6">
              <div
                v-for="item in cartItems"
                :key="item.id"
                class="flex gap-3"
              >
                <div class="w-16 h-16 bg-stone-100 rounded-lg overflow-hidden flex-shrink-0">
                  <img
                    :src="item.image || '/images/product/product-full.webp'"
                    :alt="item.name"
                    class="w-full h-full object-cover"
                  >
                </div>
                <div class="flex-1 min-w-0">
                  <h4 class="text-sm font-medium text-stone-900 truncate">{{ item.name }}</h4>
                  <p class="text-xs text-stone-500">Qty: {{ item.quantity }}</p>
                  <p class="text-sm font-medium text-stone-900 mt-1">{{ formatPrice(item.lineTotal) }}</p>
                </div>
              </div>
            </div>

            <USeparator class="my-4" />

            <!-- Totals -->
            <div class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-stone-500">Subtotal</span>
                <span class="text-stone-900">{{ formatPrice(cartTotal) }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-stone-500">Shipping</span>
                <span class="text-green-600 font-medium">FREE</span>
              </div>
            </div>

            <USeparator class="my-4" />

            <div class="flex justify-between text-lg font-semibold">
              <span class="text-stone-900">Total</span>
              <span class="text-stone-900">{{ formatPrice(cartTotal) }}</span>
            </div>

            <!-- Trust Badges -->
            <div class="mt-6 pt-6 border-t border-stone-100">
              <div class="flex items-center justify-center gap-4 text-xs text-stone-400">
                <span class="flex items-center gap-1">
                  <UIcon name="i-lucide-truck" class="w-4 h-4" />
                  Free Shipping
                </span>
                <span class="flex items-center gap-1">
                  <UIcon name="i-lucide-refresh-cw" class="w-4 h-4" />
                  30-Day Returns
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
