package server

import (
	"math"
	"net/http"
	"strings"
)

// Exact task coordinates can be a home address. Only the poster and the
// accepted worker receive them; everyone else gets a ~1 km approximation.
func roundCoord(v float64) float64 {
	return math.Round(v*100) / 100
}

func redactTask(t TaskPublic, viewerID string) TaskPublic {
	if viewerID != "" && (viewerID == t.PosterID || (t.AssigneeID != nil && *t.AssigneeID == viewerID)) {
		return t
	}
	t.Lat = roundCoord(t.Lat)
	t.Lng = roundCoord(t.Lng)
	return t
}

func redactTasks(in []TaskPublic, viewerID string) []TaskPublic {
	out := make([]TaskPublic, len(in))
	for i, t := range in {
		out[i] = redactTask(t, viewerID)
	}
	return out
}

// optionalViewerID returns the signed-in user's id, or "" for anonymous or
// invalid sessions. Public task routes stay readable without a token.
func (s *Server) optionalViewerID(r *http.Request) string {
	if !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") {
		return ""
	}
	token, ae := bearerToken(r)
	if ae != nil {
		return ""
	}
	u, err := s.store.UserByToken(token)
	if err != nil || u == nil {
		return ""
	}
	return u.ID
}
