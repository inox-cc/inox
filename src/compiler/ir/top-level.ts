import type {
  AnyNode,
  IrFunctionDeclaration,
  IrProgram,
  IrTopLevelItem,
  IrTopLevelItemKind,
  ModuleRecord,
  ModuleGraph,
  ObjectShapeInfo,
  ProgramNode,
  SourceLocation,
  ValueType
} from '../types.ts'

export type IrModuleRecord = {
  path: string
  ir: IrProgram
}

type IrTopLevelNode = AnyNode & {
  async?: boolean | null
  body?: AnyNode[]
  exported?: boolean | null
  loc?: SourceLocation
  name?: string | null
  params?: AnyNode[]
  returnArrayElementDeclaredType?: string | null
  returnArrayElementType?: ValueType | null
  returnMapKeyType?: ValueType | null
  returnMapValueType?: ValueType | null
  returnNullable?: boolean | null
  returnPromiseValueType?: ValueType | null
  returnSetElementType?: ValueType | null
  returnShape?: ObjectShapeInfo | null
  returnType?: string | null
  type?: string | null
}

type NodeList = AnyNode[]

type IrProgramWithFunctionDeclarations = {
  functionDeclarations: IrFunctionDeclaration[]
}

type IrTopLevelProgram = {
  body: NodeList
  topLevelItems: IrTopLevelItem[]
}

type IrFunctionNodeProgram = IrTopLevelProgram & {
  functionDeclarations: IrFunctionDeclaration[]
}

type IrTopLevelNodeEntry = {
  kind: IrTopLevelItemKind
  node: AnyNode
}

export type IrFunctionNodeEntry = {
  declaration: IrFunctionDeclaration
  node: AnyNode
}

type FunctionDeclarationMap = Map<string, IrFunctionDeclaration>

export function collectIrModuleRecords(graph: ModuleGraph): IrModuleRecord[] {
  const records: IrModuleRecord[] = []
  const modules = graph.modules

  for (let index = 0; index < modules.length; index = index + 1) {
    const moduleRecord: ModuleRecord = modules[index]

    if (moduleRecord.ir != null) {
      records.push({
        path: moduleRecord.path,
        ir: moduleRecord.ir
      })
    }
  }

  return records
}

export function collectIrPrograms(records: IrModuleRecord[]): IrProgram[] {
  const programs: IrProgram[] = []

  for (let index = 0; index < records.length; index = index + 1) {
    const record = records[index]
    programs.push(record.ir)
  }

  return programs
}

export function findIrEntryProgram(records: IrModuleRecord[], entry: string): IrProgram | null {
  for (let index = 0; index < records.length; index = index + 1) {
    const record = records[index]

    if (record.path === entry) {
      return record.ir
    }
  }

  return null
}

export function collectIrFunctionDeclarations(
  programs: IrProgramWithFunctionDeclarations[]
): IrFunctionDeclaration[] {
  const declarations: IrFunctionDeclaration[] = []

  for (let programIndex = 0; programIndex < programs.length; programIndex = programIndex + 1) {
    const program = programs[programIndex]
    const functionDeclarations = program.functionDeclarations

    for (let declarationIndex = 0; declarationIndex < functionDeclarations.length; declarationIndex = declarationIndex + 1) {
      const declaration = functionDeclarations[declarationIndex]
      declarations.push(declaration)
    }
  }

  return declarations
}

export function collectIrFunctionNodeEntries(programs: IrFunctionNodeProgram[]): IrFunctionNodeEntry[] {
  const entries: IrFunctionNodeEntry[] = []

  for (let programIndex = 0; programIndex < programs.length; programIndex = programIndex + 1) {
    const program = programs[programIndex]
    const declarationsByName = collectFunctionDeclarationsByName(program.functionDeclarations)
    const topLevelEntries = collectIrTopLevelNodeEntries(program)

    for (let entryIndex = 0; entryIndex < topLevelEntries.length; entryIndex = entryIndex + 1) {
      const item = topLevelEntries[entryIndex]

      if (item.kind === 'function') {
        const name = nodeNameForTopLevelLookup(item.node)
        const declaration = functionDeclarationForName(declarationsByName, name)

        if (declaration != null) {
          entries.push({
            declaration,
            node: item.node
          })
        }
      }
    }
  }

  return entries
}

export function hasIrFunctionDeclaration(program: IrProgram | null | undefined, name: string): boolean {
  if (program == null) {
    return false
  }

  const declarations = program.functionDeclarations

  for (let index = 0; index < declarations.length; index = index + 1) {
    const item = declarations[index]

    if (item.name === name) {
      return true
    }
  }

  return false
}

export function collectIrTopLevelNodeEntries(program: IrTopLevelProgram): IrTopLevelNodeEntry[] {
  const entries: IrTopLevelNodeEntry[] = []

  for (let index = 0; index < program.topLevelItems.length; index = index + 1) {
    const item = program.topLevelItems[index]
    const node = nodeAt(program.body, item.index)

    if (node != null) {
      entries.push({
        kind: item.kind,
        node
      })
    }
  }

  return entries
}

export function collectIrTopLevelNodes(program: IrTopLevelProgram, kind: IrTopLevelItemKind): NodeList {
  const nodes: NodeList = []
  const entries = collectIrTopLevelNodeEntries(program)

  for (let index = 0; index < entries.length; index = index + 1) {
    const item = entries[index]

    if (item.kind === kind) {
      nodes.push(item.node)
    }
  }

  return nodes
}

export function collectIrTopLevelNodesFromPrograms(
  programs: IrTopLevelProgram[],
  kind: IrTopLevelItemKind
): NodeList {
  const nodes: NodeList = []

  for (let programIndex = 0; programIndex < programs.length; programIndex = programIndex + 1) {
    const program = programs[programIndex]
    const programNodes = collectIrTopLevelNodes(program, kind)

    for (let nodeIndex = 0; nodeIndex < programNodes.length; nodeIndex = nodeIndex + 1) {
      const node = programNodes[nodeIndex]
      nodes.push(node)
    }
  }

  return nodes
}

export function collectTopLevelItems(program: ProgramNode): IrTopLevelItem[] {
  const items: IrTopLevelItem[] = []

  for (let index = 0; index < program.body.length; index = index + 1) {
    const item: IrTopLevelNode = program.body[index]

    if (item.type !== 'ExportDeclaration') {
      const kind = topLevelItemKind(item)
      const loc = item.loc

      if (loc != null) {
        items.push({
          kind,
          index,
          loc
        })
      } else {
        items.push({
          kind,
          index
        })
      }
    }
  }

  return items
}

export function collectFunctionDeclarations(
  program: ProgramNode,
  topLevelItems: IrTopLevelItem[]
): IrFunctionDeclaration[] {
  const declarations: IrFunctionDeclaration[] = []
  const nodes = collectIrTopLevelNodes(
    {
      body: program.body,
      topLevelItems
    },
    'function'
  )

  for (let index = 0; index < nodes.length; index = index + 1) {
    const item: IrTopLevelNode = nodes[index]
    const name = nodeNameForTopLevelLookup(item)

    if (name !== '') {
      declarations.push(createFunctionDeclaration(item, name))
    }
  }

  return declarations
}

function collectFunctionDeclarationsByName(declarations: IrFunctionDeclaration[]): FunctionDeclarationMap {
  const declarationsByName = createFunctionDeclarationMap()

  for (let index = 0; index < declarations.length; index = index + 1) {
    const declaration = declarations[index]
    declarationsByName.set(declaration.name, declaration)
  }

  return declarationsByName
}

function createFunctionDeclarationMap(): FunctionDeclarationMap {
  const map: FunctionDeclarationMap = new Map()
  return map
}

function functionDeclarationForName(
  declarationsByName: FunctionDeclarationMap,
  name: string
): IrFunctionDeclaration | null {
  const declaration = declarationsByName.get(name)

  if (declaration == null) {
    return null
  }

  return declaration
}

function nodeAt(nodes: NodeList, index: number): AnyNode | null {
  if (index < 0 || index >= nodes.length) {
    return null
  }

  return nodes[index]
}

function nodeNameForTopLevelLookup(node: IrTopLevelNode): string {
  const name = node.name

  if (name == null) {
    return ''
  }

  return name
}

function createFunctionDeclaration(item: IrTopLevelNode, name: string): IrFunctionDeclaration {
  const exported = item.exported ?? false
  const usesTask = item.async ?? false
  const params = item.params ?? []
  const returnNullable = item.returnNullable ?? false
  const returnType = item.returnType ?? 'void'
  const declaration: IrFunctionDeclaration = {
    name,
    exported,
    async: usesTask,
    params,
    returnType,
    returnNullable
  }

  const loc = item.loc

  if (loc != null) {
    declaration.loc = loc
  }

  if (item.returnArrayElementType != null) {
    declaration.returnArrayElementType = item.returnArrayElementType
  }

  if (item.returnArrayElementDeclaredType != null) {
    declaration.returnArrayElementDeclaredType = item.returnArrayElementDeclaredType
  }

  if (item.returnMapKeyType != null) {
    declaration.returnMapKeyType = item.returnMapKeyType
  }

  if (item.returnMapValueType != null) {
    declaration.returnMapValueType = item.returnMapValueType
  }

  if (item.returnPromiseValueType != null) {
    declaration.returnPromiseValueType = item.returnPromiseValueType
  }

  if (item.returnSetElementType != null) {
    declaration.returnSetElementType = item.returnSetElementType
  }

  if (item.returnShape != null) {
    declaration.returnShape = item.returnShape
  }

  return declaration
}

function topLevelItemKind(item: IrTopLevelNode): IrTopLevelItemKind {
  if (item.type === 'ImportDeclaration') {
    return 'import'
  }

  if (item.type === 'FunctionDeclaration') {
    return 'function'
  }

  if (item.type === 'ClassDeclaration') {
    return 'class'
  }

  if (item.type === 'TypeAliasDeclaration') {
    return 'type'
  }

  return 'statement'
}
