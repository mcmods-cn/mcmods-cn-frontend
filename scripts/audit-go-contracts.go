// Command audit-go-contracts reads source files only. It never starts services
// or reads application environment variables, configuration, or credentials.
package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"go/ast"
	"go/format"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

func source(n ast.Node, fset *token.FileSet) string {
	var out bytes.Buffer
	_ = format.Node(&out, fset, n)
	return out.String()
}

func literal(n ast.Expr) string {
	if n, ok := n.(*ast.BasicLit); ok && n.Kind == token.STRING {
		value, _ := strconv.Unquote(n.Value)
		return value
	}
	return ""
}

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: go run scripts/audit-go-contracts.go BACKEND_ROOT")
		os.Exit(2)
	}
	root := os.Args[1]
	fset := token.NewFileSet()
	files, err := filepath.Glob(filepath.Join(root, "internal/httpapi/*.go"))
	if err != nil {
		panic(err)
	}
	if len(files) == 0 {
		fmt.Fprintln(os.Stderr, "backend root has no internal/httpapi Go sources")
		os.Exit(2)
	}
	functions := map[string]any{}
	types := map[string]any{}
	routes := []any{}
	sourceFiles := []any{}
	for _, path := range files {
		if strings.HasSuffix(path, "_test.go") {
			continue
		}
		content, err := os.ReadFile(path)
		if err != nil {
			panic(err)
		}
		file, err := parser.ParseFile(fset, path, content, 0)
		if err != nil {
			panic(err)
		}
		rel, _ := filepath.Rel(root, path)
		lines := bytes.Count(content, []byte("\n"))
		if len(content) > 0 && content[len(content)-1] != '\n' {
			lines++
		}
		sourceFiles = append(sourceFiles, map[string]any{"path": filepath.ToSlash(rel), "sha256": fmt.Sprintf("%x", sha256.Sum256(content)), "lines": lines})
		for _, decl := range file.Decls {
			if gen, ok := decl.(*ast.GenDecl); ok {
				for _, spec := range gen.Specs {
					if typ, ok := spec.(*ast.TypeSpec); ok {
						if object, ok := typ.Type.(*ast.StructType); ok {
							fields := []any{}
							for _, field := range object.Fields.List {
								tag := ""
								if field.Tag != nil {
									tag, _ = strconv.Unquote(field.Tag.Value)
								}
								names := []string{}
								for _, name := range field.Names {
									names = append(names, name.Name)
								}
								fields = append(fields, map[string]any{"names": names, "type": source(field.Type, fset), "tag": tag})
							}
							types[typ.Name.Name] = map[string]any{"file": filepath.ToSlash(rel), "line": fset.Position(typ.Pos()).Line, "fields": fields}
						}
					}
				}
			}
			fn, ok := decl.(*ast.FuncDecl)
			if !ok || fn.Body == nil {
				continue
			}
			responses, reads, decodes, calls := []any{}, []any{}, []string{}, []string{}
			localTypes := map[string]string{}
			ast.Inspect(fn.Body, func(n ast.Node) bool {
				if value, ok := n.(*ast.ValueSpec); ok && value.Type != nil {
					for _, name := range value.Names {
						localTypes[name.Name] = source(value.Type, fset)
					}
				}
				call, ok := n.(*ast.CallExpr)
				if !ok {
					return true
				}
				name := source(call.Fun, fset)
				line := fset.Position(call.Pos()).Line
				if selected, ok := call.Fun.(*ast.SelectorExpr); ok {
					if receiver, ok := selected.X.(*ast.Ident); ok && receiver.Name == "s" {
						calls = append(calls, selected.Sel.Name)
					}
				}
				isYggdrasilWrapper := name == "handle" && fn.Name.Name == "yggdrasilRoutes"
				if (strings.HasSuffix(name, ".HandleFunc") || isYggdrasilWrapper) && len(call.Args) >= 2 {
					pattern := literal(call.Args[0])
					if pattern != "" {
						registration := source(call.Args[1], fset)
						if isYggdrasilWrapper {
							registration = "s.requireYggdrasilService(" + registration + ")"
						}
						routes = append(routes, map[string]any{"pattern": pattern, "registration": registration, "file": filepath.ToSlash(rel), "line": line})
					}
				}
				if (name == "writeJSON" || name == "writeError" || name == "writeAPIError") && len(call.Args) >= 3 {
					keys := []string{}
					if object, ok := call.Args[2].(*ast.CompositeLit); ok {
						for _, field := range object.Elts {
							if pair, ok := field.(*ast.KeyValueExpr); ok && literal(pair.Key) != "" {
								keys = append(keys, literal(pair.Key))
							}
						}
					}
					code := ""
					if name == "writeAPIError" {
						code = literal(call.Args[2])
					}
					responses = append(responses, map[string]any{"writer": name, "line": line, "status": source(call.Args[1], fset), "data_expression": source(call.Args[2], fset), "map_keys": keys, "business_code": code})
				}
				if name == "decodeJSON" && len(call.Args) >= 2 {
					decodes = append(decodes, source(call.Args[1], fset))
				}
				if name == "decodeSkinJSON" && len(call.Args) >= 3 {
					decodes = append(decodes, source(call.Args[2], fset))
				}
				if strings.HasSuffix(name, ".Get") && len(call.Args) == 1 && literal(call.Args[0]) != "" {
					reads = append(reads, map[string]any{"receiver": name, "key": literal(call.Args[0]), "line": line})
				}
				return true
			})
			body := source(fn.Body, fset)
			functions[fn.Name.Name] = map[string]any{"file": filepath.ToSlash(rel), "start_line": fset.Position(fn.Pos()).Line, "end_line": fset.Position(fn.End()).Line, "responses": responses, "reads": reads, "decode_targets": decodes, "local_types": localTypes, "calls": calls, "body": body}
		}
	}
	if err := json.NewEncoder(os.Stdout).Encode(map[string]any{"routes": routes, "functions": functions, "types": types, "source_files": sourceFiles}); err != nil {
		panic(err)
	}
}
