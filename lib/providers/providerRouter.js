import { KieVideoProvider } from "./kieVideoProvider.js";
import { MuApiVideoProvider } from "./muApiVideoProvider.js";

export class ProviderRouter {
  constructor(options = {}) {
    this.providers = options.providers || { KIE: new KieVideoProvider(options.kie), MUAPI: new MuApiVideoProvider(options.muapi) };
  }

  selectPrimaryProvider() {
    const name = "MUAPI";
    const provider = this.providers[name];
    if (!provider) throw new Error(`Unsupported primary video provider: ${name}`);
    return { name, client: provider };
  }

  selectFallbackProvider() {
    return null;
  }

  getProvider(name) {
    const normalized = String(name || "").toUpperCase();
    const client = this.providers[normalized];
    if (!client) throw new Error(`Unsupported provider: ${name}`);
    return { name: normalized, client };
  }
}

export const providerRouter = new ProviderRouter();
