// @targets js
// @expect pass

export async function main(): Promise<void> {
  const response = await fetch('data:text/plain,hello')
  const text = await response.text()

  await new Promise(resolve => setTimeout(resolve, 1))
  console.log(text)
}
