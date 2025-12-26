// Cart state composable with optimistic updates and localStorage persistence
export const useCart = () => {
  const isCartOpen = useState('cart-open', () => false)
  const cartItems = useState<CartItem[]>('cart-items', () => [])
  const cartTotal = useState('cart-total', () => 0)
  const cartQuantity = useState('cart-quantity', () => 0)
  const isLoading = useState('cart-loading', () => false)
  const isSyncing = useState('cart-syncing', () => false)

  const { getActiveOrder, addToCart: vendureAddToCart, updateCartItem, removeFromCart: vendureRemoveFromCart, resetOrderToAddingItems } = useVendure()

  // LocalStorage key for cart backup
  const CART_STORAGE_KEY = 'purrfectplay-cart'

  // Save cart to localStorage (for session recovery)
  const saveToStorage = () => {
    if (import.meta.client && cartItems.value.length > 0) {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems.value))
    }
  }

  // Load cart from localStorage
  const loadFromStorage = (): CartItem[] => {
    if (import.meta.client) {
      const stored = localStorage.getItem(CART_STORAGE_KEY)
      if (stored) {
        try {
          return JSON.parse(stored)
        } catch {
          return []
        }
      }
    }
    return []
  }

  // Clear localStorage cart
  const clearStorage = () => {
    if (import.meta.client) {
      localStorage.removeItem(CART_STORAGE_KEY)
    }
  }

  // Sync cart with Vendure (background)
  // If session expired but we have local/stored cart items, recreate the order
  const syncCart = async () => {
    isSyncing.value = true
    try {
      const result = await getActiveOrder()
      if (result.activeOrder) {
        // Active Vendure session exists - sync from server
        cartItems.value = result.activeOrder.lines.map(line => ({
          id: line.id,
          variantId: line.productVariant.id,
          name: line.productVariant.product.name,
          variantName: line.productVariant.name,
          quantity: line.quantity,
          price: line.productVariant.priceWithTax,
          lineTotal: line.linePriceWithTax,
          image: line.productVariant.product.featuredAsset?.preview || line.productVariant.featuredAsset?.preview
        }))
        cartTotal.value = result.activeOrder.totalWithTax
        cartQuantity.value = result.activeOrder.totalQuantity
        saveToStorage() // Backup to localStorage
      } else {
        // No active order - check localStorage for items to restore
        const storedItems = loadFromStorage()
        const itemsToRestore = storedItems.length > 0 ? storedItems : [...cartItems.value]

        if (itemsToRestore.length > 0) {
          // Session expired but we have items - recreate the order
          console.log('Restoring cart session with', itemsToRestore.length, 'items')
          for (const item of itemsToRestore) {
            try {
              await vendureAddToCart(item.variantId, item.quantity)
            } catch (e) {
              console.error('Failed to restore item:', item.name, e)
            }
          }
          // Re-fetch the order to get real IDs
          const restored = await getActiveOrder()
          if (restored.activeOrder) {
            cartItems.value = restored.activeOrder.lines.map(line => ({
              id: line.id,
              variantId: line.productVariant.id,
              name: line.productVariant.product.name,
              variantName: line.productVariant.name,
              quantity: line.quantity,
              price: line.productVariant.priceWithTax,
              lineTotal: line.linePriceWithTax,
              image: line.productVariant.product.featuredAsset?.preview || line.productVariant.featuredAsset?.preview
            }))
            cartTotal.value = restored.activeOrder.totalWithTax
            cartQuantity.value = restored.activeOrder.totalQuantity
            saveToStorage() // Update localStorage with server data
          }
        } else {
          // No active order and no stored items - truly empty cart
          cartItems.value = []
          cartTotal.value = 0
          cartQuantity.value = 0
          clearStorage()
        }
      }
    } catch (error) {
      console.error('Failed to sync cart:', error)
    } finally {
      isSyncing.value = false
    }
  }

  // Add to cart with OPTIMISTIC update
  const addToCart = async (variantId: string, quantity: number = 1, productInfo?: { name: string; price: number; image?: string }) => {
    // OPTIMISTIC: Update UI immediately
    if (productInfo) {
      const existingIndex = cartItems.value.findIndex(item => item.variantId === variantId)
      if (existingIndex >= 0) {
        // Update existing item
        cartItems.value[existingIndex].quantity += quantity
        cartItems.value[existingIndex].lineTotal = cartItems.value[existingIndex].quantity * cartItems.value[existingIndex].price
      } else {
        // Add new item
        cartItems.value.push({
          id: `temp-${Date.now()}`, // Temporary ID
          variantId,
          name: productInfo.name,
          variantName: productInfo.name,
          quantity,
          price: productInfo.price,
          lineTotal: productInfo.price * quantity,
          image: productInfo.image
        })
      }
      // Update totals
      cartTotal.value = cartItems.value.reduce((sum, item) => sum + item.lineTotal, 0)
      cartQuantity.value = cartItems.value.reduce((sum, item) => sum + item.quantity, 0)
      // Save to localStorage immediately (for session recovery)
      saveToStorage()
    }

    // Open cart immediately
    isCartOpen.value = true

    // ASYNC: Sync with server in background
    try {
      const result = await vendureAddToCart(variantId, quantity)
      if ('id' in result.addItemToOrder) {
        // Sync to get real IDs and prices
        await syncCart()
        return { success: true }
      } else {
        const errorMessage = result.addItemToOrder.message
        // Check if order is stuck in non-AddingItems state (from abandoned checkout)
        if (errorMessage?.includes('AddingItems') || errorMessage?.includes('may only be modified')) {
          console.log('Order stuck in checkout state, resetting...')
          await resetOrderToAddingItems()
          // Retry the add to cart
          const retryResult = await vendureAddToCart(variantId, quantity)
          if ('id' in retryResult.addItemToOrder) {
            await syncCart()
            return { success: true }
          }
        }
        // Rollback on error
        await syncCart()
        return { success: false, error: errorMessage }
      }
    } catch (error) {
      console.error('Failed to add to cart:', error)
      // Check if error message indicates order state issue
      const errorMsg = error instanceof Error ? error.message : String(error)
      if (errorMsg.includes('AddingItems') || errorMsg.includes('may only be modified')) {
        try {
          console.log('Order stuck in checkout state, resetting...')
          await resetOrderToAddingItems()
          // Retry the add to cart
          const retryResult = await vendureAddToCart(variantId, quantity)
          if ('id' in retryResult.addItemToOrder) {
            await syncCart()
            return { success: true }
          }
        } catch (retryError) {
          console.error('Failed to reset and retry:', retryError)
        }
      }
      await syncCart() // Rollback
      return { success: false, error: 'Failed to add item to cart' }
    }
  }

  // Update quantity with OPTIMISTIC update
  const updateQuantity = async (lineId: string, quantity: number) => {
    // OPTIMISTIC: Update UI immediately
    const itemIndex = cartItems.value.findIndex(item => item.id === lineId)
    const previousQuantity = itemIndex >= 0 ? cartItems.value[itemIndex].quantity : 0

    if (itemIndex >= 0) {
      if (quantity <= 0) {
        // Remove item optimistically
        cartItems.value.splice(itemIndex, 1)
      } else {
        // Update quantity optimistically
        cartItems.value[itemIndex].quantity = quantity
        cartItems.value[itemIndex].lineTotal = cartItems.value[itemIndex].price * quantity
      }
      // Update totals
      cartTotal.value = cartItems.value.reduce((sum, item) => sum + item.lineTotal, 0)
      cartQuantity.value = cartItems.value.reduce((sum, item) => sum + item.quantity, 0)
    }

    // ASYNC: Sync with server
    try {
      if (quantity <= 0) {
        await vendureRemoveFromCart(lineId)
      } else {
        await updateCartItem(lineId, quantity)
      }
      await syncCart()
    } catch (error) {
      console.error('Failed to update quantity:', error)
      await syncCart() // Rollback
    }
  }

  // Remove from cart with OPTIMISTIC update
  const removeFromCart = async (lineId: string) => {
    // OPTIMISTIC: Remove immediately
    const itemIndex = cartItems.value.findIndex(item => item.id === lineId)
    const removedItem = itemIndex >= 0 ? cartItems.value[itemIndex] : null

    if (itemIndex >= 0) {
      cartItems.value.splice(itemIndex, 1)
      cartTotal.value = cartItems.value.reduce((sum, item) => sum + item.lineTotal, 0)
      cartQuantity.value = cartItems.value.reduce((sum, item) => sum + item.quantity, 0)
    }

    // ASYNC: Sync with server
    try {
      await vendureRemoveFromCart(lineId)
      await syncCart()
    } catch (error) {
      console.error('Failed to remove from cart:', error)
      // Rollback
      if (removedItem) {
        cartItems.value.push(removedItem)
        cartTotal.value = cartItems.value.reduce((sum, item) => sum + item.lineTotal, 0)
        cartQuantity.value = cartItems.value.reduce((sum, item) => sum + item.quantity, 0)
      }
    }
  }

  // Toggle cart
  const toggleCart = () => {
    isCartOpen.value = !isCartOpen.value
  }

  const openCart = () => {
    isCartOpen.value = true
  }

  const closeCart = () => {
    isCartOpen.value = false
  }

  return {
    isCartOpen,
    cartItems,
    cartTotal,
    cartQuantity,
    isLoading,
    isSyncing,
    syncCart,
    addToCart,
    updateQuantity,
    removeFromCart,
    toggleCart,
    openCart,
    closeCart,
    clearStorage // Export to clear after order completion
  }
}

interface CartItem {
  id: string
  variantId: string
  name: string
  variantName: string
  quantity: number
  price: number
  lineTotal: number
  image?: string
}
