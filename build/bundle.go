package main

import (
	"archive/tar"
	"compress/gzip"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

func main() {
	if len(os.Args) != 4 {
		fmt.Fprintf(os.Stderr, "usage: bundle <source-dir> <output.tar.gz> <plugin-id>\n")
		os.Exit(2)
	}

	sourceDir := filepath.Clean(os.Args[1])
	outputPath := filepath.Clean(os.Args[2])
	pluginID := os.Args[3]

	if err := createBundle(sourceDir, outputPath, pluginID); err != nil {
		fmt.Fprintf(os.Stderr, "bundle: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("Plugin bundle:", outputPath)
}

func createBundle(sourceDir, outputPath, pluginID string) error {
	out, err := os.Create(outputPath)
	if err != nil {
		return err
	}
	defer out.Close()

	gz := gzip.NewWriter(out)
	defer gz.Close()

	tw := tar.NewWriter(gz)
	defer tw.Close()

	rootHeader := &tar.Header{
		Typeflag: tar.TypeDir,
		Name:     pluginID + "/",
		Mode:     0o755,
		Format:   tar.FormatUSTAR,
	}
	if err := tw.WriteHeader(rootHeader); err != nil {
		return err
	}

	return filepath.WalkDir(sourceDir, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}

		rel, err := filepath.Rel(sourceDir, path)
		if err != nil {
			return err
		}

		if rel == "." {
			return nil
		}

		name := filepath.ToSlash(filepath.Join(pluginID, rel))
		info, err := entry.Info()
		if err != nil {
			return err
		}

		header, err := tar.FileInfoHeader(info, "")
		if err != nil {
			return err
		}

		header.Name = name
		header.Mode = fileMode(name, info)
		header.Format = tar.FormatUSTAR

		if entry.IsDir() {
			header.Name = strings.TrimSuffix(header.Name, "/") + "/"
			return tw.WriteHeader(header)
		}

		if !info.Mode().IsRegular() {
			return nil
		}

		if err := tw.WriteHeader(header); err != nil {
			return err
		}

		file, err := os.Open(path)
		if err != nil {
			return err
		}
		defer file.Close()

		_, err = io.Copy(tw, file)
		return err
	})
}

func fileMode(name string, info os.FileInfo) int64 {
	if strings.Contains(name, "/server/dist/plugin-") {
		return 0o755
	}
	if strings.HasSuffix(name, ".exe") {
		return 0o755
	}
	if info.IsDir() {
		return 0o755
	}
	return 0o644
}
