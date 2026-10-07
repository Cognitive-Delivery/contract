// Compiles every `pattern` in every schema with Go's regexp package, which is RE2:
// linear time, no lookahead, no backreferences. A pattern this program rejects is a
// pattern a Go validator (gojsonschema, santhosh-tekuri/jsonschema by default) cannot
// load, and a schema set that carries one is not "usable from another language with
// nothing else", whatever the README says.
//
// The specification's portability target (SPEC section 4.4) is an ECMA-262 regular
// expression in the subset that also compiles under RE2, applied as an unanchored search.
// Passing here is necessary and not quite sufficient: it catches lookaround and
// backreferences, the constructs implementers actually hit, but not a construct both
// engines accept with different meanings.
//
// Usage, from this directory: go run . ../../schemas
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
)

type finding struct {
	file, path, pattern, err string
}

func walk(node interface{}, path string, file string, out *[]finding, seen *int) {
	switch v := node.(type) {
	case map[string]interface{}:
		if p, ok := v["pattern"].(string); ok {
			*seen++
			if _, err := regexp.Compile(p); err != nil {
				*out = append(*out, finding{file, path, p, err.Error()})
			}
		}
		keys := make([]string, 0, len(v))
		for k := range v {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			if k == "pattern" {
				continue
			}
			walk(v[k], path+"/"+k, file, out, seen)
		}
	case []interface{}:
		for i, item := range v {
			walk(item, fmt.Sprintf("%s/%d", path, i), file, out, seen)
		}
	}
}

func main() {
	dir := "schemas"
	if len(os.Args) > 1 {
		dir = os.Args[1]
	}
	files, err := filepath.Glob(filepath.Join(dir, "*.schema.json"))
	if err != nil || len(files) == 0 {
		fmt.Fprintf(os.Stderr, "no schemas found under %s\n", dir)
		os.Exit(2)
	}
	sort.Strings(files)
	var findings []finding
	seen := 0
	for _, f := range files {
		raw, err := os.ReadFile(f)
		if err != nil {
			fmt.Fprintf(os.Stderr, "read %s: %v\n", f, err)
			os.Exit(2)
		}
		var doc interface{}
		if err := json.Unmarshal(raw, &doc); err != nil {
			fmt.Fprintf(os.Stderr, "parse %s: %v\n", f, err)
			os.Exit(2)
		}
		walk(doc, "#", filepath.Base(f), &findings, &seen)
	}
	if len(findings) == 0 {
		fmt.Printf("regex portability: %d pattern(s) in %d schema(s) compile under RE2.\n", seen, len(files))
		return
	}
	fmt.Fprintf(os.Stderr, "regex portability: %d of %d pattern(s) do not compile under RE2:\n", len(findings), seen)
	for _, f := range findings {
		fmt.Fprintf(os.Stderr, "  - %s %s\n      pattern: %s\n      %s\n", f.file, f.path, f.pattern, f.err)
	}
	fmt.Fprintln(os.Stderr, "A Go validator cannot load these schemas. Rewrite the pattern without lookahead (see SPEC section 4.4).")
	os.Exit(1)
}
