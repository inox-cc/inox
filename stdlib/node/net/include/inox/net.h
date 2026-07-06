#ifndef INOX_NET_H
#define INOX_NET_H

#include <stddef.h>
#include "inox/loop.h"

#ifdef __cplusplus
#include "inox/string_view.h"
#endif

typedef struct inox_net_server inox_net_server;
typedef struct inox_net_socket inox_net_socket;

typedef struct inox_net_address {
  char address[64];
  const char* family;
  int port;
} inox_net_address;

typedef inox_status (*inox_net_connection_fn)(void* user, inox_net_server* server, inox_net_socket* socket);
typedef inox_status (*inox_net_server_fn)(void* user, inox_net_server* server);
typedef inox_status (*inox_net_server_error_fn)(void* user, inox_net_server* server, inox_status status);
typedef inox_status (*inox_net_connect_fn)(void* user, inox_net_socket* socket, inox_status status);
typedef inox_status (*inox_net_data_fn)(void* user, inox_net_socket* socket, const char* bytes, size_t len);
typedef void (*inox_net_close_fn)(void* user, inox_net_socket* socket);
typedef inox_status (*inox_net_socket_fn)(void* user, inox_net_socket* socket);
typedef inox_status (*inox_net_socket_error_fn)(void* user, inox_net_socket* socket, inox_status status);
typedef inox_status (*inox_net_socket_write_fn)(void* user, inox_net_socket* socket, inox_status status);

#ifdef __cplusplus

class NetServer {
private:
  inox_net_server* server_;

public:
  explicit NetServer(inox_net_server* server);

  static inox_status create(inox_loop* loop, inox_net_connection_fn connection, void* user, inox_net_server** out);

  inox_status onConnection(inox_net_connection_fn connection, void* user) const;
  inox_status onListening(inox_net_server_fn listening, void* user) const;
  inox_status onClose(inox_net_server_fn close, void* user) const;
  inox_status onError(inox_net_server_error_fn error, void* user) const;
  inox_status listen(const char* host, int port, int backlog) const;
  inox_status address(inox_net_address* out) const;
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
    inox_net_connect_fn connect,
    inox_net_data_fn data,
    inox_net_close_fn close,
    void* user,
    inox_net_socket** out
  );

  void setCallbacks(inox_net_data_fn data, inox_net_close_fn close, void* user) const;
  inox_status onConnect(inox_net_socket_fn connect, void* user) const;
  inox_status onReady(inox_net_socket_fn ready, void* user) const;
  inox_status onData(inox_net_data_fn data, void* user) const;
  inox_status onEnd(inox_net_socket_fn end, void* user) const;
  inox_status onClose(inox_net_socket_fn close, void* user) const;
  inox_status onError(inox_net_socket_error_fn error, void* user) const;
  inox_status onDrain(inox_net_socket_fn drain, void* user) const;
  inox_status readStart() const;
  inox_status readStop() const;
  inox_status setEncoding(inox::StringView encoding) const;
  inox_status address(inox_net_address* out) const;
  inox_status remoteAddress(inox_net_address* out) const;
  inox_status bytesRead(size_t* out_bytes) const;
  inox_status bytesWritten(size_t* out_bytes) const;
  inox_status setNoDelay(bool enabled) const;
  inox_status setKeepAlive(bool enabled, unsigned int initial_delay) const;
  inox_status ref() const;
  inox_status unref() const;
  inox_status write(inox::StringView bytes, inox_net_socket_write_fn callback = nullptr, void* user = nullptr) const;
  inox_status end(inox::StringView bytes = inox::StringView(), inox_net_socket_write_fn callback = nullptr, void* user = nullptr) const;
  inox_status destroy() const;
  void close() const;
};

#endif

#endif
