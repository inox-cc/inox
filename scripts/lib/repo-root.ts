import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const rootDir = resolve(fileURLToPath(new URL('../../', import.meta.url)))
