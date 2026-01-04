<p align="center">
  <img src="./assets/solkey.png" width="220" />
</p>

# SolKey

SolKey is a wallet-based API authentication and authorization system for Solana-native applications. It replaces static API keys with cryptographically signed requests, enabling APIs to authenticate and authorize access using proof of wallet ownership rather than shared secrets.

This project is open-source, non-custodial, and framework-agnostic. It is designed for backend services, infrastructure tools, trading bots, dashboards, and any application that requires programmatic API access with stronger security guarantees than traditional API keys provide.

---

## Introduction

### The Problem with Static API Keys

API keys have been the standard authentication mechanism for programmatic access to web services for decades. A typical API key workflow involves:

1. A service generates a random string (the API key)
2. The user stores this key in their application configuration
3. The application includes the key in every request (usually in a header)
4. The server validates the key against its database

This model has several fundamental weaknesses:

**Long-lived credentials**: API keys typically do not expire. Once issued, they remain valid indefinitely unless manually revoked. This creates a growing attack surface over time.

**Secrets in storage**: API keys must be stored somewhere—configuration files, environment variables, secret managers, or worse, directly in code. Each storage location is a potential leak vector.

**No cryptographic binding**: API keys are bearer tokens. Anyone who possesses the key can use it. There is no way to prove that a request came from the legitimate owner of the key.

**Broad permissions**: Most API key systems grant coarse-grained permissions. A key either has access to a resource or it doesn't. Fine-grained, request-level authorization is difficult to implement.

**Revocation lag**: When a key is compromised, there is often significant time between detection and revocation. During this window, the compromised key can be used maliciously.

**No request binding**: A static API key authenticates the client but not the specific request. The key can be replayed, intercepted, or extracted from network logs.

### Why Wallet-Based Authentication is Superior

Wallets in the Solana ecosystem are cryptographic key pairs. Every wallet can produce unforgeable digital signatures over arbitrary messages. These signatures provide several properties that static API keys cannot:

**Cryptographic proof of ownership**: A signature can only be produced by the private key holder. The server can verify the signature using the public key without ever possessing the private key.

**Request-level binding**: Each request can be signed individually, with the signature covering the request method, path, timestamp, and body. This prevents replay attacks and ensures that the authorization applies to a specific action.

**No shared secrets**: The private key never leaves the client. The server only stores public keys, which are not secret. There is nothing to leak.

**Built-in revocation**: Because each request is signed, authorization can be revoked instantly. There is no long-lived credential to invalidate.

**Composability**: Wallet-based signatures are already used throughout the Solana ecosystem for transactions. Reusing this primitive for API authentication creates consistency and reduces implementation complexity.

### What SolKey Replaces

SolKey is not a session management system. It is not a login flow. It is not an identity provider. It is a replacement for the specific use case where API keys are currently used: authenticating and authorizing programmatic, request-level access to APIs.

Specifically, SolKey replaces:

- Static API keys used for backend-to-backend communication
- Long-lived access tokens for bots and automation
- Shared secrets embedded in configuration files
- Bearer tokens that grant broad permissions

SolKey does not replace session-based authentication for user-facing web applications. For that use case, see SolAuth, which handles identity verification and session management. SolKey and SolAuth can be used together but serve different purposes.

---

## Design Goals

SolKey was designed with the following principles:

### No Static Secrets

Traditional API keys are static secrets. Once generated, they exist as fixed strings that must be protected. If a key is leaked—through logs, code repositories, compromised servers, or social engineering—it can be used by anyone until revoked.

SolKey eliminates static secrets entirely. The only credential is the wallet's private key, which already exists and is already protected by the wallet software. No new secrets are introduced. No keys are generated, stored, or transmitted.

### Per-Request Authentication

Each API request carries its own cryptographic proof. The signature is valid only for that specific request at that specific time. If a signature is intercepted, it cannot be replayed because the timestamp and nonce are part of the signed message.

This property eliminates an entire class of attacks related to credential theft. An attacker who intercepts a signed request can observe the signature, but cannot reuse it or modify the request without invalidating the signature.

### Explicit Authorization Scopes

Access permissions are defined using scopes. A scope is a string that describes what the wallet is authorized to do. Examples include `read:balances`, `write:orders`, `admin:*`, or custom application-specific scopes.

Scopes are granted explicitly. A wallet can be authorized for one scope or many. The server enforces scopes on every request. If a wallet attempts an action it is not authorized for, the request is rejected.

Scopes can have expiration times. A wallet might be granted `write:orders` for 24 hours, after which the scope is automatically revoked. This time-bounding reduces risk.

### Revocation by Design

Because there are no long-lived credentials, revocation is instantaneous. The server simply removes the wallet's scopes from its database. The next request from that wallet will fail authorization.

There is no need to wait for caches to expire, distribute revocation lists, or coordinate across multiple services. Revocation is a single database operation.

### Minimal Trust Assumptions

SolKey assumes the following:

- The client possesses the private key for the wallet they claim to control
- The server can verify Solana Ed25519 signatures
- The system clock on the client and server are roughly synchronized (within a few minutes)
- The server's database of authorized wallets and scopes is accurate

SolKey does not assume:

- That the network is secure
- That the client is trusted
- That requests cannot be intercepted
- That the server is immune to attacks

The security model is designed to be robust even when these assumptions are violated.

### Composability

SolKey is deliberately minimal. It handles authentication and authorization but does not impose a specific framework, database, or deployment model.

SolKey can be used alongside SolAuth for applications that need both session-based user authentication and programmatic API access. SolKey can be integrated with existing rate limiting, logging, and monitoring infrastructure. SolKey can be deployed in front of existing APIs without requiring changes to application logic.

---

## High-Level Model

### Wallet = Identity

In SolKey, a wallet address (a Solana public key) is the identity. When a client makes a request, they assert "I am wallet X." The server verifies this claim by checking the signature.

Wallets are self-sovereign. There is no central authority that issues or revokes wallets. Any valid Solana address can be used.

### Signature = Proof

The signature is cryptographic proof that the request was created by the holder of the private key associated with the wallet. The signature binds the wallet identity to the specific request.

The server verifies the signature using the wallet's public key. If the signature is valid, the server knows that the request was created by someone who controls the private key. If the signature is invalid, the request is rejected.

### Scope = Permission

A scope is a permission. Scopes are strings that describe what actions a wallet is authorized to perform. The server maintains a mapping from wallet addresses to their authorized scopes.

When a request is verified, the server checks whether the wallet has the required scope for that operation. If the wallet is authorized, the request proceeds. If not, the request is rejected with a 403 Forbidden response.

### Request = Authorization Event

Each API request is an authorization event. The client constructs a message describing the request, signs it with their wallet, and includes the signature in the request headers.

The server verifies the signature and checks the scopes. If both checks pass, the request is authorized. If either check fails, the request is denied.

This model ensures that every request is explicitly authorized. There is no implicit trust based on past requests or long-lived credentials.

---

## Request Flow

### Step-by-Step Lifecycle

The following describes the complete flow of an authenticated API request using SolKey.

#### 1. Project Defines Scopes

Before any wallets can access the API, the project must define what scopes exist and what permissions they grant. Scopes are application-specific.

For example, an exchange API might define:

- `read:markets` – Read market data
- `read:balances` – Read user balances
- `write:orders` – Submit orders
- `admin:users` – Manage user accounts

Each scope corresponds to a set of API endpoints or actions. The server enforces these mappings.

#### 2. Wallet Authorization

A wallet must be authorized before it can make requests. Authorization is typically granted through an administrative interface, registration process, or programmatic API.

The authorization process involves:

1. The wallet address is recorded in the server's database
2. One or more scopes are assigned to that wallet
3. Optionally, an expiration time is set for each scope

For example:

```
Wallet: 7xXQ2...vR8Qs
Scopes: ["read:balances", "write:orders"]
Expires: 2025-01-05T00:00:00Z
```

This authorization can be granted through various mechanisms depending on the application:

- Manual approval by an administrator
- Self-service registration with verification
- Integration with SolAuth for user-based wallets
- Programmatic assignment for service accounts

#### 3. Client Constructs Canonical Message

When the client wants to make a request, it first constructs a canonical message that represents the request. The canonical format ensures that both the client and server produce identical messages for the same request.

The canonical message includes:

- HTTP method (GET, POST, etc.)
- Request path
- Current timestamp (ISO 8601 format)
- Nonce (random value to prevent signature reuse)
- Optional: Request body hash

Example canonical message:

```
POST /api/v1/orders
1704409200
a3f8c21d-4e5f-4a1b-8c9d-2e3f4a5b6c7d
{"symbol":"SOL/USD","side":"buy","amount":10}
```

Each component is separated by a newline. The order and format are strictly defined to prevent ambiguity.

#### 4. Wallet Signs Request

The client uses the wallet's private key to sign the canonical message. For Solana wallets, this uses Ed25519 signatures.

The signing process:

```
message = construct_canonical_message(method, path, timestamp, nonce, body)
signature = wallet.sign(message)
```

The signature is a 64-byte value, typically encoded as base64 or hex for transmission.

#### 5. Client Sends Request

The client sends the HTTP request with custom headers:

```
POST /api/v1/orders
X-SolKey-Wallet: 7xXQ2...vR8Qs
X-SolKey-Timestamp: 1704409200
X-SolKey-Nonce: a3f8c21d-4e5f-4a1b-8c9d-2e3f4a5b6c7d
X-SolKey-Signature: base64_encoded_signature

{"symbol":"SOL/USD","side":"buy","amount":10}
```

The signature header contains the signature over the canonical message. The timestamp and nonce are sent as separate headers so the server can reconstruct the message.

#### 6. Server Verifies Signature

Upon receiving the request, the server:

1. Extracts the wallet address from `X-SolKey-Wallet`
2. Extracts the timestamp from `X-SolKey-Timestamp`
3. Extracts the nonce from `X-SolKey-Nonce`
4. Extracts the signature from `X-SolKey-Signature`
5. Reconstructs the canonical message using the method, path, timestamp, nonce, and body
6. Verifies the signature using the wallet's public key

If the signature is valid, the server knows the request came from the wallet owner. If the signature is invalid, the request is rejected with a 401 Unauthorized response.

#### 7. Server Enforces Authorization

After verifying the signature, the server checks authorization:

1. Query the database for the wallet's authorized scopes
2. Check if the scopes have expired
3. Determine which scope is required for the requested operation
4. Verify that the wallet has the required scope
5. Optionally, enforce rate limits based on the wallet address

If all checks pass, the request is processed. If any check fails, the request is rejected with a 403 Forbidden response.

### Flow Diagram

```
┌──────────┐                                       ┌──────────┐
│  Client  │                                       │  Server  │
└─────┬────┘                                       └─────┬────┘
      │                                                  │
      │ 1. Construct canonical message                  │
      │    (method, path, timestamp, nonce, body)       │
      │                                                  │
      │ 2. Sign message with wallet private key         │
      │                                                  │
      │ 3. Send HTTP request with signature headers     │
      │─────────────────────────────────────────────────>│
      │                                                  │
      │                                  4. Extract headers
      │                                     and signature
      │                                                  │
      │                              5. Reconstruct canonical
      │                                 message from headers
      │                                                  │
      │                                6. Verify signature
      │                                   using public key
      │                                                  │
      │                                   7. Query wallet
      │                                      scopes from DB
      │                                                  │
      │                                8. Check if wallet
      │                                   has required scope
      │                                                  │
      │                                 9. Enforce rate limits
      │                                                  │
      │               10. Return response (200 or 403)  │
      │<─────────────────────────────────────────────────│
      │                                                  │
```

---

## Canonical Signing Format

The canonical signing format is the most critical component of SolKey's security. The format defines exactly how request messages are constructed before signing and verification.

### Why Canonical Format Matters

If the client and server construct messages differently, signatures will fail even for legitimate requests. Worse, if the format is ambiguous, an attacker might be able to craft malicious messages that pass verification.

The canonical format must be:

- Deterministic: Given the same inputs, the message is always identical
- Unambiguous: There is only one valid way to construct the message
- Complete: The message captures all relevant information about the request

### Message Construction

The canonical message is a multi-line string with the following format:

```
<HTTP_METHOD>
<REQUEST_PATH>
<TIMESTAMP>
<NONCE>
<BODY_CONTENT>
```

Each component is separated by a single newline character (`\n`). There is no trailing newline.

#### HTTP Method

The HTTP method in uppercase: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, etc.

#### Request Path

The full request path including query parameters, starting with `/`. For example:

- `/api/v1/orders`
- `/api/v1/markets?symbol=SOL`

Query parameters must be included in the canonical message. The order of query parameters matters—both client and server must use the same ordering (typically lexicographic by parameter name).

#### Timestamp

The current Unix timestamp in seconds (integer). For example: `1704409200`

The timestamp serves two purposes:

1. It prevents replay attacks by binding the signature to a specific time
2. It allows the server to reject old requests

The server should reject requests where the timestamp is more than a few minutes in the past or future. This window should be configurable but defaults to 5 minutes.

#### Nonce

A randomly generated string that uniquely identifies this request. The nonce prevents signature reuse even if all other components are identical.

The nonce should be a UUID v4 or a cryptographically random string of at least 32 bytes. For example:

- `a3f8c21d-4e5f-4a1b-8c9d-2e3f4a5b6c7d`
- `7f3e9a2c8b1d4e5f6a7b8c9d0e1f2a3b`

The server should track recently used nonces and reject any request that reuses a nonce within the timestamp validity window. This prevents replay attacks where an attacker captures a valid signed request and resends it multiple times.

#### Body Content

For requests with a body (POST, PUT, PATCH), the body is included verbatim in the canonical message. For requests without a body (GET, DELETE), this field is empty but the newline separator is still included.

The body should be the exact bytes sent in the HTTP request. If the body is JSON, it should not be reformatted, pretty-printed, or reordered. The byte-for-byte content must match.

### Example Messages

#### GET Request

```
GET
/api/v1/balances
1704409200
a3f8c21d-4e5f-4a1b-8c9d-2e3f4a5b6c7d

```

Note: There is an empty line after the nonce because GET requests have no body, but the newline separator is still required.

#### POST Request

```
POST
/api/v1/orders
1704409200
a3f8c21d-4e5f-4a1b-8c9d-2e3f4a5b6c7d
{"symbol":"SOL/USD","side":"buy","amount":10}
```

#### POST Request with Query Parameters

```
POST
/api/v1/orders?account=trading
1704409200
a3f8c21d-4e5f-4a1b-8c9d-2e3f4a5b6c7d
{"symbol":"SOL/USD","side":"buy","amount":10}
```

### Timestamp Validation

The server must reject requests with timestamps outside an acceptable window. The recommended window is 5 minutes before and after the server's current time.

Rationale:

- Too narrow: Legitimate requests may be rejected due to clock skew
- Too wide: Increases the window for replay attacks

The window should be configurable per deployment based on operational requirements.

### Nonce Tracking

The server must maintain a record of recently used nonces to prevent replay attacks. The tracking window should match the timestamp validation window.

Implementation approaches:

1. Store nonces in a database with TTL
2. Use a distributed cache (Redis, Memcached) with expiration
3. Use a time-bucketed hash set for high-performance scenarios

The nonce store need only retain nonces for the duration of the timestamp window (e.g., 10 minutes for a ±5 minute window).

### Security Considerations

**Replay Attacks**: The combination of timestamp and nonce prevents replay attacks. An attacker cannot reuse a captured signature because the nonce will be rejected or the timestamp will be outside the validity window.

**Message Tampering**: Any modification to the canonical message invalidates the signature. An attacker cannot change the method, path, body, or headers without being detected.

**Signature Reuse**: Even if two requests are identical (same method, path, and body), the nonce ensures that the canonical message is different. Each request requires a fresh signature.

**Clock Skew**: The timestamp window accommodates reasonable clock differences between client and server. For stricter security, the window can be narrowed, but this increases the operational burden.

---

## API Usage Examples

The following examples demonstrate how to use SolKey in practice. These examples use pseudocode but represent realistic implementation patterns.

### REST API Request (Client Side)

```javascript
import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

async function makeAuthenticatedRequest(wallet, method, path, body = null) {
  // 1. Generate nonce
  const nonce = crypto.randomUUID();
  
  // 2. Get current timestamp
  const timestamp = Math.floor(Date.now() / 1000);
  
  // 3. Construct canonical message
  let message = `${method}\n${path}\n${timestamp}\n${nonce}`;
  if (body) {
    message += `\n${JSON.stringify(body)}`;
  } else {
    message += '\n';
  }
  
  // 4. Sign message
  const messageBytes = new TextEncoder().encode(message);
  const signature = nacl.sign.detached(messageBytes, wallet.secretKey);
  const signatureB64 = Buffer.from(signature).toString('base64');
  
  // 5. Make HTTP request
  const headers = {
    'Content-Type': 'application/json',
    'X-SolKey-Wallet': wallet.publicKey.toBase58(),
    'X-SolKey-Timestamp': timestamp.toString(),
    'X-SolKey-Nonce': nonce,
    'X-SolKey-Signature': signatureB64,
  };
  
  const options = {
    method,
    headers,
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(`https://api.example.com${path}`, options);
  return response;
}

// Usage
const wallet = Keypair.fromSecretKey(/* your private key */);
const response = await makeAuthenticatedRequest(
  wallet,
  'POST',
  '/api/v1/orders',
  { symbol: 'SOL/USD', side: 'buy', amount: 10 }
);
```

### Server-Side Verification (Python)

```python
import time
import hashlib
from typing import Optional
from fastapi import HTTPException, Request
from nacl.signing import VerifyKey
from nacl.exceptions import BadSignatureError
import base64

class SolKeyMiddleware:
    def __init__(self, db, timestamp_window=300):
        self.db = db
        self.timestamp_window = timestamp_window
        self.nonce_cache = {}  # In production, use Redis or similar
    
    async def verify_request(self, request: Request):
        # 1. Extract headers
        wallet_address = request.headers.get('X-SolKey-Wallet')
        timestamp_str = request.headers.get('X-SolKey-Timestamp')
        nonce = request.headers.get('X-SolKey-Nonce')
        signature_b64 = request.headers.get('X-SolKey-Signature')
        
        if not all([wallet_address, timestamp_str, nonce, signature_b64]):
            raise HTTPException(status_code=401, detail="Missing authentication headers")
        
        # 2. Validate timestamp
        try:
            timestamp = int(timestamp_str)
        except ValueError:
            raise HTTPException(status_code=401, detail="Invalid timestamp")
        
        current_time = int(time.time())
        time_diff = abs(current_time - timestamp)
        
        if time_diff > self.timestamp_window:
            raise HTTPException(status_code=401, detail="Request timestamp expired")
        
        # 3. Check nonce reuse
        nonce_key = f"{wallet_address}:{nonce}"
        if nonce_key in self.nonce_cache:
            raise HTTPException(status_code=401, detail="Nonce already used")
        self.nonce_cache[nonce_key] = timestamp  # Store with expiry
        
        # 4. Reconstruct canonical message
        method = request.method
        path = str(request.url.path)
        if request.url.query:
            path += f"?{request.url.query}"
        
        body = ""
        if method in ["POST", "PUT", "PATCH"]:
            body_bytes = await request.body()
            body = body_bytes.decode('utf-8')
        
        canonical_message = f"{method}\n{path}\n{timestamp}\n{nonce}\n{body}"
        
        # 5. Verify signature
        try:
            signature = base64.b64decode(signature_b64)
            verify_key = VerifyKey(bytes.fromhex(wallet_address))  # Simplified
            verify_key.verify(canonical_message.encode(), signature)
        except (BadSignatureError, Exception) as e:
            raise HTTPException(status_code=401, detail="Invalid signature")
        
        # 6. Check authorization
        wallet_scopes = await self.db.get_wallet_scopes(wallet_address)
        if not wallet_scopes:
            raise HTTPException(status_code=403, detail="Wallet not authorized")
        
        required_scope = self.get_required_scope(method, path)
        if required_scope not in wallet_scopes:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        
        return wallet_address
    
    def get_required_scope(self, method: str, path: str) -> str:
        # Map endpoints to required scopes
        if path.startswith("/api/v1/orders"):
            if method == "GET":
                return "read:orders"
            elif method in ["POST", "PUT", "DELETE"]:
                return "write:orders"
        elif path.startswith("/api/v1/balances"):
            return "read:balances"
        # ... additional mappings
        return "default"
```

### CLI Tool Usage

```bash
# Using a hypothetical solkey CLI tool

# Authorize a wallet for specific scopes
solkey authorize \
  --wallet 7xXQ2...vR8Qs \
  --scopes "read:balances,write:orders" \
  --expires "2025-01-05T00:00:00Z"

# Make an authenticated request
solkey request \
  --wallet ~/.config/solana/id.json \
  --method POST \
  --url https://api.example.com/api/v1/orders \
  --data '{"symbol":"SOL/USD","side":"buy","amount":10}'

# Revoke wallet access
solkey revoke --wallet 7xXQ2...vR8Qs

# List authorized wallets
solkey list
```

### Server Configuration Example

```yaml
# config.yaml
solkey:
  timestamp_window: 300  # 5 minutes
  nonce_cache:
    type: redis
    host: localhost
    port: 6379
    ttl: 600  # 10 minutes
  
  scopes:
    read:markets:
      endpoints:
        - GET /api/v1/markets
        - GET /api/v1/markets/*
    
    read:balances:
      endpoints:
        - GET /api/v1/balances
        - GET /api/v1/balances/*
    
    write:orders:
      endpoints:
        - POST /api/v1/orders
        - PUT /api/v1/orders/*
        - DELETE /api/v1/orders/*
      rate_limit:
        requests_per_minute: 100
    
    admin:*:
      endpoints:
        - "*"
      rate_limit:
        requests_per_minute: 1000
```

---

## Scopes & Permissions

Scopes are the authorization mechanism in SolKey. A scope defines what actions a wallet is permitted to perform. Scopes are strings that follow a hierarchical naming convention.

### Scope Format

Scopes use colon-separated namespaces:

```
<resource>:<action>
```

Examples:

- `read:balances` – Permission to read balance information
- `write:orders` – Permission to create, update, or delete orders
- `admin:users` – Permission to manage user accounts
- `read:*` – Permission to read all resources
- `*` or `admin:*` – Full administrative access

The scope format is application-specific. Projects define their own scope hierarchies based on their resource model and access control requirements.

### Scope Matching

When a request is made, the server determines which scope is required for that operation. The server then checks if the requesting wallet has that scope.

Scope matching can be:

**Exact match**: The wallet must have the exact scope required. If the endpoint requires `write:orders`, the wallet must have `write:orders`.

**Wildcard match**: A scope ending in `:*` grants access to all actions within that resource. For example, `read:*` grants `read:balances`, `read:markets`, `read:orders`, etc.

**Full wildcard**: A scope of `*` or `admin:*` typically grants access to all operations. This should be used sparingly and only for trusted administrative wallets.

### Scope Examples

#### Read-Only Access

A bot that monitors market data might be granted:

```
scopes: ["read:markets", "read:tickers"]
```

This wallet can read market and ticker information but cannot perform any write operations.

#### Trading Bot

A trading bot that needs to read balances and submit orders might be granted:

```
scopes: ["read:balances", "read:markets", "write:orders"]
```

This wallet can read its balance, check market prices, and submit orders, but cannot modify account settings or access other users' data.

#### Administrative Access

An internal service that manages user accounts might be granted:

```
scopes: ["admin:users", "read:*", "write:*"]
```

This wallet has broad permissions but is typically restricted to internal networks and heavily monitored.

### Time-Limited Permissions

Scopes can have expiration times. When a wallet is authorized, each scope can be assigned a timestamp after which it is no longer valid.

Example:

```json
{
  "wallet": "7xXQ2...vR8Qs",
  "scopes": [
    {
      "scope": "write:orders",
      "granted_at": "2025-01-04T12:00:00Z",
      "expires_at": "2025-01-05T12:00:00Z"
    }
  ]
}
```

After the expiration time, any requests requiring `write:orders` will be rejected even if the signature is valid.

Time-limited permissions are useful for:

- Temporary access for contractors or partners
- Limiting the impact of compromised wallets
- Implementing "break glass" emergency access that auto-expires
- Time-bound API trials or beta access

### Revocation

Revoking access is a simple database operation. The server removes the wallet's entry or sets all scopes to expired.

```sql
DELETE FROM wallet_scopes WHERE wallet_address = '7xXQ2...vR8Qs';
```

Or for partial revocation:

```sql
DELETE FROM wallet_scopes 
WHERE wallet_address = '7xXQ2...vR8Qs' 
AND scope = 'write:orders';
```

Because there are no long-lived credentials, revocation is effective immediately. The next request from that wallet will fail authorization.

### Least Privilege Principle

SolKey encourages applying the principle of least privilege: grant the minimum scopes necessary for a wallet to perform its intended function.

Guidelines:

1. **Start narrow**: Begin with the most restrictive scopes and expand only as needed
2. **Separate read and write**: Most use cases only need read access. Write access should be granted sparingly
3. **Avoid wildcards**: Use specific scopes instead of `*` whenever possible
4. **Time-bound sensitive scopes**: For high-risk operations, set expiration times
5. **Regular audits**: Periodically review which wallets have which scopes and revoke unused access

---

## Security Model

### What SolKey Protects Against

SolKey provides protection against several classes of attacks that are common with traditional API keys:

#### Leaked Credentials

Traditional API keys are static secrets. If an API key is committed to a public GitHub repository, logged to a file, or exposed in a configuration dump, it can be used by anyone who finds it.

SolKey eliminates this risk. The only secret is the wallet's private key, which is already managed by wallet software and protected with encryption. There is no additional secret to leak. Even if logs or configuration files are exposed, they contain only public keys and signatures, neither of which can be used to impersonate the wallet.

#### Replay Attacks

An attacker who intercepts network traffic containing a traditional API key can replay that key indefinitely. The key remains valid until manually revoked.

SolKey prevents replay attacks through two mechanisms:

1. **Timestamp validation**: Requests with timestamps outside the acceptable window are rejected
2. **Nonce tracking**: Requests with previously used nonces are rejected

An attacker who captures a signed request can observe the signature, but cannot reuse it because the nonce will be rejected. If the attacker attempts to modify any part of the request, the signature becomes invalid.

#### Over-Permissioning

Traditional API keys often grant broad, coarse-grained permissions. A single key might provide access to all API endpoints because it's difficult to implement fine-grained authorization.

SolKey uses scopes to implement least-privilege access control. Each wallet can be granted exactly the scopes it needs. An attacker who compromises a read-only wallet cannot perform write operations, even if they have a valid signature.

#### Long-Lived Credentials

Traditional API keys typically do not expire. Once issued, they remain valid indefinitely, creating a persistent attack surface.

SolKey requests are ephemeral. Each signature is valid only for a specific request at a specific time. Even if a wallet's authorization is long-lived, each individual request must be signed anew. Additionally, scopes can have explicit expiration times, automatically revoking permissions after a set period.

#### Credential Stuffing

Attackers often harvest leaked API keys and attempt to use them against multiple services (credential stuffing).

SolKey signatures are service-specific because they include the request path in the canonical message. A signature created for one API cannot be used against a different API, even if the wallet is authorized on both services.

### What SolKey Does Not Protect Against

SolKey is not a complete security solution. It protects against specific threats related to authentication and authorization, but it does not protect against all possible attacks.

#### Compromised Wallets

If an attacker gains access to a wallet's private key, they can sign requests on behalf of that wallet. SolKey cannot distinguish between legitimate and malicious use of a valid private key.

Mitigations:

- Use hardware wallets for high-value accounts
- Implement rate limiting to detect unusual activity
- Monitor wallet behavior for anomalies
- Use multi-signature wallets for administrative access
- Rotate authorized wallets periodically

#### Malicious Authorized Clients

If a wallet is authorized with broad permissions and the software using that wallet is malicious or compromised, SolKey cannot prevent abuse.

Mitigations:

- Grant minimal necessary scopes
- Use time-limited permissions for risky operations
- Implement logging and auditing
- Monitor for unusual request patterns
- Require additional verification for sensitive operations

#### Man-in-the-Middle Attacks on Application Logic

SolKey verifies that requests are signed by authorized wallets, but it does not protect the application logic itself. If the server has vulnerabilities (SQL injection, command injection, business logic flaws), an attacker with a valid signature can exploit them.

Mitigations:

- Follow secure coding practices
- Implement input validation and sanitization
- Use parameterized queries
- Conduct security audits and penetration testing

#### Denial of Service

An attacker cannot authenticate as another wallet, but they can flood the server with invalid requests, consuming resources during signature verification.

Mitigations:

- Implement rate limiting at the network layer
- Cache signature verification results where appropriate
- Use connection limits and timeouts
- Deploy behind a reverse proxy or CDN

#### Side-Channel Attacks

SolKey uses standard Ed25519 signatures, which are designed to resist timing attacks. However, implementation flaws in signature verification or cryptographic libraries could introduce side channels.

Mitigations:

- Use well-audited cryptographic libraries
- Avoid custom cryptography implementations
- Keep dependencies updated
- Consider constant-time comparison functions where appropriate

### Trust Boundaries

SolKey assumes the following trust boundaries:

**Trusted**:
- The server's database of authorized wallets and scopes
- The cryptographic signature verification implementation
- The system clock (within a reasonable window)

**Untrusted**:
- All client requests
- The network between client and server
- Request headers and bodies
- The client's environment

The security model is designed so that even if all untrusted components are malicious, the server can still make correct authentication and authorization decisions.

---

## Comparison Table

| Feature | API Keys | OAuth 2.0 Tokens | HMAC-Based Auth | SolKey |
|---------|----------|------------------|-----------------|--------|
| **Credential Type** | Static secret | Bearer token | Shared secret | Wallet signature |
| **Secret Storage** | Server and client | Server and client | Server and client | Client only (private key) |
| **Credential Lifetime** | Indefinite | Hours to days | Indefinite | Per-request |
| **Replay Prevention** | None | None | Nonce (optional) | Timestamp + nonce |
| **Request Binding** | No | No | Yes | Yes |
| **Revocation Speed** | Slow (cache invalidation) | Slow (token expiry) | Slow (cache invalidation) | Instant (database update) |
| **Granular Permissions** | Limited | Yes (scopes) | Limited | Yes (scopes) |
| **Cryptographic Proof** | No | No | Yes | Yes |
| **Key Rotation** | Manual | Automatic (refresh) | Manual | Not applicable |
| **Attack Surface** | Leaked keys, replay | Leaked tokens, replay | Leaked secrets, timing | Compromised wallets |
| **Implementation Complexity** | Low | High | Medium | Medium |
| **Ecosystem Integration** | Universal | Web-focused | Universal | Solana-focused |
| **User Experience** | Simple | Complex (flow redirects) | Simple | Simple (wallet signing) |

### When to Use SolKey

SolKey is ideal for:

- APIs in the Solana ecosystem where users already have wallets
- Backend services that require programmatic access
- Bots, automation, and infrastructure tools
- Applications where credential leakage is a primary concern
- Systems that require instant revocation
- Projects that want to eliminate static secrets

SolKey is **not** ideal for:

- General-purpose web applications where users don't have wallets
- Applications that require integration with non-crypto services
- Use cases where signature verification overhead is prohibitive
- Systems where users cannot or will not sign requests

---

## Relationship to SolAuth

SolKey and SolAuth are complementary systems that solve different problems in the authentication and authorization space.

### SolAuth: Identity and Sessions

SolAuth is a session-based authentication system for user-facing web applications. It handles:

- **Identity verification**: Proving that a user controls a wallet
- **Session management**: Maintaining logged-in state across requests
- **User experience**: Handling login flows, logout, and session expiry
- **Web context**: Cookie-based sessions, CSRF protection, redirect flows

SolAuth is designed for scenarios where a user interacts with a web interface. The user logs in with their wallet, and SolAuth establishes a session. Subsequent requests are authenticated using a session cookie.

Use SolAuth when:
- Building a web dashboard or application
- Users need persistent login state
- You want wallet-based login for humans
- Sessions should survive across browser tabs and page refreshes

### SolKey: Request-Level Authorization

SolKey is a request-level authentication system for programmatic API access. It handles:

- **Per-request authentication**: Each API call is individually signed
- **Authorization scopes**: Fine-grained permissions for what actions are allowed
- **Stateless verification**: No session state is maintained
- **Programmatic context**: Direct API calls from scripts, bots, and services

SolKey is designed for scenarios where software interacts with an API. Each request includes a signature, and the server verifies the signature without maintaining session state.

Use SolKey when:
- Building APIs for bots, scripts, or automation
- Programmatic access without browser sessions
- Each request should be independently authenticated
- You want to avoid long-lived credentials

### Using SolAuth and SolKey Together

Many applications need both. A typical architecture might be:

1. **Frontend (Human Users)**: Use SolAuth for login. Users connect their wallet, verify ownership, and establish a session. The frontend makes authenticated requests using session cookies.

2. **Backend APIs (Programmatic Access)**: Use SolKey for programmatic access. Bots and scripts sign each request with their wallet. The API verifies signatures and enforces scopes.

3. **Admin Actions**: An admin dashboard might use SolAuth for the login flow, but when the admin wants to grant API access to a bot, they authorize a wallet address in SolKey, assigning it specific scopes.

Example workflow:

```
User logs into dashboard via SolAuth
  ↓
User creates a new trading bot
  ↓
Dashboard generates a new wallet for the bot (or user provides one)
  ↓
Dashboard grants the bot wallet scopes in SolKey (e.g., "write:orders")
  ↓
Bot uses SolKey to make authenticated API requests
  ↓
API verifies signatures and enforces scopes
```

### Key Differences

| Aspect | SolAuth | SolKey |
|--------|---------|--------|
| **Purpose** | User login and sessions | Programmatic API access |
| **State** | Stateful (sessions) | Stateless (per-request) |
| **Credential** | Session cookie | Request signature |
| **Lifetime** | Minutes to hours | Per-request (seconds) |
| **User Type** | Humans (web browsers) | Software (bots, scripts) |
| **Context** | Web applications | APIs and services |

### When to Use Which

**Use SolAuth alone** if:
- You're building a web app with no programmatic access
- All users interact through a browser
- Session-based auth is sufficient

**Use SolKey alone** if:
- You're building a pure API with no web interface
- All clients are bots, scripts, or services
- You don't need sessions

**Use both together** if:
- You have both human users (web dashboard) and programmatic clients (bots)
- You want a unified wallet-based identity across sessions and API access
- Different parts of your system need different authentication patterns

---

## Operational Considerations

Deploying SolKey in production requires careful consideration of several operational aspects.

### Rate Limiting

While SolKey prevents unauthorized access, it does not inherently prevent abuse by authorized wallets. Rate limiting is essential to prevent:

- Resource exhaustion from a single wallet
- Accidental or malicious API flooding
- Denial of service from compromised wallets

Rate limiting should be implemented at multiple levels:

**Per-wallet rate limits**: Limit the number of requests per wallet per time period. This can be scope-specific (e.g., `write:orders` might have a lower limit than `read:markets`).

**Global rate limits**: Limit the total number of requests across all wallets to protect server capacity.

**Endpoint-specific rate limits**: Different endpoints may have different cost profiles. Expensive operations should have stricter limits.

Example configuration:

```yaml
rate_limits:
  global:
    requests_per_second: 10000
  
  per_wallet:
    default: 100  # requests per minute
    
    scopes:
      write:orders: 60
      admin:*: 1000
  
  endpoints:
    POST /api/v1/orders: 30
    GET /api/v1/markets: 600
```

Rate limiting can be implemented using:

- Token bucket algorithm for smooth rate limiting
- Sliding window counters for precise limits
- Redis or Memcached for distributed rate limiting
- Cloud-based rate limiting services (Cloudflare, AWS WAF)

### Logging

Comprehensive logging is critical for security monitoring, debugging, and compliance.

Log events should include:

**Authentication events**:
- Wallet address attempting authentication
- Timestamp and nonce
- Signature verification result (success/failure)
- Reason for rejection (invalid signature, expired timestamp, used nonce)

**Authorization events**:
- Wallet address making the request
- Required scope for the operation
- Whether the wallet had the required scope
- Authorization decision (allowed/denied)

**Operational events**:
- Scope granted to a wallet
- Scope revoked from a wallet
- Scope expiration
- Rate limit violations

Example log entry:

```json
{
  "timestamp": "2025-01-04T12:34:56.789Z",
  "event": "authentication_failure",
  "wallet": "7xXQ2...vR8Qs",
  "reason": "expired_timestamp",
  "request": {
    "method": "POST",
    "path": "/api/v1/orders",
    "timestamp": 1704409200,
    "nonce": "a3f8c21d-4e5f-4a1b-8c9d-2e3f4a5b6c7d"
  },
  "server_time": 1704409500
}
```

Logs should be:

- Structured (JSON or similar) for easy parsing
- Centralized for analysis across multiple servers
- Retained according to compliance requirements
- Protected with appropriate access controls

### Monitoring

Real-time monitoring helps detect security incidents and operational issues.

Key metrics to monitor:

**Authentication metrics**:
- Authentication success rate
- Authentication failure rate (by reason)
- Unique wallets authenticated per time period
- Average signature verification time

**Authorization metrics**:
- Authorization success rate
- Authorization failure rate (by required scope)
- Most commonly requested scopes
- Wallets attempting unauthorized actions

**Rate limiting metrics**:
- Rate limit violations per wallet
- Rate limit violations per endpoint
- Global rate limit utilization

**Performance metrics**:
- Request latency (including signature verification)
- Database query time for scope lookups
- Nonce cache hit rate
- Server resource utilization

Alerts should be configured for:

- Sudden increase in authentication failures
- Repeated authorization failures from a single wallet
- Unusual request patterns (time of day, volume, endpoints)
- Rate limit violations exceeding thresholds
- Performance degradation

### Revocation Strategies

Effective revocation is critical for security. Several strategies can be employed:

**Immediate revocation**: Remove wallet scopes from the database. The next request will fail. This is the standard approach for compromised wallets.

**Scheduled revocation**: Set expiration times for scopes when they are granted. Useful for temporary access or trial periods.

**Bulk revocation**: Revoke multiple wallets at once, such as all wallets associated with a specific user or partner.

**Scope-specific revocation**: Remove only specific scopes from a wallet, leaving other permissions intact.

**Emergency revocation**: A kill switch that disables all API access temporarily during a security incident.

Revocation should be:

- Logged comprehensively
- Communicated to affected parties when appropriate
- Reversible (scopes can be re-granted if revocation was in error)
- Auditable (who revoked what and when)

### Nonce Cache Management

The nonce cache prevents replay attacks but requires careful management:

**Storage backend**: Use a fast, distributed cache like Redis or Memcached. The cache must be shared across all API servers to prevent nonce reuse across instances.

**TTL configuration**: Set the TTL to match the timestamp validation window. For example, if timestamps are valid for ±5 minutes, the nonce should be cached for at least 10 minutes.

**Capacity planning**: The cache must handle the expected request volume. If you expect 1000 requests per second, the cache must store up to 600,000 nonces (1000 req/s × 600 seconds).

**Eviction policy**: Use TTL-based eviction. Nonces should expire automatically when they are no longer within the timestamp window.

**Failure handling**: If the nonce cache is unavailable, the system must either reject all requests (secure but disruptive) or allow requests (risky but operational). This should be configurable based on risk tolerance.

### Database Schema

A minimal database schema for SolKey might look like:

```sql
CREATE TABLE wallet_authorizations (
    wallet_address VARCHAR(44) PRIMARY KEY,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE wallet_scopes (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(44) NOT NULL REFERENCES wallet_authorizations(wallet_address) ON DELETE CASCADE,
    scope VARCHAR(255) NOT NULL,
    granted_at TIMESTAMP NOT NULL,
    expires_at TIMESTAMP,
    UNIQUE(wallet_address, scope)
);

CREATE INDEX idx_wallet_scopes_wallet ON wallet_scopes(wallet_address);
CREATE INDEX idx_wallet_scopes_expiry ON wallet_scopes(expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE authorization_logs (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(44) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    scope VARCHAR(255),
    timestamp TIMESTAMP NOT NULL,
    details JSONB
);

CREATE INDEX idx_logs_wallet ON authorization_logs(wallet_address, timestamp);
CREATE INDEX idx_logs_timestamp ON authorization_logs(timestamp);
```

### Key Rotation (Why It's Unnecessary)

Unlike traditional API key systems, SolKey does not require key rotation. The wallet's private key is the only long-lived credential, and it is never shared with the server.

If a wallet's private key is compromised:

1. Revoke the wallet's scopes immediately
2. The wallet owner generates a new wallet
3. Grant scopes to the new wallet
4. The owner migrates their applications to use the new wallet

This is simpler than key rotation because:

- No coordination is needed between client and server
- No grace period where both old and new keys are valid
- No risk of the new key being leaked during rotation
- The security model treats each wallet independently

---

## Roadmap

SolKey is an open-source project under active development. The following items are planned for future releases:

### Official SDKs

**JavaScript/TypeScript SDK**: A client library for Node.js and browser environments, providing:
- Canonical message construction
- Automatic signature generation
- Request signing helpers
- Integration with `@solana/web3.js`

**Rust SDK**: A server-side library for Rust applications, providing:
- Signature verification
- Scope enforcement
- Middleware for popular web frameworks (Actix, Axum, Rocket)
- Integration with Solana program libraries

**Python SDK**: A server-side library for Python applications, providing:
- Signature verification
- Scope enforcement
- Middleware for Flask, FastAPI, Django
- CLI tools for wallet management

### Permission Delegation

Allow wallets to delegate specific scopes to other wallets. For example:

- A user's primary wallet delegates `read:balances` to a read-only monitoring service
- A team wallet delegates `write:orders` to individual team member wallets
- A parent account delegates limited permissions to sub-accounts

Delegation would include:

- Chain of authorization (wallet A authorized wallet B, which authorized wallet C)
- Scope restrictions (delegated scopes can be a subset, not a superset)
- Time limits on delegated permissions
- Revocation of delegated permissions

### SolAuth Integration Helpers

Utilities to simplify using SolKey and SolAuth together:

- Automatic wallet authorization when a user logs in via SolAuth
- Linking SolAuth sessions to SolKey scopes
- Dashboard components for managing API access from web interfaces
- Unified logging and monitoring across both systems

### Audit Readiness

Tools and documentation to support security audits:

- Comprehensive security documentation
- Threat model and attack analysis
- Reference implementations with security annotations
- Test vectors for signature verification
- Compliance mapping (SOC 2, ISO 27001, etc.)

### Multi-Signature Support

Support for multi-signature wallets where requests must be signed by multiple parties:

- Threshold signatures (M-of-N)
- Sequential signing workflows
- Signature aggregation to reduce overhead
- Integration with Squads and other Solana multi-sig solutions

### Performance Optimizations

- Batch signature verification for high-throughput scenarios
- Hardware-accelerated signature verification
- Caching strategies for frequently accessed wallets
- Asynchronous verification for non-critical paths

### Enhanced Monitoring

- Pre-built dashboards for Grafana, Datadog, and other monitoring platforms
- Anomaly detection for unusual wallet behavior
- Automated alerting for security events
- Integration with SIEM systems