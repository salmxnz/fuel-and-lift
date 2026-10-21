package storage

import (
	"strings"
	"testing"
	"time"
)

// The example credentials and expected signatures are from AWS's
// "Signature Version 4 (S3)" documentation.
const (
	exampleAccess = "AKIAIOSFODNN7EXAMPLE"
	exampleSecret = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
	exampleHost   = "examplebucket.s3.amazonaws.com"
)

var exampleTime = time.Date(2013, 5, 24, 0, 0, 0, 0, time.UTC)

func TestHeaderSignature(t *testing.T) {
	// GET Object with a Range header.
	headers := map[string]string{
		"host":                 exampleHost,
		"range":                "bytes=0-9",
		"x-amz-content-sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
		"x-amz-date":           "20130524T000000Z",
	}
	got := authorization(exampleAccess, exampleSecret, "us-east-1", "GET", "/test.txt", "", headers,
		"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", exampleTime)
	want := "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, " +
		"SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, " +
		"Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41"
	if got != want {
		t.Fatalf("authorization\n got %s\nwant %s", got, want)
	}
}

func TestPresign(t *testing.T) {
	got := presign(exampleAccess, exampleSecret, "us-east-1", exampleHost, "/test.txt", 86400*time.Second, exampleTime)
	if !strings.HasSuffix(got, "X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404") {
		t.Fatalf("presigned URL: %s", got)
	}
	if !strings.HasPrefix(got, "https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request") {
		t.Fatalf("presigned URL: %s", got)
	}
}

func TestNewR2NeedsEverything(t *testing.T) {
	if NewR2("acct", "key", "", "bucket") != nil {
		t.Fatal("missing secret should disable storage")
	}
	r := NewR2("acct", "key", "secret", "photos")
	if r == nil || r.host != "acct.r2.cloudflarestorage.com" || !strings.Contains(r.PresignGet("photos/u/p.jpg", time.Hour), "/photos/photos/u/p.jpg?") {
		t.Fatalf("r2: %+v", r)
	}
}
