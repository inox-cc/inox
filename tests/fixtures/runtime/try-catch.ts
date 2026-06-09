// @targets js,c
// @expect pass

export function main(): void {
  try {
    throw 'boom'
  } catch (error) {
    console.log(`caught ${error}`)
  } finally {
    console.log('finally')
  }
}
