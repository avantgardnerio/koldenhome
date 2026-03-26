import { html, render } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { useAuth } from "./auth.js";
import { Nav } from "./components/nav.js";
import { Login } from "./pages/login.js";
import { Dashboard } from "./pages/dashboard.js";
import { Controller } from "./pages/controller.js";
import { NodeDetail } from "./pages/node.js";

const routes = [
  { pattern: /^\/nodes\/(\d+)$/, component: NodeDetail, params: (m) => ({ id: m[1] }) },
  { pattern: /^\/controller$/, component: Controller },
  { pattern: /^\/$/, component: Dashboard },
];

function match(path) {
  for (const route of routes) {
    const m = path.match(route.pattern);
    if (m) return { component: route.component, params: route.params ? route.params(m) : {} };
  }
  return { component: Dashboard, params: {} };
}

export function navigate(path) {
  history.pushState(null, "", path);
  window.dispatchEvent(new Event("route"));
}

function App() {
  const [path, setPath] = useState(location.pathname);
  const auth = useAuth();

  useEffect(() => {
    const onRoute = () => setPath(location.pathname);
    window.addEventListener("popstate", onRoute);
    window.addEventListener("route", onRoute);
    return () => {
      window.removeEventListener("popstate", onRoute);
      window.removeEventListener("route", onRoute);
    };
  }, []);

  if (auth.loading) {
    return html`<div class="container"><p>Loading...</p></div>`;
  }

  if (!auth.authenticated) {
    return html`<${Login} pending=${auth.pending} googleConfigured=${auth.googleConfigured} />`;
  }

  const { component: Page, params } = match(path);

  return html`
    <${Nav} path=${path} auth=${auth} />
    <div class="container">
      <${Page} ...${params} />
    </div>
  `;
}

render(html`<${App} />`, document.getElementById("app"));
