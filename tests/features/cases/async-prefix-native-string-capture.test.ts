// @targets cc
// @expect pass
// @stdout path-1 path-1/file

async function readPaths(): Promise<void> {
  const root = `path-${1}`
  const file = `${root}/file`

  await Promise.resolve()
  console.log(root, file)
}

await readPaths()
