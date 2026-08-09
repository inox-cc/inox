#ifndef INOX_CRYPTO_H
#define INOX_CRYPTO_H

#include "inox/array.h"
#include "inox/binary.h"
#include "inox/buffer.h"
#include "inox/string.h"
#include "inox/string_view.h"
#include "inox/value.h"

struct CryptoHashState;
struct CryptoHmacState;
struct CryptoCipherState;
struct CryptoKeyState;

class Hash {
private:
  CryptoHashState* handle_;

  explicit Hash(CryptoHashState* handle);

  friend class crypto;

public:
  Hash();
  ~Hash();
  Hash(const Hash& other) = delete;
  Hash& operator=(const Hash& other) = delete;
  Hash(Hash&& other) noexcept;
  Hash& operator=(Hash&& other) noexcept;

  Hash& update(inox::StringView data);
  Hash& update(inox::StringView data, inox::StringView encoding);
  Hash& update(const inox::Value& data);
  Hash& update(const inox::Value& data, inox::StringView encoding);
  Buffer digest();
  inox::String digest(inox::StringView encoding);
};

class Hmac {
private:
  CryptoHmacState* handle_;

  explicit Hmac(CryptoHmacState* handle);

  friend class crypto;

public:
  Hmac();
  ~Hmac();
  Hmac(const Hmac& other) = delete;
  Hmac& operator=(const Hmac& other) = delete;
  Hmac(Hmac&& other) noexcept;
  Hmac& operator=(Hmac&& other) noexcept;

  Hmac& update(inox::StringView data);
  Hmac& update(inox::StringView data, inox::StringView encoding);
  Hmac& update(const inox::Value& data);
  Hmac& update(const inox::Value& data, inox::StringView encoding);
  Buffer digest();
  inox::String digest(inox::StringView encoding);
};

class Cipheriv {
private:
  CryptoCipherState* handle_;

  explicit Cipheriv(CryptoCipherState* handle);

  friend class crypto;

public:
  Cipheriv();
  ~Cipheriv();
  Cipheriv(const Cipheriv& other) = delete;
  Cipheriv& operator=(const Cipheriv& other) = delete;
  Cipheriv(Cipheriv&& other) noexcept;
  Cipheriv& operator=(Cipheriv&& other) noexcept;

  Buffer update(inox::StringView data);
  Buffer update(const inox::Value& data);
  Buffer update(inox::StringView data, inox::StringView input_encoding);
  Buffer update(const inox::Value& data, inox::StringView input_encoding);
  inox::String update(
    inox::StringView data,
    inox::StringView input_encoding,
    inox::StringView output_encoding
  );
  inox::String update(
    const inox::Value& data,
    inox::StringView input_encoding,
    inox::StringView output_encoding
  );
  Buffer final();
  inox::String final(inox::StringView output_encoding);
  Buffer getAuthTag();
  Cipheriv& setAAD(inox::StringView data, const inox::Value& options);
  Cipheriv& setAAD(const inox::Value& data, const inox::Value& options);
};

class Decipheriv {
private:
  CryptoCipherState* handle_;

  explicit Decipheriv(CryptoCipherState* handle);

  friend class crypto;

public:
  Decipheriv();
  ~Decipheriv();
  Decipheriv(const Decipheriv& other) = delete;
  Decipheriv& operator=(const Decipheriv& other) = delete;
  Decipheriv(Decipheriv&& other) noexcept;
  Decipheriv& operator=(Decipheriv&& other) noexcept;

  Buffer update(inox::StringView data);
  Buffer update(const inox::Value& data);
  Buffer update(inox::StringView data, inox::StringView input_encoding);
  Buffer update(const inox::Value& data, inox::StringView input_encoding);
  inox::String update(
    inox::StringView data,
    inox::StringView input_encoding,
    inox::StringView output_encoding
  );
  inox::String update(
    const inox::Value& data,
    inox::StringView input_encoding,
    inox::StringView output_encoding
  );
  Buffer final();
  inox::String final(inox::StringView output_encoding);
  Decipheriv& setAAD(inox::StringView data, const inox::Value& options);
  Decipheriv& setAAD(const inox::Value& data, const inox::Value& options);
  Decipheriv& setAuthTag(inox::StringView tag);
  Decipheriv& setAuthTag(const inox::Value& tag);
  Decipheriv& setAuthTag(inox::StringView tag, inox::StringView encoding);
  Decipheriv& setAuthTag(const inox::Value& tag, inox::StringView encoding);
};

class KeyObject {
private:
  CryptoKeyState* handle_;

  explicit KeyObject(CryptoKeyState* handle);

  friend class crypto;

public:
  KeyObject();
  ~KeyObject();
  KeyObject(const KeyObject& other) = delete;
  KeyObject& operator=(const KeyObject& other) = delete;
  KeyObject(KeyObject&& other) noexcept;
  KeyObject& operator=(KeyObject&& other) noexcept;

  inox::StringView type() const;
  inox::StringView asymmetricKeyType() const;
};

class crypto {
public:
  Array getHashes() const;
  Uint8Array getRandomValues(Uint8Array value) const;
  Buffer randomBytes(inox_number size) const;
  Uint8Array randomFillSync(Uint8Array value) const;
  Uint8Array randomFillSync(Uint8Array value, inox_number offset) const;
  Uint8Array randomFillSync(Uint8Array value, inox_number offset, inox_number size) const;
  inox_number randomInt(inox_number max) const;
  inox_number randomInt(inox_number min, inox_number max) const;
  inox::String randomUUID() const;
  Buffer pbkdf2Sync(
    const inox::Value& password,
    const inox::Value& salt,
    inox_number iterations,
    inox_number keylen,
    inox::StringView digest
  ) const;
  Buffer hkdfSync(
    inox::StringView digest,
    const inox::Value& ikm,
    const inox::Value& salt,
    const inox::Value& info,
    inox_number keylen
  ) const;
  Buffer scryptSync(
    const inox::Value& password,
    const inox::Value& salt,
    inox_number keylen,
    const inox::Value& options
  ) const;
  Cipheriv createCipheriv(
    inox::StringView algorithm,
    const inox::Value& key,
    const inox::Value& iv,
    const inox::Value& options
  ) const;
  Decipheriv createDecipheriv(
    inox::StringView algorithm,
    const inox::Value& key,
    const inox::Value& iv,
    const inox::Value& options
  ) const;
  KeyObject createPrivateKey(const inox::Value& key) const;
  KeyObject createPublicKey(const inox::Value& key) const;
  KeyObject createPublicKey(const KeyObject& key) const;
  Hash createHash(inox::StringView algorithm) const;
  Hmac createHmac(inox::StringView algorithm, inox::StringView key) const;
  Hmac createHmac(inox::StringView algorithm, const inox::Value& key) const;
  inox::String hash(inox::StringView algorithm, inox::StringView data) const;
  inox::String hash(inox::StringView algorithm, const inox::Value& data) const;
  inox::String hash(
    inox::StringView algorithm,
    inox::StringView data,
    inox::StringView output_encoding
  ) const;
  inox::String hash(
    inox::StringView algorithm,
    const inox::Value& data,
    inox::StringView output_encoding
  ) const;
  Buffer hashBuffer(inox::StringView algorithm, inox::StringView data) const;
  Buffer hashBuffer(inox::StringView algorithm, const inox::Value& data) const;
  Buffer sign(inox::StringView algorithm, const inox::Value& data, const inox::Value& key) const;
  Buffer sign(inox::StringView algorithm, const inox::Value& data, const KeyObject& key) const;
  bool timingSafeEqual(const Uint8Array& left, const Uint8Array& right) const;
  bool verify(
    inox::StringView algorithm,
    const inox::Value& data,
    const inox::Value& key,
    const inox::Value& signature
  ) const;
  bool verify(
    inox::StringView algorithm,
    const inox::Value& data,
    const KeyObject& key,
    const inox::Value& signature
  ) const;
};

extern crypto crypto;

#endif
