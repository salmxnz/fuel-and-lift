package push

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"
	"time"

	"github.com/salmxnz/fuel-and-lift/api/internal/store"
)

// Message is what the service worker shows.
type Message struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	URL   string `json:"url"`
	Tag   string `json:"tag,omitempty"` // replaces an earlier notification with the same tag
	// Kind names the notification in the admin log ("friend_joined"); the
	// device never sees it.
	Kind string `json:"-"`
	// Urgent ignores quiet hours: something the user just asked for, like
	// their rest timer.
	Urgent bool `json:"-"`
}

// kind is Kind, or the tag up to its last "-" ("share-<id>" → "share").
func (m Message) kind() string {
	if m.Kind != "" {
		return m.Kind
	}
	if i := strings.LastIndex(m.Tag, "-"); i > 0 {
		return m.Tag[:i]
	}
	if m.Tag != "" {
		return m.Tag
	}
	return "other"
}

// Notifier fans a message out to every device of some users, off the request
// path, and records each user's outcome for the admin app. A nil Sender (no
// VAPID keys) sends nothing and records "disabled".
type Notifier struct {
	Store  *store.Store
	Sender *Sender
	Log    *slog.Logger
	Now    func() time.Time
}

// Notify sends msg to users in the background, skipping anyone in quiet hours.
func (n *Notifier) Notify(userIDs []string, msg Message) {
	if n == nil || n.Store == nil || len(userIDs) == 0 {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		n.send(ctx, userIDs, msg)
	}()
}

// NotifyNow sends msg to users and waits, for callers already off the
// request path (the reminder loop). Quiet hours still apply.
func (n *Notifier) NotifyNow(ctx context.Context, userIDs []string, msg Message) {
	if n == nil || n.Store == nil || len(userIDs) == 0 {
		return
	}
	n.send(ctx, userIDs, msg)
}

func (n *Notifier) log() *slog.Logger {
	if n.Log != nil {
		return n.Log
	}
	return slog.Default()
}

func (n *Notifier) send(ctx context.Context, userIDs []string, msg Message) {
	now := time.Now()
	if n.Now != nil {
		now = n.Now()
	}
	recs := map[string]*store.NotificationRecord{}
	var order []string
	record := func(id, status string) *store.NotificationRecord {
		if r, ok := recs[id]; ok { // the same user twice
			r.Status = status
			return r
		}
		uid := id
		r := &store.NotificationRecord{Channel: "push", UserID: &uid, Kind: msg.kind(), Title: msg.Title, Status: status}
		if msg.Body != "" {
			r.Body = &msg.Body
		}
		if msg.URL != "" {
			r.URL = &msg.URL
		}
		recs[id] = r
		order = append(order, id)
		return r
	}
	defer func() {
		out := make([]store.NotificationRecord, 0, len(order))
		for _, id := range order {
			out = append(out, *recs[id])
		}
		if err := n.Store.LogNotifications(context.WithoutCancel(ctx), out); err != nil {
			n.log().Warn("push: log notifications", "err", err)
		}
	}()

	if n.Sender == nil {
		for _, id := range userIDs {
			record(id, "disabled")
		}
		return
	}
	var awake []string
	for _, id := range userIDs {
		prefs, err := n.Store.GetNotificationPrefs(ctx, id)
		if err != nil {
			e := err.Error()
			record(id, "failed").Error = &e
			continue
		}
		if !msg.Urgent && InQuietHours(now, n.Store.Timezone(ctx, id), prefs.QuietFrom, prefs.QuietTo) {
			record(id, "quiet_hours")
			continue
		}
		record(id, "no_devices")
		awake = append(awake, id)
	}
	subs, err := n.Store.PushSubscriptions(ctx, awake)
	if err != nil {
		n.log().Error("push: load subscriptions", "err", err)
		e := err.Error()
		for _, id := range awake {
			recs[id].Status, recs[id].Error = "failed", &e
		}
		return
	}
	payload, _ := json.Marshal(msg)
	for _, sub := range subs {
		err := n.Sender.Send(ctx, Subscription{Endpoint: sub.Endpoint, P256dh: sub.P256dh, Auth: sub.Auth}, payload, 24*time.Hour, "normal")
		gone := errors.Is(err, ErrGone)
		if err != nil && !gone {
			n.log().Warn("push: send failed", "user", sub.UserID, "err", err)
		}
		_ = n.Store.PushResult(ctx, sub.ID, err == nil, gone)
		r := recs[sub.UserID]
		if r == nil {
			continue
		}
		r.Devices++
		if err == nil {
			r.Delivered++
		} else {
			e := err.Error()
			r.Error = &e
		}
	}
	for _, id := range awake {
		r := recs[id]
		switch {
		case r.Devices == 0:
			r.Status = "no_devices"
		case r.Delivered == r.Devices:
			r.Status = "sent"
		case r.Delivered > 0:
			r.Status = "partial"
		default:
			r.Status = "failed"
		}
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
