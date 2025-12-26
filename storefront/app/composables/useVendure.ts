// Vendure GraphQL composable for shop operations
// Uses bearer token stored in localStorage for session persistence across machines

const VENDURE_TOKEN_KEY = 'vendure-token'

// Get token from localStorage (client-side only)
const getStoredToken = (): string | null => {
  if (import.meta.client) {
    return localStorage.getItem(VENDURE_TOKEN_KEY)
  }
  return null
}

// Save token to localStorage
const saveToken = (token: string) => {
  if (import.meta.client) {
    localStorage.setItem(VENDURE_TOKEN_KEY, token)
  }
}

// Clear token from localStorage
const clearToken = () => {
  if (import.meta.client) {
    localStorage.removeItem(VENDURE_TOKEN_KEY)
  }
}

export const useVendure = () => {
  const config = useRuntimeConfig()

  const query = async <T>(gql: string, variables?: Record<string, unknown>): Promise<T> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    // Add bearer token if we have one
    const token = getStoredToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    // Use $fetch.raw to get full response with headers
    // Using /api/shop instead of /shop-api to ensure headers are properly forwarded
    const rawResponse = await $fetch.raw<{ data: T, errors?: Array<{ message: string }> }>('/api/shop', {
      method: 'POST',
      body: { query: gql, variables },
      headers,
      credentials: 'include' // Still include for cookie fallback
    })

    // Capture vendure-auth-token from response header and store it
    const authToken = rawResponse.headers.get('vendure-auth-token')
    if (authToken) {
      saveToken(authToken)
    }

    const response = rawResponse._data
    if (response?.errors && response.errors.length > 0) {
      console.error('GraphQL errors:', response.errors)
      throw new Error(response.errors[0]?.message || 'Unknown GraphQL error')
    }
    return response?.data as T
  }

  // Get product by slug
  const getProduct = async (slug: string) => {
    return query<{ product: Product | null }>(`
      query GetProduct($slug: String!) {
        product(slug: $slug) {
          id
          name
          slug
          description
          featuredAsset {
            id
            preview
            source
          }
          assets {
            id
            preview
            source
          }
          variants {
            id
            name
            sku
            price
            priceWithTax
            stockLevel
            featuredAsset {
              preview
            }
          }
        }
      }
    `, { slug })
  }

  // Get active order (cart)
  const getActiveOrder = async () => {
    return query<{ activeOrder: Order | null }>(`
      query GetActiveOrder {
        activeOrder {
          id
          code
          state
          total
          totalWithTax
          subTotal
          subTotalWithTax
          shipping
          shippingWithTax
          totalQuantity
          lines {
            id
            quantity
            linePriceWithTax
            productVariant {
              id
              name
              price
              priceWithTax
              featuredAsset {
                preview
              }
              product {
                name
                slug
                featuredAsset {
                  preview
                }
              }
            }
          }
        }
      }
    `)
  }

  // Add item to cart
  const addToCart = async (productVariantId: string, quantity: number = 1) => {
    return query<{ addItemToOrder: Order | OrderError }>(`
      mutation AddItemToOrder($productVariantId: ID!, $quantity: Int!) {
        addItemToOrder(productVariantId: $productVariantId, quantity: $quantity) {
          ... on Order {
            id
            code
            totalWithTax
            totalQuantity
            lines {
              id
              quantity
              productVariant {
                id
                name
              }
            }
          }
          ... on ErrorResult {
            errorCode
            message
          }
        }
      }
    `, { productVariantId, quantity })
  }

  // Update cart item quantity
  const updateCartItem = async (lineId: string, quantity: number) => {
    return query<{ adjustOrderLine: Order | OrderError }>(`
      mutation AdjustOrderLine($lineId: ID!, $quantity: Int!) {
        adjustOrderLine(orderLineId: $lineId, quantity: $quantity) {
          ... on Order {
            id
            totalWithTax
            totalQuantity
            lines {
              id
              quantity
            }
          }
          ... on ErrorResult {
            errorCode
            message
          }
        }
      }
    `, { lineId, quantity })
  }

  // Remove item from cart
  const removeFromCart = async (lineId: string) => {
    return query<{ removeOrderLine: Order | OrderError }>(`
      mutation RemoveOrderLine($lineId: ID!) {
        removeOrderLine(orderLineId: $lineId) {
          ... on Order {
            id
            totalWithTax
            totalQuantity
          }
          ... on ErrorResult {
            errorCode
            message
          }
        }
      }
    `, { lineId })
  }

  // Set customer for checkout
  const setCustomerForOrder = async (input: CreateCustomerInput) => {
    return query<{ setCustomerForOrder: Order | OrderError }>(`
      mutation SetCustomerForOrder($input: CreateCustomerInput!) {
        setCustomerForOrder(input: $input) {
          ... on Order {
            id
            customer {
              id
              firstName
              lastName
              emailAddress
            }
          }
          ... on ErrorResult {
            errorCode
            message
          }
        }
      }
    `, { input })
  }

  // Set shipping address
  const setShippingAddress = async (input: CreateAddressInput) => {
    return query<{ setOrderShippingAddress: Order | OrderError }>(`
      mutation SetShippingAddress($input: CreateAddressInput!) {
        setOrderShippingAddress(input: $input) {
          ... on Order {
            id
            shippingAddress {
              fullName
              streetLine1
              city
              postalCode
              country
            }
          }
          ... on ErrorResult {
            errorCode
            message
          }
        }
      }
    `, { input })
  }

  // Get shipping methods
  const getShippingMethods = async () => {
    return query<{ eligibleShippingMethods: ShippingMethod[] }>(`
      query GetShippingMethods {
        eligibleShippingMethods {
          id
          name
          description
          price
          priceWithTax
        }
      }
    `)
  }

  // Set shipping method
  const setShippingMethod = async (shippingMethodId: string) => {
    return query<{ setOrderShippingMethod: Order | OrderError }>(`
      mutation SetShippingMethod($shippingMethodId: [ID!]!) {
        setOrderShippingMethod(shippingMethodId: $shippingMethodId) {
          ... on Order {
            id
            shipping
            shippingWithTax
            totalWithTax
          }
          ... on ErrorResult {
            errorCode
            message
          }
        }
      }
    `, { shippingMethodId: [shippingMethodId] })
  }

  // Transition to arranging payment
  const transitionToArrangingPayment = async () => {
    return query<{ transitionOrderToState: Order | OrderError }>(`
      mutation TransitionToArrangingPayment {
        transitionOrderToState(state: "ArrangingPayment") {
          ... on Order {
            id
            code
            state
          }
          ... on ErrorResult {
            errorCode
            message
          }
        }
      }
    `)
  }

  // Reset order back to AddingItems state (for when user abandons checkout)
  const resetOrderToAddingItems = async () => {
    return query<{ transitionOrderToState: Order | OrderError }>(`
      mutation ResetOrderToAddingItems {
        transitionOrderToState(state: "AddingItems") {
          ... on Order {
            id
            code
            state
          }
          ... on ErrorResult {
            errorCode
            message
          }
        }
      }
    `)
  }

  // Add payment
  const addPayment = async (method: string, metadata: Record<string, unknown> = {}) => {
    return query<{ addPaymentToOrder: Order | OrderError }>(`
      mutation AddPayment($input: PaymentInput!) {
        addPaymentToOrder(input: $input) {
          ... on Order {
            id
            state
            code
          }
          ... on ErrorResult {
            errorCode
            message
          }
        }
      }
    `, { input: { method, metadata } })
  }

  return {
    query,
    getProduct,
    getActiveOrder,
    addToCart,
    updateCartItem,
    removeFromCart,
    setCustomerForOrder,
    setShippingAddress,
    getShippingMethods,
    setShippingMethod,
    transitionToArrangingPayment,
    resetOrderToAddingItems,
    addPayment,
    clearToken // Export to clear session after order completion
  }
}

// Types
interface Product {
  id: string
  name: string
  slug: string
  description: string
  featuredAsset?: Asset
  assets: Asset[]
  variants: ProductVariant[]
}

interface Asset {
  id: string
  preview: string
  source: string
}

interface ProductVariant {
  id: string
  name: string
  sku: string
  price: number
  priceWithTax: number
  stockLevel: string
  featuredAsset?: Asset
}

interface Order {
  id: string
  code: string
  state: string
  total: number
  totalWithTax: number
  subTotal: number
  subTotalWithTax: number
  shipping: number
  shippingWithTax: number
  totalQuantity: number
  lines: OrderLine[]
  customer?: Customer
  shippingAddress?: Address
}

interface OrderLine {
  id: string
  quantity: number
  linePriceWithTax: number
  productVariant: ProductVariant & { product: { name: string, slug: string, featuredAsset?: Asset } }
}

interface OrderError {
  errorCode: string
  message: string
}

interface Customer {
  id: string
  firstName: string
  lastName: string
  emailAddress: string
}

interface Address {
  fullName: string
  streetLine1: string
  city: string
  postalCode: string
  country: string
}

interface CreateCustomerInput {
  firstName: string
  lastName: string
  emailAddress: string
}

interface CreateAddressInput {
  fullName: string
  streetLine1: string
  streetLine2?: string
  city: string
  postalCode: string
  countryCode: string
}

interface ShippingMethod {
  id: string
  name: string
  description: string
  price: number
  priceWithTax: number
}
