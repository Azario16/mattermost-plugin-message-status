package main

import (
	"encoding/json"
	"net/http"
	"strings"
)

type PostStatus struct {
	PostID    string   `json:"post_id"`
	ChannelID string   `json:"channel_id"`
	AuthorID  string   `json:"author_id"`
	Delivered bool     `json:"delivered"`
	ReadBy    []string `json:"read_by"`
	UpdatedAt int64    `json:"updated_at"`
}

func (s *PostStatus) DerivedStatus() string {
	if len(s.ReadBy) > 0 {
		return "read"
	}
	if s.Delivered {
		return "delivered"
	}
	return ""
}

type readRequest struct {
	PostID string `json:"post_id"`
}

type statusResponse struct {
	PostID string `json:"post_id"`
	Status string `json:"status"`
	ReadBy []string `json:"read_by"`
}

func (p *Plugin) handleMarkRead(w http.ResponseWriter, r *http.Request) {
	var req readRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.PostID == "" {
		http.Error(w, "post_id is required", http.StatusBadRequest)
		return
	}

	readerID := r.Header.Get("Mattermost-User-ID")
	status, appErr := p.markRead(req.PostID, readerID)
	if appErr != nil {
		http.Error(w, appErr.Error(), appErr.StatusCode)
		return
	}

	if status == nil {
		writeJSON(w, map[string]string{"status": "ignored"})
		return
	}

	writeJSON(w, statusResponse{
		PostID: status.PostID,
		Status: status.DerivedStatus(),
		ReadBy: status.ReadBy,
	})
}

func (p *Plugin) handleGetStatuses(w http.ResponseWriter, r *http.Request) {
	postIDsParam := r.URL.Query().Get("post_ids")
	if postIDsParam == "" {
		http.Error(w, "post_ids is required", http.StatusBadRequest)
		return
	}

	postIDs := strings.Split(postIDsParam, ",")
	results := make([]statusResponse, 0, len(postIDs))

	for _, postID := range postIDs {
		postID = strings.TrimSpace(postID)
		if postID == "" {
			continue
		}

		status, appErr := p.getStatus(postID)
		if appErr != nil {
			http.Error(w, appErr.Error(), appErr.StatusCode)
			return
		}

		if status == nil {
			continue
		}

		results = append(results, statusResponse{
			PostID: status.PostID,
			Status: status.DerivedStatus(),
			ReadBy: status.ReadBy,
		})
	}

	writeJSON(w, map[string]any{"statuses": results})
}
