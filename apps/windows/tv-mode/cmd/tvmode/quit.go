package main

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"tvmode/internal/app"
)

// quitRunning asks a running TV Mode to close itself and waits until its port
// is gone. Returns the process exit code.
func quitRunning() int {
	req, _ := http.NewRequest(http.MethodPost, "http://127.0.0.1:"+app.Port()+"/api/quit", strings.NewReader(""))
	req.Header.Set("X-TVMode", "quit")
	c := http.Client{Timeout: 3 * time.Second}
	resp, err := c.Do(req)
	if err != nil {
		fmt.Println("TV Mode is not running")
		return 0
	}
	resp.Body.Close()
	for i := 0; i < 80; i++ { // up to 20 s: Edge needs time to flush its cookies
		time.Sleep(250 * time.Millisecond)
		if _, err := c.Get("http://127.0.0.1:" + app.Port() + "/api/pair"); err != nil {
			time.Sleep(500 * time.Millisecond)
			fmt.Println("TV Mode closed")
			return 0
		}
	}
	fmt.Println("TV Mode did not close in 20 s")
	return 1
}
