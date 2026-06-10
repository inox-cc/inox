import { join } from 'node:path'
import { compileSource } from '../src/compiler/index.ts'
import type { AnyNode, ProgramNode, SourceLocation } from '../src/compiler/types.ts'
import { rootDir } from './lib/repo-checks.ts'
import { runSnapshotSuite } from './lib/snapshot-runner.ts'

type HirSnapshot = {
  type: string
  body: SnapshotNode[]
}

type SnapshotNode = {
  type: string
  loc?: SourceLocation
  name?: string
  exported?: boolean
  async?: boolean
  kind?: string
  value?: string | number | boolean | null | SnapshotNode
  raw?: string
  path?: string[]
  property?: string
  operator?: string
  declaredType?: string
  valueType?: string
  nullable?: boolean
  arrayElementType?: string | null
  arrayElementDeclaredType?: string | null
  mapKeyType?: string | null
  mapValueType?: string | null
  setElementType?: string | null
  declaredReturnType?: string
  returnType?: string
  returnNullable?: boolean
  params?: SnapshotNode[]
  fields?: SnapshotField[]
  properties?: Array<{
    key: string
    value: SnapshotNode
    loc?: SourceLocation
  }>
  declarations?: SnapshotNode[]
  body?: SnapshotNode[]
  expression?: SnapshotNode
  init?: SnapshotNode | null
  callee?: SnapshotNode
  object?: SnapshotNode
  args?: SnapshotNode[]
  left?: SnapshotNode
  right?: SnapshotNode
  condition?: SnapshotNode
  consequent?: SnapshotNode
  alternate?: SnapshotNode
  iterable?: SnapshotNode
  elements?: SnapshotNode[]
  target?: SnapshotNode
  argument?: SnapshotNode
}

type SnapshotField = {
  name: string
  readonly?: boolean
  declaredType?: string
  valueType?: string
  nullable?: boolean
  arrayElementType?: string | null
  mapKeyType?: string | null
  mapValueType?: string | null
  setElementType?: string | null
  loc?: SourceLocation
}

const snapshotRoot = join(rootDir, 'tests/snapshots/hir')
const update = process.argv.includes('--update')

await runSnapshotSuite({
  title: 'HIR snapshot checks',
  root: snapshotRoot,
  sourceSuffix: '.ts',
  update,
  updateCommand: 'node scripts/test-hir-snapshots.ts --update',
  createOutputs: ({ path, source }) => {
    const hir = compileSource(source, {
      target: 'ts',
      callMain: false
    }).hir

    return [{
      path: path.replace(/\.ts$/, '.hir.json'),
      content: `${JSON.stringify(createHirSnapshot(hir), null, 2)}\n`
    }]
  }
})

function createHirSnapshot(hir: ProgramNode): HirSnapshot {
  return {
    type: String(hir.type ?? '<unknown>'),
    body: hir.body.map(snapshotNode)
  }
}

function snapshotNode(node: AnyNode): SnapshotNode {
  return withLocation({
    type: String(node.type ?? '<unknown>'),
    ...snapshotScalarFields(node),
    ...snapshotTypeFields(node),
    ...snapshotChildren(node)
  }, node.loc)
}

function snapshotScalarFields(node: AnyNode): Partial<SnapshotNode> {
  return {
    ...(typeof node.name !== 'string' ? {} : { name: node.name }),
    ...(typeof node.exported !== 'boolean' ? {} : { exported: node.exported }),
    ...(typeof node.async !== 'boolean' ? {} : { async: node.async }),
    ...(typeof node.kind !== 'string' ? {} : { kind: node.kind }),
    ...(!isSnapshotScalar(node.value) ? {} : { value: node.value }),
    ...(typeof node.raw !== 'string' ? {} : { raw: node.raw }),
    ...(Array.isArray(node.path) ? { path: node.path.map(String) } : {}),
    ...(typeof node.property !== 'string' ? {} : { property: node.property }),
    ...(typeof node.operator !== 'string' ? {} : { operator: node.operator })
  }
}

function snapshotTypeFields(node: AnyNode): Partial<SnapshotNode> {
  return {
    ...(node.declaredType == null ? {} : { declaredType: String(node.declaredType) }),
    ...(typeof node.valueType !== 'string' ? {} : { valueType: node.valueType }),
    ...(node.nullable == null ? {} : { nullable: Boolean(node.nullable) }),
    ...(node.arrayElementType == null ? {} : { arrayElementType: stringOrNull(node.arrayElementType) }),
    ...(node.arrayElementDeclaredType == null ? {} : { arrayElementDeclaredType: stringOrNull(node.arrayElementDeclaredType) }),
    ...(node.mapKeyType == null ? {} : { mapKeyType: stringOrNull(node.mapKeyType) }),
    ...(node.mapValueType == null ? {} : { mapValueType: stringOrNull(node.mapValueType) }),
    ...(node.setElementType == null ? {} : { setElementType: stringOrNull(node.setElementType) }),
    ...(node.declaredReturnType == null ? {} : { declaredReturnType: String(node.declaredReturnType) }),
    ...(node.returnType == null ? {} : { returnType: String(node.returnType) }),
    ...(node.returnNullable == null ? {} : { returnNullable: Boolean(node.returnNullable) }),
    ...snapshotShapeFields(node)
  }
}

function snapshotChildren(node: AnyNode): Partial<SnapshotNode> {
  return {
    ...(Array.isArray(node.params) ? { params: node.params.map(snapshotNode) } : {}),
    ...(Array.isArray(node.declarations) ? { declarations: node.declarations.map(snapshotNode) } : {}),
    ...snapshotBody(node),
    ...(Array.isArray(node.properties) ? { properties: node.properties.map(snapshotProperty) } : {}),
    ...(Array.isArray(node.elements) ? { elements: node.elements.map(snapshotNode) } : {}),
    ...(node.expression == null ? {} : { expression: snapshotNode(node.expression) }),
    ...(node.init === undefined ? {} : { init: node.init == null ? null : snapshotNode(node.init) }),
    ...(node.callee == null ? {} : { callee: snapshotNode(node.callee) }),
    ...(node.object == null ? {} : { object: snapshotNode(node.object) }),
    ...(Array.isArray(node.args) ? { args: node.args.map(snapshotNode) } : {}),
    ...(node.left == null ? {} : { left: snapshotNode(node.left) }),
    ...(node.right == null ? {} : { right: snapshotNode(node.right) }),
    ...(node.target == null ? {} : { target: snapshotNode(node.target) }),
    ...(node.value == null || isSnapshotScalar(node.value) ? {} : { value: snapshotNode(node.value) }),
    ...(node.argument == null ? {} : { argument: snapshotNode(node.argument) }),
    ...(node.condition == null ? {} : { condition: snapshotNode(node.condition) }),
    ...(node.consequent == null ? {} : { consequent: snapshotNode(node.consequent) }),
    ...(node.alternate == null ? {} : { alternate: snapshotNode(node.alternate) }),
    ...(node.iterable == null ? {} : { iterable: snapshotNode(node.iterable) })
  }
}

function snapshotBody(node: AnyNode): Pick<SnapshotNode, 'body'> {
  if (Array.isArray(node.body)) {
    return {
      body: node.body.map(snapshotNode)
    }
  }

  if (node.body != null && Array.isArray(node.body.body)) {
    return {
      body: node.body.body.map(snapshotNode)
    }
  }

  return {}
}

function snapshotProperty(property: AnyNode): { key: string, value: SnapshotNode, loc?: SourceLocation } {
  return withLocation({
    key: String(property.key ?? '<unknown>'),
    value: snapshotNode(property.value)
  }, property.loc)
}

function snapshotShapeFields(node: AnyNode): Pick<SnapshotNode, 'fields'> {
  const fields = node.shape?.fields ?? node.valueType?.fields

  if (!Array.isArray(fields)) {
    return {}
  }

  return {
    fields: fields.map(snapshotField)
  }
}

function snapshotField(field: AnyNode): SnapshotField {
  return withLocation({
    name: String(field.name ?? '<anonymous>'),
    ...(field.readonly == null ? {} : { readonly: Boolean(field.readonly) }),
    ...(field.declaredType == null ? {} : { declaredType: String(field.declaredType) }),
    ...(field.valueType == null ? {} : { valueType: String(field.valueType) }),
    ...(field.nullable == null ? {} : { nullable: Boolean(field.nullable) }),
    ...(field.arrayElementType == null ? {} : { arrayElementType: stringOrNull(field.arrayElementType) }),
    ...(field.mapKeyType == null ? {} : { mapKeyType: stringOrNull(field.mapKeyType) }),
    ...(field.mapValueType == null ? {} : { mapValueType: stringOrNull(field.mapValueType) }),
    ...(field.setElementType == null ? {} : { setElementType: stringOrNull(field.setElementType) })
  }, field.loc)
}

function isSnapshotScalar(value: unknown): value is string | number | boolean | null {
  return value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function stringOrNull(value: unknown): string | null {
  return value == null ? null : String(value)
}

function withLocation<T extends Record<string, unknown>>(value: T, loc: SourceLocation | undefined): T & { loc?: SourceLocation } {
  return loc == null ? value : {
    ...value,
    loc
  }
}
