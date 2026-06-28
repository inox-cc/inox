// @targets cc
// @expect pass
// @stdout fallback

const inferred = 'fallback'
const declared: string | null = null
const value = inferred === 'function' ? 'function' : declared ?? inferred

console.log(value)
