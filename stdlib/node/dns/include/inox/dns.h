#ifndef INOX_DNS_H
#define INOX_DNS_H

#include "inox/callback.h"
#include "inox/promise.h"
#include "inox/string_view.h"
#include "inox/value.h"

class DnsLookupOptions {
public:
  DnsLookupOptions();
  explicit DnsLookupOptions(const inox::Value& value);
  bool valid() const;
  double family() const;
  bool all() const;
  int order() const;

private:
  bool valid_;
  double family_;
  bool all_;
  int order_;
};

class DnsPromisesModule {
public:
  inox::Promise lookup(inox::StringView hostname) const;
  inox::Promise lookup(inox::StringView hostname, double family) const;
  inox::Promise lookup(inox::StringView hostname, const DnsLookupOptions& options) const;
  inox::Promise lookupService(inox::StringView address, double port) const;
};

class DnsModule {
public:
  const DnsPromisesModule promises;

  void lookup(inox::StringView hostname, inox::Callback callback) const;
  void lookup(inox::StringView hostname, double family, inox::Callback callback) const;
  void lookup(inox::StringView hostname, const DnsLookupOptions& options, inox::Callback callback) const;
  void lookupService(inox::StringView address, double port, inox::Callback callback) const;
};

extern const DnsModule dns;

#endif
