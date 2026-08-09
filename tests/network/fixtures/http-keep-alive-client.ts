import http, { type Agent } from 'node:http'

function read(port: number, path: string, nonce: string, agent: Agent): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = http.get(
      {
        hostname: '127.0.0.1',
        port,
        path,
        agent,
        headers: { 'X-Inox-Keep-Alive': nonce }
      },
      (response) => {
        let body = ''

        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          body = body + chunk
        })
        response.on('end', () => {
          resolve(body)
        })
        response.on('error', (error) => {
          reject(error)
        })
      }
    )

    request.on('error', (error) => {
      reject(error)
    })
  })
}

function readIsolated(port: number, path: string, nonce: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = http.get(
      {
        hostname: '127.0.0.1',
        port,
        path,
        agent: false,
        headers: { 'X-Inox-Keep-Alive': nonce }
      },
      (response) => {
        let body = ''

        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          body = body + chunk
        })
        response.on('end', () => {
          resolve(body)
        })
        response.on('error', (error) => {
          reject(error)
        })
      }
    )

    request.on('error', (error) => {
      reject(error)
    })
  })
}

export function startHttpKeepAliveClientAcceptance(port: number, otherPort: number, nonce: string): void {
  runHttpKeepAliveClientAcceptance(port, otherPort, nonce)
}

async function runHttpKeepAliveClientAcceptance(port: number, otherPort: number, nonce: string): Promise<void> {
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1, maxFreeSockets: 1, timeout: 1000 })
  const first = await read(port, '/first', nonce, agent)
  const second = await read(port, '/second', nonce, agent)
  const queued = await Promise.all([
    read(port, '/queued-first', nonce, agent),
    read(port, '/queued-second', nonce, agent)
  ])
  const origins = await Promise.all([
    read(port, '/origin-block', nonce, agent),
    read(otherPort, '/other-origin', nonce, agent)
  ])
  agent.destroy()
  const afterDestroy = await read(port, '/after-destroy', nonce, agent)
  const isolatedFirst = await readIsolated(port, '/isolated-first', nonce)
  const isolatedSecond = await readIsolated(port, '/isolated-second', nonce)
  const global = await read(port, '/global', nonce, http.globalAgent)

  if (
    first === 'keep-alive-first ' + nonce &&
    second === 'keep-alive-second ' + nonce &&
    queued[0] === 'keep-alive-queued-first ' + nonce &&
    queued[1] === 'keep-alive-queued-second ' + nonce &&
    origins[0] === 'keep-alive-origin-block ' + nonce &&
    origins[1] === 'keep-alive-other-origin ' + nonce &&
    afterDestroy === 'keep-alive-after-destroy ' + nonce &&
    isolatedFirst === 'keep-alive-isolated-first ' + nonce &&
    isolatedSecond === 'keep-alive-isolated-second ' + nonce &&
    global === 'keep-alive-global ' + nonce
  ) {
    console.log('INOX_HTTP_KEEP_ALIVE_CLIENT_OK')
  }
}
