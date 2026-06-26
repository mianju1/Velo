export function buildServerUrl(hostInput: string, portInput: string) {
  const host = hostInput.trim().replace(/\/+$/, "");
  const port = portInput.trim();

  if (!host) {
    return "";
  }

  const schemeMatch = host.match(/^(https?:\/\/)/i);
  const scheme = schemeMatch?.[1] ?? inferScheme(port);
  const hostWithoutScheme = schemeMatch ? host.slice(scheme.length) : host;
  const hostWithoutPort = hostWithoutScheme.replace(/:\d+$/, "");

  return `${scheme}${hostWithoutPort}${port ? `:${port}` : ""}`;
}

function inferScheme(port: string) {
  if (port === "80") {
    return "http://";
  }
  if (port === "443" || port === "") {
    return "https://";
  }

  return "http://";
}
