// @targets js
// @expect pass

export function main(): void {
  try {
    throw new Error('boom')
  } catch (error) {
    console.log(error.message)
  }
}
