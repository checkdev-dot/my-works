  var H = window.HOME;
  function esc(s) { return String(s).replace(/([\\;,:"])/g, "\\$1"); }
  function qr(text, el, alt) { var q = qrcode(0, "M"); q.addData(text); q.make(); var i = new Image(); i.src = q.createDataURL(10, 2); i.alt = alt; document.getElementById(el).appendChild(i); }
  document.getElementById("t").textContent = H.greeting;
  document.getElementById("place").textContent = "Flat " + H.flat + " · " + H.tower + " · " + H.society;
  document.getElementById("ssid").textContent = H.wifi.ssid;
  document.getElementById("pw").textContent = H.wifi.password;
  qr("WIFI:T:" + (H.wifi.security || "WPA") + ";S:" + esc(H.wifi.ssid) + ";P:" + esc(H.wifi.password) + ";;", "wq", "Wi-Fi QR code");
  qr(location.origin + "/", "pq", "QR code for the guest page");

document.getElementById("printBtn").addEventListener("click", function () { window.print(); });

document.getElementById("gNum").textContent = H.gate;
document.getElementById("gTxt").textContent = "Enter from Gate " + H.gate;
