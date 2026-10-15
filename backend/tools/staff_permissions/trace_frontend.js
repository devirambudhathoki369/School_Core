// Trace which API calls each staff permission's screens make.
//
// usage: node trace_frontend.js <frontend dir> <out.json>
// then:  python manage.py shell -c "..."  -- see build_map.py
//
// Follows configs/menus.jsx (permission -> view), configs/views/* (view ->
// component), and every identifier each component references, down to the
// __fetch/__search/__save/__update/__delete/server.* calls and their URLs.
// The app shell (pages/_app, pages/[role]) is traced too: its calls are made
// for every staff session. Uses the frontend's own @babel/parser.
const fs = require("fs");
const path = require("path");
const FRONT = path.resolve(process.argv[2]);
const NM = path.join(FRONT, "node_modules");
const parser = require(path.join(NM, "@babel/parser"));
const traverse = require(path.join(NM, "@babel/traverse")).default;
const t = require(path.join(NM, "@babel/types"));
const SRC = path.join(FRONT, "src");

const METHOD = {
  __fetch: "GET", __search: "POST", __fetchAsOptions: "GET",
  __save: "POST", __update: "PUT", __delete: "DELETE",
};
const SERVER = { get: "GET", post: "POST", put: "PUT", patch: "PATCH", delete: "DELETE" };
const EXTS = ["", ".js", ".jsx", ".ts", ".tsx", "/index.js", "/index.jsx", "/index.ts", "/index.tsx"];

function resolve(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const e of EXTS) {
    const f = base + e;
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  return null;
}

const modules = new Map();
function load(file) {
  if (modules.has(file)) return modules.get(file);
  const mod = { file, ast: null, exports: new Map(), reexports: [], star: [] };
  modules.set(file, mod);
  let code;
  try { code = fs.readFileSync(file, "utf8"); } catch { return mod; }
  try {
    mod.ast = parser.parse(code, {
      sourceType: "module", errorRecovery: true,
      plugins: ["jsx", "typescript", "classProperties", "dynamicImport", "optionalChaining"],
    });
  } catch (e) { mod.error = String(e.message); return mod; }
  traverse(mod.ast, {
    Program(p) { mod.program = p; },
    ExportNamedDeclaration(p) {
      const n = p.node;
      if (n.source) {
        const src = resolve(file, n.source.value);
        for (const s of n.specifiers) mod.reexports.push({ local: s.local ? s.local.name : "default", exported: s.exported.name, src });
        return;
      }
      if (n.declaration) {
        const d = n.declaration;
        if (d.id) mod.exports.set(d.id.name, { binding: d.id.name });
        if (d.declarations) for (const v of d.declarations) if (v.id.name) mod.exports.set(v.id.name, { binding: v.id.name });
      }
      for (const s of n.specifiers || []) mod.exports.set(s.exported.name, { binding: s.local.name });
    },
    ExportDefaultDeclaration(p) {
      const d = p.node.declaration;
      if (t.isIdentifier(d)) mod.exports.set("default", { binding: d.name });
      else mod.exports.set("default", { path: p.get("declaration") });
    },
    ExportAllDeclaration(p) { mod.star.push(resolve(file, p.node.source.value)); },
  });
  return mod;
}

// Evaluate a URL argument to a string; unknown parts become "{}".
function evalStr(p, depth = 0) {
  if (!p || !p.node || depth > 8) return null;
  const n = p.node;
  if (t.isStringLiteral(n)) return n.value;
  if (t.isTemplateLiteral(n)) {
    let s = "";
    n.quasis.forEach((q, i) => {
      s += q.value.cooked;
      if (i < n.expressions.length) {
        const v = evalStr(p.get(`expressions.${i}`), depth + 1);
        s += v === null ? "{}" : v;
      }
    });
    return s;
  }
  if (t.isBinaryExpression(n, { operator: "+" })) {
    const a = evalStr(p.get("left"), depth + 1), b = evalStr(p.get("right"), depth + 1);
    return (a === null ? "{}" : a) + (b === null ? "{}" : b);
  }
  if (t.isIdentifier(n)) {
    const b = p.scope.getBinding(n.name);
    if (!b) return null;
    if (b.kind === "module") {
      const imp = b.path.parentPath.node;
      const src = resolve(fileOf(p), imp.source.value);
      const name = t.isImportSpecifier(b.path.node) ? b.path.node.imported.name : "default";
      return src ? constExport(src, name, depth + 1) : null;
    }
    if (b.path.isVariableDeclarator() && b.constant !== false) return evalStr(b.path.get("init"), depth + 1);
    return null;
  }
  if (t.isConditionalExpression(n)) return evalStr(p.get("consequent"), depth + 1);
  if (t.isLogicalExpression(n)) return evalStr(p.get("left"), depth + 1) ?? evalStr(p.get("right"), depth + 1);
  if ((t.isMemberExpression(n) || t.isOptionalMemberExpression(n)) && !n.computed && t.isIdentifier(n.property)) {
    // API.hostels -> the property of a constant object
    const obj = objectOf(p.get("object"), depth + 1);
    if (obj) {
      const prop = obj.get("properties").find((pr) => pr.isObjectProperty() && ((pr.node.key.name || pr.node.key.value) === n.property.name));
      if (prop) return evalStr(prop.get("value"), depth + 1);
    }
    return null;
  }
  return null;
}
// A URL that is a parameter of the enclosing function: evaluate the matching
// argument at that function's call sites in the same module.
function paramUrls(argp) {
  if (!argp || !argp.isIdentifier()) return [];
  const b = argp.scope.getBinding(argp.node.name);
  if (!b || b.kind !== "param") return [];
  const fn = b.scope.path;
  const idx = fn.node.params.findIndex((p) => t.isIdentifier(p, { name: argp.node.name }));
  if (idx < 0) return [];
  let fname = fn.node.id && fn.node.id.name;
  if (!fname && fn.parentPath.isVariableDeclarator()) fname = fn.parentPath.node.id.name;
  if (!fname) return [];
  const fnBinding = fn.parentPath.scope.getBinding(fname) || fn.scope.parent.getBinding(fname);
  const urls = [];
  const scopeRoot = fnBinding ? fnBinding.scope.path : argp.scope.getProgramParent().path;
  scopeRoot.traverse({
    CallExpression(cp) {
      if (!t.isIdentifier(cp.node.callee, { name: fname })) return;
      const a = cp.get(`arguments.${idx}`);
      const v = evalStr(a);
      if (v !== null) urls.push(v);
    },
  });
  return urls;
}
function objectOf(p, depth) {
  if (p && (p.isMemberExpression() || p.isOptionalMemberExpression()) && !p.node.computed && t.isIdentifier(p.node.property)) {
    const parent = objectOf(p.get("object"), depth + 1);
    if (!parent) return null;
    const prop = parent.get("properties").find((pr) => pr.isObjectProperty() && ((pr.node.key.name || pr.node.key.value) === p.node.property.name));
    return prop ? objectOf(prop.get("value"), depth + 1) : null;
  }
  if (p && p.isIdentifier()) {
    const b = p.scope.getBinding(p.node.name);
    if (b && b.kind === "module") {
      const imp = b.path.parentPath.node;
      const src = resolve(fileOf(p), imp.source.value);
      const name = t.isImportSpecifier(b.path.node) ? b.path.node.imported.name : "default";
      if (!src) return null;
      const m = load(src);
      if (!m.program) return null;
      fileByProgram.set(m.program.node, src);
      const ex = m.exports.get(name);
      const eb = ex && ex.binding && m.program.scope.getBinding(ex.binding);
      return eb && eb.path.isVariableDeclarator() ? objectOf(eb.path.get("init"), depth + 1) : null;
    }
  }
  return objectOfLocal(p, depth);
}
function objectOfLocal(p, depth) {
  if (!p || !p.node || depth > 8) return null;
  if (p.isObjectExpression()) return p;
  if (p.isIdentifier()) {
    const b = p.scope.getBinding(p.node.name);
    if (b && b.path.isVariableDeclarator()) return objectOf(b.path.get("init"), depth + 1);
  }
  return null;
}
const fileByProgram = new WeakMap();
function fileOf(p) { return fileByProgram.get(p.scope.getProgramParent().path.node) || ""; }
function constExport(file, name, depth) {
  const mod = load(file);
  if (!mod.program) return null;
  fileByProgram.set(mod.program.node, file);
  const ex = mod.exports.get(name);
  if (!ex || !ex.binding) return null;
  const b = mod.program.scope.getBinding(ex.binding);
  if (b && b.path.isVariableDeclarator()) return evalStr(b.path.get("init"), depth);
  return null;
}

// ---- reachability: (file, exportName) -> set of API calls --------------------
const memo = new Map();
function exportCalls(file, name, stack = new Set()) {
  const key = file + "#" + name;
  if (memo.has(key)) return memo.get(key);
  if (stack.has(key)) return new Set();
  stack.add(key);
  const out = new Set();
  memo.set(key, out);
  const mod = load(file);
  if (!mod.program) return out;
  fileByProgram.set(mod.program.node, file);
  const add = (s) => s && s.forEach((c) => out.add(c));
  if (name === "*") {
    for (const n of mod.exports.keys()) add(exportCalls(file, n, stack));
    add(topLevelCalls(mod, stack));
    return out;
  }
  const ex = mod.exports.get(name);
  if (ex) {
    if (ex.path) add(pathCalls(mod, ex.path, stack, new Set()));
    else add(bindingCalls(mod, ex.binding, stack, new Set()));
  } else {
    const re = mod.reexports.find((r) => r.exported === name);
    if (re && re.src) add(exportCalls(re.src, re.local, stack));
    for (const s of mod.star) if (s) add(exportCalls(s, name, stack));
  }
  // a module's import-time side effects run whenever anything is used from it
  add(topLevelCalls(mod, stack));
  return out;
}
const topMemo = new Map();
function topLevelCalls(mod, stack) {
  if (topMemo.has(mod.file)) return topMemo.get(mod.file);
  const out = new Set();
  topMemo.set(mod.file, out);
  for (const st of mod.program.get("body")) {
    if (st.isExpressionStatement()) pathCalls(mod, st, stack, new Set()).forEach((c) => out.add(c));
  }
  return out;
}
function bindingCalls(mod, name, stack, seen) {
  const b = mod.program.scope.getBinding(name);
  if (!b) return new Set();
  if (b.kind === "module") {
    const imp = b.path.parentPath.node;
    const src = resolve(mod.file, imp.source.value);
    if (!src) return new Set();
    if (t.isImportNamespaceSpecifier(b.path.node)) return exportCalls(src, "*", stack);
    const nm = t.isImportSpecifier(b.path.node) ? b.path.node.imported.name : "default";
    return exportCalls(src, nm, stack);
  }
  if (seen.has(name)) return new Set();
  seen.add(name);
  let decl = b.path;
  if (decl.isVariableDeclarator()) decl = decl.get("init");
  return pathCalls(mod, decl, stack, seen);
}
function pathCalls(mod, p, stack, seen) {
  const out = new Set();
  if (!p || !p.node) return out;
  const handleRef = (ip) => {
    const name = ip.node.name;
    const b = ip.scope.getBinding(name);
    if (!b) return;
    if (b.scope !== mod.program.scope) return; // local variable
    bindingCalls(mod, name, stack, seen).forEach((c) => out.add(c));
  };
  const check = (cp) => {
    const c = cp.node.callee;
    let method = null;
    if (t.isIdentifier(c) && METHOD[c.name]) method = METHOD[c.name];
    else if (t.isMemberExpression(c) && t.isIdentifier(c.object, { name: "server" }) && t.isIdentifier(c.property) && SERVER[c.property.name]) method = SERVER[c.property.name];
    if (t.isImport(c)) {
      const arg = cp.node.arguments[0];
      if (t.isStringLiteral(arg)) {
        const src = resolve(mod.file, arg.value);
        if (src) exportCalls(src, "default", stack).forEach((x) => out.add(x));
      }
      return;
    }
    if (!method) return;
    const argp = cp.get("arguments.0");
    const url = evalStr(argp);
    if (url !== null) { out.add(method + " " + url); return; }
    const viaParams = paramUrls(argp);
    if (viaParams.length) { viaParams.forEach((u) => out.add(method + " " + u)); return; }
    out.add(method + " ?" + path.relative(SRC, mod.file));
  };
  if (p.isIdentifier() || p.isJSXIdentifier()) { if (p.isIdentifier()) handleRef(p); return out; }
  if (p.isCallExpression()) check(p);
  p.traverse({
    CallExpression: check,
    Identifier(ip) {
      if (ip.parentPath.isMemberExpression({ property: ip.node }) && !ip.parentPath.node.computed) return;
      if (ip.parentPath.isObjectProperty({ key: ip.node }) && !ip.parentPath.node.computed) return;
      if (ip.isBindingIdentifier && ip.isBindingIdentifier()) return;
      handleRef(ip);
    },
    JSXIdentifier(ip) {
      if (!ip.parentPath.isJSXOpeningElement() && !ip.parentPath.isJSXMemberExpression()) return;
      const b = ip.scope.getBinding(ip.node.name);
      if (b && b.scope === mod.program.scope) bindingCalls(mod, ip.node.name, stack, seen).forEach((c) => out.add(c));
    },
  });
  return out;
}

// ---- screens: view key -> calls ---------------------------------------------
const screens = {};
const viewDir = path.join(SRC, "configs/views");
for (const f of fs.readdirSync(viewDir)) {
  const file = path.join(viewDir, f);
  const mod = load(file);
  if (!mod.program) continue;
  fileByProgram.set(mod.program.node, file);
  mod.program.traverse({
    ObjectProperty(pp) {
      const k = pp.node.key;
      const key = t.isStringLiteral(k) ? k.value : t.isIdentifier(k) ? k.name : null;
      if (!key || !/[a-z]/.test(key)) return;
      const v = pp.get("value");
      if (!(v.isArrowFunctionExpression() || v.isJSXElement() || v.isIdentifier() || v.isFunctionExpression())) return;
      const calls = pathCalls(mod, v, new Set(), new Set());
      screens[key] = [...new Set([...(screens[key] || []), ...calls])];
    },
  });
}

// ---- menus: permission id -> view keys ---------------------------------------
const permMod = load(path.join(SRC, "configs/permissions/index.js"));
fileByProgram.set(permMod.program.node, permMod.file);
function objValue(p) {
  if (p.isObjectExpression()) {
    const o = {};
    for (const pr of p.get("properties")) if (pr.isObjectProperty()) o[pr.node.key.name || pr.node.key.value] = objValue(pr.get("value"));
    return o;
  }
  if (p.isNumericLiteral()) return p.node.value;
  return null;
}
const PERMS = objValue(permMod.program.scope.getBinding("PERMISSIONS").path.get("init"));
function permOf(node) {
  // PERMISSIONS.A.B[.C]
  const parts = [];
  let n = node;
  while (t.isMemberExpression(n)) { parts.unshift(n.property.name); n = n.object; }
  if (!t.isIdentifier(n, { name: "PERMISSIONS" })) return undefined;
  return parts.reduce((o, k) => (o ? o[k] : undefined), PERMS);
}
const menuMod = load(path.join(SRC, "configs/menus.jsx"));
fileByProgram.set(menuMod.program.node, menuMod.file);
const viewAccess = {}; // view key -> Set(perm ids | "ALL")
// Mirrors methods/filterViews.js: a submenu item whose own id is granted is
// shown WITH its whole subtree, so a leaf is reachable by its own id or any
// granted ancestor's (a top-level group's own id is not consulted).
function walkMenu(arr, parent, top, inherited) {
  for (const el of arr.get("elements")) {
    if (!el.isObjectExpression()) continue;
    const props = {};
    for (const pr of el.get("properties")) if (pr.isObjectProperty()) props[pr.node.key.name] = pr.get("value");
    const view = props.view && props.view.isStringLiteral() ? props.view.node.value : "";
    const key = parent ? parent + "." + view : view;
    const idNode = props.id ? props.id.node : null;
    const id = idNode ? permOf(idNode) : undefined;
    const always = props.alwaysShow && props.alwaysShow.isBooleanLiteral({ value: true });
    if (props.submenu) {
      const next = always ? ["ALL"] : top ? [] : [...inherited, ...(typeof id === "number" ? [id] : [])];
      walkMenu(props.submenu, key, false, next);
      continue;
    }
    const access = new Set(inherited);
    if (always) access.add("ALL");
    if (typeof id === "number") access.add(id);
    if (top && !idNode) access.add("ALL"); // ungated top-level leaf
    if (!access.size) continue; // id: null in a submenu -> admins only
    viewAccess[key] = viewAccess[key] || new Set();
    access.forEach((a) => viewAccess[key].add(a));
  }
}
walkMenu(menuMod.program.scope.getBinding("adminMenu").path.get("init"), "", true, []);

// ---- the app shell: every staff session runs it ------------------------------
const STOP = [path.join(SRC, "configs/views"), path.join(SRC, "configs/menus.jsx")];
const globalCalls = new Set();
const shellEntries = ["pages/_app.js", "pages/[role].jsx"].map((f) => path.join(SRC, f));
// The shell imports the view maps; cut those edges so screens stay screens,
// and start over so nothing memoised through them leaks in.
memo.clear(); topMemo.clear();
const _exportCalls = exportCalls;
exportCalls = function (file, name, stack = new Set()) {
  if (STOP.some((s) => file.startsWith(s))) return new Set();
  return _exportCalls(file, name, stack);
};
for (const f of shellEntries) for (const c of exportCalls(f, "default")) globalCalls.add(c);

const out = { screens, viewAccess: Object.fromEntries(Object.entries(viewAccess).map(([k, v]) => [k, [...v]])), global: [...globalCalls], perms: PERMS };
fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
console.log("screens", Object.keys(screens).length, "menu views", Object.keys(viewAccess).length, "global calls", globalCalls.size);
const unmapped = Object.keys(viewAccess).filter((k) => !screens[k]);
console.log("menu views with no screen:", unmapped.join(", "));
