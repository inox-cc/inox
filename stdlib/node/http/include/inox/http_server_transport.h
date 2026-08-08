#ifndef INOX_HTTP_SERVER_TRANSPORT_H
#define INOX_HTTP_SERVER_TRANSPORT_H

#include <memory>

#include "inox/callback.h"
#include "inox/net.h"
#include "inox/string_view.h"

class HttpServer;

class HttpServerConnectionTransport {
public:
  virtual ~HttpServerConnectionTransport();

  virtual void destroy() = 0;
  virtual void end(inox::StringView data, inox::Callback callback) = 0;
  virtual NetSocket socket() const = 0;
  virtual void start(
    inox::Callback close,
    inox::Callback error,
    inox::Callback data
  ) = 0;
  virtual bool write(inox::StringView data) = 0;
  virtual bool write(inox::StringView data, inox::Callback callback) = 0;
};

HttpServer makeHttpServer(NetServer server, inox::Callback listener);
void acceptHttpServerConnection(
  const HttpServer& server,
  std::shared_ptr<HttpServerConnectionTransport> transport
);

#endif
