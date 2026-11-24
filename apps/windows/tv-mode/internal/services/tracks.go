package services

import "encoding/json"

// The audio and subtitle choices of an Edge player (JioHotstar, Prime) for the phone's
// "Subtitles and audio" list. Neither player has an API TV Mode can use, so the script
// opens the player's own menu, reads its choices, presses one if asked, and closes the
// menu again: the menu is never left open on the TV. Best effort, written without the
// signed-in players' markup; evaluates to {audio:[{id,label,on}], subs:[...]} or
// {err:"..."} ("nobutton" when there is no subtitles button, "nolist" when the menu
// opened but nothing in it could be read).

const jsTracksBody = `(async function(set){
var sleep=function(ms){return new Promise(function(r){setTimeout(r,ms)})};
function lab(b){return (b.getAttribute("aria-label")||b.getAttribute("title")||b.innerText||b.textContent||"").replace(/\s+/g," ").trim()}
function vis(e){var r=e.getBoundingClientRect();if(r.width<2||r.height<2)return false;var s=getComputedStyle(e);return s.visibility!=="hidden"&&s.display!=="none"&&+s.opacity>0.05}
function wake(){var v=document.querySelector("video");var r=v?v.getBoundingClientRect():{left:0,top:0,width:innerWidth,height:innerHeight};var o={bubbles:true,clientX:r.left+r.width/2+Math.random()*4,clientY:r.top+r.height*0.8};(v||document.body).dispatchEvent(new MouseEvent("mousemove",o));document.dispatchEvent(new MouseEvent("mousemove",o))}
function toggle(){var pick=null,best=0;[].slice.call(document.querySelectorAll("button,[role=button],[data-uia]")).forEach(function(b){var l=(b.getAttribute("aria-label")||b.getAttribute("title")||b.getAttribute("data-uia")||b.innerText||"").replace(/\s+/g," ").trim();if(!l||l.length>60)return;
var sc=/audio.{0,6}subtitle|subtitle.{0,6}audio|audio-subtitle|subtitleaudio/i.test(l)?3:/subtitle|caption/i.test(l)?2:/^audio|language/i.test(l)?1:0;if(sc>best){best=sc;pick=b}});return pick}
var HA=/^(audio|audio languages?|languages?|audio track|spoken language)$/i, HS=/^(subtitles?|captions?|subtitles? (and|&) captions?|closed captions?)$/i;
var CS="[role=menuitemradio],[role=radio],[role=option],[role=menuitemcheckbox],[role=menuitem],li,button,label,[aria-checked],[aria-selected]";var before=new Set([].slice.call(document.querySelectorAll(CS)).filter(vis));
function read(tg){
 var heads=[].slice.call(document.querySelectorAll("h1,h2,h3,h4,h5,h6,[role=heading],p,span,div,legend,label")).filter(function(h){if(h.children.length>2||!vis(h))return false;var t=(h.textContent||"").replace(/\s+/g," ").trim();return HA.test(t)||HS.test(t)});
 var cand=[].slice.call(document.querySelectorAll(CS)).filter(function(e){if(e===tg||e.contains(tg)||before.has(e)||!vis(e))return false;var t=lab(e);if(!t||t.length>40||HA.test(t)||HS.test(t))return false;return !e.querySelector("[role=menuitemradio],[role=radio],[role=option],li,button")});
 var out={audio:[],subs:[]},seen={};
 cand.forEach(function(e){var h=null;heads.forEach(function(x){if(x.compareDocumentPosition(e)&Node.DOCUMENT_POSITION_FOLLOWING)h=x});if(!h)return;
  var kind=HA.test(h.textContent.replace(/\s+/g," ").trim())?"audio":"subs";var t=lab(e).replace(/\s*(selected|checked|current)$/i,"");if(seen[kind+t])return;seen[kind+t]=1;
  var el=e.closest("[aria-checked],[aria-selected],[aria-pressed]")||e;var on=el.getAttribute("aria-checked")==="true"||el.getAttribute("aria-selected")==="true"||el.getAttribute("aria-pressed")==="true"||/(^|[\s_-])(selected|active|checked|is-selected|isSelected)/.test(String(el.className&&el.className.baseVal!==undefined?el.className.baseVal:el.className));
  out[kind].push({id:t,label:t,on:!!on,el:e})});
 return out}
var tg=toggle();if(!tg)return {err:"nobutton"};
wake();await sleep(250);tg=toggle()||tg;tg.click();await sleep(700);
var L=read(tg);
if(set){var hit=(L[set.kind]||[]).filter(function(x){return x.id===set.id})[0];if(!hit){var t0=toggle();if(t0&&L.audio.length+L.subs.length)t0.click();return {err:"nochoice"}}hit.el.click();await sleep(500);L=read(tg);if(!L.audio.length&&!L.subs.length){wake();var t3=toggle()||tg;t3.click();await sleep(700);L=read(tg)}}
var n=L.audio.length+L.subs.length;
if(n){var t2=toggle()||tg;t2.click()}
function strip(a){return a.map(function(x){return {id:x.id,label:x.label,on:x.on}})}
if(!n)return {err:"nolist"};
return {audio:strip(L.audio),subs:strip(L.subs)}})`

// JSTracks lists the player's audio and subtitle choices (the menu opens and closes).
const JSTracks = jsTracksBody + `(null)`

// JSSetTrack presses one choice by kind ("audio" or "subs") and label, then closes the
// menu; it evaluates to the lists after the change.
func JSSetTrack(kind, id string) string {
	b, _ := json.Marshal(map[string]string{"kind": kind, "id": id})
	return jsTracksBody + "(" + string(b) + ")"
}

// JSMenuClose closes a player menu left open (presses the same subtitles button again).
const JSMenuClose = `(function(){var pick=null,best=0;[].slice.call(document.querySelectorAll("button,[role=button],[data-uia]")).forEach(function(b){var l=(b.getAttribute("aria-label")||b.getAttribute("title")||b.getAttribute("data-uia")||b.innerText||"").replace(/\s+/g," ").trim();if(!l||l.length>60)return;
var sc=/audio.{0,6}subtitle|subtitle.{0,6}audio|audio-subtitle|subtitleaudio/i.test(l)?3:/subtitle|caption/i.test(l)?2:/^audio|language/i.test(l)?1:0;if(sc>best){best=sc;pick=b}});if(!pick)return "none";pick.click();return "ok"})()`
