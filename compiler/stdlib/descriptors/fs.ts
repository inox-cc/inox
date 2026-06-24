export type FsRuntimeCallInfo = {
  method: string
  nodeName: string
  path: string[]
  root: string
  viaPromises: boolean
  mode: string
}

export function fsRuntimeCallInfoFromPath(path: string[] | null | undefined): FsRuntimeCallInfo | null {
  if (path === null || typeof path === 'undefined' || path.length < 2) {
    return null
  }

  const nodeName = path[path.length - 1]

  if (path.length === 3 && path[1] === 'promises') {
    const method = promiseFsRuntimeMethodForNodeName(nodeName)

    if (method === null || typeof method === 'undefined') {
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

  const syncMethod = syncFsRuntimeMethodForNodeName(nodeName)

  if (syncMethod !== null && typeof syncMethod !== 'undefined') {
    return {
      method: syncMethod,
      nodeName,
      path,
      root: path[0],
      viaPromises: false,
      mode: 'sync'
    }
  }

  const callbackMethod = callbackFsRuntimeMethodForNodeName(nodeName)

  if (callbackMethod !== null && typeof callbackMethod !== 'undefined') {
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

  if (info !== null && typeof info !== 'undefined') {
    return info.method
  }

  return null
}

export function fsGlobalUsagePathForRuntimeMethod(method: string): string[] | null {
  const promisePath = promiseFsNodePathForRuntimeMethod(method)

  if (promisePath !== null && typeof promisePath !== 'undefined') {
    return promisePath
  }

  const syncPath = syncFsNodePathForRuntimeMethod(method)

  if (syncPath !== null && typeof syncPath !== 'undefined') {
    return syncPath
  }

  return null
}

export function isFsPromiseUsagePath(path: string): boolean {
  return (
    path === 'fs.promises.access' ||
    path === 'fs.promises.appendFile' ||
    path === 'fs.promises.copyFile' ||
    path === 'fs.promises.lstat' ||
    path === 'fs.promises.mkdir' ||
    path === 'fs.promises.readFile' ||
    path === 'fs.promises.readdir' ||
    path === 'fs.promises.readlink' ||
    path === 'fs.promises.realpath' ||
    path === 'fs.promises.rename' ||
    path === 'fs.promises.rm' ||
    path === 'fs.promises.stat' ||
    path === 'fs.promises.symlink' ||
    path === 'fs.promises.unlink' ||
    path === 'fs.promises.writeFile'
  )
}

export function isFsSyncUsagePath(path: string): boolean {
  return (
    path === 'fs.accessSync' ||
    path === 'fs.appendFileSync' ||
    path === 'fs.copyFileSync' ||
    path === 'fs.lstatSync' ||
    path === 'fs.mkdirSync' ||
    path === 'fs.readFileSync' ||
    path === 'fs.readdirSync' ||
    path === 'fs.readlinkSync' ||
    path === 'fs.realpathSync' ||
    path === 'fs.renameSync' ||
    path === 'fs.rmSync' ||
    path === 'fs.statSync' ||
    path === 'fs.symlinkSync' ||
    path === 'fs.unlinkSync' ||
    path === 'fs.writeFileSync' ||
    path.startsWith('fs.constants.')
  )
}

export function isFsPromiseRuntimeMethod(method: string): boolean {
  return (
    method === 'access' ||
    method === 'appendFile' ||
    method === 'copyFile' ||
    method === 'lstat' ||
    method === 'mkdir' ||
    method === 'readFile' ||
    method === 'readdir' ||
    method === 'readlink' ||
    method === 'realpath' ||
    method === 'rename' ||
    method === 'rm' ||
    method === 'stat' ||
    method === 'symlink' ||
    method === 'unlink' ||
    method === 'writeFile'
  )
}

export function isFsSyncRuntimeMethod(method: string): boolean {
  return (
    method === 'accessSync' ||
    method === 'appendFileSync' ||
    method === 'copyFileSync' ||
    method === 'lstatSync' ||
    method === 'mkdirSync' ||
    method === 'readFileSync' ||
    method === 'readdirSync' ||
    method === 'readlinkSync' ||
    method === 'realpathSync' ||
    method === 'renameSync' ||
    method === 'rmSync' ||
    method === 'statSync' ||
    method === 'symlinkSync' ||
    method === 'unlinkSync' ||
    method === 'writeFileSync'
  )
}

export function isAsyncFsRuntimeMethod(method: string): boolean {
  return isFsPromiseRuntimeMethod(method)
}

export function unsupportedFsRuntimeMethodMessage(info: FsRuntimeCallInfo, promisesApi: boolean): string | null {
  if (info.mode === 'callback' && !promisesApi) {
    return `Node ${joinStrings(info.path, '.')} callback API is not supported yet; use fs.promises.${info.nodeName}`
  }

  return null
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

function promiseFsRuntimeMethodForNodeName(nodeName: string): string | null {
  if (
    nodeName === 'access' ||
    nodeName === 'appendFile' ||
    nodeName === 'copyFile' ||
    nodeName === 'lstat' ||
    nodeName === 'mkdir' ||
    nodeName === 'readdir' ||
    nodeName === 'readFile' ||
    nodeName === 'readlink' ||
    nodeName === 'realpath' ||
    nodeName === 'rename' ||
    nodeName === 'rm' ||
    nodeName === 'stat' ||
    nodeName === 'symlink' ||
    nodeName === 'unlink' ||
    nodeName === 'writeFile'
  ) {
    return nodeName
  }

  return null
}

function syncFsRuntimeMethodForNodeName(nodeName: string): string | null {
  if (
    nodeName === 'accessSync' ||
    nodeName === 'appendFileSync' ||
    nodeName === 'copyFileSync' ||
    nodeName === 'lstatSync' ||
    nodeName === 'mkdirSync' ||
    nodeName === 'readdirSync' ||
    nodeName === 'readFileSync' ||
    nodeName === 'readlinkSync' ||
    nodeName === 'realpathSync' ||
    nodeName === 'renameSync' ||
    nodeName === 'rmSync' ||
    nodeName === 'statSync' ||
    nodeName === 'symlinkSync' ||
    nodeName === 'unlinkSync' ||
    nodeName === 'writeFileSync'
  ) {
    return nodeName
  }

  return null
}

function callbackFsRuntimeMethodForNodeName(nodeName: string): string | null {
  return promiseFsRuntimeMethodForNodeName(nodeName)
}

function promiseFsNodePathForRuntimeMethod(method: string): string[] | null {
  if (
    method === 'access' ||
    method === 'appendFile' ||
    method === 'copyFile' ||
    method === 'lstat' ||
    method === 'mkdir' ||
    method === 'readdir' ||
    method === 'readFile' ||
    method === 'readlink' ||
    method === 'realpath' ||
    method === 'rename' ||
    method === 'rm' ||
    method === 'stat' ||
    method === 'symlink' ||
    method === 'unlink' ||
    method === 'writeFile'
  ) {
    return ['fs', 'promises', method]
  }

  return null
}

function syncFsNodePathForRuntimeMethod(method: string): string[] | null {
  if (
    method === 'accessSync' ||
    method === 'appendFileSync' ||
    method === 'copyFileSync' ||
    method === 'lstatSync' ||
    method === 'mkdirSync' ||
    method === 'readdirSync' ||
    method === 'readFileSync' ||
    method === 'readlinkSync' ||
    method === 'realpathSync' ||
    method === 'renameSync' ||
    method === 'rmSync' ||
    method === 'statSync' ||
    method === 'symlinkSync' ||
    method === 'unlinkSync' ||
    method === 'writeFileSync'
  ) {
    return ['fs', method]
  }

  return null
}
