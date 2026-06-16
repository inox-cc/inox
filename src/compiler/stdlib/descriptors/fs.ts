export type FsRuntimeCallInfo = {
  method: string
  nodeName: string
  path: string[]
  root: string
  viaPromises: boolean
  mode: string
}

export type RemovedFsRuntimeMethodInfo = {
  path: string[]
  root: string
  message: string
}

type StringMapEntry = {
  key: string
  value: string
}

type StringPathMapEntry = {
  key: string
  path: string[]
}

const promiseNodeMethodEntries: StringMapEntry[] = [
  { key: 'access', value: 'access' },
  { key: 'appendFile', value: 'appendFile' },
  { key: 'copyFile', value: 'copyFile' },
  { key: 'lstat', value: 'lstat' },
  { key: 'mkdir', value: 'mkdir' },
  { key: 'readFile', value: 'readFile' },
  { key: 'readdir', value: 'readDir' },
  { key: 'readlink', value: 'readlink' },
  { key: 'realpath', value: 'realpath' },
  { key: 'rename', value: 'rename' },
  { key: 'rm', value: 'rm' },
  { key: 'stat', value: 'stat' },
  { key: 'symlink', value: 'symlink' },
  { key: 'unlink', value: 'unlink' },
  { key: 'writeFile', value: 'writeFile' }
]

const syncNodeMethodEntries: StringMapEntry[] = [
  { key: 'accessSync', value: 'accessSync' },
  { key: 'appendFileSync', value: 'appendFileSync' },
  { key: 'copyFileSync', value: 'copyFileSync' },
  { key: 'lstatSync', value: 'lstatSync' },
  { key: 'mkdirSync', value: 'mkdirSync' },
  { key: 'readFileSync', value: 'readFileSync' },
  { key: 'readdirSync', value: 'readDirSync' },
  { key: 'readlinkSync', value: 'readlinkSync' },
  { key: 'realpathSync', value: 'realpathSync' },
  { key: 'renameSync', value: 'renameSync' },
  { key: 'rmSync', value: 'rmSync' },
  { key: 'statSync', value: 'statSync' },
  { key: 'symlinkSync', value: 'symlinkSync' },
  { key: 'unlinkSync', value: 'unlinkSync' },
  { key: 'writeFileSync', value: 'writeFileSync' }
]

const callbackNodeMethodEntries: StringMapEntry[] = [
  { key: 'access', value: 'access' },
  { key: 'appendFile', value: 'appendFile' },
  { key: 'copyFile', value: 'copyFile' },
  { key: 'lstat', value: 'lstat' },
  { key: 'mkdir', value: 'mkdir' },
  { key: 'readFile', value: 'readFile' },
  { key: 'readdir', value: 'readDir' },
  { key: 'readlink', value: 'readlink' },
  { key: 'realpath', value: 'realpath' },
  { key: 'rename', value: 'rename' },
  { key: 'rm', value: 'rm' },
  { key: 'stat', value: 'stat' },
  { key: 'symlink', value: 'symlink' },
  { key: 'unlink', value: 'unlink' },
  { key: 'writeFile', value: 'writeFile' }
]

const removedExtensionMethodMessageEntries: StringMapEntry[] = [
  { key: 'appendFileBytes', value: 'use fs.promises.appendFile or fs.appendFileSync' },
  { key: 'appendFileBytesSync', value: 'use fs.appendFileSync' },
  { key: 'readDir', value: 'use fs.promises.readdir or fs.readdirSync' },
  { key: 'readDirSync', value: 'use fs.readdirSync' },
  { key: 'readFileBytes', value: 'use fs.promises.readFile or fs.readFileSync' },
  { key: 'readFileBytesSync', value: 'use fs.readFileSync' },
  { key: 'writeFileBytes', value: 'use fs.promises.writeFile or fs.writeFileSync' },
  { key: 'writeFileBytesSync', value: 'use fs.writeFileSync' }
]

const promiseRuntimeMethodNodePathEntries: StringPathMapEntry[] = [
  { key: 'access', path: ['fs', 'promises', 'access'] },
  { key: 'appendFile', path: ['fs', 'promises', 'appendFile'] },
  { key: 'appendFileBytes', path: ['fs', 'promises', 'appendFile'] },
  { key: 'copyFile', path: ['fs', 'promises', 'copyFile'] },
  { key: 'lstat', path: ['fs', 'promises', 'lstat'] },
  { key: 'mkdir', path: ['fs', 'promises', 'mkdir'] },
  { key: 'readFile', path: ['fs', 'promises', 'readFile'] },
  { key: 'readFileBytes', path: ['fs', 'promises', 'readFile'] },
  { key: 'readDir', path: ['fs', 'promises', 'readdir'] },
  { key: 'readDirDirents', path: ['fs', 'promises', 'readdir'] },
  { key: 'readlink', path: ['fs', 'promises', 'readlink'] },
  { key: 'realpath', path: ['fs', 'promises', 'realpath'] },
  { key: 'rename', path: ['fs', 'promises', 'rename'] },
  { key: 'rm', path: ['fs', 'promises', 'rm'] },
  { key: 'stat', path: ['fs', 'promises', 'stat'] },
  { key: 'symlink', path: ['fs', 'promises', 'symlink'] },
  { key: 'unlink', path: ['fs', 'promises', 'unlink'] },
  { key: 'writeFile', path: ['fs', 'promises', 'writeFile'] },
  { key: 'writeFileBytes', path: ['fs', 'promises', 'writeFile'] }
]

const syncRuntimeMethodNodePathEntries: StringPathMapEntry[] = [
  { key: 'accessSync', path: ['fs', 'accessSync'] },
  { key: 'appendFileSync', path: ['fs', 'appendFileSync'] },
  { key: 'appendFileBytesSync', path: ['fs', 'appendFileSync'] },
  { key: 'copyFileSync', path: ['fs', 'copyFileSync'] },
  { key: 'lstatSync', path: ['fs', 'lstatSync'] },
  { key: 'mkdirSync', path: ['fs', 'mkdirSync'] },
  { key: 'readFileSync', path: ['fs', 'readFileSync'] },
  { key: 'readFileBytesSync', path: ['fs', 'readFileSync'] },
  { key: 'readDirSync', path: ['fs', 'readdirSync'] },
  { key: 'readDirDirentsSync', path: ['fs', 'readdirSync'] },
  { key: 'readlinkSync', path: ['fs', 'readlinkSync'] },
  { key: 'realpathSync', path: ['fs', 'realpathSync'] },
  { key: 'renameSync', path: ['fs', 'renameSync'] },
  { key: 'rmSync', path: ['fs', 'rmSync'] },
  { key: 'statSync', path: ['fs', 'statSync'] },
  { key: 'symlinkSync', path: ['fs', 'symlinkSync'] },
  { key: 'unlinkSync', path: ['fs', 'unlinkSync'] },
  { key: 'writeFileSync', path: ['fs', 'writeFileSync'] },
  { key: 'writeFileBytesSync', path: ['fs', 'writeFileSync'] }
]

const promiseNodeMethods = createStringMap(promiseNodeMethodEntries)
const syncNodeMethods = createStringMap(syncNodeMethodEntries)
const callbackNodeMethods = createStringMap(callbackNodeMethodEntries)
const removedExtensionMethodMessages = createStringMap(removedExtensionMethodMessageEntries)
const promiseRuntimeMethodNodePaths = createStringPathMap(promiseRuntimeMethodNodePathEntries)
const syncRuntimeMethodNodePaths = createStringPathMap(syncRuntimeMethodNodePathEntries)
const fsPromiseUsagePaths = createUsagePathSet('fs.promises.', promiseNodeMethodEntries)
const fsSyncUsagePaths = createUsagePathSet('fs.', syncNodeMethodEntries)

export function fsRuntimeCallInfoFromPath(path: string[] | null | undefined): FsRuntimeCallInfo | null {
  if (path == null || path.length < 2) {
    return null
  }

  const nodeName = path[path.length - 1]

  if (path.length === 3 && path[1] === 'promises') {
    const method = promiseNodeMethods.get(nodeName)

    if (method == null) {
      return null
    }

    return {
      method,
      nodeName,
      path,
      root: path[0],
      viaPromises: true,
      mode: 'promise'
    }
  }

  if (path.length !== 2) {
    return null
  }

  const syncMethod = syncNodeMethods.get(nodeName)

  if (syncMethod != null) {
    return {
      method: syncMethod,
      nodeName,
      path,
      root: path[0],
      viaPromises: false,
      mode: 'sync'
    }
  }

  const callbackMethod = callbackNodeMethods.get(nodeName)

  if (callbackMethod != null) {
    return {
      method: callbackMethod,
      nodeName,
      path,
      root: path[0],
      viaPromises: false,
      mode: 'callback'
    }
  }

  return null
}

export function fsRuntimeMethodForPath(path: string[] | null | undefined): string | null {
  const info = fsRuntimeCallInfoFromPath(path)

  if (info != null) {
    return info.method
  }

  return null
}

export function fsGlobalUsagePathForRuntimeMethod(method: string): string[] | null {
  const promisePath = promiseRuntimeMethodNodePaths.get(method)

  if (promisePath != null) {
    return promisePath
  }

  const syncPath = syncRuntimeMethodNodePaths.get(method)

  if (syncPath != null) {
    return syncPath
  }

  return null
}

export function isFsPromiseUsagePath(path: string): boolean {
  return fsPromiseUsagePaths.has(path)
}

export function isFsSyncUsagePath(path: string): boolean {
  return fsSyncUsagePaths.has(path) || path.startsWith('fs.constants.')
}

export function isFsPromiseRuntimeMethod(method: string): boolean {
  return promiseRuntimeMethodNodePaths.has(method)
}

export function isFsSyncRuntimeMethod(method: string): boolean {
  return syncRuntimeMethodNodePaths.has(method)
}

export function isAsyncFsRuntimeMethod(method: string): boolean {
  return isFsPromiseRuntimeMethod(method)
}

export function removedFsRuntimeMethodInfoFromPath(
  path: string[] | null | undefined
): RemovedFsRuntimeMethodInfo | null {
  if (path == null || path.length !== 2) {
    return null
  }

  const nodeName = path[1]
  const replacement = removedExtensionMethodMessages.get(nodeName)

  if (replacement == null) {
    return null
  }

  return {
    path,
    root: path[0],
    message: `function ${path.join('.')} is not part of Node fs; ${replacement}`
  }
}

export function unsupportedFsRuntimeMethodMessage(info: FsRuntimeCallInfo, promisesApi: boolean): string | null {
  if (info.method === 'readDir') {
    if (promisesApi) {
      return null
    }

    return 'Node fs.readdir callback API is not supported yet; use fs.promises.readdir'
  }

  if (info.mode === 'callback' && !promisesApi) {
    return `Node ${info.path.join('.')} callback API is not supported yet; use fs.promises.${info.method}`
  }

  return null
}

function createStringMap(entries: StringMapEntry[]): Map<string, string> {
  const map = new Map()

  for (const entry of entries) {
    map.set(entry.key, entry.value)
  }

  return map
}

function createStringPathMap(entries: StringPathMapEntry[]): Map<string, string[]> {
  const map = new Map()

  for (const entry of entries) {
    map.set(entry.key, entry.path)
  }

  return map
}

function createUsagePathSet(prefix: string, entries: StringMapEntry[]): Set<string> {
  const paths: Set<string> = new Set()

  for (const entry of entries) {
    paths.add(`${prefix}${entry.key}`)
  }

  return paths
}
