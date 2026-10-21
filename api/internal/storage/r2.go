// Package storage keeps meal photos in Cloudflare R2 (S3-compatible). It
// signs requests itself (AWS Signature Version 4) so the API needs no SDK.
package storage

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

// R2 is a bucket in one Cloudflare account.
type R2 struct {
	host      string // <account>.r2.cloudflarestorage.com
	bucket    string
	accessKey string
	secretKey string
	region    string
	client    *http.Client
	now       func() time.Time
}

// NewR2 returns nil when any setting is missing, which turns photo storage off.
func NewR2(accountID, accessKey, secretKey, bucket string) *R2 {
	if accountID == "" || accessKey == "" || secretKey == "" || bucket == "" {
		return nil
	}
	return &R2{
		host: accountID + ".r2.cloudflarestorage.com", bucket: bucket,
		accessKey: accessKey, secretKey: secretKey, region: "auto",
		client: &http.Client{Timeout: 30 * time.Second}, now: time.Now,
	}
}

// objectPath is the path-style path of a key: /<bucket>/<key>.
func (r *R2) objectPath(key string) string { return "/" + r.bucket + "/" + key }

// Put uploads an object.
func (r *R2) Put(ctx context.Context, key, contentType string, body []byte) error {
	return r.do(ctx, http.MethodPut, key, contentType, body, http.StatusOK)
}

// Delete removes an object. Deleting a missing object is not an error.
func (r *R2) Delete(ctx context.Context, key string) error {
	return r.do(ctx, http.MethodDelete, key, "", nil, http.StatusNoContent, http.StatusOK, http.StatusNotFound)
}

func (r *R2) do(ctx context.Context, method, key, contentType string, body []byte, ok ...int) error {
	path := r.objectPath(key)
	req, err := http.NewRequestWithContext(ctx, method, "https://"+r.host+encodePath(path), bytes.NewReader(body))
	if err != nil {
		return err
	}
	sum := sha256.Sum256(body)
	payload := hex.EncodeToString(sum[:])
	t := r.now().UTC()
	headers := map[string]string{
		"host":                 r.host,
		"x-amz-content-sha256": payload,
		"x-amz-date":           t.Format("20060102T150405Z"),
	}
	if contentType != "" {
		headers["content-type"] = contentType
	}
	auth := authorization(r.accessKey, r.secretKey, r.region, method, path, "", headers, payload, t)
	for k, v := range headers {
		if k != "host" {
			req.Header.Set(k, v)
		}
	}
	req.Header.Set("Authorization", auth)
	req.ContentLength = int64(len(body))
	res, err := r.client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	for _, code := range ok {
		if res.StatusCode == code {
			_, _ = io.Copy(io.Discard, res.Body)
			return nil
		}
	}
	msg, _ := io.ReadAll(io.LimitReader(res.Body, 512))
	return fmt.Errorf("r2 %s %s: %d %s", method, key, res.StatusCode, strings.TrimSpace(string(msg)))
}

// PresignGet returns a URL anyone can GET the object from until ttl passes.
func (r *R2) PresignGet(key string, ttl time.Duration) string {
	return presign(r.accessKey, r.secretKey, r.region, r.host, r.objectPath(key), ttl, r.now().UTC())
}

// --- Signature Version 4 ---------------------------------------------------------

const algorithm = "AWS4-HMAC-SHA256"

func hmacSHA256(key []byte, s string) []byte {
	m := hmac.New(sha256.New, key)
	m.Write([]byte(s))
	return m.Sum(nil)
}

func sha256Hex(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

// uriEncode is RFC 3986 encoding as SigV4 wants it (keeps A-Z a-z 0-9 - _ . ~).
func uriEncode(s string, keepSlash bool) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case 'A' <= c && c <= 'Z', 'a' <= c && c <= 'z', '0' <= c && c <= '9', c == '-', c == '_', c == '.', c == '~':
			b.WriteByte(c)
		case c == '/' && keepSlash:
			b.WriteByte(c)
		default:
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return b.String()
}

func encodePath(p string) string { return uriEncode(p, true) }

func canonicalQuery(q url.Values) string {
	keys := make([]string, 0, len(q))
	for k := range q {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var parts []string
	for _, k := range keys {
		for _, v := range q[k] {
			parts = append(parts, uriEncode(k, false)+"="+uriEncode(v, false))
		}
	}
	return strings.Join(parts, "&")
}

func signingKey(secret, date, region string) []byte {
	k := hmacSHA256([]byte("AWS4"+secret), date)
	k = hmacSHA256(k, region)
	k = hmacSHA256(k, "s3")
	return hmacSHA256(k, "aws4_request")
}

// signature signs a canonical request; headers keys must be lower case.
func signature(secret, region, method, path, query string, headers map[string]string, payload string, t time.Time) (sig, signed string) {
	names := make([]string, 0, len(headers))
	for k := range headers {
		names = append(names, k)
	}
	sort.Strings(names)
	var ch strings.Builder
	for _, k := range names {
		ch.WriteString(k + ":" + strings.TrimSpace(headers[k]) + "\n")
	}
	signed = strings.Join(names, ";")
	canonical := strings.Join([]string{method, encodePath(path), query, ch.String(), signed, payload}, "\n")
	date := t.Format("20060102")
	scope := date + "/" + region + "/s3/aws4_request"
	toSign := strings.Join([]string{algorithm, t.Format("20060102T150405Z"), scope, sha256Hex(canonical)}, "\n")
	return hex.EncodeToString(hmacSHA256(signingKey(secret, date, region), toSign)), signed
}

func authorization(access, secret, region, method, path, query string, headers map[string]string, payload string, t time.Time) string {
	sig, signed := signature(secret, region, method, path, query, headers, payload, t)
	scope := t.Format("20060102") + "/" + region + "/s3/aws4_request"
	return fmt.Sprintf("%s Credential=%s/%s, SignedHeaders=%s, Signature=%s", algorithm, access, scope, signed, sig)
}

func presign(access, secret, region, host, path string, ttl time.Duration, t time.Time) string {
	scope := t.Format("20060102") + "/" + region + "/s3/aws4_request"
	q := url.Values{
		"X-Amz-Algorithm":     {algorithm},
		"X-Amz-Credential":    {access + "/" + scope},
		"X-Amz-Date":          {t.Format("20060102T150405Z")},
		"X-Amz-Expires":       {fmt.Sprint(int(ttl.Seconds()))},
		"X-Amz-SignedHeaders": {"host"},
	}
	query := canonicalQuery(q)
	sig, _ := signature(secret, region, http.MethodGet, path, query, map[string]string{"host": host}, "UNSIGNED-PAYLOAD", t)
	return "https://" + host + encodePath(path) + "?" + query + "&X-Amz-Signature=" + sig
}
