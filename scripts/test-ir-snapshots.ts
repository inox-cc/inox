import { join } from 'node:path'
import { compileSource } from '../compiler/index.ts'
import type {
  AnyNode,
  IrFunctionDeclaration,
  IrGlobalUsage,
  IrProgram,
  IrSyntaxFeatureUsage,
  IrTopLevelItem,
  SourceLocation
} from '../compiler/types.ts'
import { rootDir } from './lib/repo-checks.ts'
import { runSnapshotSuite } from './lib/snapshot-runner.ts'

type IrSnapshot = {
  version: number
  features: string[]
  runtimeRequirements: string[]
  topLevelItems: SnapshotTopLevelItem[]
  functionDeclarations: SnapshotFunctionDeclaration[]
  functionEffects: Array<{
    name: string
    throws: boolean
    throwValueTypes: string[]
  }>
  syntaxFeatures: SnapshotSyntaxFeatureUsage[]
  globalUsages: SnapshotGlobalUsage[]
  bodySummary: SnapshotBodyItem[]
}

type SnapshotTopLevelItem = {
  kind: string
  index: number
  loc?: SourceLocation
}

type SnapshotFunctionDeclaration = {
  name: string
  exported: boolean
  async: boolean
  params: SnapshotParam[]
  returnType: string
  returnNullable: boolean
  returnShape?: unknown
  loc?: SourceLocation
}

type SnapshotParam = {
  name: string
  declaredType?: string
  valueType?: string
  nullable?: boolean
  arrayElementType?: string | null
  arrayElementDeclaredType?: string | null
  mapKeyType?: string | null
  mapValueType?: string | null
  setElementType?: string | null
  shape?: SnapshotShape
}

type SnapshotShape = {
  kind: string
  fields?: SnapshotField[]
}

type SnapshotSyntaxFeatureUsage = {
  feature: string
  loc?: SourceLocation
}

type SnapshotGlobalUsage = {
  root: string
  path: string[]
  loc?: SourceLocation
}

type SnapshotBodyItem = {
  index: number
  type: string
  name?: string
  exported?: boolean
  async?: boolean
  declarationKind?: string
  declarations?: string[]
  fields?: SnapshotField[]
  loc?: SourceLocation
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

const snapshotRoot = join(rootDir, 'tests/snapshots/ir')
const update = process.argv.includes('--update')

await runSnapshotSuite({
  title: 'IR snapshot checks',
  root: snapshotRoot,
  sourceSuffix: '.ts',
  update,
  updateCommand: 'node scripts/test-ir-snapshots.ts --update',
  createOutputs: ({ path, source }) => {
    const ir = compileSource(source, {
      target: 'c',
      callMain: false
    }).ir

    return [
      {
        path: path.replace(/\.ts$/, '.ir.json'),
        content: `${JSON.stringify(createIrSnapshot(ir), null, 2)}\n`
      }
    ]
  }
})

function createIrSnapshot(ir: IrProgram): IrSnapshot {
  return {
    version: ir.version,
    features: ir.features,
    runtimeRequirements: ir.runtimeRequirements,
    topLevelItems: ir.topLevelItems.map(snapshotTopLevelItem),
    functionDeclarations: ir.functionDeclarations.map(snapshotFunctionDeclaration),
    functionEffects: ir.functionEffects.map((effect) => ({
      name: effect.name,
      throws: effect.throws,
      throwValueTypes: effect.throwValueTypes
    })),
    syntaxFeatures: ir.syntaxFeatures.map(snapshotSyntaxFeatureUsage),
    globalUsages: ir.globalUsages.map(snapshotGlobalUsage),
    bodySummary: ir.body.map(snapshotBodyItem)
  }
}

function snapshotTopLevelItem(item: IrTopLevelItem): SnapshotTopLevelItem {
  return withLocation(
    {
      kind: item.kind,
      index: item.index
    },
    item.loc
  )
}

function snapshotFunctionDeclaration(declaration: IrFunctionDeclaration): SnapshotFunctionDeclaration {
  return withLocation(
    {
      name: declaration.name,
      exported: declaration.exported,
      async: declaration.async,
      params: declaration.params.map(snapshotParam),
      returnType: declaration.returnType,
      returnNullable: declaration.returnNullable,
      ...(!declaration.returnShape ? {} : { returnShape: declaration.returnShape })
    },
    declaration.loc
  )
}

function snapshotParam(param: AnyNode): SnapshotParam {
  return {
    name: String(param.name ?? '<anonymous>'),
    ...(!param.declaredType ? {} : { declaredType: String(param.declaredType) }),
    ...(!param.valueType ? {} : { valueType: String(param.valueType) }),
    ...(!param.nullable ? {} : { nullable: Boolean(param.nullable) }),
    ...(!param.arrayElementType ? {} : { arrayElementType: stringOrNull(param.arrayElementType) }),
    ...(!param.arrayElementDeclaredType
      ? {}
      : { arrayElementDeclaredType: stringOrNull(param.arrayElementDeclaredType) }),
    ...(!param.mapKeyType ? {} : { mapKeyType: stringOrNull(param.mapKeyType) }),
    ...(!param.mapValueType ? {} : { mapValueType: stringOrNull(param.mapValueType) }),
    ...(!param.setElementType ? {} : { setElementType: stringOrNull(param.setElementType) }),
    ...(!param.shape ? {} : { shape: snapshotShape(param.shape) })
  }
}

function snapshotSyntaxFeatureUsage(usage: IrSyntaxFeatureUsage): SnapshotSyntaxFeatureUsage {
  return withLocation(
    {
      feature: usage.feature
    },
    usage.loc
  )
}

function snapshotGlobalUsage(usage: IrGlobalUsage): SnapshotGlobalUsage {
  return withLocation(
    {
      root: usage.root,
      path: usage.path
    },
    usage.loc
  )
}

function snapshotBodyItem(item: AnyNode, index: number): SnapshotBodyItem {
  return withLocation(
    {
      index,
      type: String(item.type ?? '<unknown>'),
      ...(typeof item.name !== 'string' ? {} : { name: item.name }),
      ...(typeof item.exported !== 'boolean' ? {} : { exported: item.exported }),
      ...(typeof item.async !== 'boolean' ? {} : { async: item.async }),
      ...(typeof item.kind !== 'string' ? {} : { declarationKind: item.kind }),
      ...(Array.isArray(item.declarations) ? { declarations: item.declarations.map(declarationName) } : {}),
      ...snapshotBodyFields(item)
    },
    item.loc
  )
}

function snapshotField(field: AnyNode): SnapshotField {
  return withLocation(
    {
      name: String(field.name ?? '<anonymous>'),
      ...(!field.readonly ? {} : { readonly: Boolean(field.readonly) }),
      ...(!field.declaredType ? {} : { declaredType: String(field.declaredType) }),
      ...(!field.valueType ? {} : { valueType: String(field.valueType) }),
      ...(!field.nullable ? {} : { nullable: Boolean(field.nullable) }),
      ...(!field.arrayElementType ? {} : { arrayElementType: stringOrNull(field.arrayElementType) }),
      ...(!field.mapKeyType ? {} : { mapKeyType: stringOrNull(field.mapKeyType) }),
      ...(!field.mapValueType ? {} : { mapValueType: stringOrNull(field.mapValueType) }),
      ...(!field.setElementType ? {} : { setElementType: stringOrNull(field.setElementType) })
    },
    field.loc
  )
}

function snapshotShape(shape: AnyNode): SnapshotShape {
  return {
    kind: String(shape.kind ?? '<unknown>'),
    ...(Array.isArray(shape.fields) ? { fields: shape.fields.map(snapshotField) } : {})
  }
}

function snapshotBodyFields(item: AnyNode): Pick<SnapshotBodyItem, 'fields'> {
  if (Array.isArray(item.fields)) {
    return {
      fields: item.fields.map(snapshotField)
    }
  }

  if (item.valueType && Array.isArray(item.valueType.fields)) {
    return {
      fields: item.valueType.fields.map(snapshotField)
    }
  }

  return {}
}

function declarationName(declaration: AnyNode): string {
  if (typeof declaration.name === 'string') {
    return declaration.name
  }

  if (declaration.id && typeof declaration.id.name === 'string') {
    return declaration.id.name
  }

  return '<anonymous>'
}

function stringOrNull(value: unknown): string | null {
  return !value ? null : String(value)
}

function withLocation<T extends Record<string, unknown>>(
  value: T,
  loc: SourceLocation | undefined
): T & { loc?: SourceLocation } {
  return !loc
    ? value
    : {
        ...value,
        loc
      }
}
