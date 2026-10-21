// Package server wires the routes and middleware.
package server

import (
	"net/http"

	"github.com/salmxnz/fuel-and-lift/api/internal/auth"
	"github.com/salmxnz/fuel-and-lift/api/internal/handlers"
	"github.com/salmxnz/fuel-and-lift/api/internal/httpx"
)

// NewRouter returns the API's http.Handler.
func NewRouter(h *handlers.Handler) http.Handler {
	mux := http.NewServeMux()
	secure := auth.RequireAuth(h.Cfg.JWTSecret)

	open := map[string]http.HandlerFunc{
		"GET /health":                          h.Health,
		"POST /v1/auth/google":                 h.GoogleSignIn,
		"POST /v1/auth/refresh":                auth.CSRF(h.Refresh),
		"POST /v1/auth/logout":                 auth.CSRF(h.Logout),
		"GET /v1/invite-links/preview/{token}": h.PreviewInviteLink,
		"GET /v1/push/vapid-public-key":        h.VAPIDPublicKey,
	}
	for p, f := range open {
		mux.HandleFunc(p, f)
	}

	signedIn := map[string]http.HandlerFunc{
		"GET /v1/auth/me": h.Me,

		// profile, goal, weight
		"POST /v1/plan/preview":     h.PlanPreview,
		"POST /v1/onboarding":       h.Onboard,
		"GET /v1/profile":           h.GetProfile,
		"PATCH /v1/profile":         h.PatchProfile,
		"GET /v1/goal":              h.GetGoal,
		"POST /v1/goal":             h.NewGoal,
		"GET /v1/weigh-ins":         h.ListWeighIns,
		"POST /v1/weigh-ins":        h.PutWeighIn,
		"DELETE /v1/weigh-ins/{id}": h.DeleteWeighIn,

		// food
		"GET /v1/meal-slots":                    h.ListMealSlots,
		"POST /v1/meal-slots":                   h.CreateMealSlot,
		"PUT /v1/meal-slots/order":              h.ReorderMealSlots,
		"PATCH /v1/meal-slots/{id}":             h.UpdateMealSlot,
		"DELETE /v1/meal-slots/{id}":            h.DeleteMealSlot,
		"GET /v1/days/{date}":                   h.GetDay,
		"POST /v1/days/{date}/entries":          h.AddEntry,
		"POST /v1/days/{date}/saved-meals/{id}": h.LogSavedMeal,
		"PATCH /v1/entries/{id}":                h.UpdateEntry,
		"DELETE /v1/entries/{id}":               h.DeleteEntry,
		"GET /v1/saved-meals":                   h.ListSavedMeals,
		"POST /v1/saved-meals":                  h.SaveMeal,
		"PUT /v1/saved-meals/{id}":              h.SaveMeal,
		"DELETE /v1/saved-meals/{id}":           h.DeleteSavedMeal,
		"GET /v1/foods":                         h.ListFoods,
		"POST /v1/foods":                        h.CreateFood,
		"GET /v1/foods/barcode/{code}":          h.FoodByBarcode,

		// AI and plan
		"POST /v1/ai/meal-estimate": h.MealEstimate,
		"GET /v1/ai/usage":          h.AIUsage,
		"GET /v1/billing":           h.Billing,
		"POST /v1/billing/checkout": h.Checkout,

		// gym
		"GET /v1/exercises":                             h.ListExercises,
		"POST /v1/exercises":                            h.CreateExercise,
		"GET /v1/templates":                             h.ListTemplates,
		"POST /v1/templates":                            h.CreateTemplate,
		"GET /v1/templates/{id}":                        h.GetTemplate,
		"PUT /v1/templates/{id}":                        h.SaveTemplate,
		"DELETE /v1/templates/{id}":                     h.DeleteTemplate,
		"GET /v1/weekly-plan":                           h.GetWeeklyPlan,
		"PUT /v1/weekly-plan":                           h.PutWeeklyPlan,
		"POST /v1/sessions":                             h.StartSession,
		"GET /v1/sessions":                              h.ListSessions,
		"GET /v1/sessions/{id}":                         h.GetSession,
		"POST /v1/sessions/{id}/blocks":                 h.AddSessionBlock,
		"PATCH /v1/sessions/{id}/blocks/{block_id}":     h.PatchBlock,
		"POST /v1/sessions/{id}/blocks/{block_id}/sets": h.AddSet,
		"PATCH /v1/sessions/{id}/sets/{set_id}":         h.PatchSet,
		"POST /v1/sessions/{id}/accept-all":             h.AcceptAll,
		"POST /v1/sessions/{id}/finish":                 h.FinishSession,
		"POST /v1/sessions/{id}/apply":                  h.ApplyProposals,

		// progress
		"GET /v1/progress/weight":         h.WeightProgress,
		"GET /v1/progress/calories":       h.CaloriesProgress,
		"GET /v1/progress/exercises/{id}": h.ExerciseProgress,
		"GET /v1/progress/records":        h.RecordsProgress,

		// friends
		"POST /v1/invite-links":        h.CreateInviteLink,
		"GET /v1/invite-links":         h.ListInviteLinks,
		"DELETE /v1/invite-links/{id}": h.RevokeInviteLink,
		"POST /v1/invite-links/accept": h.AcceptInviteLink,
		"GET /v1/friends":              h.ListFriends,
		"PATCH /v1/friends/{user_id}":  h.PatchFriend,
		"DELETE /v1/friends/{user_id}": h.RemoveFriend,
		"GET /v1/sharing":              h.GetSharing,
		"PUT /v1/sharing":              h.PutSharing,
		"GET /v1/feed":                 h.Feed,
		"POST /v1/feed/{id}/cheer":     h.Cheer,
		"DELETE /v1/feed/{id}/cheer":   h.Cheer,

		// notifications
		"POST /v1/push/subscriptions":   h.Subscribe,
		"DELETE /v1/push/subscriptions": h.Unsubscribe,
		"GET /v1/notification-prefs":    h.GetNotificationPrefs,
		"PUT /v1/notification-prefs":    h.PutNotificationPrefs,
	}
	for p, f := range signedIn {
		mux.HandleFunc(p, secure(f))
	}

	return auth.CORS(h.Cfg.AllowedOrigins)(httpx.Recover(httpx.Logger(mux)))
}
