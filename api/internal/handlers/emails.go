package handlers

import (
	"context"
	"strings"

	"github.com/salmxnz/fuel-and-lift/api/internal/email"
	"github.com/salmxnz/fuel-and-lift/api/internal/nutrition"
)

// Transactional emails. Each looks up what it needs on the request path and
// hands sending to the Mailer's background goroutine; failures only log.

func firstName(name string) string {
	if f := strings.Fields(name); len(f) > 0 {
		return f[0]
	}
	return "there"
}

// emailAfterOnboarding sends the welcome email, and tells the inviter (if any)
// that their friend counts towards Pro now, or that they just got it.
func (h *Handler) emailAfterOnboarding(ctx context.Context, userID, displayName string, plan nutrition.Plan, upgraded string) {
	if h.Mail == nil {
		return
	}
	u, err := h.Store.GetUser(ctx, userID)
	if err != nil {
		return
	}
	h.Mail.Go(u.Email, &email.Welcome{
		FirstName:       firstName(displayName),
		Calories:        email.Thousands(plan.TargetKcal),
		Protein:         email.Thousands(plan.Macros.ProteinG),
		Carbs:           email.Thousands(plan.Macros.CarbsG),
		Fat:             email.Thousands(plan.Macros.FatG),
		ReferralsForPro: h.Cfg.ReferralsForPro,
	})

	// Onboarding happens once, so an invited user is credited exactly now.
	if u.InvitedBy == nil {
		return
	}
	inviter, err := h.Store.GetUser(ctx, *u.InvitedBy)
	if err != nil {
		return
	}
	needed := h.Cfg.ReferralsForPro
	if upgraded == inviter.ID {
		h.Mail.Go(inviter.Email, &email.ProUnlocked{FirstName: firstName(inviter.Name), Needed: needed})
		return
	}
	if inviter.IsPro(h.now()) {
		return // progress towards Pro means nothing to them
	}
	n, err := h.Store.ReferralCount(ctx, inviter.ID)
	if err != nil || n >= needed {
		return
	}
	h.Mail.Go(inviter.Email, &email.FriendJoined{
		FirstName: firstName(inviter.Name), FriendName: firstName(displayName),
		Referrals: min(n, 8), Needed: needed, Remaining: needed - n,
	})
}

// emailPhotoLimit is sent when a free user's estimate used their last photo.
func (h *Handler) emailPhotoLimit(ctx context.Context, userID string, a allowance) {
	if h.Mail == nil || a.photoLimit == nil {
		return
	}
	u, err := h.Store.GetUser(ctx, userID)
	if err != nil {
		return
	}
	n, err := h.Store.ReferralCount(ctx, userID)
	if err != nil {
		return
	}
	h.Mail.Go(u.Email, &email.PhotoLimit{
		FirstName: firstName(u.Name),
		Limit:     *a.photoLimit,
		Month:     a.resetsOn.AddDate(0, -1, 0).Format("January"),
		ResetsOn:  a.resetsOn.Format("2 January"),
		Referrals: min(n, 8), Needed: h.Cfg.ReferralsForPro,
	})
}
