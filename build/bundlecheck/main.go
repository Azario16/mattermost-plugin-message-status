package main

import (
	"archive/tar"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

func main() {
	bundlePath := "dist/com.github.mattermost-message-status-1.0.0.tar.gz"
	if len(os.Args) > 1 {
		bundlePath = os.Args[1]
	}

	tmpDir, err := os.MkdirTemp("", "plugin-extract-*")
	if err != nil {
		panic(err)
	}
	defer os.RemoveAll(tmpDir)

	fmt.Println("extracting to", tmpDir)
	if err := extractTarGz(bundlePath, tmpDir); err != nil {
		fmt.Println("extract error:", err)
		os.Exit(1)
	}

	entries, err := os.ReadDir(tmpDir)
	if err != nil {
		panic(err)
	}

	fmt.Println("root entries:", len(entries))
	for _, e := range entries {
		fmt.Println(" -", e.Name(), e.IsDir())
	}

	extractDir := tmpDir
	if len(entries) == 1 && entries[0].IsDir() {
		extractDir = filepath.Join(tmpDir, entries[0].Name())
	}

	manifestPath := filepath.Join(extractDir, "plugin.json")
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		fmt.Println("manifest read error:", err)
		os.Exit(1)
	}

	var manifest map[string]any
	if err := json.Unmarshal(data, &manifest); err != nil {
		fmt.Println("manifest json error:", err)
		os.Exit(1)
	}

	binaryPath := filepath.Join(extractDir, "server/dist/plugin-linux-amd64")
	info, err := os.Stat(binaryPath)
	if err != nil {
		fmt.Println("binary missing:", err)
		os.Exit(1)
	}

	fmt.Println("manifest id:", manifest["id"])
	fmt.Printf("binary mode: %o\n", info.Mode().Perm())
	fmt.Println("ok")
}

func extractTarGz(path, dst string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()

	gz, err := gzip.NewReader(f)
	if err != nil {
		return fmt.Errorf("gzip: %w", err)
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("tar next: %w", err)
		}

		switch header.Typeflag {
		case tar.TypeDir, tar.TypeReg:
		default:
			fmt.Println("skip type", string(header.Typeflag), header.Name)
			continue
		}

		target := filepath.Join(dst, header.Name)
		cleanTarget := filepath.Clean(target)
		cleanDst := filepath.Clean(dst)
		if !strings.HasPrefix(cleanTarget, cleanDst+string(os.PathSeparator)) && cleanTarget != cleanDst {
			return fmt.Errorf("sanitize failed: %s", header.Name)
		}

		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.Mkdir(target, os.FileMode(header.Mode)); err != nil && !os.IsExist(err) {
				return fmt.Errorf("mkdir %s: %w", header.Name, err)
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(target), 0744); err != nil {
				return err
			}
			out, err := os.OpenFile(target, os.O_RDWR|os.O_CREATE|os.O_TRUNC, os.FileMode(header.Mode))
			if err != nil {
				return err
			}
			if _, err := io.Copy(out, tr); err != nil {
				out.Close()
				return err
			}
			out.Close()
		}
	}

	return nil
}
