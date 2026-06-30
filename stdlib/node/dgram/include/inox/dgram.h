#ifndef INOX_DGRAM_H
#define INOX_DGRAM_H

#include <stddef.h>
#include "inox/loop.h"

#ifdef __cplusplus
extern "C" {
#endif

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
inox_status inox_dgram_socket_address(inox_dgram_socket* socket, inox_dgram_address* out);
inox_status inox_dgram_socket_remote_address(inox_dgram_socket* socket, inox_dgram_address* out);
inox_status inox_dgram_local_port(inox_dgram_socket* socket, int* out_port);
inox_status inox_dgram_set_broadcast(inox_dgram_socket* socket, int enabled);
inox_status inox_dgram_set_ttl(inox_dgram_socket* socket, int ttl);
inox_status inox_dgram_get_send_buffer_size(inox_dgram_socket* socket, int* out_size);
inox_status inox_dgram_set_send_buffer_size(inox_dgram_socket* socket, int size);
inox_status inox_dgram_get_recv_buffer_size(inox_dgram_socket* socket, int* out_size);
inox_status inox_dgram_set_recv_buffer_size(inox_dgram_socket* socket, int size);
inox_status inox_dgram_ref(inox_dgram_socket* socket);
inox_status inox_dgram_unref(inox_dgram_socket* socket);
void inox_dgram_close(inox_dgram_socket* socket);

#ifdef __cplusplus
}
#endif

#endif
