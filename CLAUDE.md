# CatioHaven - One-Page Product Storefront

## Project Overview

A premium one-page product storefront for the CatioHaven outdoor cat enclosure. Built with Nuxt 4 + Nuxt UI v4 frontend and Vendure headless commerce backend.

**Product:** Premium multi-level outdoor cat enclosure with mesh walls, tunnels, and climbing platforms.

## Tech Stack

- **Frontend:** Nuxt 4 + Nuxt UI v4 + TypeScript
- **Backend:** Vendure 3.x (headless commerce)
- **Database:** SQLite (dev) / PostgreSQL (prod)
- **Deployment:** Single Docker container, Railway-ready
- **Runtime:** Bun 1.3.5 (located at `~/.bun/bin/bun`)

## Project Structure

```
one-page-pet-init/
├── storefront/          # Nuxt 4 frontend
│   ├── app/
│   │   ├── pages/       # Landing page
│   │   ├── components/  # UI components
│   │   ├── composables/ # Vendure API hooks
│   │   └── assets/      # Styles
│   ├── server/          # Nuxt server routes
│   └── nuxt.config.ts
├── vendure/             # Vendure commerce backend
│   ├── src/
│   │   ├── vendure-config.ts
│   │   └── migrations/
│   └── static/
├── Dockerfile           # Unified container
├── docker-compose.yml   # Local dev & prod
└── CLAUDE.md
```

## Critical Development Rules

### Pre-Commit Requirements

**ALL checks must pass before commits. No exceptions.**

```bash
pnpm lint       # ESLint must pass
pnpm typecheck  # TypeScript must pass
```

### TypeScript Strictness

- `strict: true` is mandatory
- No `any` types without explicit justification
- All function parameters and returns must be typed

## Architecture

### Nuxt → Vendure Proxy

Nuxt proxies all Vendure endpoints via Nitro:

| Route | Target |
|-------|--------|
| `/shop-api` | Vendure Shop GraphQL API |
| `/admin-api` | Vendure Admin GraphQL API |
| `/dashboard` | Vendure Admin Dashboard |
| `/assets` | Product images/assets |

**nuxt.config.ts:**
```typescript
nitro: {
  devProxy: {
    '/shop-api': { target: 'http://localhost:3000/shop-api' },
    '/admin-api': { target: 'http://localhost:3000/admin-api' },
    '/dashboard': { target: 'http://localhost:3000/dashboard' },
    '/assets': { target: 'http://localhost:3000/assets' }
  }
}
```

### Vendure GraphQL API

**Shop API Queries:**
```graphql
# Get product by slug
query GetProduct($slug: String!) {
  product(slug: $slug) {
    id
    name
    description
    variants {
      id
      name
      price
      stockLevel
    }
    featuredAsset {
      preview
    }
  }
}

# Add to cart
mutation AddToCart($productVariantId: ID!, $quantity: Int!) {
  addItemToOrder(productVariantId: $productVariantId, quantity: $quantity) {
    ... on Order {
      id
      totalWithTax
      lines {
        productVariant { name }
        quantity
      }
    }
  }
}
```

## Design System

### Colors (app.config.ts)

```typescript
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'teal',    // Brand accent (matches product tunnels)
      neutral: 'zinc'     // Dark sophisticated base
    }
  }
})
```

### Typography

- **Display:** Fraunces (serif, elegant)
- **Body:** DM Sans (clean, readable)

### Design Philosophy

This is a **premium product page** - not generic e-commerce. Design rules:

1. **Dark theme** - Luxurious, sophisticated
2. **Teal accents** - Match the product's teal tunnels
3. **Large typography** - Headlines command attention
4. **Generous whitespace** - Let content breathe
5. **Subtle animations** - Hover states, transitions
6. **Social proof** - Reviews, stats, trust badges

### NO AI SLOP

- No generic gradients (purple/blue defaults)
- No Inter/Roboto fonts
- No cookie-cutter layouts
- Every design choice must be intentional

## Nuxt UI v4 Rules

### Component Names (v2 → v4)

| Old | New |
|-----|-----|
| `UDivider` | `USeparator` |
| `UDropdown` | `UDropdownMenu` |
| `UFormGroup` | `UFormField` |
| `UToggle` | `USwitch` |

### Prop Changes

- `options` → `items` (USelect, etc.)
- `timeout` → `duration` (toast)
- `click` → `onClick` in item objects

### Semantic Colors

```vue
<!-- Good -->
<UButton color="primary">Add to Cart</UButton>
<p class="text-muted">Limited stock</p>

<!-- Bad -->
<UButton color="teal">Add to Cart</UButton>
<p class="text-zinc-500">Limited stock</p>
```

### Design Tokens

- Text: `text-dimmed`, `text-muted`, `text-default`, `text-highlighted`
- Background: `bg-default`, `bg-muted`, `bg-elevated`
- Border: `border-default`, `border-muted`

## Development

### Local Development

```bash
# Install dependencies
cd storefront && pnpm install
cd ../vendure && npm install

# Start both services (from root)
npm run dev

# Or start individually
npm run dev:vendure    # Port 3000 (internal)
npm run dev:storefront # Port 3015 (main app)

# For full dashboard dev mode, also run:
cd vendure && npm run dev:dashboard  # Vite HMR for dashboard
```

### Ports

| Service | Port |
|---------|------|
| Nuxt Storefront | 3015 |
| Vendure API (internal) | 3000 |
| Vendure Dashboard (proxied) | 3015/dashboard |
| Shop API (proxied) | 3015/shop-api |
| GraphiQL (proxied) | 3015/graphiql/shop |
| PostgreSQL (prod) | 5432 |

**All Vendure endpoints are proxied through Nuxt on port 3015.**

### Environment Variables

**storefront/.env:**
```bash
VENDURE_API_URL=http://localhost:3000
```

**vendure/.env:**
```bash
APP_ENV=dev
SUPERADMIN_USERNAME=superadmin
SUPERADMIN_PASSWORD=superadmin123
COOKIE_SECRET=your-secret-here
DATABASE_URL=postgres://... # Production only
```

## Deployment

### Docker (Single Container)

The Dockerfile creates a unified container running both Nuxt and Vendure:

```bash
# Build
docker build -t catiohaven .

# Run
docker run -p 6000:6000 catiohaven
```

### Docker Compose

```bash
# Production-like local
docker-compose up -d

# Development with hot reload
docker-compose --profile dev up
```

### Railway Deployment

1. Connect GitHub repo
2. Set root directory: `/one-page-pet-init`
3. Railway auto-detects Dockerfile
4. Add environment variables:
   - `DATABASE_URL` (use Railway Postgres)
   - `SUPERADMIN_USERNAME`
   - `SUPERADMIN_PASSWORD`
   - `COOKIE_SECRET`

### Health Check

The container exposes `/health` endpoint for monitoring.

## Vendure Admin

Access at: `http://localhost:6000/dashboard` (proxied through Nuxt)

**Default credentials:**
- Username: `superadmin`
- Password: `superadmin123`

### Product Setup

1. Go to Dashboard → Catalog → Products
2. Create "CatioHaven Outdoor Enclosure"
3. Add variants (if applicable)
4. Upload product images
5. Set price ($299)

## API Integration

### Composables

```typescript
// composables/useVendure.ts
export const useVendure = () => {
  const config = useRuntimeConfig()

  const query = async <T>(gql: string, variables?: Record<string, any>): Promise<T> => {
    return await $fetch('/shop-api', {
      method: 'POST',
      body: { query: gql, variables }
    })
  }

  return { query }
}
```

### Example Usage

```vue
<script setup lang="ts">
const { query } = useVendure()

const { data: product } = await useAsyncData('product', () =>
  query<{ product: Product }>(`
    query {
      product(slug: "catiohaven") {
        name
        description
        variants { price }
      }
    }
  `)
)
</script>
```

## Commands Reference

```bash
# Development
npm run dev              # Both services
npm run dev:vendure      # Vendure only
npm run dev:storefront   # Nuxt only

# Build
npm run build            # Build all
npm run build:vendure    # Vendure only
npm run build:storefront # Nuxt only

# Docker
npm run docker:build     # Build image
npm run docker:run       # Run container
npm run docker:up        # Docker compose up
npm run docker:down      # Docker compose down

# Quality
pnpm lint               # ESLint
pnpm typecheck          # TypeScript
```

## Testing Checklist

Before deployment:
- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes
- [ ] Product displays correctly
- [ ] Add to cart works
- [ ] Checkout flow works
- [ ] Mobile responsive
- [ ] Dark mode consistent
- [ ] Vendure dashboard accessible

## Browser Testing

Use the Dev Browser plugin for automation testing:

```bash
# Test credentials (if needed)
Email: test@catiohaven.com
Password: TestCatio123!
```

## Future Enhancements

- [ ] Stripe/PayPal integration
- [ ] Email notifications
- [ ] Inventory tracking
- [ ] Order management dashboard
- [ ] Customer reviews integration
- [ ] Multi-variant support (sizes)
