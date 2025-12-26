export default defineNuxtPlugin((nuxtApp) => {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible')
        observer.unobserve(entry.target)
      }
    })
  }, {
    threshold: 0.1,
    rootMargin: '50px'
  })

  nuxtApp.vueApp.directive('animate', {
    mounted(el, binding) {
      el.classList.add('scroll-transition')
      
      const animationType = binding.arg || 'fade-up'
      el.classList.add(`anim-${animationType}`)
      
      if (binding.value) {
        if (typeof binding.value === 'number') {
           el.style.transitionDelay = `${binding.value}ms`
        } else if (typeof binding.value === 'object' && binding.value.delay) {
           el.style.transitionDelay = `${binding.value.delay}ms`
        }
      }

      observer.observe(el)
    },
    unmounted(el) {
      observer.unobserve(el)
    }
  })
})
