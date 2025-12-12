export async function register() {
  // Configure a global HTTP(S) proxy for all Node runtime fetch/undici requests
  try {
    const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
    if (!proxyUrl) return;
    // Only available in Node runtime; guard dynamic import
    const undici = await import("undici");
    const ProxyAgent = (undici as any).ProxyAgent || (undici as any).buildProxy ? (undici as any).ProxyAgent : undefined;
    const setGlobalDispatcher = (undici as any).setGlobalDispatcher;
    const AgentCtor = ProxyAgent || (undici as any).Agent;
    if (!AgentCtor || !setGlobalDispatcher) return;
    const agent = new AgentCtor(proxyUrl);
    setGlobalDispatcher(agent);
    // eslint-disable-next-line no-console
    console.log("[instrumentation] HTTP proxy configured via ", proxyUrl.replace(/:\\/\\/.*@/, "://***@"));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[instrumentation] Proxy setup skipped:", (e as any)?.message || e);
  }
}
