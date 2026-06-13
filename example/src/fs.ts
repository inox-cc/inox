import fs from 'node:fs'

export async function fsTest(): Promise<void> {
  await fs.promises.writeFile('./test.txt', 'Hello World!')
  const data = await fs.promises.readFile('./test.txt', 'utf8')

  console.log(data)
}
