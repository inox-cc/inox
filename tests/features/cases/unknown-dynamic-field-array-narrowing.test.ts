// @targets cc
// @expect pass
// @stdout done

type AnyNode = { [key: string]: any }

function visit(node: AnyNode): void {
  const values: unknown = node.values

  if (Array.isArray(values)) {
    console.log(values.length)
  }

  console.log('done')
}

visit({})
