#include "inox/dns.h"

#include <array>
#include <cmath>
#include <cstring>
#include <new>
#include <string>
#include <utility>

#include "inox/loop.h"
#include "inox/object.h"

#ifdef INOX_LOOP_BACKEND_LIBUV
#include "loop-libuv-internal.h"
#endif

namespace {

void throwDnsError(const char* message) {
  inox::throw_value(inox::String(message == nullptr ? "TypeError: DNS operation failed" : message));
}

inox::Value materializeDnsError(const inox::String& message) {
  static const inox_field_info fields[] = {
    {"message", INOX_FIELD_READONLY},
  };
  static const inox_shape shape = {1, fields};

  inox::ObjectValue error = inox::ObjectValue::create(&shape);

  if (!error.valid() || inox::thrown()) {
    return inox::Value();
  }

  error.init(0, message.raw());
  return inox::thrown() ? inox::Value() : inox::Value(std::move(error));
}

inox::Value materializeLookupAddress(const inox::String& address, double family) {
  static const inox_field_info fields[] = {
    {"address", INOX_FIELD_READONLY},
    {"family", INOX_FIELD_READONLY},
  };
  static const inox_shape shape = {2, fields};

  inox::ObjectValue result = inox::ObjectValue::create(&shape);

  if (!result.valid() || inox::thrown()) {
    return inox::Value();
  }

  result.init(0, address.raw());
  result.init(1, inox_number_value(family));
  return inox::thrown() ? inox::Value() : inox::Value(std::move(result));
}

bool validFamily(double family) {
  if (!std::isfinite(family) || std::floor(family) != family) {
    return false;
  }

  return family == 0 || family == 4 || family == 6;
}

inox::Promise rejectedDnsPromise(const inox::String& message) {
  inox::Value error = materializeDnsError(message);

  if (inox::thrown()) {
    error = inox::take_exception();
  }

  return inox::Promise::reject(std::move(error));
}

inox::Promise rejectDnsPromise(inox::Promise promise, const inox::String& message) {
  inox::Value error = materializeDnsError(message);

  if (inox::thrown()) {
    error = inox::take_exception();
  }

  if (promise.rejectWith(std::move(error)) != INOX_OK) {
    return inox::Promise();
  }

  return promise;
}

#ifdef INOX_LOOP_BACKEND_LIBUV

struct DnsLookupRequest {
  uv_getaddrinfo_t request;
  inox_loop* loop;
  std::string hostname;
  inox::Callback callback;
  inox::Promise promise;
  bool promise_mode;
};

void reportDnsStatus(inox_loop* loop, inox_status status) {
  if (status != INOX_OK) {
    inox_libuv_loop_report_status(loop, status);
  }
}

inox::Value dnsErrorForStatus(int status) {
  const char* details = status == 0 ? "address not found" : uv_strerror(status);
  inox::String message = inox::String::fromFormat("getaddrinfo %s", details);

  if (inox::thrown()) {
    return inox::Value();
  }

  return materializeDnsError(message);
}

bool firstAddress(addrinfo* addresses, inox::String& address, double& family) {
  for (addrinfo* item = addresses; item != nullptr; item = item->ai_next) {
    if (item->ai_addr == nullptr) {
      continue;
    }

    if (item->ai_family == AF_INET) {
      char text[INET_ADDRSTRLEN] = {};
      const auto* ipv4 = reinterpret_cast<const sockaddr_in*>(item->ai_addr);

      if (uv_ip4_name(ipv4, text, sizeof(text)) == 0) {
        address = inox::String(text);
        family = 4;
        return !inox::thrown();
      }
    }

    if (item->ai_family == AF_INET6) {
      char text[INET6_ADDRSTRLEN] = {};
      const auto* ipv6 = reinterpret_cast<const sockaddr_in6*>(item->ai_addr);

      if (uv_ip6_name(ipv6, text, sizeof(text)) == 0) {
        address = inox::String(text);
        family = 6;
        return !inox::thrown();
      }
    }
  }

  return false;
}

void finishCallbackLookup(
  DnsLookupRequest& request,
  inox::Value error,
  inox::String address,
  double family
) {
  const std::array<inox::Value, 3> arguments = {
    std::move(error),
    std::move(address),
    inox::Value(inox_number_value(family)),
  };
  inox::Value result = request.callback.call(arguments);
  (void)result;

  if (inox::thrown()) {
    reportDnsStatus(request.loop, INOX_ERR_THROW);
  }
}

void finishPromiseLookup(
  DnsLookupRequest& request,
  inox::Value error,
  inox::String address,
  double family
) {
  if (error.tag != INOX_TAG_NULL) {
    reportDnsStatus(request.loop, request.promise.rejectWith(std::move(error)));
    return;
  }

  inox::Value result = materializeLookupAddress(address, family);

  if (inox::thrown()) {
    result = inox::take_exception();
    reportDnsStatus(request.loop, request.promise.rejectWith(std::move(result)));
    return;
  }

  reportDnsStatus(request.loop, request.promise.fulfill(std::move(result)));
}

void dnsLookupCallback(uv_getaddrinfo_t* native_request, int status, addrinfo* addresses) {
  auto* request = native_request == nullptr ? nullptr : static_cast<DnsLookupRequest*>(native_request->data);

  if (request == nullptr) {
    if (addresses != nullptr) {
      uv_freeaddrinfo(addresses);
    }
    return;
  }

  inox::String address("");
  double family = 0;
  inox::Value error(inox_null_value());

  if (status != 0 || !firstAddress(addresses, address, family)) {
    if (inox::thrown()) {
      error = inox::take_exception();
    } else {
      error = dnsErrorForStatus(status);

      if (inox::thrown()) {
        error = inox::take_exception();
      }
    }
  }

  if (addresses != nullptr) {
    uv_freeaddrinfo(addresses);
  }

  if (request->promise_mode) {
    finishPromiseLookup(*request, std::move(error), std::move(address), family);
  } else {
    finishCallbackLookup(*request, std::move(error), std::move(address), family);
  }

  delete request;
}

DnsLookupRequest* allocateLookupRequest(
  inox::StringView hostname,
  inox::Callback callback,
  inox::Promise promise,
  bool promise_mode
) {
  DnsLookupRequest* request = new (std::nothrow) DnsLookupRequest{
    uv_getaddrinfo_t(),
    inox::loop(),
    std::string(),
    std::move(callback),
    std::move(promise),
    promise_mode,
  };

  if (request == nullptr) {
    return nullptr;
  }

  try {
    request->hostname.assign(hostname.bytes, hostname.len);
  } catch (const std::bad_alloc&) {
    delete request;
    return nullptr;
  }

  request->request.data = request;
  return request;
}

int queueLookup(DnsLookupRequest& request, int address_family) {
  uv_loop_t* loop = request.loop == nullptr ? nullptr : inox_libuv_loop_handle(request.loop);

  if (loop == nullptr) {
    return UV_ENOSYS;
  }

  addrinfo hints = {};
  hints.ai_family = address_family;
  hints.ai_socktype = SOCK_STREAM;

  return uv_getaddrinfo(
    loop,
    &request.request,
    dnsLookupCallback,
    request.hostname.c_str(),
    nullptr,
    &hints
  );
}

int nativeAddressFamily(double family) {
  if (family == 4) {
    return AF_INET;
  }

  if (family == 6) {
    return AF_INET6;
  }

  return AF_UNSPEC;
}

void queueCallbackLookup(inox::StringView hostname, double family, inox::Callback callback) {
  if (hostname.len == 0 || hostname.bytes == nullptr || !callback.valid() || !validFamily(family)) {
    throwDnsError("TypeError: dns.lookup arguments are invalid");
    return;
  }

  DnsLookupRequest* request = allocateLookupRequest(
    hostname,
    std::move(callback),
    inox::Promise(),
    false
  );

  if (request == nullptr) {
    throwDnsError("TypeError: dns.lookup allocation failed");
    return;
  }

  const int status = queueLookup(*request, nativeAddressFamily(family));

  if (status != 0) {
    delete request;
    throwDnsError("TypeError: dns.lookup could not start");
  }
}

inox::Promise queuePromiseLookup(inox::StringView hostname, double family) {
  if (hostname.len == 0 || hostname.bytes == nullptr || !validFamily(family)) {
    return rejectedDnsPromise(inox::String("dns.lookup arguments are invalid"));
  }

  inox::Promise promise = inox::Promise::create();

  if (!promise.valid()) {
    return inox::Promise();
  }

  DnsLookupRequest* request = allocateLookupRequest(
    hostname,
    inox::Callback(),
    promise,
    true
  );

  if (request == nullptr) {
    return rejectDnsPromise(std::move(promise), inox::String("dns.lookup allocation failed"));
  }

  const int status = queueLookup(*request, nativeAddressFamily(family));

  if (status != 0) {
    delete request;
    return rejectDnsPromise(
      std::move(promise),
      inox::String::fromFormat("dns.lookup failed: %s", uv_strerror(status))
    );
  }

  return promise;
}

#endif

} // namespace

DnsLookupOptions::DnsLookupOptions() : valid_(true), family_(0) {}

DnsLookupOptions::DnsLookupOptions(const inox::Value& value) : valid_(false), family_(0) {
  const inox_value raw = value.raw();

  if (raw.tag != INOX_TAG_OBJECT && raw.tag != INOX_TAG_CLASS_INSTANCE) {
    return;
  }

  inox::Value field;
  const inox_status status = inox_object_get(raw, "family", 6, field.out());

  if (status == INOX_ERR_FIELD || (status == INOX_OK && field.tag == INOX_TAG_UNDEFINED)) {
    valid_ = true;
    return;
  }

  if (status != INOX_OK || field.tag != INOX_TAG_NUMBER || !validFamily(field.as.number)) {
    return;
  }

  family_ = field.as.number;
  valid_ = true;
}

bool DnsLookupOptions::valid() const {
  return valid_;
}

double DnsLookupOptions::family() const {
  return family_;
}

void DnsModule::lookup(inox::StringView hostname, inox::Callback callback) const {
  lookup(hostname, 0, std::move(callback));
}

void DnsModule::lookup(inox::StringView hostname, double family, inox::Callback callback) const {
#ifdef INOX_LOOP_BACKEND_LIBUV
  queueCallbackLookup(hostname, family, std::move(callback));
#else
  (void)hostname;
  (void)family;
  (void)callback;
  throwDnsError("TypeError: node:dns requires the libuv loop backend");
#endif
}

void DnsModule::lookup(
  inox::StringView hostname,
  const DnsLookupOptions& options,
  inox::Callback callback
) const {
  if (!options.valid()) {
    throwDnsError("TypeError: dns.lookup options are invalid");
    return;
  }

  lookup(hostname, options.family(), std::move(callback));
}

inox::Promise DnsPromisesModule::lookup(inox::StringView hostname) const {
  return lookup(hostname, 0);
}

inox::Promise DnsPromisesModule::lookup(inox::StringView hostname, double family) const {
#ifdef INOX_LOOP_BACKEND_LIBUV
  return queuePromiseLookup(hostname, family);
#else
  (void)hostname;
  (void)family;
  return rejectedDnsPromise(inox::String("node:dns requires the libuv loop backend"));
#endif
}

inox::Promise DnsPromisesModule::lookup(
  inox::StringView hostname,
  const DnsLookupOptions& options
) const {
  if (!options.valid()) {
    return rejectedDnsPromise(inox::String("dns.lookup options are invalid"));
  }

  return lookup(hostname, options.family());
}

const DnsModule dns;
