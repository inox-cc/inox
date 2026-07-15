// @targets cc
// @expect pass
// @stdout 7

type OptionalLocation = {
  line: number
}

type NodeWithOptionalLocation = AnyNode & {
  loc?: OptionalLocation
}

type ProgramWithNodes = AnyNode & {
  body: AnyNode[]
}

function locationLine(program: ProgramWithNodes): number {
  const node: NodeWithOptionalLocation = program.body[0]
  const loc = node.loc

  if (loc === null || typeof loc === 'undefined') {
    return 7
  }

  return loc.line
}

console.log(locationLine({ body: [{ type: 'Identifier' }] }))
