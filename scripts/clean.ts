import { rm } from 'node:fs/promises'

async function clean(path: string): Promise<void> {
  await rm(path, {
    force: true,
    recursive: true
  })
}

await clean('coverage')
await clean('dist')
