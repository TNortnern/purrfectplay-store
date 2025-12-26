<script setup lang="ts">
const { syncCart, addToCart, updateQuantity, removeFromCart, cartItems, cartTotal, cartQuantity, isCartOpen, closeCart, isLoading, clearStorage } = useCart()
const { setCustomerForOrder, setShippingAddress, getShippingMethods, setShippingMethod, transitionToArrangingPayment, resetOrderToAddingItems, getActiveOrder } = useVendure()
const { createPaymentElement, createAddressElement, getAddressFromElement, processPaymentWithElement, destroyPaymentElement, destroyAddressElement, isLoading: isStripeLoading, error: stripeError } = useStripe()

// Product data - matches Vendure catalog
// In production: product ID 1, variant ID 2
const product = {
  id: '1',
  variantId: '2',
  name: 'PurrfectPlay™ Pop-Up Cat Tent & Tunnel Set',
  tagline: 'Safe outdoor adventures for your indoor cat',
  price: 1799, // cents - sale price
  originalPrice: 2999, // cents - regular price
  rating: 5,
  reviewCount: 847,
  images: [
    { src: '/images/product/product-full.webp', alt: 'Full setup with carry bag' },
    { src: '/images/product/gem1.jpg', alt: 'Cat enjoying the tunnel' },
    { src: '/images/product/dimensions.jpg', alt: 'Product dimensions' },
    { src: '/images/product/cat-topview.jpeg', alt: 'Cat relaxing inside' },
    { src: '/images/product/detail-connection.jpg', alt: 'Tent and tunnel connection' },
    { src: '/images/product/carry-bag.jpg', alt: 'Compact carry bag' }
  ]
}

const selectedImage = ref(0)
const quantity = ref(1)
const isCheckoutOpen = ref(false)
const checkoutStep = ref(1)
const isProcessing = ref(false)
const checkoutError = ref('')
const orderCode = ref('')

// Checkout form state
const customerInfo = ref({
  firstName: '',
  lastName: '',
  emailAddress: ''
})

const shippingInfo = ref({
  fullName: '',
  streetLine1: '',
  streetLine2: '',
  city: '',
  postalCode: '',
  countryCode: 'US'
})

const shippingMethods = ref<Array<{ id: string; name: string; priceWithTax: number }>>([])
const selectedShippingMethod = ref('')

// Sync cart on mount
onMounted(() => {
  syncCart()
})

const handleAddToCart = async () => {
  // Pass product info for optimistic UI update
  const result = await addToCart(product.variantId, quantity.value, {
    name: product.name,
    price: product.price,
    image: product.images[0]?.src
  })
  if (result.success) {
    quantity.value = 1
  }
}

const formatPrice = (cents: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(cents / 100)
}

const proceedToCheckout = async () => {
  if (cartItems.value.length === 0) return

  isProcessing.value = true
  checkoutError.value = ''

  try {
    // Get the active Vendure order to include in Stripe metadata
    const orderResult = await getActiveOrder()
    const vendureOrderCode = orderResult.activeOrder?.code || ''

    // Get vendure token from localStorage
    const vendureToken = import.meta.client ? localStorage.getItem('vendure-token') || '' : ''

    // Create Stripe Checkout Session
    const response = await $fetch('/api/checkout/create-session', {
      method: 'POST',
      body: {
        items: cartItems.value.map(item => ({
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          image: item.image ? `${window.location.origin}${item.image}` : undefined
        })),
        successUrl: `${window.location.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: window.location.origin,
        vendureOrderCode,
        vendureToken
      }
    })

    // Redirect to Stripe Checkout
    if (response.url) {
      window.location.href = response.url
    }
  } catch (error) {
    console.error('Checkout error:', error)
    checkoutError.value = error instanceof Error ? error.message : 'Failed to start checkout'
    isProcessing.value = false
  }
}

// Close checkout and reset order state if needed
const closeCheckout = async () => {
  // If we're at step 3 (payment), the order is in ArrangingPayment state
  // We need to reset it back to AddingItems so the cart can be modified
  if (checkoutStep.value >= 3) {
    try {
      await resetOrderToAddingItems()
      destroyPaymentElement()
    } catch (e) {
      console.error('Failed to reset order state:', e)
    }
  }
  isCheckoutOpen.value = false
  checkoutError.value = ''
}

// Go back from payment step to address
const goBackFromPayment = async () => {
  try {
    await resetOrderToAddingItems()
    destroyPaymentElement()
  } catch (e) {
    console.error('Failed to reset order state:', e)
  }
  checkoutStep.value = 2
  // Re-initialize address element
  nextTick(() => {
    createAddressElement('stripe-address-element', {
      firstName: customerInfo.value.firstName,
      lastName: customerInfo.value.lastName
    })
  })
}

const submitCustomerInfo = async () => {
  isProcessing.value = true
  checkoutError.value = ''
  try {
    const result = await setCustomerForOrder(customerInfo.value)
    if ('errorCode' in result.setCustomerForOrder) {
      throw new Error(result.setCustomerForOrder.message)
    }
    checkoutStep.value = 2
    // Initialize Stripe Address Element
    nextTick(() => {
      createAddressElement('stripe-address-element', {
        firstName: customerInfo.value.firstName,
        lastName: customerInfo.value.lastName
      })
    })
  } catch (error) {
    console.error('Failed to set customer:', error)
    checkoutError.value = error instanceof Error ? error.message : 'Failed to save contact information. Please try again.'
  } finally {
    isProcessing.value = false
  }
}

const submitShippingInfo = async () => {
  isProcessing.value = true
  checkoutError.value = ''
  try {
    // Get address from Stripe Address Element
    const stripeAddress = await getAddressFromElement()
    if (!stripeAddress) {
      throw new Error('Please complete your shipping address')
    }

    const result = await setShippingAddress({
      fullName: `${stripeAddress.name || `${customerInfo.value.firstName} ${customerInfo.value.lastName}`}`,
      streetLine1: stripeAddress.address.line1,
      streetLine2: stripeAddress.address.line2 || '',
      city: stripeAddress.address.city,
      postalCode: stripeAddress.address.postal_code,
      countryCode: stripeAddress.address.country
    })
    if ('errorCode' in result.setOrderShippingAddress) {
      throw new Error(result.setOrderShippingAddress.message)
    }

    // Cleanup address element
    destroyAddressElement()

    // Auto-select first shipping method (shipping is free)
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

    // Store order code for confirmation
    if ('code' in transitionResult.transitionOrderToState) {
      orderCode.value = transitionResult.transitionOrderToState.code
    }

    // Go directly to payment step (skip shipping method selection since it's free)
    checkoutStep.value = 3
    nextTick(() => {
      createPaymentElement('stripe-payment-element', orderCode.value)
    })
  } catch (error) {
    console.error('Failed to set shipping:', error)
    checkoutError.value = error instanceof Error ? error.message : 'Failed to save shipping address. Please try again.'
  } finally {
    isProcessing.value = false
  }
}

// Complete order with Stripe payment (supports all payment methods)
const completeOrder = async () => {
  isProcessing.value = true
  checkoutError.value = ''
  try {
    // Build the return URL for redirect-based payment methods (Klarna, iDEAL, etc.)
    const returnUrl = `${window.location.origin}/checkout/confirmation?order=${orderCode.value}`

    // Process Stripe payment using Payment Element
    const paymentResult = await processPaymentWithElement(returnUrl)

    if (!paymentResult.success) {
      throw new Error(paymentResult.error || 'Payment failed')
    }

    // If requires redirect (Klarna, Link, etc.), Stripe will handle it automatically
    // The user will be redirected to the payment provider and back to returnUrl
    if (paymentResult.requiresRedirect) {
      // Don't do anything - Stripe is handling the redirect
      return
    }

    // Payment succeeded immediately (card payments) - the webhook will finalize the order
    // Poll for order completion (webhook should process within a few seconds)
    let attempts = 0
    const maxAttempts = 10
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      const orderResult = await getActiveOrder()
      const order = orderResult.activeOrder

      // Check if order is complete (no active order means it was finalized)
      if (!order || order.state === 'PaymentSettled' || order.state === 'PaymentAuthorized') {
        break
      }
      attempts++
    }

    // Cleanup and show confirmation
    destroyPaymentElement()
    checkoutStep.value = 4
    clearStorage() // Clear localStorage cart backup
    await syncCart() // Refresh cart after order
  } catch (error) {
    console.error('Failed to complete order:', error)
    checkoutError.value = error instanceof Error ? error.message : 'Payment failed. Please try again.'
  } finally {
    isProcessing.value = false
  }
}

const benefits = [
  { icon: 'i-lucide-zap', text: '5-Second Setup' },
  { icon: 'i-lucide-shield-check', text: '100% Escape-Proof' },
  { icon: 'i-lucide-wind', text: 'Breathable Mesh' },
  { icon: 'i-lucide-package', text: 'Ultra Portable' }
]

const problemSolutions = [
  {
    problem: 'Indoor cats get bored and restless',
    solution: 'Give them the stimulation of the outdoors safely',
    icon: 'i-lucide-frown'
  },
  {
    problem: 'Worried about escapes or predators',
    solution: '360° mesh enclosure keeps them secure',
    icon: 'i-lucide-alert-triangle'
  },
  {
    problem: 'Traditional catios cost $500+',
    solution: 'Get the same benefits for under $60',
    icon: 'i-lucide-dollar-sign'
  }
]

const features = [
  {
    title: 'Pop-Up in 5 Seconds',
    description: 'Spring-loaded frame opens instantly. No assembly, no tools, no frustration. Just unfold and watch your cat explore.',
    image: '/images/product/gem1.jpg'
  },
  {
    title: '2-in-1 Modular Design',
    description: 'Connect the spacious tent with the 47" tunnel for endless configurations. Use them together or separately.',
    image: '/images/product/another.jpg'
  },
  {
    title: 'Take It Anywhere',
    description: 'Folds flat into a 16" carry bag. Perfect for the backyard, park, camping, or vacation. Your cat\'s adventure awaits.',
    image: '/images/product/carry-bag.jpg'
  }
]

const reviews = [
  {
    name: 'Sarah M.',
    location: 'Austin, TX',
    avatar: 'SM',
    rating: 5,
    title: 'My cats are OBSESSED!',
    text: 'I have two indoor cats who were always staring longingly out the window. Now they get supervised outdoor time and they\'re so much happier. Setup really does take 5 seconds.',
    verified: true,
    helpful: 47
  },
  {
    name: 'James K.',
    location: 'Portland, OR',
    avatar: 'JK',
    rating: 5,
    title: 'Perfect for camping',
    text: 'We take our cat everywhere with us. This tent lets him enjoy nature safely while we set up camp. The mesh is sturdy and the zipper is secure. Highly recommend!',
    verified: true,
    helpful: 32
  },
  {
    name: 'Maria L.',
    location: 'Chicago, IL',
    avatar: 'ML',
    rating: 5,
    title: 'Apartment balcony game-changer',
    text: 'I was worried my curious cat would find a way out, but the mesh is really well-made. She loves watching the birds and getting fresh air. Best purchase for her!',
    verified: true,
    helpful: 28
  },
  {
    name: 'David R.',
    location: 'Miami, FL',
    avatar: 'DR',
    rating: 5,
    title: 'Worth every penny',
    text: 'I looked at permanent catios that cost $800+. This does everything I need for a fraction of the price, plus I can take it with me when I move.',
    verified: true,
    helpful: 51
  }
]

const faqs = [
  {
    question: 'Is it really escape-proof?',
    answer: 'Yes! The fine mesh walls have no gaps large enough for cats to squeeze through, and the heavy-duty zippers have safety locks. We\'ve tested it with the most determined escape artists.'
  },
  {
    question: 'What size cats does it fit?',
    answer: 'The tent comfortably fits cats up to 25 lbs. The 24" x 24" x 24" tent provides ample room to move around, and the tunnel adds even more exploration space.'
  },
  {
    question: 'Can I leave it outside?',
    answer: 'The tent is water-resistant and UV-protected for outdoor use. However, we recommend bringing it inside during heavy rain or strong winds to extend its lifespan.'
  },
  {
    question: 'How do I clean it?',
    answer: 'Simply wipe down with a damp cloth or use a handheld vacuum to remove any fur or debris. The mesh dries quickly if it gets wet.'
  }
]

const specs = [
  { label: 'Tent Size', value: '24" x 24" x 24"' },
  { label: 'Tunnel Length', value: '47" extended' },
  { label: 'Weight', value: '2.5 lbs total' },
  { label: 'Max Cat Weight', value: '25 lbs' },
  { label: 'Material', value: 'Polyester mesh, steel wire frame' },
  { label: 'Packed Size', value: '16" diameter flat' }
]
</script>

<template>
  <div class="bg-white text-stone-900">
    <!-- Announcement Bar -->
    <div class="bg-orange-500 text-white text-center py-2 px-4 text-sm font-medium">
      <span class="hidden sm:inline">🎄 Holiday Sale: </span>
      <span class="font-bold">25% OFF</span> + Free Shipping | Ends Soon!
    </div>

    <!-- Header -->
    <header class="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-stone-200">
      <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center">
            <UIcon name="i-lucide-cat" class="w-6 h-6 text-white" />
          </div>
          <span class="font-bold text-xl">PurrfectPlay</span>
        </div>

        <div class="hidden md:flex items-center gap-6 text-sm">
          <a href="#features" class="text-stone-600 hover:text-orange-500 transition-colors">Features</a>
          <a href="#reviews" class="text-stone-600 hover:text-orange-500 transition-colors">Reviews</a>
          <a href="#faq" class="text-stone-600 hover:text-orange-500 transition-colors">FAQ</a>
        </div>

        <div class="flex items-center gap-3">
          <div class="hidden sm:flex items-center gap-1 text-sm text-stone-600">
            <UIcon name="i-lucide-truck" class="w-4 h-4 text-orange-500" />
            Free Shipping
          </div>
          <UButton
            color="neutral"
            variant="ghost"
            class="relative"
            @click="isCartOpen = true"
          >
            <UIcon name="i-lucide-shopping-bag" class="w-5 h-5" />
            <span
              v-if="cartQuantity > 0"
              class="absolute -top-1 -right-1 w-5 h-5 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center font-bold"
            >
              {{ cartQuantity }}
            </span>
          </UButton>
        </div>
      </div>
    </header>

    <!-- HERO SECTION - Split Layout -->
    <section class="relative min-h-[90vh] bg-gradient-to-br from-stone-900 via-stone-800 to-stone-900">
      <div class="max-w-7xl mx-auto px-4 py-16 lg:py-24">
        <div class="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          <!-- Left: Text Content -->
          <div class="text-white order-2 lg:order-1">
          <!-- Badge -->
          <div class="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 rounded-full text-sm font-semibold mb-6">
            <UIcon name="i-heroicons-star-solid" class="w-4 h-4 text-white" />
            #1 Rated Portable Cat Enclosure 2024
          </div>

          <!-- Headline -->
          <h1 class="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">
            Give Your Indoor Cat
            <span class="text-orange-400">Safe Outdoor Adventures</span>
          </h1>

          <!-- Subheadline with specific claim -->
          <p class="text-xl lg:text-2xl text-white/90 mb-8 leading-relaxed">
            The pop-up tent & tunnel that sets up in <span class="font-bold text-orange-300">5 seconds</span> and keeps your cat 100% secure. Join 847+ happy cat parents.
          </p>

          <!-- Quick Benefits -->
          <div class="flex flex-wrap gap-4 mb-8">
            <div v-for="benefit in benefits" :key="benefit.text" class="flex items-center gap-2 text-white/90">
              <UIcon :name="benefit.icon" class="w-5 h-5 text-orange-400" />
              <span>{{ benefit.text }}</span>
            </div>
          </div>

          <!-- CTA Group -->
          <div class="flex flex-col sm:flex-row gap-4 mb-6">
            <UButton
              size="xl"
              class="px-8 py-4 text-lg font-bold shadow-xl shadow-orange-500/30 hover:shadow-orange-500/50 transition-all"
              @click="handleAddToCart"
              :loading="isLoading"
            >
              <UIcon name="i-lucide-shopping-cart" class="w-5 h-5 mr-2" />
              Get Yours Now - {{ formatPrice(product.price) }}
            </UButton>
            <div class="flex items-center gap-2 text-white/80 text-sm">
              <span class="line-through">{{ formatPrice(product.originalPrice) }}</span>
              <span class="px-2 py-1 bg-green-500 text-white rounded font-semibold">SAVE 40%</span>
            </div>
          </div>

          <!-- Trust Signals -->
          <div class="flex flex-wrap items-center gap-6 text-sm text-white/70">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-truck" class="w-5 h-5" />
              Free Shipping
            </div>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-shield-check" class="w-5 h-5" />
              30-Day Guarantee
            </div>
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-star-solid" class="w-5 h-5 text-amber-400" />
              5.0/5 (847 reviews)
            </div>
          </div>
          </div>

          <!-- Right: Product Image -->
          <div class="order-1 lg:order-2 flex justify-center">
            <div class="relative">
              <img
                src="/images/product/product-full.webp"
                alt="PurrfectPlay Cat Tent and Tunnel Set with Carry Bag"
                class="w-full max-w-lg drop-shadow-2xl"
              >
              <!-- Sale badge -->
              <div class="absolute -top-4 -right-4 w-20 h-20 bg-red-500 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg transform rotate-12">
                40% OFF
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>


    <!-- Problem/Solution Section -->
    <section class="py-16 lg:py-24 bg-white">
      <div class="max-w-7xl mx-auto px-4">
        <div class="text-center max-w-3xl mx-auto mb-12">
          <h2 class="text-3xl lg:text-4xl font-bold mb-4">
            Your Cat Deserves <span class="text-orange-500">More Than Window Watching</span>
          </h2>
          <p class="text-lg text-stone-600">
            Indoor cats live longer, but they miss out on the stimulation and enrichment that nature provides. Until now.
          </p>
        </div>

        <div class="grid md:grid-cols-3 gap-8">
          <div v-for="item in problemSolutions" :key="item.problem" class="text-center">
            <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
              <UIcon :name="item.icon" class="w-8 h-8 text-red-500" />
            </div>
            <p class="text-stone-500 mb-2 line-through">{{ item.problem }}</p>
            <p class="font-semibold text-lg text-stone-900">{{ item.solution }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Product Gallery Section -->
    <section class="py-16 lg:py-24 bg-stone-50">
      <div class="max-w-7xl mx-auto px-4">
        <div class="text-center mb-12">
          <h2 class="text-3xl lg:text-4xl font-bold mb-4">
            See What's Included
          </h2>
          <p class="text-lg text-stone-600">
            Everything you need for safe outdoor adventures
          </p>
        </div>

        <!-- Image Grid -->
        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
          <!-- Main lifestyle shot - large -->
          <div class="lg:col-span-2 rounded-2xl overflow-hidden shadow-lg aspect-[4/3]">
            <img
              src="/images/product/gem1.jpg"
              alt="Cat enjoying the tent and tunnel"
              class="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
            >
          </div>
          <!-- Dimensions diagram -->
          <div class="rounded-2xl overflow-hidden shadow-lg bg-white p-4 flex items-center justify-center">
            <img
              src="/images/product/dimensions.jpg"
              alt="Product dimensions - 117cm tent, 117cm tunnel"
              class="w-full h-full object-contain"
            >
          </div>
          <!-- Cat top view -->
          <div class="rounded-2xl overflow-hidden shadow-lg aspect-square">
            <img
              src="/images/product/cat-topview.jpeg"
              alt="Cat relaxing inside the tent"
              class="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
            >
          </div>
          <!-- Detail connection -->
          <div class="rounded-2xl overflow-hidden shadow-lg aspect-square">
            <img
              src="/images/product/detail-connection.jpg"
              alt="Secure tent and tunnel connection"
              class="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
            >
          </div>
          <!-- Carry bag -->
          <div class="rounded-2xl overflow-hidden shadow-lg aspect-square">
            <img
              src="/images/product/carry-bag.jpg"
              alt="Compact carry bag for easy storage"
              class="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
            >
          </div>
        </div>

        <!-- Stats below gallery -->
        <div class="grid grid-cols-3 gap-4 mt-12 max-w-3xl mx-auto text-center">
          <div class="p-4 bg-white rounded-xl shadow-sm">
            <p class="text-3xl font-bold text-orange-500">5 sec</p>
            <p class="text-sm text-stone-600">Setup Time</p>
          </div>
          <div class="p-4 bg-white rounded-xl shadow-sm">
            <p class="text-3xl font-bold text-orange-500">2.5 lbs</p>
            <p class="text-sm text-stone-600">Total Weight</p>
          </div>
          <div class="p-4 bg-white rounded-xl shadow-sm">
            <p class="text-3xl font-bold text-orange-500">847+</p>
            <p class="text-sm text-stone-600">Happy Cats</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Features Section -->
    <section id="features" class="py-16 lg:py-24 bg-white">
      <div class="max-w-7xl mx-auto px-4">
        <div class="text-center max-w-3xl mx-auto mb-16">
          <h2 class="text-3xl lg:text-4xl font-bold mb-4">
            Why <span class="text-orange-500">847+ Cat Parents</span> Choose PurrfectPlay
          </h2>
        </div>

        <div class="space-y-24">
          <div
            v-for="(feature, index) in features"
            :key="feature.title"
            class="grid lg:grid-cols-2 gap-12 items-center"
          >
            <div :class="index % 2 === 1 ? 'lg:order-2' : ''">
              <div class="aspect-[4/3] rounded-2xl overflow-hidden shadow-xl">
                <img
                  :src="feature.image"
                  :alt="feature.title"
                  class="w-full h-full object-cover"
                >
              </div>
            </div>
            <div :class="index % 2 === 1 ? 'lg:order-1' : ''">
              <h3 class="text-2xl lg:text-3xl font-bold mb-4">{{ feature.title }}</h3>
              <p class="text-lg text-stone-600 mb-6">{{ feature.description }}</p>
              <UButton
                size="lg"
                @click="handleAddToCart"
                :loading="isLoading"
              >
                Order Now - {{ formatPrice(product.price) }}
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Product Details -->
    <section class="py-16 lg:py-24 bg-stone-50">
      <div class="max-w-7xl mx-auto px-4">
        <div class="grid lg:grid-cols-2 gap-12 items-start">
          <!-- Gallery -->
          <div class="space-y-4 lg:sticky lg:top-24">
            <div class="aspect-square rounded-2xl overflow-hidden bg-white shadow-lg">
              <img
                :src="product.images[selectedImage].src"
                :alt="product.images[selectedImage].alt"
                class="w-full h-full object-cover"
              >
            </div>
            <div class="flex gap-3">
              <button
                v-for="(image, index) in product.images"
                :key="index"
                class="w-20 h-20 rounded-xl overflow-hidden border-2 transition-all"
                :class="selectedImage === index ? 'border-orange-500 ring-2 ring-orange-500/20' : 'border-stone-200 hover:border-orange-300'"
                @click="selectedImage = index"
              >
                <img :src="image.src" :alt="image.alt" class="w-full h-full object-cover">
              </button>
            </div>
          </div>

          <!-- Details -->
          <div class="space-y-8">
            <div>
              <div class="flex items-center gap-2 mb-2">
                <div class="flex">
                  <UIcon v-for="i in 5" :key="i" name="i-heroicons-star-solid" class="w-5 h-5 text-amber-400" />
                </div>
                <span class="text-stone-600">{{ product.rating }}.0 ({{ product.reviewCount }} reviews)</span>
              </div>
              <h2 class="text-3xl font-bold mb-2">{{ product.name }}</h2>
              <p class="text-lg text-stone-600">{{ product.tagline }}</p>
            </div>

            <div class="flex items-baseline gap-3">
              <span class="text-4xl font-bold text-orange-600">{{ formatPrice(product.price) }}</span>
              <span class="text-xl text-stone-400 line-through">{{ formatPrice(product.originalPrice) }}</span>
              <span class="px-3 py-1 bg-green-100 text-green-700 text-sm font-bold rounded-full">SAVE $12</span>
            </div>

            <!-- What's Included -->
            <div class="bg-white rounded-xl p-6 border border-stone-200">
              <h4 class="font-bold mb-4">What's Included:</h4>
              <ul class="space-y-2">
                <li class="flex items-center gap-2">
                  <UIcon name="i-lucide-check" class="w-5 h-5 text-green-500" />
                  24" x 24" x 24" Pop-Up Tent
                </li>
                <li class="flex items-center gap-2">
                  <UIcon name="i-lucide-check" class="w-5 h-5 text-green-500" />
                  47" Extendable Tunnel
                </li>
                <li class="flex items-center gap-2">
                  <UIcon name="i-lucide-check" class="w-5 h-5 text-green-500" />
                  Compact Carry Bag
                </li>
                <li class="flex items-center gap-2">
                  <UIcon name="i-lucide-check" class="w-5 h-5 text-green-500" />
                  Ground Stakes (4x)
                </li>
              </ul>
            </div>

            <!-- Quantity & Add to Cart -->
            <div class="space-y-4">
              <div class="flex items-center gap-4">
                <span class="font-medium">Quantity:</span>
                <div class="flex items-center border border-stone-200 rounded-xl overflow-hidden">
                  <button
                    class="w-12 h-12 flex items-center justify-center hover:bg-stone-50 transition-colors"
                    @click="quantity = Math.max(1, quantity - 1)"
                  >
                    <UIcon name="i-lucide-minus" class="w-4 h-4" />
                  </button>
                  <span class="w-12 text-center font-semibold">{{ quantity }}</span>
                  <button
                    class="w-12 h-12 flex items-center justify-center hover:bg-stone-50 transition-colors"
                    @click="quantity++"
                  >
                    <UIcon name="i-lucide-plus" class="w-4 h-4" />
                  </button>
                </div>
              </div>

              <UButton
                size="xl"
                block
                class="py-4 text-lg font-bold"
                :loading="isLoading"
                @click="handleAddToCart"
              >
                <UIcon name="i-lucide-shopping-cart" class="w-5 h-5 mr-2" />
                Add to Cart - {{ formatPrice(product.price * quantity) }}
              </UButton>

              <div class="flex items-center justify-center gap-6 text-sm text-stone-500">
                <div class="flex items-center gap-1">
                  <UIcon name="i-lucide-truck" class="w-4 h-4" />
                  Free Shipping
                </div>
                <div class="flex items-center gap-1">
                  <UIcon name="i-lucide-shield-check" class="w-4 h-4" />
                  30-Day Guarantee
                </div>
              </div>
            </div>

            <!-- Specs -->
            <div class="bg-stone-100 rounded-xl p-6">
              <h4 class="font-bold mb-4">Specifications</h4>
              <div class="grid grid-cols-2 gap-4">
                <div v-for="spec in specs" :key="spec.label">
                  <p class="text-sm text-stone-500">{{ spec.label }}</p>
                  <p class="font-medium">{{ spec.value }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Reviews Section -->
    <section id="reviews" class="py-16 lg:py-24 bg-white">
      <div class="max-w-7xl mx-auto px-4">
        <div class="text-center mb-12">
          <div class="flex items-center justify-center gap-1 mb-4">
            <UIcon v-for="i in 5" :key="i" name="i-heroicons-star-solid" class="w-8 h-8 text-amber-400" />
          </div>
          <h2 class="text-3xl lg:text-4xl font-bold mb-2">
            5 out of 5 Stars
          </h2>
          <p class="text-lg text-stone-600">Based on {{ product.reviewCount }} verified reviews</p>
        </div>

        <div class="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          <div
            v-for="review in reviews"
            :key="review.name"
            class="bg-stone-50 rounded-2xl p-6"
          >
            <div class="flex items-center gap-1 mb-3">
              <UIcon v-for="i in review.rating" :key="i" name="i-heroicons-star-solid" class="w-5 h-5 text-amber-400" />
            </div>
            <h4 class="font-bold text-lg mb-2">{{ review.title }}</h4>
            <p class="text-stone-600 mb-4">"{{ review.text }}"</p>
            <div class="flex items-center justify-between">
              <div>
                <p class="font-medium">{{ review.name }}</p>
                <p class="text-sm text-stone-500">{{ review.location }}</p>
              </div>
              <div class="flex items-center gap-2 text-sm text-stone-500">
                <UIcon name="i-lucide-check-circle" class="w-4 h-4 text-green-500" />
                Verified Purchase
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- FAQ Section -->
    <section id="faq" class="py-16 lg:py-24 bg-stone-50">
      <div class="max-w-3xl mx-auto px-4">
        <div class="text-center mb-12">
          <h2 class="text-3xl lg:text-4xl font-bold mb-4">
            Frequently Asked Questions
          </h2>
        </div>

        <div class="space-y-4">
          <details
            v-for="faq in faqs"
            :key="faq.question"
            class="bg-white rounded-xl p-6 group"
          >
            <summary class="font-semibold text-lg cursor-pointer flex items-center justify-between">
              {{ faq.question }}
              <UIcon name="i-lucide-chevron-down" class="w-5 h-5 transition-transform group-open:rotate-180" />
            </summary>
            <p class="mt-4 text-stone-600">{{ faq.answer }}</p>
          </details>
        </div>
      </div>
    </section>

    <!-- Final CTA -->
    <section class="py-16 lg:py-24 bg-gradient-to-r from-orange-500 to-amber-500 text-white">
      <div class="max-w-4xl mx-auto px-4 text-center">
        <h2 class="text-3xl lg:text-5xl font-bold mb-6">
          Give Your Cat the Gift of Adventure
        </h2>
        <p class="text-xl text-orange-100 mb-8 max-w-2xl mx-auto">
          Join 847+ happy cat parents. Free shipping, 30-day money-back guarantee, and a lifetime of happy meows.
        </p>

        <UButton
          size="xl"
          color="neutral"
          class="px-10 py-5 text-xl font-bold bg-white text-orange-600 hover:bg-orange-50 shadow-xl"
          @click="handleAddToCart"
          :loading="isLoading"
        >
          <UIcon name="i-lucide-shopping-cart" class="w-6 h-6 mr-2" />
          Order Now - {{ formatPrice(product.price) }}
        </UButton>

        <div class="flex items-center justify-center gap-8 mt-8 text-orange-100">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-truck" class="w-5 h-5" />
            Free Shipping
          </div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-refresh-cw" class="w-5 h-5" />
            30-Day Returns
          </div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-shield" class="w-5 h-5" />
            Satisfaction Guaranteed
          </div>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="bg-stone-900 text-stone-400 py-12">
      <div class="max-w-7xl mx-auto px-4">
        <div class="grid md:grid-cols-4 gap-8 mb-8">
          <div>
            <div class="flex items-center gap-2 mb-4">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center">
                <UIcon name="i-lucide-cat" class="w-6 h-6 text-white" />
              </div>
              <span class="font-bold text-lg text-white">PurrfectPlay</span>
            </div>
            <p class="text-sm">Safe outdoor adventures for indoor cats.</p>
          </div>
          <div>
            <h4 class="font-semibold text-white mb-4">Shop</h4>
            <ul class="space-y-2 text-sm">
              <li><a href="#" class="hover:text-orange-400 transition-colors">Cat Tent & Tunnel</a></li>
              <li><a href="#" class="hover:text-orange-400 transition-colors">Accessories</a></li>
              <li><a href="#" class="hover:text-orange-400 transition-colors">Gift Cards</a></li>
            </ul>
          </div>
          <div>
            <h4 class="font-semibold text-white mb-4">Support</h4>
            <ul class="space-y-2 text-sm">
              <li><a href="#faq" class="hover:text-orange-400 transition-colors">FAQ</a></li>
              <li><a href="#" class="hover:text-orange-400 transition-colors">Contact Us</a></li>
              <li><a href="#" class="hover:text-orange-400 transition-colors">Shipping Info</a></li>
              <li><a href="#" class="hover:text-orange-400 transition-colors">Returns</a></li>
            </ul>
          </div>
          <div>
            <h4 class="font-semibold text-white mb-4">Connect</h4>
            <div class="flex gap-4">
              <a href="#" class="hover:text-orange-400 transition-colors">
                <UIcon name="i-simple-icons-instagram" class="w-5 h-5" />
              </a>
              <a href="#" class="hover:text-orange-400 transition-colors">
                <UIcon name="i-simple-icons-facebook" class="w-5 h-5" />
              </a>
              <a href="#" class="hover:text-orange-400 transition-colors">
                <UIcon name="i-simple-icons-tiktok" class="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
        <div class="border-t border-stone-800 pt-8 text-center text-sm">
          <p>&copy; {{ new Date().getFullYear() }} PurrfectPlay. All rights reserved.</p>
        </div>
      </div>
    </footer>

    <!-- Cart Slideover -->
    <USlideover v-model:open="isCartOpen">
      <template #content>
        <div class="flex flex-col h-full bg-white">
          <div class="flex items-center justify-between p-4 border-b border-stone-200">
            <h2 class="text-lg font-bold">Shopping Cart ({{ cartQuantity }})</h2>
            <UButton color="neutral" variant="ghost" icon="i-lucide-x" @click="closeCart" />
          </div>

          <div class="flex-1 overflow-y-auto p-4">
            <div v-if="cartItems.length === 0" class="text-center py-12">
              <UIcon name="i-lucide-shopping-bag" class="w-16 h-16 text-stone-300 mx-auto mb-4" />
              <p class="text-stone-500 mb-4">Your cart is empty</p>
              <UButton @click="closeCart">Continue Shopping</UButton>
            </div>

            <div v-else class="space-y-4">
              <div
                v-for="item in cartItems"
                :key="item.id"
                class="flex gap-4 p-4 bg-stone-50 rounded-xl"
              >
                <div class="w-20 h-20 rounded-lg overflow-hidden bg-white flex-shrink-0">
                  <img
                    :src="item.image || product.images[0].src"
                    :alt="item.name"
                    class="w-full h-full object-cover"
                  >
                </div>
                <div class="flex-1 min-w-0">
                  <h4 class="font-medium text-sm truncate">{{ item.name }}</h4>
                  <p class="text-sm text-stone-500">{{ item.variantName }}</p>
                  <div class="flex items-center justify-between mt-2">
                    <div class="flex items-center border border-stone-200 rounded-lg overflow-hidden bg-white">
                      <button
                        class="w-8 h-8 flex items-center justify-center hover:bg-stone-100"
                        @click="updateQuantity(item.id, item.quantity - 1)"
                      >
                        <UIcon name="i-lucide-minus" class="w-3 h-3" />
                      </button>
                      <span class="w-8 text-center text-sm">{{ item.quantity }}</span>
                      <button
                        class="w-8 h-8 flex items-center justify-center hover:bg-stone-100"
                        @click="updateQuantity(item.id, item.quantity + 1)"
                      >
                        <UIcon name="i-lucide-plus" class="w-3 h-3" />
                      </button>
                    </div>
                    <span class="font-semibold">{{ formatPrice(item.lineTotal) }}</span>
                  </div>
                </div>
                <button
                  class="text-stone-400 hover:text-red-500 transition-colors"
                  @click="removeFromCart(item.id)"
                >
                  <UIcon name="i-lucide-trash-2" class="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          <div v-if="cartItems.length > 0" class="p-4 border-t border-stone-200 space-y-4 bg-stone-50">
            <div class="flex justify-between text-lg font-bold">
              <span>Total</span>
              <span>{{ formatPrice(cartTotal) }}</span>
            </div>
            <UButton
              size="lg"
              block
              class="py-3"
              @click="proceedToCheckout"
            >
              Checkout
              <UIcon name="i-lucide-arrow-right" class="w-5 h-5 ml-2" />
            </UButton>
            <p class="text-center text-xs text-stone-500">
              Free shipping • 30-day returns • Secure checkout
            </p>
          </div>
        </div>
      </template>
    </USlideover>

    <!-- Checkout Modal - Modern Full Width -->
    <UModal v-model:open="isCheckoutOpen" :ui="{ width: 'sm:max-w-xl' }">
      <template #content>
        <div class="bg-white rounded-2xl flex flex-col max-h-[90vh]">
          <!-- Header -->
          <div class="bg-stone-50 px-6 py-4 border-b border-stone-200">
            <div class="flex items-center justify-between">
              <div>
                <h2 class="text-xl font-bold text-stone-900">Checkout</h2>
                <p class="text-sm text-stone-500">Step {{ Math.min(checkoutStep, 3) }} of 3</p>
              </div>
              <button
                class="w-10 h-10 rounded-full bg-white border border-stone-200 flex items-center justify-center hover:bg-stone-100 transition-colors"
                @click="closeCheckout"
              >
                <UIcon name="i-lucide-x" class="w-5 h-5 text-stone-500" />
              </button>
            </div>

            <!-- Progress Bar (3 steps: Contact, Address, Payment) -->
            <div class="mt-4 flex gap-2">
              <div
                v-for="step in 3"
                :key="step"
                class="h-1.5 flex-1 rounded-full transition-colors"
                :class="checkoutStep >= step ? 'bg-orange-500' : 'bg-stone-200'"
              />
            </div>
          </div>

          <!-- Error Message -->
          <div v-if="checkoutError" class="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
            <div class="flex items-center gap-3">
              <UIcon name="i-lucide-alert-circle" class="w-5 h-5 text-red-500 flex-shrink-0" />
              <p class="text-sm text-red-700">{{ checkoutError }}</p>
            </div>
          </div>

          <!-- Content (scrollable) -->
          <div class="p-6 overflow-y-auto flex-1">
            <!-- Step 1: Contact Information -->
            <div v-if="checkoutStep === 1" class="space-y-5">
              <div>
                <h3 class="text-lg font-semibold text-stone-900 mb-1">Contact Information</h3>
                <p class="text-sm text-stone-500">We'll use this to send your order confirmation.</p>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-2">
                  <label class="block text-sm font-medium text-stone-700">First Name *</label>
                  <input
                    v-model="customerInfo.firstName"
                    type="text"
                    placeholder="John"
                    class="w-full h-12 px-4 rounded-xl border border-stone-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all text-stone-900 placeholder:text-stone-400"
                  >
                </div>
                <div class="space-y-2">
                  <label class="block text-sm font-medium text-stone-700">Last Name *</label>
                  <input
                    v-model="customerInfo.lastName"
                    type="text"
                    placeholder="Doe"
                    class="w-full h-12 px-4 rounded-xl border border-stone-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all text-stone-900 placeholder:text-stone-400"
                  >
                </div>
              </div>

              <div class="space-y-2">
                <label class="block text-sm font-medium text-stone-700">Email Address *</label>
                <input
                  v-model="customerInfo.emailAddress"
                  type="email"
                  placeholder="john@example.com"
                  class="w-full h-12 px-4 rounded-xl border border-stone-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all text-stone-900 placeholder:text-stone-400"
                >
              </div>

              <button
                class="w-full h-14 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="isProcessing || !customerInfo.firstName || !customerInfo.lastName || !customerInfo.emailAddress"
                @click="submitCustomerInfo"
              >
                <span v-if="isProcessing" class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span v-else>Continue to Shipping</span>
                <UIcon v-if="!isProcessing" name="i-lucide-arrow-right" class="w-5 h-5" />
              </button>
            </div>

            <!-- Step 2: Shipping Address -->
            <div v-if="checkoutStep === 2" class="space-y-5">
              <div>
                <h3 class="text-lg font-semibold text-stone-900 mb-1">Shipping Address</h3>
                <p class="text-sm text-stone-500">Where should we send your order?</p>
              </div>

              <!-- Stripe Address Element with autocomplete -->
              <div
                id="stripe-address-element"
                class="stripe-address-element min-h-[200px] max-h-[350px] overflow-y-auto p-4 border border-stone-300 rounded-xl bg-white"
              />

              <div class="flex gap-3">
                <button
                  class="h-14 px-6 border border-stone-300 text-stone-700 font-medium rounded-xl hover:bg-stone-50 transition-colors"
                  @click="checkoutStep = 1; destroyAddressElement()"
                >
                  Back
                </button>
                <button
                  class="flex-1 h-14 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  :disabled="isProcessing"
                  @click="submitShippingInfo"
                >
                  <span v-if="isProcessing" class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span v-else>Continue to Payment</span>
                  <UIcon v-if="!isProcessing" name="i-lucide-arrow-right" class="w-5 h-5" />
                </button>
              </div>
            </div>

            <!-- Step 3: Payment (Stripe Payment Element - supports ALL payment methods) -->
            <div v-if="checkoutStep === 3" class="space-y-5">
              <div>
                <h3 class="text-lg font-semibold text-stone-900 mb-1">Payment</h3>
                <p class="text-sm text-stone-500">Choose your preferred payment method.</p>
              </div>

              <!-- Order Summary -->
              <div class="bg-stone-50 rounded-xl p-4 space-y-3">
                <h4 class="font-semibold text-stone-900">Order Summary</h4>
                <div class="space-y-2 text-sm">
                  <div class="flex justify-between">
                    <span class="text-stone-600">Subtotal</span>
                    <span class="font-medium">{{ formatPrice(cartTotal) }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-stone-600">Shipping</span>
                    <span class="font-medium text-green-600">FREE</span>
                  </div>
                  <div class="pt-2 border-t border-stone-200 flex justify-between">
                    <span class="font-semibold text-stone-900">Total</span>
                    <span class="font-bold text-lg text-stone-900">{{ formatPrice(cartTotal) }}</span>
                  </div>
                </div>
              </div>

              <!-- Stripe Payment Element (supports Card, Apple Pay, Google Pay, Klarna, Link, etc.) -->
              <div class="space-y-2">
                <label class="block text-sm font-medium text-stone-700">Payment Method</label>
                <div
                  id="stripe-payment-element"
                  class="min-h-[200px] p-4 rounded-xl border border-stone-300 bg-white"
                />
                <p v-if="stripeError" class="text-sm text-red-500">{{ stripeError }}</p>
              </div>

              <!-- Security Notice -->
              <div class="flex items-center gap-2 text-sm text-stone-500">
                <UIcon name="i-lucide-lock" class="w-4 h-4" />
                <span>Your payment is secure and encrypted by Stripe</span>
              </div>

              <div class="flex gap-3">
                <button
                  class="h-14 px-6 border border-stone-300 text-stone-700 font-medium rounded-xl hover:bg-stone-50 transition-colors"
                  @click="goBackFromPayment"
                >
                  Back
                </button>
                <button
                  class="flex-1 h-14 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  :disabled="isProcessing || isStripeLoading"
                  @click="completeOrder"
                >
                  <span v-if="isProcessing || isStripeLoading" class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <UIcon v-else name="i-lucide-lock" class="w-5 h-5" />
                  <span v-if="!isProcessing && !isStripeLoading">Pay {{ formatPrice(cartTotal) }}</span>
                </button>
              </div>
            </div>

            <!-- Step 4: Confirmation -->
            <div v-if="checkoutStep === 4" class="text-center py-8">
              <div class="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <UIcon name="i-lucide-check" class="w-10 h-10 text-green-600" />
              </div>
              <h3 class="text-2xl font-bold text-stone-900 mb-2">Order Confirmed!</h3>
              <p class="text-stone-600 mb-2">Order #{{ orderCode }}</p>
              <p class="text-stone-500 mb-8">
                Thank you for your purchase! A confirmation email has been sent to {{ customerInfo.emailAddress }}.
              </p>
              <button
                class="h-14 px-8 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl transition-colors"
                @click="isCheckoutOpen = false; closeCart()"
              >
                Continue Shopping
              </button>
            </div>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style>
html {
  scroll-behavior: smooth;
}

/* Ripple effect for buttons */
button, .btn-ripple {
  position: relative;
  overflow: hidden;
}

button::after, .btn-ripple::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  transition: width 0.6s ease, height 0.6s ease, opacity 0.6s ease;
  pointer-events: none;
  opacity: 0;
}

button:active::after, .btn-ripple:active::after {
  width: 300px;
  height: 300px;
  opacity: 1;
  transition: width 0s, height 0s, opacity 0s;
}

/* Dark button ripple */
button.btn-dark::after {
  background: rgba(0, 0, 0, 0.15);
}
</style>
