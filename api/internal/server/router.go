// Package server wires the routes and middleware.
package server

import (
	"net/http"

	"github.com/salmxnz/fuel-and-lift/api/internal/audit"
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
		"GET /v1/avatars/{user_id}":            h.Avatar,
		"GET /v1/exercise-photos/{id}":         h.ExercisePhoto,
		// Stripe calls this; its signature is the auth.
		"POST /v1/billing/webhook": h.StripeWebhook,
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
		"POST /v1/profile/avatar":   h.PutAvatar,
		"DELETE /v1/profile/avatar": h.DeleteAvatar,
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
		"POST /v1/entries/{id}/share":           h.ShareEntry,
		"POST /v1/entries/{id}/save":            h.SaveEntry,
		"GET /v1/saved-meals":                   h.ListSavedMeals,
		"POST /v1/saved-meals":                  h.SaveMeal,
		"PUT /v1/saved-meals/{id}":              h.SaveMeal,
		"DELETE /v1/saved-meals/{id}":           h.DeleteSavedMeal,
		"PUT /v1/saved-meals/{id}/visibility":   h.SetVisibility("meal"),
		"GET /v1/foods":                         h.ListFoods,
		"POST /v1/foods":                        h.CreateFood,
		"GET /v1/foods/barcode/{code}":          h.FoodByBarcode,

		// AI and plan
		"POST /v1/ai/meal-estimate": h.MealEstimate,
		"POST /v1/ai/exercise":      h.ExerciseAI,
		"POST /v1/ai/cardio-screen": h.CardioScreenAI,
		"GET /v1/ai/usage":          h.AIUsage,
		"GET /v1/billing":           h.Billing,
		"POST /v1/billing/checkout": h.Checkout,
		"POST /v1/billing/portal":   h.BillingPortal,

		// gym
		"GET /v1/exercises":                             h.ListExercises,
		"POST /v1/exercises":                            h.CreateExercise,
		"GET /v1/exercises/shared":                      h.SharedExercises,
		"PUT /v1/exercises/{id}/visibility":             h.SetExerciseVisibility,
		"POST /v1/exercises/{id}/add":                   h.AddSharedExercise,
		"PUT /v1/exercises/{id}/photo":                  h.PutExercisePhoto,
		"DELETE /v1/exercises/{id}/photo":               h.DeleteExercisePhoto,
		"GET /v1/gym/insights":                          h.GymInsights,
		"POST /v1/gym/week-extras":                      h.AddWeekExtras,
		"DELETE /v1/gym/week-extras/{id}":               h.DeleteWeekExtra,
		"GET /v1/templates":                             h.ListTemplates,
		"POST /v1/templates":                            h.CreateTemplate,
		"GET /v1/templates/{id}":                        h.GetTemplate,
		"PUT /v1/templates/{id}":                        h.SaveTemplate,
		"DELETE /v1/templates/{id}":                     h.DeleteTemplate,
		"GET /v1/templates/{id}/versions/{version}":     h.GetTemplateVersion,
		"POST /v1/templates/{id}/current":               h.SetCurrentTemplateVersion,
		"POST /v1/templates/{id}/share":                 h.ShareTemplate,
		"PUT /v1/templates/{id}/visibility":             h.SetVisibility("template"),
		"GET /v1/weekly-plan":                           h.GetWeeklyPlan,
		"PUT /v1/weekly-plan":                           h.PutWeeklyPlan,
		"POST /v1/sessions":                             h.StartSession,
		"GET /v1/sessions":                              h.ListSessions,
		"GET /v1/sessions/{id}":                         h.GetSession,
		"POST /v1/sessions/{id}/blocks":                 h.AddSessionBlock,
		"PATCH /v1/sessions/{id}/blocks/{block_id}":     h.PatchBlock,
		"PUT /v1/sessions/{id}/order":                   h.ReorderSession,
		"POST /v1/sessions/{id}/rest":                   h.StartRest,
		"DELETE /v1/sessions/{id}/rest":                 h.StopRest,
		"POST /v1/sessions/{id}/blocks/{block_id}/sets": h.AddSet,
		"PATCH /v1/sessions/{id}/sets/{set_id}":         h.PatchSet,
		"POST /v1/sessions/{id}/accept-all":             h.AcceptAll,
		"POST /v1/sessions/{id}/finish":                 h.FinishSession,
		"GET /v1/sessions/{id}/partners":                h.SessionPartners,
		"POST /v1/sessions/{id}/apply":                  h.ApplyProposals,

		// splits and routines
		"GET /v1/splits":                   h.GetSplits,
		"POST /v1/splits/{key}/apply":      h.ApplySplit,
		"GET /v1/routines":                 h.ListRoutines,
		"POST /v1/routines":                h.SaveRoutine,
		"GET /v1/routines/{id}":            h.GetRoutine,
		"PUT /v1/routines/{id}":            h.SaveRoutine,
		"DELETE /v1/routines/{id}":         h.DeleteRoutine,
		"POST /v1/routines/{id}/apply":     h.ApplyRoutine,
		"POST /v1/routines/{id}/share":     h.ShareRoutine,
		"PUT /v1/routines/{id}/visibility": h.SetVisibility("routine"),

		// the Shop and people's profiles
		"GET /v1/shop":                      h.Shop,
		"GET /v1/shop/{kind}/{id}":          h.GetShopItem,
		"POST /v1/shop/{kind}/{id}/add":     h.AddShopItem,
		"POST /v1/shop/{kind}/{id}/report":  h.ReportShopItem,
		"GET /v1/suggestions":               h.Suggestions,
		"POST /v1/entries/{id}/again":       h.LogAgain,
		"GET /v1/people/{id}":               h.GetPerson,
		"POST /v1/people/{id}/join-workout": h.JoinWorkout,

		// progress
		"GET /v1/progress/weight":         h.WeightProgress,
		"GET /v1/progress/calories":       h.CaloriesProgress,
		"GET /v1/progress/exercises/{id}": h.ExerciseProgress,
		"GET /v1/progress/records":        h.RecordsProgress,
		"GET /v1/progress/streak":         h.StreakProgress,
		"GET /v1/progress/photos":         h.ListProgressPhotos,
		"POST /v1/progress/photos":        h.AddProgressPhoto,
		"DELETE /v1/progress/photos/{id}": h.DeleteProgressPhoto,
		// meal photos
		"GET /v1/photos":         h.ListPhotos,
		"DELETE /v1/photos/{id}": h.DeletePhoto,

		// feedback
		"POST /v1/feedback": h.SendFeedback,
		"GET /v1/feedback":  h.ListMyFeedback,

		// friends
		"POST /v1/invite-links":        h.CreateInviteLink,
		"GET /v1/invite-links":         h.ListInviteLinks,
		"DELETE /v1/invite-links/{id}": h.RevokeInviteLink,
		"POST /v1/invite-links/accept": h.AcceptInviteLink,
		"GET /v1/friends":              h.ListFriends,
		"GET /v1/friends/week":         h.FriendsWeek,
		"PATCH /v1/friends/{user_id}":  h.PatchFriend,
		"DELETE /v1/friends/{user_id}": h.RemoveFriend,
		"GET /v1/sharing":              h.GetSharing,
		"PUT /v1/sharing":              h.PutSharing,
		"GET /v1/feed":                 h.Feed,
		"POST /v1/feed/{id}/cheer":     h.Cheer,
		"DELETE /v1/feed/{id}/cheer":   h.Cheer,

		// meals and templates shared by friends
		"GET /v1/shares":              h.ListShares,
		"GET /v1/shares/history":      h.ListShareHistory,
		"POST /v1/shares/{id}/accept": h.AcceptShare,
		"DELETE /v1/shares/{id}":      h.DeclineShare,

		// notifications
		"POST /v1/push/subscriptions":   h.Subscribe,
		"DELETE /v1/push/subscriptions": h.Unsubscribe,
		"GET /v1/notification-prefs":    h.GetNotificationPrefs,
		"PUT /v1/notification-prefs":    h.PutNotificationPrefs,
	}
	for p, f := range signedIn {
		mux.HandleFunc(p, secure(f))
	}

	admin := map[string]http.HandlerFunc{
		"GET /v1/admin/reports":                   h.ListReports,
		"POST /v1/admin/shop/{kind}/{id}/hide":    h.HideShopItem,
		"DELETE /v1/admin/shop/{kind}/{id}/hide":  h.HideShopItem,
		"POST /v1/admin/shop/{kind}/{id}/dismiss": h.DismissReports,

		// users (the admin app)
		"GET /v1/admin/users":                            h.ListAdminUsers,
		"GET /v1/admin/users/{id}":                       h.GetAdminUser,
		"PUT /v1/admin/users/{id}/pro":                   h.GrantPro,
		"DELETE /v1/admin/users/{id}/pro":                h.RevokePro,
		"PUT /v1/admin/users/{id}/role":                  h.SetUserRole,
		"POST /v1/admin/users/{id}/suspend":              h.SuspendUser,
		"DELETE /v1/admin/users/{id}/suspend":            h.SuspendUser,
		"GET /v1/admin/users/{id}/saved-meals":           h.AdminUserSavedMeals,
		"GET /v1/admin/users/{id}/entries":               h.AdminUserEntries,
		"GET /v1/admin/users/{id}/templates":             h.AdminUserTemplates,
		"GET /v1/admin/users/{id}/routines":              h.AdminUserRoutines,
		"GET /v1/admin/users/{id}/sessions":              h.AdminUserSessions,
		"GET /v1/admin/users/{id}/sessions/{session_id}": h.AdminUserSession,
		"GET /v1/admin/users/{id}/friends":               h.AdminUserFriends,
		"GET /v1/admin/users/{id}/billing":               h.AdminUserBilling,
		"POST /v1/admin/users/{id}/billing/sync":         h.SyncAdminUserBilling,

		// what the server sent and what it was asked
		"GET /v1/admin/notifications":       h.ListSentNotifications,
		"GET /v1/admin/notifications/stats": h.SentNotificationStats,
		"GET /v1/admin/audit":               h.ListAudit,
		"GET /v1/admin/feedback":            h.ListAdminFeedback,
		"PATCH /v1/admin/feedback/{id}":     h.PatchAdminFeedback,
		"GET /v1/admin/billing":             h.AdminBilling,
	}
	for p, f := range admin {
		mux.HandleFunc(p, secure(auth.RequireAdmin(f)))
	}

	// The audit log sits outside Recover so a panic is recorded as the 500 it becomes.
	return auth.CORS(h.Cfg.AllowedOrigins)(audit.Middleware(h.Audit, mux)(httpx.Recover(httpx.Logger(mux))))
}
