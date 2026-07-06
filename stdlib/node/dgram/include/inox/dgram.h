#ifndef INOX_DGRAM_H
#define INOX_DGRAM_H

#include <stddef.h>
#include "inox/loop.h"

typedef struct inox_dgram_socket inox_dgram_socket;

typedef struct inox_dgram_address {
  char address[64];
  const char* family;
  int port;
} inox_dgram_address;

typedef inox_status (*inox_dgram_recv_fn)(
  void* user,
  inox_dgram_socket* socket,
  const char* bytes,
  size_t len,
  const char* host,
  int port
);
typedef inox_status (*inox_dgram_send_fn)(void* user, inox_status status);
typedef void (*inox_dgram_close_fn)(void* user, inox_dgram_socket* socket);

#define INOX_DGRAM_BIND_REUSEADDR 1u

inox_status inox_dgram_socket_new(
  inox_loop* loop,
  inox_dgram_recv_fn recv,
  void* user,
  inox_dgram_socket** out
);
inox_status inox_dgram_bind(inox_dgram_socket* socket, const char* host, int port);
inox_status inox_dgram_bind_flags(inox_dgram_socket* socket, const char* host, int port, unsigned int flags);
inox_status inox_dgram_socket_on_message(inox_dgram_socket* socket, inox_dgram_recv_fn recv, void* user);
inox_status inox_dgram_socket_on_close(inox_dgram_socket* socket, inox_dgram_close_fn close, void* user);
inox_status inox_dgram_socket_connect(inox_dgram_socket* socket, const char* host, int port);
inox_status inox_dgram_socket_disconnect(inox_dgram_socket* socket);
inox_status inox_dgram_recv_start(inox_dgram_socket* socket);
inox_status inox_dgram_recv_stop(inox_dgram_socket* socket);
inox_status inox_dgram_send(inox_dgram_socket* socket, const char* bytes, size_t len, const char* host, int port);
inox_status inox_dgram_send_with_callback(
  inox_dgram_socket* socket,
  const char* bytes,
  size_t len,
  const char* host,
  int port,
  inox_dgram_send_fn callback,
  void* user
);
inox_status inox_dgram_send_connected(inox_dgram_socket* socket, const char* bytes, size_t len);
inox_status inox_dgram_send_connected_with_callback(
  inox_dgram_socket* socket,
  const char* bytes,
  size_t len,
  inox_dgram_send_fn callback,
  void* user
);
void inox_dgram_close(inox_dgram_socket* socket);

#ifdef __cplusplus

class DgramSocket {
private:
  inox_dgram_socket* socket_;

public:
  explicit DgramSocket(inox_dgram_socket* socket);

  inox_status address(inox_dgram_address* out) const;
  inox_status remoteAddress(inox_dgram_address* out) const;
  inox_status localPort(int* out_port) const;
  inox_status setBroadcast(bool enabled) const;
  inox_status setTTL(int ttl) const;
  inox_status getSendBufferSize(int* out_size) const;
  inox_status setSendBufferSize(int size) const;
  inox_status getRecvBufferSize(int* out_size) const;
  inox_status setRecvBufferSize(int size) const;
  inox_status ref() const;
  inox_status unref() const;
};

#endif

#endif
