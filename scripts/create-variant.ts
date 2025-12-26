const ADMIN_API = 'https://catiohaven-store.fly.dev/admin-api';

async function adminQuery(query: string, variables?: any, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(ADMIN_API, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  const result = await response.json() as any;
  const authToken = response.headers.get('vendure-auth-token');
  if (result.errors?.length) throw new Error(result.errors[0].message);
  return { data: result.data, token: authToken };
}

async function main() {
  // Login
  const login = await adminQuery(`
    mutation { login(username: "superadmin", password: "superadmin123") { ... on CurrentUser { id } } }
  `);
  const token = login.token;
  console.log('Logged in');

  // Check if we have a country
  const countries = await adminQuery(`
    query { countries { items { id code name enabled } } }
  `, null, token);
  console.log('Countries:', countries.data.countries.items.length, 'found');

  // Enable US country if not enabled
  const usCountry = countries.data.countries.items.find((c: any) => c.code === 'US');
  if (usCountry && !usCountry.enabled) {
    console.log('Enabling US country...');
    await adminQuery(`
      mutation { updateCountry(input: { id: "${usCountry.id}", enabled: true }) { id } }
    `, null, token);
  }

  // Check for zones
  const zones = await adminQuery(`
    query { zones { items { id name } } }
  `, null, token);
  console.log('Zones:', zones.data.zones.items);

  let zoneId = zones.data.zones.items[0]?.id;
  if (!zoneId) {
    // Create a zone
    console.log('Creating zone...');
    const zone = await adminQuery(`
      mutation { createZone(input: { name: "US Zone", memberIds: ["${usCountry?.id || '1'}"] }) { id name } }
    `, null, token);
    zoneId = zone.data.createZone.id;
    console.log('Created zone:', zoneId);
  }

  // Check for tax rates
  const taxRates = await adminQuery(`
    query { taxRates { items { id name value } } }
  `, null, token);
  console.log('Tax rates:', taxRates.data.taxRates.items);

  if (taxRates.data.taxRates.items.length === 0) {
    // Need a tax category first
    const taxCategories = await adminQuery(`
      query { taxCategories { items { id name } } }
    `, null, token);

    let taxCategoryId = taxCategories.data.taxCategories.items[0]?.id;
    if (!taxCategoryId) {
      console.log('Creating tax category...');
      const taxCat = await adminQuery(`
        mutation { createTaxCategory(input: { name: "Standard" }) { id } }
      `, null, token);
      taxCategoryId = taxCat.data.createTaxCategory.id;
    }

    // Create tax rate
    console.log('Creating tax rate...');
    await adminQuery(`
      mutation { createTaxRate(input: { name: "No Tax", value: 0, categoryId: "${taxCategoryId}", zoneId: "${zoneId}", enabled: true }) { id } }
    `, null, token);
  }

  // Update channel to have default tax zone
  const channels = await adminQuery(`
    query { channels { items { id code defaultTaxZone { id } } } }
  `, null, token);
  console.log('Channels:', channels.data.channels.items);

  const defaultChannel = channels.data.channels.items.find((c: any) => c.code === '__default_channel__');
  if (defaultChannel && !defaultChannel.defaultTaxZone) {
    console.log('Setting default tax zone on channel...');
    await adminQuery(`
      mutation { updateChannel(input: { id: "${defaultChannel.id}", defaultTaxZoneId: "${zoneId}" }) { ... on Channel { id } } }
    `, null, token);
    console.log('Updated channel with default tax zone');
  }

  // Check variants
  const products = await adminQuery(`
    query { products { items { id name variants { id name priceWithTax } } } }
  `, null, token);
  console.log('Products:', JSON.stringify(products.data, null, 2));

  const product = products.data.products.items[0];
  if (product && product.variants.length === 0) {
    console.log('Creating variant...');
    const variant = await adminQuery(`
      mutation {
        createProductVariants(input: [{
          productId: "1"
          sku: "PURRFECT-TENT-001"
          price: 1799
          translations: [{ languageCode: en, name: "Standard Set" }]
          stockOnHand: 1000
          trackInventory: TRUE
        }]) { id name priceWithTax }
      }
    `, null, token);
    console.log('Created variant:', variant.data);
  } else if (product?.variants?.length > 0) {
    console.log('Variant already exists:', product.variants);
  }
}

main().catch(console.error);
