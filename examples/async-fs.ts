// @targets c
// @expect pass
// @stdout async fs

async function load(path: string): Promise<string> {
  await fs.writeFile(path, 'async fs')
  return fs.readFile(path, 'utf8')
}

const text = await load('/tmp/ccjs-example-async-fs.txt')
console.log(text)
