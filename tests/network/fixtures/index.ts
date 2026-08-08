import process from 'node:process'

import { startDnsAcceptance } from './dns.ts'
import { startHttpChunkedClientAcceptance } from './http-chunked-client.ts'
import { startHttpChunkedErrorAcceptance } from './http-chunked-errors.ts'
import { startHttpChunkedServerAcceptance } from './http-chunked-server.ts'
import { startHttpKeepAliveServerAcceptance } from './http-keep-alive-server.ts'
import { startHttpKeepAliveClientAcceptance } from './http-keep-alive-client.ts'
import { startHttpStreamingClientAcceptance } from './http-streaming-client.ts'
import { startHttpStreamingServerAcceptance } from './http-streaming-server.ts'
import { startHttpAcceptance } from './http.ts'
import { startHttpClientAcceptance } from './http-client.ts'
import { startHttpsClientAcceptance } from './https-client.ts'
import { startHttpsKeepAliveClientAcceptance } from './https-keep-alive-client.ts'
import { startHttpsStreamingClientAcceptance } from './https-streaming-client.ts'
import { startTcpAcceptance } from './tcp.ts'
import { startUdpAcceptance } from './udp.ts'

const port = Number(process.argv[2]) ?? 0
const nonce = process.argv[3]
const httpsPort = Number(process.argv[4]) ?? 0
const httpChunkedPort = Number(process.argv[5]) ?? 0
const httpChunkedErrorPort = Number(process.argv[6]) ?? 0
const httpChunkedServerPort = Number(process.argv[7]) ?? 0
const httpKeepAliveServerPort = Number(process.argv[8]) ?? 0
const httpKeepAliveClientPort = Number(process.argv[9]) ?? 0
const httpsKeepAliveClientPort = Number(process.argv[10]) ?? 0
const httpStreamingServerPort = Number(process.argv[11]) ?? 0
const httpStreamingClientPort = Number(process.argv[12]) ?? 0
const httpsStreamingClientPort = Number(process.argv[13]) ?? 0

startTcpAcceptance()
startUdpAcceptance()
startDnsAcceptance()
startHttpAcceptance(port, nonce)
startHttpClientAcceptance()
startHttpsClientAcceptance(httpsPort, nonce)
startHttpChunkedClientAcceptance(httpChunkedPort, nonce)
startHttpChunkedErrorAcceptance(httpChunkedErrorPort)
startHttpChunkedServerAcceptance(httpChunkedServerPort, nonce)
startHttpKeepAliveServerAcceptance(httpKeepAliveServerPort, nonce)
startHttpKeepAliveClientAcceptance(httpKeepAliveClientPort, nonce)
startHttpsKeepAliveClientAcceptance(httpsKeepAliveClientPort, nonce)
startHttpStreamingServerAcceptance(httpStreamingServerPort, nonce)
startHttpStreamingClientAcceptance(httpStreamingClientPort, nonce)
startHttpsStreamingClientAcceptance(httpsStreamingClientPort, nonce)
