package main

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"net/http"
	"time"
)

// Local pages that stand in for the streaming sites in the smoke test.

const common = `<meta charset=utf-8><style>
body{margin:0;height:4200px;background:#222;color:#eee;font:20px sans-serif}
a.t{position:absolute;display:block;width:200px;height:120px;background:#446;color:#fff;border:2px solid #88a}
#v{position:absolute;left:20px;top:700px}
</style>
<script>
window.__clicks=[];window.__mm=[];window.__keys=[];
document.addEventListener("mousemove",function(e){window.__mm.push([e.clientX,e.clientY]);if(window.__mm.length>400)window.__mm.shift();},true);
document.addEventListener("keydown",function(e){window.__keys.push(e.key);},true);
function place(){var cx=innerWidth/2,cy=innerHeight/2;
 var spots={center:[cx-100,cy-60],right:[cx+250,cy-60],left:[cx-450,cy-60],below:[cx-100,cy+160],above:[cx-100,cy-280]};
 for(var k in spots){var a=document.getElementById(k);a.style.left=spots[k][0]+"px";a.style.top=spots[k][1]+"px";}}
addEventListener("load",place);addEventListener("resize",place);
document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a.t");if(a){e.preventDefault();window.__clicks.push(a.id);}},true);
</script>
<a class=t id=center href="#c">center</a><a class=t id=right href="#r">right</a><a class=t id=left href="#l">left</a>
<a class=t id=below href="#b">below</a><a class=t id=above href="#a">above</a>`

func browsePage() string {
	return `<!doctype html><title>browse</title>` + common +
		`<video id=v src="/t.wav" width=320 height=180 loop autoplay></video>`
}

func watchPage() string {
	return `<!doctype html><title>watch</title>` + common +
		`<video id=v src="/t.wav" style="position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:-1;background:#000" loop autoplay></video>`
}

// silentWav is ten seconds of 8 kHz 8-bit silence: a media file with a real duration.
func silentWav() []byte {
	const rate, secs = 8000, 10
	data := bytes.Repeat([]byte{0x80}, rate*secs)
	var b bytes.Buffer
	b.WriteString("RIFF")
	_ = binary.Write(&b, binary.LittleEndian, uint32(36+len(data)))
	b.WriteString("WAVEfmt ")
	_ = binary.Write(&b, binary.LittleEndian, uint32(16))
	_ = binary.Write(&b, binary.LittleEndian, uint16(1))
	_ = binary.Write(&b, binary.LittleEndian, uint16(1))
	_ = binary.Write(&b, binary.LittleEndian, uint32(rate))
	_ = binary.Write(&b, binary.LittleEndian, uint32(rate))
	_ = binary.Write(&b, binary.LittleEndian, uint16(1))
	_ = binary.Write(&b, binary.LittleEndian, uint16(8))
	b.WriteString("data")
	_ = binary.Write(&b, binary.LittleEndian, uint32(len(data)))
	b.Write(data)
	return b.Bytes()
}

func startPages() {
	wav := silentWav()
	mux := http.NewServeMux()
	mux.HandleFunc("/t.wav", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "audio/wav")
		http.ServeContent(w, r, "t.wav", time.Time{}, bytes.NewReader(wav))
	})
	mux.HandleFunc("/extpage", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `<!doctype html><title>ext</title><body style="background:#000;color:#999">extpage<script>
var l=[],mm=0;function u(){document.title="ext "+l.join(",")+" mm"+mm}
addEventListener("keydown",function(e){l.push("k:"+e.key);u()});
addEventListener("click",function(){l.push("click");u()});
addEventListener("mousemove",function(){mm++;if(mm%5==0)u()});u();</script>`)
	})
	mux.HandleFunc("/poster/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/svg+xml")
		h := (len(r.URL.Path) * 53) % 360
		fmt.Fprintf(w, `<svg xmlns="http://www.w3.org/2000/svg" width="780" height="439"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(%d,45%%,45%%)"/><stop offset="1" stop-color="hsl(%d,50%%,18%%)"/></linearGradient></defs><rect width="780" height="439" fill="url(#g)"/></svg>`, h, (h+60)%360)
	})
	mux.HandleFunc("/navtest", func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, navPage()) })
	mux.HandleFunc("/title/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "<!doctype html><title>title</title><body style=background:#111;color:#eee>Title page")
	})
	mux.HandleFunc("/signin", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "<!doctype html><title>signin</title><body style=background:#111;color:#eee>Sign in page")
	})
	mux.HandleFunc("/browse", func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, browsePage()) })
	mux.HandleFunc("/watch/", func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, watchPage()) })
	mux.HandleFunc("/slow", func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(6 * time.Second) // a heavy site
		fmt.Fprint(w, browsePage())
	})
	go func() { _ = http.ListenAndServe("127.0.0.1:8780", mux) }()
}

// navPage is a stand-in for a streaming home page: a fixed header with Sign in
// at the top right, a hero wrapped in a tabindex=-1 container (not pressable),
// an overflow carousel of 12 tiles, a second row, a dialog, and no focus style.
func navPage() string {
	var tiles, tiles2 string
	for i := 1; i <= 12; i++ {
		tiles += fmt.Sprintf(`<a class=tile href="/title/%d?tvmode-app=prime">Tile %d</a>`, i, i)
		tiles2 += fmt.Sprintf(`<a class=tile href="/title/%d?tvmode-app=prime">Row2 %d</a>`, 20+i, i)
	}
	return `<!doctype html><title>navtest</title><meta charset=utf-8><style>
*{outline:none!important}
body{margin:0;background:#111;color:#eee;font:18px sans-serif;height:2600px}
header{position:fixed;top:0;left:0;right:0;height:64px;background:#000;display:flex;gap:24px;align-items:center;padding:0 24px;z-index:10}
header a{color:#fff;padding:8px 14px}header .sp{flex:1}
#hero{margin-top:64px;height:420px;background:#335;tabindex:-1} #hero img{width:100%;height:100%;display:block}
.row{display:flex;gap:16px;overflow:hidden;width:100%;padding:16px 0 16px 24px;box-sizing:border-box}
a.tile{flex:none;width:220px;height:130px;background:#446;color:#fff;display:flex;align-items:center;justify-content:center;text-decoration:none}
#dlg{display:none;position:fixed;left:50%;top:50%;width:520px;height:300px;margin:-150px 0 0 -260px;background:#222;z-index:50;border:1px solid #777}
#bd{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:40}
</style>
<script>window.__clicks=[];addEventListener("load",function(){
document.getElementById("more").addEventListener("click",function(e){e.preventDefault();dlg.style.display=bd.style.display="block";});
document.getElementById("x").addEventListener("click",function(){dlg.style.display=bd.style.display="none";});
document.addEventListener("keydown",function(e){if(e.key==="Escape"){dlg.style.display=bd.style.display="none";}});});</script>
<header><a href="#h">Home</a><a href="#s">Search</a><a href="#m">Movies</a><span class=sp></span><a href="/signin?tvmode-app=prime">Sign in</a></header>
<div id=hero tabindex=-1><img alt="" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"></div>
<div style="padding:12px 24px"><a id=more href="#more" style="color:#fff">More info</a></div>
<div class=row id=r1>` + tiles + `</div><div class=row id=r2>` + tiles2 + `</div>
<div id=bd></div><div id=dlg role=dialog aria-modal=true><button id=x aria-label="Close dialog">Close</button></div>`
}
