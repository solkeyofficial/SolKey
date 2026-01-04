
import { canonicalRequestMessage } from "../../core/message.js";
import { verifyRequestSignature } from "../../core/verify.js";
import { scopeAllowed } from "../../core/scopes.js";

export function requireSolKey(requiredScope) {
  return (req, res, next) => {
    const pubkey = req.header("x-solkey-pubkey");
    const signature = req.header("x-solkey-signature");
    const scope = req.header("x-solkey-scope");
    const timestamp = Number(req.header("x-solkey-timestamp"));

    if (!pubkey || !signature || !scope || !timestamp) {
      return res.status(401).json({ error: "Missing SolKey headers" });
    }

    if (!scopeAllowed(requiredScope, [scope])) {
      return res.status(403).json({ error: "Scope not allowed" });
    }

    const msg = canonicalRequestMessage({
      method: req.method,
      path: req.path,
      bodyHash: "placeholder",
      timestamp,
      scope,
    });

    const ok = verifyRequestSignature(pubkey, msg, signature);
    if (!ok) return res.status(401).json({ error: "Invalid signature" });

    next();
  };
}
