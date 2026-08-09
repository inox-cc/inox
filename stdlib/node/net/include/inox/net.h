#ifndef INOX_NET_H
#define INOX_NET_H

#include <optional>

#include "inox/callback.h"
#include "inox/string.h"
#include "inox/string_view.h"
#include "inox/value.h"

struct NetAddress {
  inox::String address;
  inox::String family;
  double port;
};

class NetListenOptions {
public:
  NetListenOptions();
  explicit NetListenOptions(const inox::Value& value);

private:
  bool valid_;
  std::optional<double> port_;
  std::optional<inox::String> host_;
  std::optional<double> backlog_;

  friend class NetServer;
};

class NetConnectionOptions {
public:
  NetConnectionOptions();
  explicit NetConnectionOptions(const inox::Value& value);

private:
  bool valid_;
  std::optional<double> port_;
  std::optional<inox::String> host_;

  friend class NetModule;
};

class NetServer : public inox::Value {
public:
  NetServer();
  explicit NetServer(const inox::Value& value);
  explicit NetServer(inox::Value&& value);

  using inox::Value::operator=;

  NetAddress address() const;
  NetServer& close();
  NetServer& close(inox::Callback callback);
  NetServer& getConnections(inox::Callback callback);
  bool listening() const;
  NetServer& listen();
  NetServer& listen(inox::Callback callback);
  NetServer& listen(double port);
  NetServer& listen(double port, double backlog);
  NetServer& listen(double port, inox::Callback callback);
  NetServer& listen(double port, inox::StringView host);
  NetServer& listen(double port, inox::StringView host, inox::Callback callback);
  NetServer& listen(double port, inox::StringView host, double backlog);
  NetServer& listen(double port, double backlog, inox::Callback callback);
  NetServer& listen(double port, inox::StringView host, double backlog, inox::Callback callback);
  NetServer& listen(const NetListenOptions& options);
  NetServer& listen(const NetListenOptions& options, inox::Callback callback);
  inox::Value maxConnections() const;
  NetServer& on(inox::StringView event_name, inox::Callback listener);
  NetServer& ref();
  void setMaxConnections(double maximum);
  NetServer& unref();
};

class NetSocket : public inox::Value {
public:
  NetSocket();
  explicit NetSocket(const inox::Value& value);
  explicit NetSocket(inox::Value&& value);

  using inox::Value::operator=;

  NetAddress address() const;
  double bytesRead() const;
  double bytesWritten() const;
  bool connecting() const;
  NetSocket& destroy();
  bool destroyed() const;
  NetSocket& end();
  NetSocket& end(inox::Callback callback);
  NetSocket& end(inox::StringView text);
  NetSocket& end(inox::StringView text, inox::Callback callback);
  bool isPaused() const;
  inox::String localAddress() const;
  double localPort() const;
  NetSocket& on(inox::StringView event_name, inox::Callback listener);
  NetSocket& pause();
  bool pending() const;
  inox::String readyState() const;
  NetSocket& ref();
  NetSocket& resume();
  inox::String remoteAddress() const;
  double remotePort() const;
  NetSocket& setEncoding(inox::StringView encoding);
  NetSocket& setKeepAlive();
  NetSocket& setKeepAlive(bool enabled);
  NetSocket& setKeepAlive(bool enabled, double initial_delay);
  NetSocket& setNoDelay();
  NetSocket& setNoDelay(bool enabled);
  NetSocket& setTimeout(double timeout);
  NetSocket& setTimeout(double timeout, inox::Callback callback);
  NetSocket& unref();
  bool write(inox::StringView text);
  bool write(inox::StringView text, inox::Callback callback);
};

class NetModule {
public:
  NetSocket connect(double port) const;
  NetSocket connect(double port, inox::Callback callback) const;
  NetSocket connect(double port, inox::StringView host) const;
  NetSocket connect(double port, inox::StringView host, inox::Callback callback) const;
  NetSocket connect(const NetConnectionOptions& options) const;
  NetSocket connect(const NetConnectionOptions& options, inox::Callback callback) const;
  NetServer createServer() const;
  NetServer createServer(inox::Callback listener) const;
};

extern const NetModule net;

#endif
