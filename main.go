// ocusage — OpenCode Go plan quota monitor.
//
// Queries the remote usage endpoint and reports how much of the 5-hour
// rolling, weekly, and monthly limits is left, with terminal visualization.
//
//	URL (default): https://opencode.ai/zen/go/v1/usage
//	Auth:          Authorization: Bearer <OPENCODE_API_KEY>
//
// The endpoint is not officially documented; the parser accepts both known
// response shapes:
//
//	{ "usage": { "rolling": { "status", "percent", "resetsAt" }, ... } }
//	{ "rolling5h": { "usageDollars", "limitDollars", "usagePercent", "resetInSec" }, ... }
//
// When the API only reports a percentage, dollar figures are derived from the
// published plan limits ($12 / $30 / $60).
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const (
	defaultURL      = "https://opencode.ai/zen/go/v1/usage"
	rolling5hLimit  = 12.0
	weeklyLimit     = 30.0
	monthlyLimit    = 60.0
	requestTimeout  = 15 * time.Second
	refreshInterval = 30 * time.Second
)

type window struct {
	Status         string   `json:"status"`
	UsedPercent    float64  `json:"usedPercent"`
	UsedDollars    *float64 `json:"usedDollars"`
	LimitDollars   *float64 `json:"limitDollars"`
	ResetsAt       string   `json:"resetsAt"`
	ResetsInSec    *int64   `json:"resetsInSec"`
	hasPercent     bool
	hasReset       bool
	percentDerived bool
}

type report struct {
	Rolling5h *window `json:"rolling5h"`
	Weekly    *window `json:"weekly"`
	Monthly   *window `json:"monthly"`
	Plan      string  `json:"plan,omitempty"`
	FetchedAt string  `json:"fetchedAt"`
}

// windowRaw tolerates every field naming seen in the wild so far.
type windowRaw struct {
	Status       string   `json:"status"`
	Percent      *float64 `json:"percent"`
	UsagePercent *float64 `json:"usagePercent"`
	UsedPercent  *float64 `json:"usedPercent"`
	UsageDollars *float64 `json:"usageDollars"`
	UsedDollars  *float64 `json:"usedDollars"`
	LimitDollars *float64 `json:"limitDollars"`
	ResetsAt     string   `json:"resetsAt"`
	ResetAt      string   `json:"resetAt"`
	ResetsInSec  *int64   `json:"resetsInSeconds"`
}

// resetSecKeys covers the naming variants observed across community tools:
// resetsInSeconds / resetsInSec / resetInSec / resets_in_sec / reset_in_sec.
// Note resetInSec vs resetsInSec differ by a single "s", so exact-tag
// matching alone silently drops the field.
var resetSecKeys = []string{"resetsInSeconds", "resetsInSec", "resetInSec", "resets_in_sec", "reset_in_sec"}

func (w *windowRaw) UnmarshalJSON(b []byte) error {
	type alias windowRaw // avoid recursion on the custom unmarshaler
	var a alias
	if err := json.Unmarshal(b, &a); err != nil {
		return err
	}
	*w = windowRaw(a)

	var m map[string]json.RawMessage
	if err := json.Unmarshal(b, &m); err != nil {
		return err
	}
	for _, k := range resetSecKeys {
		if v, ok := m[k]; ok {
			var n int64
			if err := json.Unmarshal(v, &n); err == nil && n > 0 {
				w.ResetsInSec = &n
				break
			}
		}
	}
	return nil
}

func (w *windowRaw) normalize(planLimit float64) *window {
	out := &window{Status: w.Status}
	if w.Status == "" {
		out.Status = "ok"
	}

	percent := w.Percent
	if percent == nil {
		percent = w.UsagePercent
	}
	if percent == nil {
		percent = w.UsedPercent
	}
	if percent != nil {
		out.UsedPercent = *percent
		out.hasPercent = true
	}

	out.UsedDollars = w.UsageDollars
	if out.UsedDollars == nil {
		out.UsedDollars = w.UsedDollars
	}
	out.LimitDollars = w.LimitDollars

	// Percent-only responses: derive dollars from the published plan limits.
	if out.UsedDollars == nil && out.hasPercent {
		used := planLimit * out.UsedPercent / 100
		out.UsedDollars = &used
		out.LimitDollars = &planLimit
		out.percentDerived = true
	}

	out.ResetsAt = w.ResetsAt
	if out.ResetsAt == "" {
		out.ResetsAt = w.ResetAt
	}
	out.ResetsInSec = w.ResetsInSec
	if out.ResetsAt != "" || out.ResetsInSec != nil {
		out.hasReset = true
	}
	return out
}

// parseResponse walks the JSON defensively: windows may sit at the top level,
// under "usage", and rolling may be named rolling5h / rolling / 5h.
func parseResponse(body []byte) (*report, error) {
	var top map[string]json.RawMessage
	if err := json.Unmarshal(body, &top); err != nil {
		return nil, fmt.Errorf("response is not valid JSON: %w", err)
	}

	src := top
	if u, ok := top["usage"]; ok {
		var inner map[string]json.RawMessage
		if err := json.Unmarshal(u, &inner); err == nil {
			src = inner
		}
	}

	rep := &report{FetchedAt: time.Now().UTC().Format(time.RFC3339)}
	if p, ok := top["plan"]; ok {
		_ = json.Unmarshal(p, &rep.Plan)
	}

	pick := func(names ...string) (json.RawMessage, bool) {
		for _, n := range names {
			if v, ok := src[n]; ok {
				return v, true
			}
		}
		return nil, false
	}

	decode := func(raw json.RawMessage, planLimit float64) (*window, error) {
		var wr windowRaw
		if err := json.Unmarshal(raw, &wr); err != nil {
			return nil, err
		}
		return wr.normalize(planLimit), nil
	}

	if raw, ok := pick("rolling5h", "rolling", "5h", "continuous"); ok {
		w, err := decode(raw, rolling5hLimit)
		if err != nil {
			return nil, fmt.Errorf("rolling window: %w", err)
		}
		rep.Rolling5h = w
	}
	if raw, ok := pick("weekly", "week"); ok {
		w, err := decode(raw, weeklyLimit)
		if err != nil {
			return nil, fmt.Errorf("weekly window: %w", err)
		}
		rep.Weekly = w
	}
	if raw, ok := pick("monthly", "month"); ok {
		w, err := decode(raw, monthlyLimit)
		if err != nil {
			return nil, fmt.Errorf("monthly window: %w", err)
		}
		rep.Monthly = w
	}

	if rep.Rolling5h == nil && rep.Weekly == nil && rep.Monthly == nil {
		keys := make([]string, 0, len(src))
		for k := range src {
			keys = append(keys, k)
		}
		return nil, fmt.Errorf("no usage windows found in response (keys: %s)", strings.Join(keys, ", "))
	}
	return rep, nil
}

func fetch(url, key string) ([]byte, int, error) {
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "ocusage/1.0")

	client := &http.Client{Timeout: requestTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	return body, resp.StatusCode, err
}

// ---- visualization ----

var useColor = true

func colorize(code, s string) string {
	if !useColor {
		return s
	}
	return "\033[" + code + "m" + s + "\033[0m"
}

func levelColor(pct float64) string {
	switch {
	case pct >= 90:
		return "1;31" // bold red
	case pct >= 75:
		return "31" // red
	case pct >= 50:
		return "33" // yellow
	default:
		return "32" // green
	}
}

// bar renders a fill of fillPct percent of width, colored by healthPct
// (the consumption level) so a short bar turns red as quota runs out.
func bar(fillPct float64, width int, healthPct float64) string {
	if fillPct < 0 {
		fillPct = 0
	}
	if fillPct > 100 {
		fillPct = 100
	}
	filled := int(fillPct/100*float64(width) + 0.5)
	if filled > width {
		filled = width
	}
	c := levelColor(healthPct)
	return colorize(c, strings.Repeat("█", filled)) + strings.Repeat("░", width-filled)
}

// humanDuration renders a countdown the way "3h20m" / "2d 9h" reads naturally.
func humanDuration(d time.Duration) string {
	if d < 0 {
		d = 0
	}
	sec := int64(d.Seconds())
	days := sec / 86400
	sec %= 86400
	hours := sec / 3600
	sec %= 3600
	mins := sec / 60
	switch {
	case days > 0:
		return fmt.Sprintf("%dd %dh", days, hours)
	case hours > 0:
		return fmt.Sprintf("%dh %dm", hours, mins)
	default:
		return fmt.Sprintf("%dm", mins)
	}
}

func (w *window) resetCountdown(now time.Time) string {
	if t, err := time.Parse(time.RFC3339, w.ResetsAt); err == nil {
		return humanDuration(t.Sub(now)) + " (" + t.Local().Format("15:04:05") + ")"
	}
	if w.ResetsInSec != nil {
		return humanDuration(time.Duration(*w.ResetsInSec) * time.Second)
	}
	return "unknown"
}

func (w *window) remainingDollars() (float64, bool) {
	if w.UsedDollars == nil || w.LimitDollars == nil || *w.LimitDollars == 0 {
		return 0, false
	}
	return *w.LimitDollars - *w.UsedDollars, true
}

func (r *report) render(out io.Writer) {
	now := time.Now()
	fmt.Fprintf(out, "OpenCode Go Usage")
	if r.Plan != "" {
		fmt.Fprintf(out, "  [plan: %s]", r.Plan)
	}
	fmt.Fprintf(out, "  %s  (bar = remaining)\n", now.Format("2006-01-02 15:04:05"))
	fmt.Fprintln(out, strings.Repeat("─", 72))

	rows := []struct {
		label string
		w     *window
	}{
		{"5h rolling", r.Rolling5h},
		{"weekly    ", r.Weekly},
		{"monthly   ", r.Monthly},
	}
	for _, row := range rows {
		if row.w == nil {
			continue
		}
		w := row.w
		c := levelColor(w.UsedPercent)
		leftPct := 100 - w.UsedPercent // bar and number show remaining
		fmt.Fprintf(out, "%s  %s %5.1f%%", row.label, bar(leftPct, 28, w.UsedPercent), leftPct)

		if rem, ok := w.remainingDollars(); ok {
			fmt.Fprintf(out, "  used $%.2f / $%.2f  %s $%.2f",
				deref(w.UsedDollars), deref(w.LimitDollars), colorize(c, "left"), rem)
		}
		fmt.Fprintln(out)

		fmt.Fprintf(out, "           ")
		if w.Status != "" && w.Status != "ok" {
			fmt.Fprintf(out, "  status: %s", colorize("31", w.Status))
		}
		fmt.Fprintf(out, "  resets in %s", w.resetCountdown(now))
		if w.percentDerived {
			fmt.Fprint(out, colorize("2", "  ($ derived from plan limits)"))
		}
		fmt.Fprintln(out)
	}
	fmt.Fprintln(out, strings.Repeat("─", 72))

	// The tightest constraint first: highest used percentage wins the summary.
	var tightest *window
	var label string
	for _, row := range rows {
		if row.w != nil && (tightest == nil || row.w.UsedPercent > tightest.UsedPercent) {
			tightest = row.w
			label = strings.TrimSpace(row.label)
		}
	}
	if tightest != nil {
		if rem, ok := tightest.remainingDollars(); ok {
			fmt.Fprintf(out, "bottleneck: %s — %s%.2f left%s of quota\n",
				label, colorize(levelColor(tightest.UsedPercent), "$"), rem, colorize(levelColor(tightest.UsedPercent), ""))
		} else {
			fmt.Fprintf(out, "bottleneck: %s — %.1f%% used\n", label, tightest.UsedPercent)
		}
	}
}

func deref(f *float64) float64 {
	if f == nil {
		return 0
	}
	return *f
}

func apiKeyFromEnv() string {
	for _, name := range []string{"OPENCODE_API_KEY", "OPENCODE_GO_API_KEY", "OPENCODE_ZEN_API_KEY"} {
		if v := os.Getenv(name); v != "" {
			return v
		}
	}
	return ""
}

func run(url, key string, asJSON bool) error {
	body, status, err := fetch(url, key)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	switch status {
	case http.StatusUnauthorized, http.StatusForbidden:
		return fmt.Errorf("HTTP %d: API key rejected — check that the key has a Go subscription (get one at https://opencode.ai/auth)", status)
	case http.StatusNotFound:
		return fmt.Errorf("HTTP 404: endpoint not found at %s — the API may have moved, override with -url", url)
	case http.StatusTooManyRequests:
		return fmt.Errorf("HTTP 429: rate limited, retry later")
	}
	if status >= 400 {
		msg := strings.TrimSpace(string(body))
		if len(msg) > 200 {
			msg = msg[:200] + "…"
		}
		return fmt.Errorf("HTTP %d: %s", status, msg)
	}

	rep, err := parseResponse(body)
	if err != nil {
		return fmt.Errorf("%w\nraw response: %.300s", err, string(body))
	}

	if asJSON {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		return enc.Encode(rep)
	}
	rep.render(os.Stdout)

	for _, w := range []*window{rep.Rolling5h, rep.Weekly, rep.Monthly} {
		if w != nil && w.UsedPercent >= 100 {
			os.Exit(2) // exhausted window: nonzero exit for alerting scripts
		}
	}
	return nil
}

func main() {
	var (
		url     = flag.String("url", defaultURL, "usage endpoint URL")
		key     = flag.String("key", "", "OpenCode API key (sk-…); defaults to $OPENCODE_API_KEY")
		asJSON  = flag.Bool("json", false, "print machine-readable JSON instead of the visual report")
		watch   = flag.Bool("watch", false, "keep refreshing every 30s")
		noColor = flag.Bool("no-color", false, "disable colored output")
	)
	flag.Parse()

	if *noColor || os.Getenv("NO_COLOR") != "" || os.Getenv("TERM") == "dumb" {
		useColor = false
	}

	apiKey := *key
	if apiKey == "" {
		apiKey = apiKeyFromEnv()
	}
	if apiKey == "" {
		fmt.Fprintln(os.Stderr, "error: no API key — pass -key sk-… or set $OPENCODE_API_KEY")
		os.Exit(1)
	}

	for {
		if err := run(*url, apiKey, *asJSON); err != nil {
			fmt.Fprintln(os.Stderr, "error:", err)
			os.Exit(1)
		}
		if !*watch {
			return
		}
		time.Sleep(refreshInterval)
		if !*asJSON {
			fmt.Fprint(os.Stdout, "\033[H\033[2J") // clear screen between refreshes
		}
	}
}
