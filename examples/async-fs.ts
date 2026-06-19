// @targets c
// @expect pass
// @stdout async fs

import fs from 'node:fs'

async function load(path: string): Promise<string> {
  await fs.promises.writeFile(path, 'async fs')
  return fs.promises.readFile(path, 'utf8')
}

const text = await load('/tmp/inox-example-async-fs.txt')
console.log(text)
