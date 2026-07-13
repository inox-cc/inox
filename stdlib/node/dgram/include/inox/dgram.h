#ifndef INOX_DGRAM_H
#define INOX_DGRAM_H

#include <memory>
#include <optional>

#include "inox/buffer.h"
#include "inox/callback.h"
#include "inox/string.h"
#include "inox/string_view.h"

struct DgramAddress {
  inox::String address;
  inox::String family;
  double port;
};

struct DgramRemoteInfo : DgramAddress {
  double size;
};

class DgramSocket;
class DgramModule;

class DgramSocketOptions {
public:
  DgramSocketOptions();
  explicit DgramSocketOptions(const inox::Value& value);

private:
  bool valid_;
  inox::String type_;
  bool reuse_addr_;
  std::optional<double> recv_buffer_size_;
  std::optional<double> send_buffer_size_;

  friend class DgramModule;
};

class DgramBindOptions {
public:
  DgramBindOptions();
  explicit DgramBindOptions(const inox::Value& value);

private:
  bool valid_;
  std::optional<double> port_;
  std::optional<inox::String> address_;

  friend class DgramSocket;
};

class DgramSocket {
private:
  class Impl;
  std::shared_ptr<Impl> impl_;

  explicit DgramSocket(std::shared_ptr<Impl> impl);

  friend class DgramModule;

public:
  DgramSocket();
  DgramSocket(const DgramSocket& other);
  DgramSocket(DgramSocket&& other) noexcept;
  DgramSocket& operator=(const DgramSocket& other);
  DgramSocket& operator=(DgramSocket&& other) noexcept;
  ~DgramSocket();

  DgramAddress address() const;
  DgramSocket& bind();
  DgramSocket& bind(double port);
  DgramSocket& bind(double port, inox::StringView address);
  DgramSocket& bind(double port, inox::StringView address, inox::Callback callback);
  DgramSocket& bind(const DgramBindOptions& options);
  DgramSocket& bind(const DgramBindOptions& options, inox::Callback callback);
  DgramSocket& close();
  DgramSocket& close(inox::Callback callback);
  DgramSocket& connect(double port);
  DgramSocket& connect(double port, inox::StringView address);
  DgramSocket& connect(double port, inox::StringView address, inox::Callback callback);
  DgramSocket& disconnect();
  double getRecvBufferSize() const;
  double getSendBufferSize() const;
  DgramSocket& on(inox::StringView event_name, inox::Callback listener);
  DgramSocket& ref();
  DgramAddress remoteAddress() const;
  void send(inox::StringView message);
  void send(inox::StringView message, inox::Callback callback);
  void send(inox::StringView message, double port, inox::StringView address);
  void send(inox::StringView message, double port, inox::StringView address, inox::Callback callback);
  void send(const Uint8Array& message);
  void send(const Uint8Array& message, inox::Callback callback);
  void send(const Uint8Array& message, double port, inox::StringView address);
  void send(const Uint8Array& message, double port, inox::StringView address, inox::Callback callback);
  DgramSocket& setBroadcast(bool enabled);
  DgramSocket& setRecvBufferSize(double size);
  DgramSocket& setSendBufferSize(double size);
  DgramSocket& setTTL(double ttl);
  DgramSocket& unref();
};

class DgramModule {
public:
  DgramSocket createSocket(inox::StringView type) const;
  DgramSocket createSocket(inox::StringView type, inox::Callback listener) const;
  DgramSocket createSocket(const DgramSocketOptions& options) const;
  DgramSocket createSocket(const DgramSocketOptions& options, inox::Callback listener) const;
};

extern const DgramModule dgram;

#endif
