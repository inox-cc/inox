#ifndef INOX_NET_H
#define INOX_NET_H

#include <stddef.h>

#include "inox/loop.h"
#include "inox/string_view.h"

struct inox_net_server;
struct inox_net_socket;

struct NetAddress {
  char address[64];
  inox::StringView family;
  int port;
};

typedef inox_status (*NetConnectionFn)(void* user, inox_net_server* server, inox_net_socket* socket);
typedef inox_status (*NetServerFn)(void* user, inox_net_server* server);
typedef inox_status (*NetServerErrorFn)(void* user, inox_net_server* server, inox_status status);
typedef inox_status (*NetConnectFn)(void* user, inox_net_socket* socket, inox_status status);
typedef inox_status (*NetDataFn)(void* user, inox_net_socket* socket, inox::StringView bytes);
typedef void (*NetCloseFn)(void* user, inox_net_socket* socket);
typedef inox_status (*NetSocketFn)(void* user, inox_net_socket* socket);
typedef inox_status (*NetSocketErrorFn)(void* user, inox_net_socket* socket, inox_status status);
typedef inox_status (*NetSocketWriteFn)(void* user, inox_net_socket* socket, inox_status status);

#ifdef __cplusplus

class NetServer {
private:
  inox_net_server* server_;

public:
  NetServer();
  explicit NetServer(inox_net_server* server);

  static NetServer create(inox_loop* loop, NetConnectionFn connection, void* user);

  inox_net_server* raw() const;
  void onConnection(NetConnectionFn connection, void* user) const;
  void onListening(NetServerFn listening, void* user) const;
  void onClose(NetServerFn close, void* user) const;
  void onError(NetServerErrorFn error, void* user) const;
  void listen(inox::StringView host, int port, int backlog) const;
  NetAddress address() const;
  int localPort() const;
  void close() const;
};

class NetSocket {
private:
  inox_net_socket* socket_;

public:
  NetSocket();
  explicit NetSocket(inox_net_socket* socket);

  static NetSocket connect(
    inox_loop* loop,
    inox::StringView host,
    int port,
    NetConnectFn connect,
    NetDataFn data,
    NetCloseFn close,
    void* user
  );

  inox_net_socket* raw() const;
  void setCallbacks(NetDataFn data, NetCloseFn close, void* user) const;
  void onConnect(NetSocketFn connect, void* user) const;
  void onReady(NetSocketFn ready, void* user) const;
  void onData(NetDataFn data, void* user) const;
  void onEnd(NetSocketFn end, void* user) const;
  void onClose(NetSocketFn close, void* user) const;
  void onError(NetSocketErrorFn error, void* user) const;
  void onDrain(NetSocketFn drain, void* user) const;
  void readStart() const;
  void readStop() const;
  void setEncoding(inox::StringView encoding) const;
  NetAddress address() const;
  NetAddress remoteAddress() const;
  size_t bytesRead() const;
  size_t bytesWritten() const;
  void setNoDelay(bool enabled) const;
  void setKeepAlive(bool enabled, unsigned int initial_delay) const;
  void ref() const;
  void unref() const;
  void write(inox::StringView bytes, NetSocketWriteFn callback = nullptr, void* user = nullptr) const;
  void end(inox::StringView bytes = inox::StringView(), NetSocketWriteFn callback = nullptr, void* user = nullptr) const;
  void destroy() const;
  void close() const;
};

#endif

#endif
