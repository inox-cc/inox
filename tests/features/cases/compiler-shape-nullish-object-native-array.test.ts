// @targets cc
// @expect pass
// @stdout ok

const fallback = true ? { label: 'object' } : null
const value = fallback ?? ['array']

value
console.log('ok')
