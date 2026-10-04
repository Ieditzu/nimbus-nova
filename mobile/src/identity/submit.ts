import { api, baseUrl } from "../api";
import { assetBase64 } from "./files";
import { verifyIdentityFlow, type IdentityFlowInput } from "./flow";

export function submitIdentity(input: IdentityFlowInput) {
  return verifyIdentityFlow(input, {
    client: api,
    baseUrl,
    readAsset: assetBase64,
  });
}
