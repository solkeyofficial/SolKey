
import nacl from "tweetnacl";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";

export function verifyRequestSignature(pubkey, message, signature) {
  const pk = new PublicKey(pubkey).toBytes();
  const sig = bs58.decode(signature);
  const msg = new TextEncoder().encode(message);
  return nacl.sign.detached.verify(msg, sig, pk);
}
