#!/usr/bin/env npx tsx
/**
 * Seed script for production database
 * Run: npx tsx scripts/seed-production.ts
 */

const ADMIN_API = process.env.ADMIN_API_URL || 'https://catiohaven-store.fly.dev/admin-api';
const ADMIN_USER = process.env.SUPERADMIN_USERNAME || 'superadmin';
const ADMIN_PASS = process.env.SUPERADMIN_PASSWORD || 'superadmin123';

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

async function adminQuery<T>(query: string, variables?: Record<string, unknown>, token?: string): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(ADMIN_API, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  const result = await response.json() as GraphQLResponse<T>;

  // Check for auth token in response
  const authToken = response.headers.get('vendure-auth-token');
  if (authToken) {
    console.log('Received auth token');
    return { ...result.data!, __token: authToken } as T;
  }

  if (result.errors?.length) {
    throw new Error(result.errors[0].message);
  }
  return result.data!;
}

async function main() {
  console.log('Seeding production database...');
  console.log('Admin API:', ADMIN_API);

  // 1. Login to admin
  console.log('\n1. Logging in as admin...');
  const loginResult = await adminQuery<{ login: { __typename: string; id?: string; message?: string }; __token?: string }>(`
    mutation Login($username: String!, $password: String!) {
      login(username: $username, password: $password) {
        ... on CurrentUser {
          id
        }
        ... on InvalidCredentialsError {
          message
        }
      }
    }
  `, { username: ADMIN_USER, password: ADMIN_PASS });

  if (loginResult.login.__typename === 'InvalidCredentialsError') {
    throw new Error('Invalid credentials: ' + loginResult.login.message);
  }
  console.log('Logged in successfully');
  const token = (loginResult as any).__token;

  // 2. Check if product already exists
  console.log('\n2. Checking for existing products...');
  const productsResult = await adminQuery<{ products: { totalItems: number; items: Array<{ id: string; name: string }> } }>(`
    query {
      products {
        totalItems
        items { id name }
      }
    }
  `, undefined, token);

  if (productsResult.products.totalItems > 0) {
    console.log('Products already exist:', productsResult.products.items.map(p => p.name));
    return;
  }

  // 3. Create shipping method
  console.log('\n3. Creating shipping method...');
  const shippingResult = await adminQuery<{ createShippingMethod: { id: string } }>(`
    mutation {
      createShippingMethod(input: {
        code: "free-shipping"
        checker: { code: "default-shipping-eligibility-checker", arguments: [] }
        calculator: { code: "default-shipping-calculator", arguments: [{ name: "rate", value: "0" }, { name: "includesTax", value: "auto" }] }
        fulfillmentHandler: "manual-fulfillment"
        translations: [{ languageCode: en, name: "Free Shipping", description: "Free standard shipping" }]
      }) { id }
    }
  `, undefined, token);
  console.log('Created shipping method:', shippingResult.createShippingMethod.id);

  // 4. Create product
  console.log('\n4. Creating product...');
  const createProductResult = await adminQuery<{ createProduct: { id: string } }>(`
    mutation CreateProduct {
      createProduct(input: {
        translations: [{
          languageCode: en
          name: "PurrfectPlay Pop-Up Cat Tent & Tunnel Set"
          slug: "purrfectplay-cat-tent-tunnel"
          description: "The ultimate safe outdoor adventure set for your indoor cat! Features a 24\\" x 24\\" x 24\\" pop-up tent connected to a 47\\" extendable tunnel. Spring-loaded frame sets up in just 5 seconds. 100% escape-proof breathable mesh keeps your cat secure while enjoying fresh air. Includes tent, tunnel, compact carry bag, and 4 ground stakes. Perfect for backyard, park, camping, or apartment balconies. Max cat weight: 25 lbs."
        }]
        enabled: true
      }) {
        id
      }
    }
  `, undefined, token);
  const productId = createProductResult.createProduct.id;
  console.log('Created product with ID:', productId);

  // 5. Create product variant
  console.log('\n5. Creating product variant...');
  const createVariantResult = await adminQuery<{ createProductVariants: Array<{ id: string }> }>(`
    mutation CreateVariant($productId: ID!) {
      createProductVariants(input: [{
        productId: $productId
        sku: "PURRFECT-TENT-001"
        price: 1799
        translations: [{ languageCode: en, name: "Standard Set" }]
        stockOnHand: 1000
        trackInventory: TRUE
      }]) {
        id
      }
    }
  `, { productId }, token);
  console.log('Created variant:', createVariantResult.createProductVariants[0].id);

  // 6. Add product to channel (make it visible)
  console.log('\n6. Assigning product to default channel...');
  await adminQuery(`
    mutation AssignToChannel($productId: ID!) {
      assignProductsToChannel(input: { productIds: [$productId], channelId: "1" }) {
        id
      }
    }
  `, { productId }, token);
  console.log('Assigned to channel');

  console.log('\n✅ Production database seeded successfully!');
}

main().catch(console.error);
