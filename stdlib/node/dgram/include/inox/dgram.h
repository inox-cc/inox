#ifndef INOX_DGRAM_H
#define INOX_DGRAM_H

#include <stddef.h>

#include "inox/loop.h"
#include "inox/string_view.h"

struct inox_dgram_socket;

struct DgramAddress {
  char address[64];
  inox::StringView family;
  int port;
};

class DgramSocket;

typedef void (*DgramRecvFn)(
  void* user,
  DgramSocket socket,
  inox::StringView bytes,
  inox::StringView host,
  int port
);
typedef void (*DgramCloseFn)(void* user, inox_dgram_socket* socket);

#define INOX_DGRAM_BIND_REUSEADDR 1u

#ifdef __cplusplus

class DgramSocket {
private:
  inox_dgram_socket* socket_;

public:
  DgramSocket();
  explicit DgramSocket(inox_dgram_socket* socket);

  static DgramSocket create(inox_loop* loop, DgramRecvFn recv, void* user);

  void bind(inox::StringView host, int port, unsigned int flags = 0) const;
  void onMessage(DgramRecvFn recv, void* user) const;
  void onClose(DgramCloseFn close, void* user) const;
  void connect(inox::StringView host, int port) const;
  void disconnect() const;
  void recvStart() const;
  void recvStop() const;
  void send(inox::StringView bytes) const;
  void send(inox::StringView bytes, inox::StringView host, int port) const;
  void close() const;
  DgramAddress address() const;
  DgramAddress remoteAddress() const;
  int localPort() const;
  void setBroadcast(bool enabled) const;
  void setTTL(int ttl) const;
  int getSendBufferSize() const;
  void setSendBufferSize(int size) const;
  int getRecvBufferSize() const;
  void setRecvBufferSize(int size) const;
  void ref() const;
  void unref() const;
};

#endif

#endif
