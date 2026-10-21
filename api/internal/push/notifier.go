package push

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"time"

	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

// Message is what the service worker shows.
type Message struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	URL   string `json:"url"`
	Tag   string `json:"tag,omitempty"` // replaces an earlier notification with the same tag
}

// Notifier fans a message out to every device of some users, off the request
// path. A nil Sender (no VAPID keys) makes it a no-op.
type Notifier struct {
	Store  *store.Store
	Sender *Sender
	Log    *slog.Logger
	Now    func() time.Time
}

// Notify sends msg to users in the background, skipping anyone in quiet hours.
func (n *Notifier) Notify(userIDs []string, msg Message) {
	if n == nil || n.Sender == nil || len(userIDs) == 0 {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		n.send(ctx, userIDs, msg)
	}()
}

func (n *Notifier) send(ctx context.Context, userIDs []string, msg Message) {
	now := time.Now()
	if n.Now != nil {
		now = n.Now()
	}
	var awake []string
	for _, id := range userIDs {
		prefs, err := n.Store.GetNotificationPrefs(ctx, id)
		if err != nil {
			continue
		}
		if InQuietHours(now, n.Store.Timezone(ctx, id), prefs.QuietFrom, prefs.QuietTo) {
			continue
		}
		awake = append(awake, id)
	}
	subs, err := n.Store.PushSubscriptions(ctx, awake)
	if err != nil {
		n.Log.Error("push: load subscriptions", "err", err)
		return
	}
	payload, _ := json.Marshal(msg)
	for _, sub := range subs {
		err := n.Sender.Send(ctx, Subscription{Endpoint: sub.Endpoint, P256dh: sub.P256dh, Auth: sub.Auth}, payload, 24*time.Hour, "normal")
		gone := errors.Is(err, ErrGone)
		if err != nil && !gone {
			n.Log.Warn("push: send failed", "user", sub.UserID, "err", err)
		}
		_ = n.Store.PushResult(ctx, sub.ID, err == nil, gone)
	}
}

// InQuietHours reports whether now (in tz) falls in [from, to). Windows may
// wrap midnight ("22:00" → "07:00").
func InQuietHours(now time.Time, tz string, from, to *string) bool {
	if from == nil || to == nil {
		return false
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.UTC
	}
	f, err1 := time.Parse("15:04", *from)
	t, err2 := time.Parse("15:04", *to)
	if err1 != nil || err2 != nil {
		return false
	}
	l := now.In(loc)
	m := l.Hour()*60 + l.Minute()
	fm, tm := f.Hour()*60+f.Minute(), t.Hour()*60+t.Minute()
	if fm == tm {
		return false
	}
	if fm < tm {
		return m >= fm && m < tm
	}
	return m >= fm || m < tm
}
