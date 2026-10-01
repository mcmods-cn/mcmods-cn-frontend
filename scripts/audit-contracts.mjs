// Read-only source inventory. No services, network, env files or credentials.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import ts from "typescript";

const root = process.cwd();
const backend = path.resolve(process.argv[2] ?? "../mcmods-cn-backend");
const output = process.argv[3] ?? "docs/audit/module-contracts.json";
const config = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
if (config.error) throw new Error("Cannot read tsconfig.json");
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();
const hash = (text) => crypto.createHash("sha256").update(text).digest("hex");
const relative = (file) => path.relative(root, file).split(path.sep).join("/");
const unique = (values) => [...new Set(values)];
const bounded = (values) => {
  const variants = unique(values);
  return variants.length > 64 ? [...variants.slice(0, 63), "{VARIANTS_EXCEED_64}"] : variants;
};
const splitQuery = (text) => {
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    if (text[index] === "}") depth -= 1;
    if (text[index] === "?" && depth === 0) return [text.slice(0, index), text.slice(index + 1)];
  }
  return [text, ""];
};
const symbolFor = (node) => {
  const value = checker.getSymbolAtLocation(node);
  return value && (value.flags & ts.SymbolFlags.Alias) ? checker.getAliasedSymbol(value) : value;
};
const initializer = (node) => {
  const decl = symbolFor(node)?.valueDeclaration;
  return decl && ts.isVariableDeclaration(decl) ? decl.initializer : undefined;
};
const unwrap = (node) => {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node))) node = node.expression;
  return node;
};
function strings(node, bindings = new Map(), seen = new Set(), depth = 0) {
  node = unwrap(node);
  if (!node) return [];
  if (depth > 12 || seen.has(node)) return [`{${node.getText()}}`];
  seen = new Set(seen).add(node);
  const recurse = (next) => strings(next, bindings, seen, depth + 1);
  if (ts.isStringLiteralLike(node)) return [node.text];
  if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) {
    const type = checker.getTypeAtLocation(node);
    const variants = type.isUnion() ? type.types : [type];
    if (variants.length && variants.every((variant) => variant.flags & ts.TypeFlags.StringLiteral)) return bounded(variants.map((variant) => variant.value));
  }
  if (ts.isIdentifier(node)) {
    if (node.text === "API_BASE_URL") return ["{API_BASE_URL}"];
    if (bindings.has(node.text)) return strings(bindings.get(node.text), new Map(), seen, depth + 1);
    const value = initializer(node);
    return value ? recurse(value) : [`{${node.text}}`];
  }
  if (ts.isConditionalExpression(node)) return bounded([...recurse(node.whenTrue), ...recurse(node.whenFalse)]);
  if (ts.isTemplateExpression(node)) {
    let result = [node.head.text];
    for (const span of node.templateSpans) result = bounded(result.flatMap((left) => recurse(span.expression).map((right) => left + right + span.literal.text)));
    return result;
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return bounded(recurse(node.left).flatMap((left) => recurse(node.right).map((right) => left + right)));
  if (ts.isCallExpression(node)) {
    if (["encodeURIComponent", "String"].includes(node.expression.getText())) return recurse(node.arguments[0]);
    const decl = symbolFor(node.expression)?.valueDeclaration;
    const fn = decl && ts.isVariableDeclaration(decl) ? decl.initializer : decl;
    if (fn && (ts.isFunctionDeclaration(fn) || ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) {
      const bound = new Map(bindings);
      fn.parameters.forEach((parameter, index) => { if (ts.isIdentifier(parameter.name) && node.arguments[index]) bound.set(parameter.name.text, node.arguments[index]); });
      if (!ts.isBlock(fn.body)) return strings(fn.body, bound, seen, depth + 1);
      const returned = [];
      const visit = (child) => {
        if (ts.isReturnStatement(child) && child.expression) returned.push(...strings(child.expression, bound, seen, depth + 1));
        else if (!ts.isFunctionLike(child)) ts.forEachChild(child, visit);
      };
      ts.forEachChild(fn.body, visit);
      if (returned.length) return bounded(returned);
    }
  }
  return [`{${node.getText()}}`];
}
function property(node, key) {
  node = unwrap(node);
  if (node && ts.isIdentifier(node)) node = unwrap(initializer(node));
  if (!node || !ts.isObjectLiteralExpression(node)) return undefined;
  return node.properties.find((item) => ts.isPropertyAssignment(item) && (item.name.getText().replaceAll(/["']/g, "") === key))?.initializer;
}
function optionMethods(node) {
  node = unwrap(node);
  if (!node) return ["GET"];
  if (ts.isIdentifier(node)) return initializer(node) ? optionMethods(initializer(node)) : ["{RequestInit.method}"];
  if (ts.isConditionalExpression(node)) return bounded([...optionMethods(node.whenTrue), ...optionMethods(node.whenFalse)]);
  if (!ts.isObjectLiteralExpression(node)) return ["{RequestInit.method}"];
  const method = property(node, "method");
  if (method) return strings(method);
  const spreads = node.properties.filter(ts.isSpreadAssignment);
  return spreads.length ? bounded(spreads.flatMap((spread) => optionMethods(spread.expression))) : ["GET"];
}
function shape(type) {
  if (checker.isArrayType(type) || checker.isTupleType(type)
    || type.flags & (ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Unknown | ts.TypeFlags.Any)) return [];
  return checker.getPropertiesOfType(type).map((item) => ({
    name: item.name,
    optional: Boolean(item.flags & ts.SymbolFlags.Optional),
    type: checker.typeToString(checker.getTypeOfSymbolAtLocation(item, item.valueDeclaration ?? item.declarations?.[0])),
  }));
}
function queryKeys(node, file, patterns, seen = new Set()) {
  if (!node || seen.has(node)) return [];
  seen = new Set(seen).add(node);
  const keys = patterns.flatMap((pattern) => [...splitQuery(pattern)[1].matchAll(/(?:^|&)([a-zA-Z][\w-]*)=/g)].map((match) => match[1]));
  if (ts.isIdentifier(node)) {
    const symbol = symbolFor(node);
    const scan = (child) => {
      if (ts.isCallExpression(child) && ts.isPropertyAccessExpression(child.expression)
        && ["set", "append"].includes(child.expression.name.text) && symbolFor(child.expression.expression) === symbol) {
        if (child.arguments[0] && ts.isStringLiteralLike(child.arguments[0])) keys.push(child.arguments[0].text);
      }
      ts.forEachChild(child, scan);
    };
    scan(file);
    keys.push(...queryKeys(initializer(node), file, [], seen));
  }
  if (ts.isNewExpression(node) && node.expression.getText() === "URLSearchParams") {
    const initial = unwrap(node.arguments?.[0]);
    if (initial && ts.isObjectLiteralExpression(initial)) for (const field of initial.properties) if (field.name) keys.push(field.name.getText().replaceAll(/["']/g, ""));
  }
  ts.forEachChild(node, (child) => keys.push(...queryKeys(child, file, [], seen)));
  return unique(keys);
}
const raw = JSON.parse(execFileSync(process.env.GO_AUDIT_BIN ?? "go", ["run", "scripts/audit-go-contracts.go", backend], { cwd: root, encoding: "utf8", maxBuffer: 30 * 1024 * 1024 }));
const routes = raw.routes.map((route) => {
  const separator = route.pattern.indexOf(" ");
  const method = separator < 0 ? "ANY" : route.pattern.slice(0, separator);
  const routePath = separator < 0 ? route.pattern : route.pattern.slice(separator + 1);
  const handlers = [...route.registration.matchAll(/\bs\.([A-Za-z][A-Za-z0-9]*)/g)].map((match) => match[1]);
  return { ...route, method, path: routePath, handler: handlers.at(-1), permissions: [...route.registration.matchAll(/requirePermission\("([^"]+)"/g)].map((match) => match[1]) };
});
const globPattern = (text) => text.split(/(\{[^}]*\})/g).map((part) => part.startsWith("{") ? "[^/]+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("");
function overlaps(callPath, routePath) {
  const concrete = callPath.replaceAll(/\{[^}]*\}/g, "audit-dynamic");
  if (new RegExp(`^${globPattern(routePath)}$`).test(concrete)) return true;
  const concreteRoute = routePath.replaceAll(/\{[^}]*\}/g, "audit-dynamic");
  return new RegExp(`^${globPattern(callPath)}$`).test(concreteRoute);
}
const calls = [];
const sourceFiles = [];
for (const file of program.getSourceFiles()) {
  const rel = relative(file.fileName);
  if (!rel.startsWith("app/") || file.isDeclarationFile || /\.(test|spec)\.[tj]sx?$/.test(rel)) continue;
  let found = false;
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const sym = symbolFor(node.expression);
      if (sym && ["apiRequest", "backendFetch"].includes(sym.name) && sym.declarations?.some((decl) => relative(decl.getSourceFile().fileName) === "app/_lib/api.ts")) {
        found = true;
        const positions = file.getLineAndCharacterOfPosition(node.getStart());
        const options = node.arguments[1];
        const methods = optionMethods(options);
        const body = property(options, "body");
        const payload = body && ts.isCallExpression(body) && body.expression.getText() === "JSON.stringify" ? body.arguments[0] : undefined;
        const responseType = node.typeArguments?.[0];
        const variants = strings(node.arguments[0]);
        const isWrapper = rel === "app/_lib/api.ts" && sym.name === "backendFetch";
        const variantMatches = variants.map((variant) => {
          const clean = splitQuery(variant.replace(/^\{API_BASE_URL\}/, ""))[0];
          return { url_pattern: variant, matched_routes: routes.filter((route) => methods.includes(route.method) && overlaps(clean, route.path)).map((route) => route.pattern) };
        });
        const matches = unique(variantMatches.flatMap((variant) => variant.matched_routes));
        const classification = isWrapper ? "shared_fetch_wrapper" : matches.length ? variantMatches.every((variant) => variant.matched_routes.length) ? "route_pattern_match_only" : "partial_pattern_match" : "needs_manual_resolution";
        calls.push({ file: rel, line: positions.line + 1, column: positions.character + 1, callee: sym.name, source_expression: node.arguments[0]?.getText(), url_patterns: variants, methods, options_expression: options?.getText(), query_expression: variants.map((variant) => splitQuery(variant)[1]), query_keys: queryKeys(node.arguments[0], file, variants), request_fields: payload ? shape(checker.getTypeAtLocation(payload)) : [], response_type: responseType?.getText(), response_fields: responseType ? shape(checker.getTypeFromTypeNode(responseType)) : [], matched_routes: matches, variant_matches: variantMatches, classification, semantic_contract_verified: false, behavior_verified: false });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (found) {
    const sourceBytes = fs.readFileSync(file.fileName);
    // TypeScript removes a UTF-8 BOM; the ledger must identify real bytes.
    if (sourceBytes.toString("utf8").replace(/^\uFEFF/, "") !== file.text) throw new Error(`Source changed during extraction: ${rel}`);
    sourceFiles.push({ path: rel, sha256: hash(sourceBytes), lines: file.text.split(/\r?\n/).length - (file.text.endsWith("\n") ? 1 : 0) });
  }
}
const usedHandlers = new Set(routes.map((route) => route.handler));
// Include one explicit helper layer, preserving the distinction from runtime
// control-flow or complete recursive call-graph verification.
for (const name of [...usedHandlers]) for (const child of raw.functions[name]?.calls ?? []) if (raw.functions[child]) usedHandlers.add(child);
const functions = Object.fromEntries(Object.entries(raw.functions).filter(([name]) => usedHandlers.has(name)).map(([name, fn]) => {
  const requestTypes = [...fn.body.matchAll(/\bvar\s+\w+\s+([A-Za-z][A-Za-z0-9]*Request)\b/g)].map((match) => match[1]);
  for (const target of fn.decode_targets) {
    const declared = fn.local_types[target.replace(/^&/, "")];
    if (declared && raw.types[declared]) requestTypes.push(declared);
  }
  const reads = fn.reads.filter((read) => /(?:Query\(\)|query|params)\.Get$/.test(read.receiver));
  const meta = { ...fn };
  delete meta.body;
  delete meta.local_types;
  return [name, { ...meta, reads, request_types: unique(requestTypes), semantic_contract_verified: false, behavior_verified: false }];
}));
const usedTypes = new Set(Object.values(functions).flatMap((fn) => fn.request_types));
for (const name of usedTypes) for (const field of raw.types[name]?.fields ?? []) if (field.names.length === 0 && raw.types[field.type]) usedTypes.add(field.type);
const backendFiles = new Set([...routes.map((route) => route.file), ...Object.values(functions).map((fn) => fn.file), ...[...usedTypes].map((name) => raw.types[name]?.file)]);
const manualPath = "docs/audit/module-contract-overrides.json";
const manual = fs.existsSync(manualPath) ? JSON.parse(fs.readFileSync(manualPath, "utf8")) : { records: [] };
for (const record of manual.records) {
  for (const pattern of record.resolved_route_patterns) if (!routes.some((route) => route.pattern === pattern)) throw new Error(`Manual route no longer registered: ${pattern}`);
  const selected = calls.filter((call) => call.file === record.file && call.source_expression === record.argument_expression);
  if (!selected.length) throw new Error(`Manual call expression drifted: ${record.file}: ${record.argument_expression}`);
  for (const call of selected) call.manual_path_method_review = record;
}
const result = {
  format_version: 1,
  command: "GO_AUDIT_BIN=<go> node scripts/audit-contracts.mjs ../mcmods-cn-backend docs/audit/module-contracts.json",
  boundaries: ["AST inventory is extraction, not per-handler semantic review or execution evidence", "Dynamic placeholders preserve expressions; pattern overlap can overmatch and needs manual resolution", "Only actual imported shared apiRequest/backendFetch calls under app are included; tests excluded; plain fetch/navigation/assets are separate scope", "Go AST reads registered handler bodies/DTO metadata; nested helper-dependent response and permission rules require call-chain review", "URLs/source expressions are code, not captured requests or env credentials"],
  counts: { calls: calls.length, production_calls: calls.filter((call) => call.classification !== "shared_fetch_wrapper").length, routes: routes.length, unresolved: calls.filter((call) => call.classification === "needs_manual_resolution").length, partially_matched: calls.filter((call) => call.classification === "partial_pattern_match").length },
  frontend_source_files: sourceFiles,
  backend_route_files: raw.source_files.filter((file) => routes.some((route) => route.file === file.path)),
  backend_source_files: raw.source_files.filter((file) => backendFiles.has(file.path)),
  manual_path_method_reviews: manual.records,
  calls, routes, handlers: functions,
  request_types: Object.fromEntries(Object.entries(raw.types).filter(([name]) => usedTypes.has(name))),
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result.counts));
