package email

import (
	"context"
	"io"
	"log/slog"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net/mail"
	"strings"
	"testing"
)

func testMailer() *Mailer {
	return New(Config{
		From: "hello@adebite.com", FromName: "adebite",
		AppURL: "https://adebite.com", AssetsURL: "https://adebite.com",
	}, slog.New(slog.DiscardHandler))
}

func TestRenderEveryTemplate(t *testing.T) {
	m := testMailer()
	cases := []struct {
		msg  Message
		want []string
	}{
		{&Welcome{FirstName: "Amara", Calories: "2,150", Protein: "160", Carbs: "215", Fat: "70", ReferralsForPro: 8},
			[]string{"Hi Amara", "2,150", "https://adebite.com/email/hero-welcome.png", "https://adebite.com/today"}},
		{&FriendJoined{FirstName: "Amara", FriendName: "Jonah <b>", Referrals: 3, Needed: 8, Remaining: 5},
			[]string{"Jonah &lt;b&gt; is on adebite now", "referrals-3.png", "3 of 8", "/friends/add"}},
		{&ProUnlocked{FirstName: "Amara", Needed: 8}, []string{"You did it, Amara", "hero-pro.png"}},
		{&PhotoLimit{FirstName: "Amara", Limit: 10, Month: "October", ResetsOn: "1 November", Referrals: 2, Needed: 8},
			[]string{"That&#x27;s 10 photos this month", "1 November", "referrals-2.png"}},
		{&WeeklyRecap{FirstName: "Amara", WeekRange: "13–19 Oct", DaysLogged: 6, AvgCalories: "2,080", TargetCalories: "2,150", Workouts: 3, WeightChange: "−0.4 kg"},
			[]string{"how it added up, Amara", "6 / 7", "−0.4 kg"}},
	}
	for _, c := range cases {
		t.Run(c.msg.template(), func(t *testing.T) {
			*c.msg.base() = Base{AppURL: "https://adebite.com", AssetsURL: "https://adebite.com"}
			html, text, err := m.Render(c.msg)
			if err != nil {
				t.Fatal(err)
			}
			// Pretty-printing breaks lines inside text; browsers collapse it.
			flat := strings.Join(strings.Fields(html), " ")
			for _, w := range c.want {
				if !strings.Contains(flat, w) {
					t.Errorf("html is missing %q", w)
				}
			}
			if strings.Contains(html, "{{") || strings.Contains(text, "{{") {
				t.Error("a Go token was left unrendered")
			}
			if !strings.Contains(text, "Amara") {
				t.Error("plaintext is missing the name")
			}
			if strings.Contains(html, "ADEBITE") || strings.Contains(text, "ADEBITE") {
				t.Error("the name is always lowercase")
			}
		})
	}
}

func TestSendBuildsMultipart(t *testing.T) {
	m := testMailer()
	var got []byte
	m.deliver = func(_ context.Context, to string, msg []byte) error {
		got = msg
		return nil
	}
	if err := m.Send(context.Background(), "amara@example.com", &ProUnlocked{FirstName: "Amára", Needed: 8}); err != nil {
		t.Fatal(err)
	}
	msg, err := mail.ReadMessage(strings.NewReader(string(got)))
	if err != nil {
		t.Fatal(err)
	}
	if subj, _ := new(mime.WordDecoder).DecodeHeader(msg.Header.Get("Subject")); subj != "You've got Pro, for good" {
		t.Errorf("subject = %q", subj)
	}
	if from := msg.Header.Get("From"); from != `"adebite" <hello@adebite.com>` {
		t.Errorf("from = %q", from)
	}
	mt, params, err := mime.ParseMediaType(msg.Header.Get("Content-Type"))
	if err != nil || mt != "multipart/alternative" {
		t.Fatalf("content type = %q, %v", mt, err)
	}
	r := multipart.NewReader(msg.Body, params["boundary"])
	var types []string
	for {
		p, err := r.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		body, _ := io.ReadAll(quotedprintable.NewReader(p))
		if !strings.Contains(string(body), "Amára") {
			t.Errorf("%s part is missing the name", p.Header.Get("Content-Type"))
		}
		types = append(types, strings.SplitN(p.Header.Get("Content-Type"), ";", 2)[0])
	}
	if strings.Join(types, ",") != "text/plain,text/html" {
		t.Errorf("parts = %v", types)
	}
}

func TestSendWithoutSMTPOnlyRenders(t *testing.T) {
	m := testMailer()
	if m.Enabled() {
		t.Fatal("no host: should be log-only")
	}
	if err := m.Send(context.Background(), "a@example.com", &Welcome{FirstName: "A"}); err != nil {
		t.Fatal(err)
	}
	var nilMailer *Mailer
	nilMailer.Go("a@example.com", &Welcome{}) // must not panic
}

func TestThousands(t *testing.T) {
	for in, want := range map[float64]string{0: "0", 999: "999", 2150: "2,150", 2149.6: "2,150", 1234567: "1,234,567"} {
		if got := Thousands(in); got != want {
			t.Errorf("Thousands(%v) = %q, want %q", in, got, want)
		}
	}
}
