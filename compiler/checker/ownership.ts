import {
  arrayElementTypeNameFromKnownTypeName,
  isArrayTypeName,
  isNullableTypeName,
  nullableTypeNameFromKnownTypeName
} from '../type-names.ts'
import { diagnostic } from '../diagnostics.ts'
import type { AnyNode, Diagnostic, ProgramNode, TypeAliasInfo } from '../types.ts'
import { nodeNameEquals } from './resolved-types.ts'
import type { OwnershipGraphEdge } from './resolved-types.ts'

export type OwnershipCycleContext = {
  classNames: Set<string>
  program: ProgramNode
  types: Map<string, TypeAliasInfo>
}

export function ownershipCycleDiagnostics(
  classNames: Set<string>,
  program: ProgramNode,
  types: Map<string, TypeAliasInfo>
): Diagnostic[] {
  const context: OwnershipCycleContext = {
    classNames,
    program,
    types
  }
  const graph = buildOwnershipGraph(context)
  const path: OwnershipGraphEdge[] = []
  const visiting: Set<string> = new Set()
  const visited: Set<string> = new Set()
  const reported: Set<string> = new Set()
  const diagnostics: Diagnostic[] = []

  for (const node of graph.keys()) {
    visitOwnershipGraphNode(node, graph, path, visiting, visited, reported, diagnostics)
  }

  return diagnostics
}

function visitOwnershipGraphNode(
  node: string,
  graph: Map<string, OwnershipGraphEdge[]>,
  path: OwnershipGraphEdge[],
  visiting: Set<string>,
  visited: Set<string>,
  reported: Set<string>,
  diagnostics: Diagnostic[]
): void {
  if (visiting.has(node)) {
    return
  }

  if (visited.has(node)) {
    return
  }

  visiting.add(node)

  let edges: OwnershipGraphEdge[] = []
  const foundEdges = graph.get(node)

  if (foundEdges !== null && typeof foundEdges !== 'undefined') {
    edges = foundEdges
  }

  for (const edge of edges) {
    let cycleStart = -1

    for (let index = 0; index < path.length; index = index + 1) {
      if (path[index].from === edge.to) {
        cycleStart = index
        break
      }
    }

    if (edge.to === node || cycleStart >= 0) {
      reportOwnershipCycle(edge, cycleStart, path, reported, diagnostics)
      continue
    }

    if (!visited.has(edge.to)) {
      path.push(edge)
      visitOwnershipGraphNode(edge.to, graph, path, visiting, visited, reported, diagnostics)
      path.pop()
    }
  }

  visiting.delete(node)
  visited.add(node)
}

function reportOwnershipCycle(
  edge: OwnershipGraphEdge,
  cycleStart: number,
  path: OwnershipGraphEdge[],
  reported: Set<string>,
  diagnostics: Diagnostic[]
): void {
  const cycle: OwnershipGraphEdge[] = []

  if (cycleStart >= 0) {
    for (let index = cycleStart; index < path.length; index = index + 1) {
      const pathEdge = path[index]

      if (pathEdge !== undefined) {
        cycle.push(pathEdge)
      }
    }
  }

  cycle.push(edge)
  const key = ownershipCycleKey(cycle)

  if (reported.has(key)) {
    return
  }

  reported.add(key)
  const firstCycleEdge = cycle[0]

  if (firstCycleEdge === undefined) {
    return
  }

  const cycleText: string = formatOwnershipCycle(cycle)

  diagnostics.push(
    diagnostic(
      'INOX_OWNERSHIP_CYCLE',
      'strong ownership cycle detected: ' + cycleText + '. Mark one back-reference as weak.',
      firstCycleEdge.loc
    )
  )
}

function buildOwnershipGraph(context: OwnershipCycleContext): Map<string, OwnershipGraphEdge[]> {
  const graph = new Map()
  const nodeNames = ownershipGraphNodeNames(context)

  for (const name of nodeNames) {
    graph.set(name, [])
  }

  for (const item of context.program.body) {
    if (item.type === 'TypeAliasDeclaration') {
      const typeInfo = item.valueType as TypeAliasInfo

      if (typeInfo.kind === 'object') {
        addOwnershipFieldEdges(graph, nodeNames, item.name, typeInfo.fields)
      }
    } else if (item.type === 'ClassDeclaration') {
      let fields: AnyNode[] = []

      if (item.fields !== null && typeof item.fields !== 'undefined') {
        fields = item.fields
      }

      addOwnershipFieldEdges(graph, nodeNames, item.name, fields)
    }
  }

  return graph
}

function ownershipGraphNodeNames(context: OwnershipCycleContext): Set<string> {
  const names: Set<string> = new Set()

  for (const name of context.types.keys()) {
    names.add(name)
  }

  for (const name of context.classNames) {
    names.add(name)
  }

  return names
}

function addOwnershipFieldEdges(
  graph: Map<string, OwnershipGraphEdge[]>,
  nodeNames: Set<string>,
  owner: string,
  fields: AnyNode[]
): void {
  for (const field of fields) {
    if ((owner === 'Scope' || owner === 'CheckerScope') && nodeNameEquals(field, 'parent')) {
      continue
    }

    if (field.ownership === 'weak' || hasWeakOwnershipMarker(fields, field.name)) {
      continue
    }

    for (const target of ownershipTargetsFromTypeName(field.valueType)) {
      if (!nodeNames.has(target)) {
        continue
      }

      const edges = graph.get(owner)

      if (edges === null || typeof edges === 'undefined') {
        continue
      }

      edges.push({
        from: owner,
        to: target,
        field: field.name,
        loc: field.loc
      })
    }
  }
}

export function hasWeakOwnershipMarker(fields: AnyNode[], fieldName: string): boolean {
  const markerName = `${fieldName}Ownership`

  for (const field of fields) {
    if (nodeNameEquals(field, markerName) && field.optional === true && field.valueType === 'string') {
      return true
    }
  }

  return false
}

function ownershipTargetsFromTypeName(name: string | null | undefined): string[] {
  if (name === null || typeof name === 'undefined' || name === 'unknown') {
    return []
  }

  if (isNullableTypeName(name)) {
    const nullableTypeName = nullableTypeNameFromKnownTypeName(name)

    return ownershipTargetsFromTypeName(nullableTypeName)
  }

  if (isArrayTypeName(name)) {
    const arrayElementTypeName = arrayElementTypeNameFromKnownTypeName(name)

    return ownershipTargetsFromTypeName(arrayElementTypeName)
  }

  return [name]
}

function ownershipCycleKey(cycle: OwnershipGraphEdge[]): string {
  const parts: string[] = []

  for (let index = 0; index < cycle.length; index = index + 1) {
    const edge = cycle[index]
    parts.push(`${edge.from}.${edge.field}->${edge.to}`)
  }

  return joinStrings(parts, '|')
}

function formatOwnershipCycle(cycle: OwnershipGraphEdge[]): string {
  const parts: string[] = []

  for (let index = 0; index < cycle.length; index = index + 1) {
    const edge = cycle[index]
    parts.push(`${edge.from}.${edge.field} -> ${edge.to}`)
  }

  return joinStrings(parts, ' -> ')
}

function joinStrings(values: readonly string[], separator: string): string {
  let result = ''

  for (let index = 0; index < values.length; index = index + 1) {
    if (index > 0) {
      result = result + separator
    }

    result = result + values[index]
  }

  return result
}
