package handlers

import (
	"net/http"

	"github.com/salmxnz/fuel-and-lift/api/internal/auth"
	"github.com/salmxnz/fuel-and-lift/api/internal/httpx"
	"github.com/salmxnz/fuel-and-lift/api/internal/push"
)

// Moderation of the Shop. These routes are wrapped in auth.RequireAdmin.

// ListReports handles GET /v1/admin/reports.
func (h *Handler) ListReports(w http.ResponseWriter, r *http.Request) {
	list, err := h.Store.OpenReports(r.Context())
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"reports": list})
}

// HideShopItem handles POST (hide) and DELETE (unhide)
// /v1/admin/shop/{kind}/{id}/hide. The owner keeps the item either way.
func (h *Handler) HideShopItem(w http.ResponseWriter, r *http.Request) {
	kind, ok := pathKind(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	hide := r.Method == http.MethodPost
	owner, name, err := h.Store.SetHidden(r.Context(), auth.UserID(r), kind, id, hide)
	if err != nil {
		h.storeError(w, r, err)
		return
	}
	if hide {
		url := "/gym"
		if kind == "meal" {
			url = "/saved-meals"
		}
		h.Notifier.Notify([]string{owner}, push.Message{
			Kind:  "shop_hidden",
			Title: name + " was removed from the Shop",
			Body:  "A moderator hid it after it was reported. It's still in your account.",
			URL:   url, Tag: "hidden-" + id,
		})
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"hidden": hide})
}

// DismissReports handles POST /v1/admin/shop/{kind}/{id}/dismiss: the
// reports were wrong, the item stays.
func (h *Handler) DismissReports(w http.ResponseWriter, r *http.Request) {
	kind, ok := pathKind(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	if err := h.Store.DismissReports(r.Context(), auth.UserID(r), kind, id); err != nil {
		h.storeError(w, r, err)
		return
	}
	httpx.NoContent(w)
}
