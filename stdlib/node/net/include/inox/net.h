#ifndef INOX_NET_H
#define INOX_NET_H

#include <stddef.h>
#include "inox/loop.h"

#ifdef __cplusplus
#include "inox/string_view.h"
#endif

struct inox_net_server;
struct inox_net_socket;

struct NetAddress {
  char address[64];
  const char* family;
  int port;
};

typedef inox_status (*NetConnectionFn)(void* user, inox_net_server* server, inox_net_socket* socket);
typedef inox_status (*NetServerFn)(void* user, inox_net_server* server);
typedef inox_status (*NetServerErrorFn)(void* user, inox_net_server* server, inox_status status);
typedef inox_status (*NetConnectFn)(void* user, inox_net_socket* socket, inox_status status);
typedef inox_status (*NetDataFn)(void* user, inox_net_socket* socket, const char* bytes, size_t len);
typedef void (*NetCloseFn)(void* user, inox_net_socket* socket);
typedef inox_status (*NetSocketFn)(void* user, inox_net_socket* socket);
typedef inox_status (*NetSocketErrorFn)(void* user, inox_net_socket* socket, inox_status status);
typedef inox_status (*NetSocketWriteFn)(void* user, inox_net_socket* socket, inox_status status);

#ifdef __cplusplus

class NetServer {
private:
  inox_net_server* server_;

public:
  explicit NetServer(inox_net_server* server);

  static inox_status create(inox_loop* loop, NetConnectionFn connection, void* user, inox_net_server** out);

  inox_status onConnection(NetConnectionFn connection, void* user) const;
  inox_status onListening(NetServerFn listening, void* user) const;
  inox_status onClose(NetServerFn close, void* user) const;
  inox_status onError(NetServerErrorFn error, void* user) const;
  inox_status listen(const char* host, int port, int backlog) const;
  inox_status address(NetAddress* out) const;
  inox_status localPort(int* out_port) const;
  void close() const;
};

class NetSocket {
private:
  inox_net_socket* socket_;

public:
  explicit NetSocket(inox_net_socket* socket);

  static inox_status connect(
    inox_loop* loop,
    const char* host,
    int port,
    NetConnectFn connect,
    NetDataFn data,
    NetCloseFn close,
    void* user,
    inox_net_socket** out
  );

  void setCallbacks(NetDataFn data, NetCloseFn close, void* user) const;
  inox_status onConnect(NetSocketFn connect, void* user) const;
  inox_status onReady(NetSocketFn ready, void* user) const;
  inox_status onData(NetDataFn data, void* user) const;
  inox_status onEnd(NetSocketFn end, void* user) const;
  inox_status onClose(NetSocketFn close, void* user) const;
  inox_status onError(NetSocketErrorFn error, void* user) const;
  inox_status onDrain(NetSocketFn drain, void* user) const;
  inox_status readStart() const;
  inox_status readStop() const;
  inox_status setEncoding(inox::StringView encoding) const;
  inox_status address(NetAddress* out) const;
  inox_status remoteAddress(NetAddress* out) const;
  inox_status bytesRead(size_t* out_bytes) const;
  inox_status bytesWritten(size_t* out_bytes) const;
  inox_status setNoDelay(bool enabled) const;
  inox_status setKeepAlive(bool enabled, unsigned int initial_delay) const;
  inox_status ref() const;
  inox_status unref() const;
  inox_status write(inox::StringView bytes) const;
  inox_status write(inox::StringView bytes, NetSocketWriteFn callback) const;
  inox_status write(inox::StringView bytes, NetSocketWriteFn callback, void* user) const;
  inox_status end() const;
  inox_status end(inox::StringView bytes) const;
  inox_status end(inox::StringView bytes, NetSocketWriteFn callback) const;
  inox_status end(inox::StringView bytes, NetSocketWriteFn callback, void* user) const;
  inox_status destroy() const;
  void close() const;
};

#endif

#endif
