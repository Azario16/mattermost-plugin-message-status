package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"

	"github.com/gorilla/mux"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
)

const (
	statusEventName = "status_updated"
	kvPrefix        = "status_"
)

// Plugin implements the Mattermost plugin interface.
type Plugin struct {
	plugin.MattermostPlugin
	router *mux.Router
	mu     sync.Mutex
}

func (p *Plugin) OnActivate() error {
	p.router = p.initRouter()
	return nil
}

func (p *Plugin) MessageHasBeenPosted(_ *plugin.Context, post *model.Post) {
	if post == nil || post.DeleteAt > 0 {
		return
	}

	if post.Type != "" && post.Type != model.PostTypeDefault {
		return
	}

	if post.Props != nil {
		if fromWebhook, ok := post.Props["from_webhook"].(bool); ok && fromWebhook {
			return
		}
	}

	p.markDelivered(post)
}

func (p *Plugin) ServeHTTP(c *plugin.Context, w http.ResponseWriter, r *http.Request) {
	p.router.ServeHTTP(w, r)
}

func (p *Plugin) initRouter() *mux.Router {
	router := mux.NewRouter()
	router.Use(p.requireLoggedIn)

	api := router.PathPrefix("/api/v1").Subrouter()
	api.HandleFunc("/read", p.handleMarkRead).Methods(http.MethodPost)
	api.HandleFunc("/status", p.handleGetStatuses).Methods(http.MethodGet)

	return router
}

func (p *Plugin) requireLoggedIn(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Mattermost-User-ID") == "" {
			http.Error(w, "Not authorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (p *Plugin) kvKey(postID string) string {
	return kvPrefix + postID
}

func (p *Plugin) getStatus(postID string) (*PostStatus, *model.AppError) {
	data, appErr := p.API.KVGet(p.kvKey(postID))
	if appErr != nil {
		return nil, appErr
	}
	if len(data) == 0 {
		return nil, nil
	}

	var status PostStatus
	if err := json.Unmarshal(data, &status); err != nil {
		return nil, model.NewAppError("getStatus", "plugin.message_status.unmarshal.app_error", nil, err.Error(), http.StatusInternalServerError)
	}

	return &status, nil
}

func (p *Plugin) saveStatus(status *PostStatus) *model.AppError {
	status.UpdatedAt = model.GetMillis()
	data, err := json.Marshal(status)
	if err != nil {
		return model.NewAppError("saveStatus", "plugin.message_status.marshal.app_error", nil, err.Error(), http.StatusInternalServerError)
	}

	if appErr := p.API.KVSet(p.kvKey(status.PostID), data); appErr != nil {
		return appErr
	}
	return nil
}

func (p *Plugin) markDelivered(post *model.Post) {
	p.mu.Lock()
	defer p.mu.Unlock()

	existing, appErr := p.getStatus(post.Id)
	if appErr != nil {
		p.API.LogError("Failed to load post status", "post_id", post.Id, "error", appErr.Error())
		return
	}

	status := &PostStatus{
		PostID:    post.Id,
		ChannelID: post.ChannelId,
		AuthorID:  post.UserId,
		Delivered: true,
		ReadBy:    []string{},
	}

	if existing != nil {
		status.ReadBy = existing.ReadBy
		if len(status.ReadBy) > 0 {
			p.publishStatusUpdate(status)
			return
		}
		if existing.Delivered {
			return
		}
	}

	if appErr := p.saveStatus(status); appErr != nil {
		p.API.LogError("Failed to save delivered status", "post_id", post.Id, "error", appErr.Error())
		return
	}

	p.publishStatusUpdate(status)
}

func (p *Plugin) markRead(postID, readerID string) (*PostStatus, *model.AppError) {
	p.mu.Lock()
	defer p.mu.Unlock()

	post, appErr := p.API.GetPost(postID)
	if appErr != nil {
		return nil, appErr
	}

	if post.DeleteAt > 0 || post.UserId == readerID {
		return nil, nil
	}

	status, appErr := p.getStatus(postID)
	if appErr != nil {
		return nil, appErr
	}

	if status == nil {
		status = &PostStatus{
			PostID:    post.Id,
			ChannelID: post.ChannelId,
			AuthorID:  post.UserId,
			Delivered: true,
			ReadBy:    []string{},
		}
	}

	for _, id := range status.ReadBy {
		if id == readerID {
			return status, nil
		}
	}

	status.ReadBy = append(status.ReadBy, readerID)
	if appErr := p.saveStatus(status); appErr != nil {
		return nil, appErr
	}

	p.publishStatusUpdate(status)
	return status, nil
}

func (p *Plugin) publishStatusUpdate(status *PostStatus) {
	if status == nil {
		return
	}

	derived := status.DerivedStatus()
	if derived == "" {
		return
	}

	// Mattermost websocket payloads must use primitive values only.
	readBy := strings.Join(status.ReadBy, ",")

	payload := map[string]any{
		"post_id":    status.PostID,
		"channel_id": status.ChannelID,
		"author_id":  status.AuthorID,
		"status":     derived,
		"read_by":    readBy,
	}

	p.API.PublishWebSocketEvent(statusEventName, payload, &model.WebsocketBroadcast{
		UserId: status.AuthorID,
	})
}

func writeJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(value); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
