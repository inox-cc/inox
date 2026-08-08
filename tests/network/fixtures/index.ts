import process from 'node:process'

import { startDnsAcceptance } from './dns.ts'
import { startHttpChunkedClientAcceptance } from './http-chunked-client.ts'
import { startHttpChunkedErrorAcceptance } from './http-chunked-errors.ts'
import { startHttpChunkedServerAcceptance } from './http-chunked-server.ts'
import { startHttpAcceptance } from './http.ts'
import { startHttpClientAcceptance } from './http-client.ts'
import { startHttpsClientAcceptance } from './https-client.ts'
import { startTcpAcceptance } from './tcp.ts'
import { startUdpAcceptance } from './udp.ts'

const port = Number(process.argv[2]) ?? 0
const nonce = process.argv[3]
const httpsPort = Number(process.argv[4]) ?? 0
const httpChunkedPort = Number(process.argv[5]) ?? 0
const httpChunkedErrorPort = Number(process.argv[6]) ?? 0
const httpChunkedServerPort = Number(process.argv[7]) ?? 0

startTcpAcceptance()
startUdpAcceptance()
startDnsAcceptance()
startHttpAcceptance(port, nonce)
startHttpClientAcceptance()
startHttpsClientAcceptance(httpsPort, nonce)
startHttpChunkedClientAcceptance(httpChunkedPort, nonce)
startHttpChunkedErrorAcceptance(httpChunkedErrorPort)
startHttpChunkedServerAcceptance(httpChunkedServerPort, nonce)
