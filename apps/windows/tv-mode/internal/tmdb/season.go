package tmdb

import (
	"fmt"
	"net/url"
)

// Episode is one episode of a season.
type Episode struct {
	N        int    `json:"n"`
	Name     string `json:"name"`
	Overview string `json:"over"`
	Runtime  int    `json:"min"` // minutes
	Still    string `json:"still"`
	Air      string `json:"air"`
}

// Season lists the episodes of season n of series id.
func (c *Client) Season(id, n int) ([]Episode, error) {
	var r struct {
		Episodes []struct {
			N        int    `json:"episode_number"`
			Name     string `json:"name"`
			Overview string `json:"overview"`
			Runtime  int    `json:"runtime"`
			Still    string `json:"still_path"`
			Air      string `json:"air_date"`
		} `json:"episodes"`
	}
	if err := c.get(fmt.Sprintf("/tv/%d/season/%d", id, n), url.Values{"language": {"en-US"}}, &r); err != nil {
		return nil, err
	}
	out := make([]Episode, 0, len(r.Episodes))
	for _, e := range r.Episodes {
		out = append(out, Episode{N: e.N, Name: e.Name, Overview: e.Overview, Runtime: e.Runtime, Still: e.Still, Air: e.Air})
	}
	return out, nil
}
