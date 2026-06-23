// @targets c
// @expect pass
// @stdout diag:boom

const message = await Promise.reject(new Error('boom')).catch((error) => `diag:${error.message}`)
console.log(message)
