#include "inox/dns.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstring>
#include <new>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "inox/array.h"
#include "inox/loop.h"
#include "inox/object.h"

#ifdef INOX_LOOP_BACKEND_LIBUV
#include "loop-libuv-internal.h"
#endif

namespace {

constexpr int resultOrderVerbatim = 0;
constexpr int resultOrderIpv4First = 4;
constexpr int resultOrderIpv6First = 6;

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

inox::Value materializeLookupService(const inox::String& hostname, const inox::String& service) {
  static const inox_field_info fields[] = {
    {"hostname", INOX_FIELD_READONLY},
    {"service", INOX_FIELD_READONLY},
  };
  static const inox_shape shape = {2, fields};

  inox::ObjectValue result = inox::ObjectValue::create(&shape);

  if (!result.valid() || inox::thrown()) {
    return inox::Value();
  }

  result.init(0, hostname.raw());
  result.init(1, service.raw());
  return inox::thrown() ? inox::Value() : inox::Value(std::move(result));
}

bool validFamily(double family) {
  if (!std::isfinite(family) || std::floor(family) != family) {
    return false;
  }

  return family == 0 || family == 4 || family == 6;
}

bool validPort(double port) {
  return std::isfinite(port) && std::floor(port) == port && port >= 0 && port <= 65535;
}

bool stringEquals(const inox::Value& value, std::string_view expected) {
  if (value.tag != INOX_TAG_STRING || value.as.ref == nullptr) {
    return false;
  }

  const inox::String string(value);
  return string.length() == expected.size() && std::memcmp(string.bytes(), expected.data(), expected.size()) == 0;
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

struct DnsAddress {
  inox::String address;
  double family;
};

struct DnsLookupRequest {
  uv_getaddrinfo_t request;
  inox_loop* loop;
  std::string hostname;
  inox::Callback callback;
  inox::Promise promise;
  bool promiseMode;
  bool all;
  int order;
};

struct DnsLookupServiceRequest {
  uv_getnameinfo_t request;
  inox_loop* loop;
  sockaddr_storage address;
  inox::Callback callback;
  inox::Promise promise;
  bool promiseMode;
};

void reportDnsStatus(inox_loop* loop, inox_status status) {
  if (status != INOX_OK) {
    inox_libuv_loop_report_status(loop, status);
  }
}

inox::Value dnsErrorForStatus(const char* operation, int status) {
  const char* details = status == 0 ? "result not found" : uv_strerror(status);
  inox::String message = inox::String::fromFormat("%s %s", operation, details);

  if (inox::thrown()) {
    return inox::Value();
  }

  return materializeDnsError(message);
}

bool appendAddress(std::vector<DnsAddress>& output, const char* text, double family) {
  inox::String address(text);

  if (inox::thrown()) {
    return false;
  }

  try {
    output.push_back({std::move(address), family});
  } catch (const std::bad_alloc&) {
    inox::throw_out_of_memory();
    return false;
  }

  return true;
}

bool collectAddresses(addrinfo* addresses, int order, std::vector<DnsAddress>& output) {
  for (addrinfo* item = addresses; item != nullptr; item = item->ai_next) {
    if (item->ai_addr == nullptr) {
      continue;
    }

    if (item->ai_family == AF_INET) {
      char text[INET_ADDRSTRLEN] = {};
      const auto* ipv4 = reinterpret_cast<const sockaddr_in*>(item->ai_addr);

      if (uv_ip4_name(ipv4, text, sizeof(text)) == 0 && !appendAddress(output, text, 4)) {
        return false;
      }
    } else if (item->ai_family == AF_INET6) {
      char text[INET6_ADDRSTRLEN] = {};
      const auto* ipv6 = reinterpret_cast<const sockaddr_in6*>(item->ai_addr);

      if (uv_ip6_name(ipv6, text, sizeof(text)) == 0 && !appendAddress(output, text, 6)) {
        return false;
      }
    }
  }

  if (order == resultOrderVerbatim || output.size() < 2) {
    return !output.empty();
  }

  try {
    std::stable_partition(output.begin(), output.end(), [order](const DnsAddress& item) {
      return item.family == order;
    });
  } catch (const std::bad_alloc&) {
    inox::throw_out_of_memory();
    return false;
  }

  return !output.empty();
}

Array materializeLookupAddresses(const std::vector<DnsAddress>& addresses) {
  Array result = Array::create(addresses.size());

  if (!result.valid() || inox::thrown()) {
    return Array();
  }

  for (std::size_t index = 0; index < addresses.size(); index += 1) {
    inox::Value address = materializeLookupAddress(addresses[index].address, addresses[index].family);

    if (inox::thrown()) {
      return Array();
    }

    result.set(index, address);

    if (inox::thrown()) {
      return Array();
    }
  }

  return result;
}

void finishCallbackLookup(DnsLookupRequest& request, inox::Value error, const std::vector<DnsAddress>& addresses) {
  if (request.all) {
    Array result = error.tag == INOX_TAG_NULL ? materializeLookupAddresses(addresses) : Array::create(0);

    if (inox::thrown()) {
      reportDnsStatus(request.loop, INOX_ERR_THROW);
      return;
    }

    const std::array<inox::Value, 2> arguments = {
      std::move(error),
      std::move(result),
    };
    inox::Value callbackResult = request.callback.call(arguments);
    (void)callbackResult;
  } else {
    const bool hasAddress = !addresses.empty();
    const std::array<inox::Value, 3> arguments = {
      std::move(error),
      hasAddress ? inox::Value(addresses[0].address) : inox::Value(inox::String("")),
      inox::Value(inox_number_value(hasAddress ? addresses[0].family : 0)),
    };
    inox::Value callbackResult = request.callback.call(arguments);
    (void)callbackResult;
  }

  if (inox::thrown()) {
    reportDnsStatus(request.loop, INOX_ERR_THROW);
  }
}

void finishPromiseLookup(DnsLookupRequest& request, inox::Value error, const std::vector<DnsAddress>& addresses) {
  if (error.tag != INOX_TAG_NULL) {
    reportDnsStatus(request.loop, request.promise.rejectWith(std::move(error)));
    return;
  }

  inox::Value result = request.all
    ? inox::Value(materializeLookupAddresses(addresses))
    : materializeLookupAddress(addresses[0].address, addresses[0].family);

  if (inox::thrown()) {
    result = inox::take_exception();
    reportDnsStatus(request.loop, request.promise.rejectWith(std::move(result)));
    return;
  }

  reportDnsStatus(request.loop, request.promise.fulfill(std::move(result)));
}

void dnsLookupCallback(uv_getaddrinfo_t* nativeRequest, int status, addrinfo* addresses) {
  auto* request = nativeRequest == nullptr ? nullptr : static_cast<DnsLookupRequest*>(nativeRequest->data);

  if (request == nullptr) {
    if (addresses != nullptr) {
      uv_freeaddrinfo(addresses);
    }
    return;
  }

  std::vector<DnsAddress> resolved;
  inox::Value error(inox_null_value());

  if (status != 0 || !collectAddresses(addresses, request->order, resolved)) {
    if (inox::thrown()) {
      error = inox::take_exception();
    } else {
      error = dnsErrorForStatus("getaddrinfo", status);

      if (inox::thrown()) {
        error = inox::take_exception();
      }
    }
  }

  if (addresses != nullptr) {
    uv_freeaddrinfo(addresses);
  }

  if (request->promiseMode) {
    finishPromiseLookup(*request, std::move(error), resolved);
  } else {
    finishCallbackLookup(*request, std::move(error), resolved);
  }

  delete request;
}

DnsLookupRequest* allocateLookupRequest(
  inox::StringView hostname,
  inox::Callback callback,
  inox::Promise promise,
  bool promiseMode,
  bool all,
  int order
) {
  DnsLookupRequest* request = new (std::nothrow) DnsLookupRequest{
    uv_getaddrinfo_t(),
    inox::loop(),
    std::string(),
    std::move(callback),
    std::move(promise),
    promiseMode,
    all,
    order,
  };

  if (request == nullptr) {
    inox::throw_out_of_memory();
    return nullptr;
  }

  try {
    request->hostname.assign(hostname.bytes, hostname.len);
  } catch (const std::bad_alloc&) {
    delete request;
    inox::throw_out_of_memory();
    return nullptr;
  }

  request->request.data = request;
  return request;
}

int queueLookup(DnsLookupRequest& request, int addressFamily) {
  uv_loop_t* loop = request.loop == nullptr ? nullptr : inox_libuv_loop_handle(request.loop);

  if (loop == nullptr) {
    return UV_ENOSYS;
  }

  addrinfo hints = {};
  hints.ai_family = addressFamily;
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

void queueCallbackLookup(
  inox::StringView hostname,
  double family,
  bool all,
  int order,
  inox::Callback callback
) {
  if (hostname.len == 0 || hostname.bytes == nullptr || !callback.valid() || !validFamily(family)) {
    throwDnsError("TypeError: dns.lookup arguments are invalid");
    return;
  }

  DnsLookupRequest* request = allocateLookupRequest(
    hostname,
    std::move(callback),
    inox::Promise(),
    false,
    all,
    order
  );

  if (request == nullptr) {
    if (!inox::thrown()) {
      throwDnsError("TypeError: dns.lookup allocation failed");
    }
    return;
  }

  const int status = queueLookup(*request, nativeAddressFamily(family));

  if (status != 0) {
    delete request;
    throwDnsError("TypeError: dns.lookup could not start");
  }
}

inox::Promise queuePromiseLookup(inox::StringView hostname, double family, bool all, int order) {
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
    true,
    all,
    order
  );

  if (request == nullptr) {
    if (inox::thrown()) {
      inox::Value error = inox::take_exception();
      reportDnsStatus(inox::loop(), promise.rejectWith(std::move(error)));
      return promise;
    }

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

bool parseSocketAddress(inox::StringView address, double port, sockaddr_storage& output) {
  if (address.bytes == nullptr || address.len == 0 || !validPort(port)) {
    return false;
  }

  std::string text;

  try {
    text.assign(address.bytes, address.len);
  } catch (const std::bad_alloc&) {
    inox::throw_out_of_memory();
    return false;
  }

  sockaddr_in ipv4 = {};

  if (uv_ip4_addr(text.c_str(), static_cast<int>(port), &ipv4) == 0) {
    std::memcpy(&output, &ipv4, sizeof(ipv4));
    return true;
  }

  sockaddr_in6 ipv6 = {};

  if (uv_ip6_addr(text.c_str(), static_cast<int>(port), &ipv6) == 0) {
    std::memcpy(&output, &ipv6, sizeof(ipv6));
    return true;
  }

  return false;
}

void finishCallbackLookupService(
  DnsLookupServiceRequest& request,
  inox::Value error,
  inox::String hostname,
  inox::String service
) {
  const std::array<inox::Value, 3> arguments = {
    std::move(error),
    std::move(hostname),
    std::move(service),
  };
  inox::Value result = request.callback.call(arguments);
  (void)result;

  if (inox::thrown()) {
    reportDnsStatus(request.loop, INOX_ERR_THROW);
  }
}

void finishPromiseLookupService(
  DnsLookupServiceRequest& request,
  inox::Value error,
  const inox::String& hostname,
  const inox::String& service
) {
  if (error.tag != INOX_TAG_NULL) {
    reportDnsStatus(request.loop, request.promise.rejectWith(std::move(error)));
    return;
  }

  inox::Value result = materializeLookupService(hostname, service);

  if (inox::thrown()) {
    result = inox::take_exception();
    reportDnsStatus(request.loop, request.promise.rejectWith(std::move(result)));
    return;
  }

  reportDnsStatus(request.loop, request.promise.fulfill(std::move(result)));
}

void dnsLookupServiceCallback(
  uv_getnameinfo_t* nativeRequest,
  int status,
  const char* hostnameValue,
  const char* serviceValue
) {
  auto* request = nativeRequest == nullptr
    ? nullptr
    : static_cast<DnsLookupServiceRequest*>(nativeRequest->data);

  if (request == nullptr) {
    return;
  }

  inox::Value error(inox_null_value());
  inox::String hostname(hostnameValue == nullptr ? "" : hostnameValue);
  inox::String service(serviceValue == nullptr ? "" : serviceValue);

  if (inox::thrown()) {
    error = inox::take_exception();
  } else if (status != 0) {
    error = dnsErrorForStatus("getnameinfo", status);

    if (inox::thrown()) {
      error = inox::take_exception();
    }
  }

  if (request->promiseMode) {
    finishPromiseLookupService(*request, std::move(error), hostname, service);
  } else {
    finishCallbackLookupService(*request, std::move(error), std::move(hostname), std::move(service));
  }

  delete request;
}

DnsLookupServiceRequest* allocateLookupServiceRequest(
  inox::StringView address,
  double port,
  inox::Callback callback,
  inox::Promise promise,
  bool promiseMode
) {
  DnsLookupServiceRequest* request = new (std::nothrow) DnsLookupServiceRequest{
    uv_getnameinfo_t(),
    inox::loop(),
    sockaddr_storage(),
    std::move(callback),
    std::move(promise),
    promiseMode,
  };

  if (request == nullptr) {
    inox::throw_out_of_memory();
    return nullptr;
  }

  if (!parseSocketAddress(address, port, request->address)) {
    delete request;
    return nullptr;
  }

  request->request.data = request;
  return request;
}

int queueLookupService(DnsLookupServiceRequest& request) {
  uv_loop_t* loop = request.loop == nullptr ? nullptr : inox_libuv_loop_handle(request.loop);

  if (loop == nullptr) {
    return UV_ENOSYS;
  }

  return uv_getnameinfo(
    loop,
    &request.request,
    dnsLookupServiceCallback,
    reinterpret_cast<const sockaddr*>(&request.address),
    0
  );
}

void queueCallbackLookupService(inox::StringView address, double port, inox::Callback callback) {
  if (!callback.valid() || !validPort(port)) {
    throwDnsError("TypeError: dns.lookupService arguments are invalid");
    return;
  }

  DnsLookupServiceRequest* request = allocateLookupServiceRequest(
    address,
    port,
    std::move(callback),
    inox::Promise(),
    false
  );

  if (request == nullptr) {
    if (!inox::thrown()) {
      throwDnsError("TypeError: dns.lookupService address is invalid");
    }
    return;
  }

  const int status = queueLookupService(*request);

  if (status != 0) {
    delete request;
    throwDnsError("TypeError: dns.lookupService could not start");
  }
}

inox::Promise queuePromiseLookupService(inox::StringView address, double port) {
  if (!validPort(port)) {
    return rejectedDnsPromise(inox::String("dns.lookupService arguments are invalid"));
  }

  inox::Promise promise = inox::Promise::create();

  if (!promise.valid()) {
    return inox::Promise();
  }

  DnsLookupServiceRequest* request = allocateLookupServiceRequest(
    address,
    port,
    inox::Callback(),
    promise,
    true
  );

  if (request == nullptr) {
    if (inox::thrown()) {
      inox::Value error = inox::take_exception();
      reportDnsStatus(inox::loop(), promise.rejectWith(std::move(error)));
      return promise;
    }

    return rejectDnsPromise(std::move(promise), inox::String("dns.lookupService address is invalid"));
  }

  const int status = queueLookupService(*request);

  if (status != 0) {
    delete request;
    return rejectDnsPromise(
      std::move(promise),
      inox::String::fromFormat("dns.lookupService failed: %s", uv_strerror(status))
    );
  }

  return promise;
}

#endif

} // namespace

DnsLookupOptions::DnsLookupOptions()
  : valid_(true), family_(0), all_(false), order_(resultOrderVerbatim) {}

DnsLookupOptions::DnsLookupOptions(const inox::Value& value)
  : valid_(false), family_(0), all_(false), order_(resultOrderVerbatim) {
  const inox_value raw = value.raw();

  if (raw.tag != INOX_TAG_OBJECT && raw.tag != INOX_TAG_CLASS_INSTANCE) {
    return;
  }

  inox::Value field;
  inox_status status = inox_object_get(raw, "family", 6, field.out());

  if (status != INOX_ERR_FIELD && !(status == INOX_OK && field.tag == INOX_TAG_UNDEFINED)) {
    if (status != INOX_OK || field.tag != INOX_TAG_NUMBER || !validFamily(field.as.number)) {
      return;
    }

    family_ = field.as.number;
  }

  field = inox::Value();
  status = inox_object_get(raw, "all", 3, field.out());

  if (status != INOX_ERR_FIELD && !(status == INOX_OK && field.tag == INOX_TAG_UNDEFINED)) {
    if (status != INOX_OK || field.tag != INOX_TAG_BOOL) {
      return;
    }

    all_ = field.as.boolean;
  }

  field = inox::Value();
  status = inox_object_get(raw, "order", 5, field.out());

  if (status != INOX_ERR_FIELD && !(status == INOX_OK && field.tag == INOX_TAG_UNDEFINED)) {
    if (status != INOX_OK || field.tag != INOX_TAG_STRING) {
      return;
    }

    if (stringEquals(field, "ipv4first")) {
      order_ = resultOrderIpv4First;
    } else if (stringEquals(field, "ipv6first")) {
      order_ = resultOrderIpv6First;
    } else if (!stringEquals(field, "verbatim")) {
      return;
    }
  }

  valid_ = true;
}

bool DnsLookupOptions::valid() const {
  return valid_;
}

double DnsLookupOptions::family() const {
  return family_;
}

bool DnsLookupOptions::all() const {
  return all_;
}

int DnsLookupOptions::order() const {
  return order_;
}

void DnsModule::lookup(inox::StringView hostname, inox::Callback callback) const {
  lookup(hostname, 0, std::move(callback));
}

void DnsModule::lookup(inox::StringView hostname, double family, inox::Callback callback) const {
#ifdef INOX_LOOP_BACKEND_LIBUV
  queueCallbackLookup(hostname, family, false, resultOrderVerbatim, std::move(callback));
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

#ifdef INOX_LOOP_BACKEND_LIBUV
  queueCallbackLookup(hostname, options.family(), options.all(), options.order(), std::move(callback));
#else
  (void)hostname;
  (void)callback;
  throwDnsError("TypeError: node:dns requires the libuv loop backend");
#endif
}

void DnsModule::lookupService(
  inox::StringView address,
  double port,
  inox::Callback callback
) const {
#ifdef INOX_LOOP_BACKEND_LIBUV
  queueCallbackLookupService(address, port, std::move(callback));
#else
  (void)address;
  (void)port;
  (void)callback;
  throwDnsError("TypeError: node:dns requires the libuv loop backend");
#endif
}

inox::Promise DnsPromisesModule::lookup(inox::StringView hostname) const {
  return lookup(hostname, 0);
}

inox::Promise DnsPromisesModule::lookup(inox::StringView hostname, double family) const {
#ifdef INOX_LOOP_BACKEND_LIBUV
  return queuePromiseLookup(hostname, family, false, resultOrderVerbatim);
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

#ifdef INOX_LOOP_BACKEND_LIBUV
  return queuePromiseLookup(hostname, options.family(), options.all(), options.order());
#else
  (void)hostname;
  return rejectedDnsPromise(inox::String("node:dns requires the libuv loop backend"));
#endif
}

inox::Promise DnsPromisesModule::lookupService(inox::StringView address, double port) const {
#ifdef INOX_LOOP_BACKEND_LIBUV
  return queuePromiseLookupService(address, port);
#else
  (void)address;
  (void)port;
  return rejectedDnsPromise(inox::String("node:dns requires the libuv loop backend"));
#endif
}

const DnsModule dns;
