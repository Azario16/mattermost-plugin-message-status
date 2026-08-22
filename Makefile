PLUGIN_ID := com.github.mattermost-message-status
PLUGIN_VERSION := 1.0.0
BUNDLE_NAME := $(PLUGIN_ID)-$(PLUGIN_VERSION).tar.gz

GO ?= go
NPM ?= npm

# MSYS make often lacks Windows env vars Go needs (GOPATH, GOMODCACHE, GOCACHE).
GO_USER := $(shell id -un 2>/dev/null)
GO_ENV_GOPATH := $(shell $(GO) env GOPATH 2>/dev/null)
GO_ENV_GOMODCACHE := $(shell $(GO) env GOMODCACHE 2>/dev/null)
GO_ENV_GOCACHE := $(shell $(GO) env GOCACHE 2>/dev/null)
ifeq ($(GO_ENV_GOCACHE),off)
GO_ENV_GOCACHE :=
endif

ifeq ($(GO_ENV_GOPATH),)
ifneq ($(GO_USER),)
ifneq ($(wildcard /c/Users/$(GO_USER)/go),)
export GOPATH := /c/Users/$(GO_USER)/go
endif
endif
ifndef GOPATH
export GOPATH := $(HOME)/go
endif
else
export GOPATH := $(GO_ENV_GOPATH)
endif

ifeq ($(GO_ENV_GOMODCACHE),)
export GOMODCACHE := $(GOPATH)/pkg/mod
else
export GOMODCACHE := $(GO_ENV_GOMODCACHE)
endif

ifeq ($(GO_ENV_GOCACHE),)
ifneq ($(GO_USER),)
ifneq ($(wildcard /c/Users/$(GO_USER)/AppData/Local/go-build),)
export GOCACHE := /c/Users/$(GO_USER)/AppData/Local/go-build
endif
endif
ifndef GOCACHE
export GOCACHE := $(GOPATH)/pkg/cache
endif
else
export GOCACHE := $(GO_ENV_GOCACHE)
endif

ifneq ($(GO_USER),)
ifneq ($(wildcard /c/Users/$(GO_USER)/AppData/Local),)
export LOCALAPPDATA := /c/Users/$(GO_USER)/AppData/Local
endif
endif

.PHONY: all server server-linux webapp bundle bundle-all dist dist-all clean

all: dist

server-linux:
	cd server && $(GO) mod tidy
	rm -rf server/dist
	mkdir -p server/dist
	cd server && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 $(GO) build -trimpath -o dist/plugin-linux-amd64
	cd server && CGO_ENABLED=0 GOOS=linux GOARCH=arm64 $(GO) build -trimpath -o dist/plugin-linux-arm64

server: server-linux
	cd server && CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 $(GO) build -trimpath -o dist/plugin-darwin-amd64
	cd server && CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 $(GO) build -trimpath -o dist/plugin-darwin-arm64
	cd server && CGO_ENABLED=0 GOOS=windows GOARCH=amd64 $(GO) build -trimpath -o dist/plugin-windows-amd64.exe

webapp:
	cd webapp && $(NPM) install
	cd webapp && $(NPM) run build

bundle:
	rm -rf dist/$(PLUGIN_ID)
	mkdir -p dist/$(PLUGIN_ID)/webapp/dist
	mkdir -p dist/$(PLUGIN_ID)/server/dist
	cp plugin.json dist/$(PLUGIN_ID)/
	cp -r webapp/dist dist/$(PLUGIN_ID)/webapp/
	cp server/dist/plugin-linux-amd64 server/dist/plugin-linux-arm64 dist/$(PLUGIN_ID)/server/dist/
	$(GO) run ./build/bundle.go dist/$(PLUGIN_ID) dist/$(BUNDLE_NAME) $(PLUGIN_ID)

bundle-all:
	rm -rf dist/$(PLUGIN_ID)
	mkdir -p dist/$(PLUGIN_ID)/webapp/dist
	mkdir -p dist/$(PLUGIN_ID)/server/dist
	cp plugin.full.json dist/$(PLUGIN_ID)/plugin.json
	cp -r webapp/dist dist/$(PLUGIN_ID)/webapp/
	cp -r server/dist/. dist/$(PLUGIN_ID)/server/dist/
	$(GO) run ./build/bundle.go dist/$(PLUGIN_ID) dist/$(BUNDLE_NAME) $(PLUGIN_ID)
	@echo "Plugin bundle (all platforms): dist/$(BUNDLE_NAME)"

dist: server-linux webapp bundle

dist-all: server webapp bundle-all

clean:
	rm -rf dist server/dist webapp/dist webapp/node_modules
