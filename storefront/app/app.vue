<script setup lang="ts">
useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { name: 'theme-color', content: '#f97316' },
    { name: 'robots', content: 'index, follow' },
    { name: 'author', content: 'PurrfectPlay' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' },
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Nunito:ital,wght@0,200..1000;1,200..1000&family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap' }
  ],
  htmlAttrs: {
    lang: 'en'
  }
})

const title = 'PurrfectPlay™ Pop-Up Cat Tent & Tunnel | #1 Outdoor Cat Enclosure 2024'
const description = 'Give your cat safe outdoor adventures with the PurrfectPlay™ 2-in-1 Pop-Up Tent & Tunnel Set. Breathable mesh, instant setup, portable design. Free shipping. 30-day returns. Shop now!'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  ogType: 'product',
  ogSiteName: 'PurrfectPlay',
  twitterCard: 'summary_large_image',
  twitterTitle: title,
  twitterDescription: description
})

// JSON-LD structured data for SEO
useHead({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: 'PurrfectPlay™ Pop-Up Cat Tent & Tunnel Set',
        description: 'Premium 2-in-1 pop-up cat tent with attached tunnel for safe indoor/outdoor adventures. Features breathable mesh design, instant pop-up setup, and compact portable storage.',
        brand: { '@type': 'Brand', name: 'PurrfectPlay' },
        offers: {
          '@type': 'Offer',
          price: '49.99',
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
          seller: { '@type': 'Organization', name: 'PurrfectPlay' }
        },
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: '4.9',
          reviewCount: '847'
        }
      })
    }
  ]
})
</script>

<template>
  <UApp>
    <UMain class="min-h-screen">
      <NuxtPage />
    </UMain>
  </UApp>
</template>

<style>
:root {
  --font-display: 'Playfair Display', serif;
  --font-body: 'Nunito', sans-serif;
}

body {
  font-family: var(--font-body);
}

h1, h2, h3, .font-display {
  font-family: var(--font-display);
}
</style>
