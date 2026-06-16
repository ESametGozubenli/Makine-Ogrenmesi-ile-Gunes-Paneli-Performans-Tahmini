"use strict";

const MAX_HISTORY = 50;
const ML_API      = "http://localhost:5000";
const LS_KEY      = "sharedExcelInfo";   // ml.js ile paylaşılır

function saveSharedInfo(name, rows, columns) {
  localStorage.setItem(LS_KEY, JSON.stringify({ name, rows, columns, loadedAt: Date.now() }));
}

let state = {
  allData: [],
  cursor: 0,
  history: [],
};

/* ── CHART OPTIONS (light theme) ── */
const CHART_OPTS = () => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index", intersect: false },
  plugins: {
    legend: {
      labels: {
        color: "#64748b",
        font: { size: 11, family: "Inter" },
        boxWidth: 12,
        padding: 14,
      },
    },
    tooltip: {
      backgroundColor: "#fff",
      titleColor: "#1e293b",
      bodyColor: "#64748b",
      borderColor: "#e2e8f0",
      borderWidth: 1,
      padding: 10,
    },
  },
  scales: {
    x: {
      ticks: { color: "#94a3b8", font: { size: 10 }, maxTicksLimit: 8 },
      grid: { color: "#f1f5f9" },
    },
    y: {
      ticks: { color: "#94a3b8", font: { size: 10 } },
      grid: { color: "#f1f5f9" },
    },
  },
});

function makeDataset(label, color, data = []) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: color + "18",
    pointBackgroundColor: color,
    pointRadius: 3,
    pointHoverRadius: 5,
    borderWidth: 2,
    fill: true,
    tension: 0.4,
  };
}

let chartPow = null;
let chartTemp = null;

function initCharts() {
  const ctxPow  = document.getElementById("chartPower").getContext("2d");
  const ctxTemp = document.getElementById("chartTemp").getContext("2d");

  chartPow = new Chart(ctxPow, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        makeDataset("Güç (mW)", "#2563eb"),
        makeDataset("Performans Oranı (%)", "#7c3aed"),
      ],
    },
    options: CHART_OPTS(),
  });

  chartTemp = new Chart(ctxTemp, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        makeDataset("Sıcaklık (°C)", "#dc2626"),
        makeDataset("Verim Kaybı (%)", "#d97706"),
      ],
    },
    options: CHART_OPTS(),
  });
}

/* ── UI GÜNCELLEYICILER ── */
let prevValues = {};

function setTrend(id, cur, prev) {
  const el = document.getElementById(id);
  if (!el) return;
  if (prev === undefined) { el.innerHTML = ""; return; }
  const diff = cur - prev;
  if (Math.abs(diff) < 0.001) { el.innerHTML = ""; return; }
  const up = diff > 0;
  el.className = "trend " + (up ? "up" : "dn");
  el.innerHTML = `<i class="fa-solid fa-arrow-${up ? "up" : "down"}"></i> ${Math.abs(diff).toFixed(2)}`;
}

function updateCards(entry) {
  document.getElementById("val-volt").textContent = (+entry.volt).toFixed(2);
  document.getElementById("val-amp").textContent  = (+entry.amp).toFixed(2);
  document.getElementById("val-pow").textContent  = (+entry.pow).toFixed(2);
  document.getElementById("val-temp").textContent = (+entry.temp).toFixed(2);

  setTrend("trend-volt", +entry.volt, prevValues.volt);
  setTrend("trend-amp",  +entry.amp,  prevValues.amp);
  setTrend("trend-pow",  +entry.pow,  prevValues.pow);
  setTrend("trend-temp", +entry.temp, prevValues.temp);

  prevValues = { volt: +entry.volt, amp: +entry.amp, pow: +entry.pow, temp: +entry.temp };

  ["card-volt","card-amp","card-pow","card-temp"].forEach((id) => {
    const el = document.getElementById(id);
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
  });
}

function updateCharts() {
  if (!chartPow || !chartTemp) return;
  const sorted = [...state.history];
  chartPow.data.labels = sorted.map((h) => h.time);
  chartPow.data.datasets[0].data = sorted.map((h) => +h.pow);
  chartPow.data.datasets[1].data = sorted.map((h) => +h.perf);
  chartPow.update("none");

  chartTemp.data.labels = sorted.map((h) => h.time);
  chartTemp.data.datasets[0].data = sorted.map((h) => +h.temp);
  chartTemp.data.datasets[1].data = sorted.map((h) => Math.abs(+h.loss));
  chartTemp.update("none");
}

function updateTable() {
  const tbody = document.getElementById("dataTableBody");
  const rows  = [...state.history].reverse().slice(0, 10);
  tbody.innerHTML = rows
    .map((r) => `
    <tr>
      <td>${r.date} ${r.time}</td>
      <td class="val-volt">${(+r.volt).toFixed(2)}</td>
      <td class="val-amp">${(+r.amp).toFixed(2)}</td>
      <td class="val-pow">${(+r.pow).toFixed(2)}</td>
      <td class="val-temp">${(+r.temp).toFixed(2)} °C</td>
      <td class="val-perf">${(+r.perf).toFixed(2)}%</td>
      <td class="val-loss">${Math.abs(+r.loss).toFixed(2)}%</td>
    </tr>
  `)
    .join("");
}

function updateLastUpdate() {
  const el = document.getElementById("lastUpdate");
  if (el) el.textContent = "Son güncelleme: " + new Date().toLocaleTimeString("tr-TR");
}

function updateDataSourceBar(fileName, total) {
  const bar  = document.getElementById("dataSourceBar");
  const txt  = document.getElementById("dataSourceText");
  const stat = document.getElementById("dataSourceStats");
  if (!bar) return;
  bar.classList.add("visible");
  if (txt)  txt.textContent  = `Kaynak: ${fileName}`;
  if (stat) stat.textContent = `${total} kayıt yüklendi`;
}

let tickInterval = null;

function showNoDataWarning() {
  if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }

  const liveDot  = document.getElementById("liveDot");
  const liveLabel = document.getElementById("liveLabel");
  if (liveDot)  { liveDot.style.background = "#dc2626"; liveDot.style.animation = "none"; }
  if (liveLabel) liveLabel.textContent = "Veri Yok";

  const badge = document.getElementById("badgeLive");
  if (badge) {
    badge.style.background   = "#fee2e2";
    badge.style.color        = "#dc2626";
    badge.style.border       = "1px solid #fca5a5";
    badge.innerHTML          = '<i class="fa-solid fa-circle-xmark me-1"></i>Veri Yok';
  }

  const bar  = document.getElementById("dataSourceBar");
  const txt  = document.getElementById("dataSourceText");
  const stat = document.getElementById("dataSourceStats");
  if (bar)  { bar.style.background = "#fee2e255"; bar.style.borderColor = "#fca5a5"; bar.style.color = "#dc2626"; }
  if (txt)  txt.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Tüm kayıtlar gösterildi';
  if (stat) stat.textContent = "Sistem durduruldu";

  const lastUp = document.getElementById("lastUpdate");
  if (lastUp) lastUp.textContent = "Veri akışı durdu";
}

function tick() {
  if (state.allData.length === 0) return;
  if (state.cursor >= state.allData.length) { showNoDataWarning(); return; }

  const entry = state.allData[state.cursor];
  state.cursor++;

  state.history.push(entry);
  if (state.history.length > MAX_HISTORY) state.history.shift();

  updateCards(entry);
  updateCharts();
  updateTable();
  updateLastUpdate();
}

/* ── EXCEL UPLOAD ── */
async function handleFileUpload(file) {
  if (!file) return;

  const liveDot   = document.getElementById("liveDot");
  const liveLabel = document.getElementById("liveLabel");
  if (liveDot)   { liveDot.style.background = "#d97706"; liveDot.style.animation = "none"; }
  if (liveLabel) liveLabel.textContent = "Yükleniyor…";

  const formData = new FormData();
  formData.append("excel", file);

  try {
    const res = await fetch("http://localhost:3000/api/upload", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Reset state
    if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
    state = { allData: data, cursor: 0, history: [] };

    // Grafikleri sıfırla
    if (!chartPow) initCharts();
    else {
      chartPow.data.labels  = [];
      chartPow.data.datasets.forEach(d => d.data = []);
      chartTemp.data.labels = [];
      chartTemp.data.datasets.forEach(d => d.data = []);
      chartPow.update("none");
      chartTemp.update("none");
    }

    // Preload
    const preload = data.slice(0, Math.min(20, data.length));
    state.history = [...preload];
    state.cursor  = preload.length;

    if (data.length > 0) {
      updateCards(data[preload.length - 1]);
      updateCharts();
      updateTable();
      updateLastUpdate();
    }

    // Dashboard göster
    document.getElementById("uploadPrompt").style.display = "none";
    document.getElementById("dashContent").style.display  = "block";
    if (!chartPow) initCharts();

    // Label güncelle
    const labelUpload = document.getElementById("labelUpload");
    if (labelUpload) {
      labelUpload.classList.add("loaded");
      labelUpload.innerHTML = `<i class="fa-solid fa-check"></i> ${file.name} <input type="file" id="excelInput" accept=".xlsx,.xls" style="display:none" />`;
      document.getElementById("excelInput").addEventListener("change", (e) => handleFileUpload(e.target.files[0]));
    }

    updateDataSourceBar(file.name, data.length);

    // localStorage'a kaydet (ML sayfası okuyacak)
    saveSharedInfo(file.name, data.length, []);

    // ML sunucusuna da gönder (varsa)
    try {
      const fd2 = new FormData();
      fd2.append("excel", file);
      fetch(`${ML_API}/ml/upload`, { method: "POST", body: fd2 }).catch(() => {});
    } catch { /* ML sunucusu kapalıysa sorun yok */ }

    // Live durum
    if (liveDot)   { liveDot.style.background = ""; liveDot.style.animation = ""; liveDot.className = "live-dot"; }
    if (liveLabel) liveLabel.textContent = "Canlı";

    if (state.cursor >= state.allData.length) {
      showNoDataWarning();
    } else {
      tickInterval = setInterval(tick, 2000);
    }

  } catch (err) {
    console.error("Upload hatası:", err);
    if (liveDot)   { liveDot.style.background = "#dc2626"; liveDot.style.animation = "none"; }
    if (liveLabel) liveLabel.textContent = "Hata";
    alert("Dosya yüklenirken hata: " + err.message + "\n\nNode.js sunucusunun (port 3000) çalıştığından emin olun.");
  }
}

/* ── EVENT LISTENERS ── */
document.addEventListener("DOMContentLoaded", async () => {
  const excelInput  = document.getElementById("excelInput");
  const excelInput2 = document.getElementById("excelInput2");

  if (excelInput)  excelInput.addEventListener("change",  (e) => handleFileUpload(e.target.files[0]));
  if (excelInput2) excelInput2.addEventListener("change", (e) => handleFileUpload(e.target.files[0]));

  // Sayfa açılınca Node.js sunucusunda veri var mı kontrol et (ML sayfasından geri dönünce)
  await tryAutoLoadDashboard();
});

async function tryAutoLoadDashboard() {
  try {
    const res  = await fetch("http://localhost:3000/api/veriler");
    if (!res.ok) return;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return;

    // Veri var — dashboard'ı göster
    if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
    state = { allData: data, cursor: 0, history: [] };

    if (!chartPow) initCharts();
    else {
      chartPow.data.labels  = [];
      chartPow.data.datasets.forEach(d => d.data = []);
      chartTemp.data.labels = [];
      chartTemp.data.datasets.forEach(d => d.data = []);
      chartPow.update("none");
      chartTemp.update("none");
    }

    const preload = data.slice(0, Math.min(20, data.length));
    state.history = [...preload];
    state.cursor  = preload.length;

    if (data.length > 0) {
      updateCards(data[preload.length - 1]);
      updateCharts();
      updateTable();
      updateLastUpdate();
    }

    document.getElementById("uploadPrompt").style.display = "none";
    document.getElementById("dashContent").style.display  = "block";
    if (!chartPow) initCharts();

    // Dosya adını localStorage'dan al
    let fileName = "Mevcut Veri";
    try {
      const info = JSON.parse(localStorage.getItem("sharedExcelInfo") || "null");
      if (info?.name) fileName = info.name;
    } catch {}

    const labelUpload = document.getElementById("labelUpload");
    if (labelUpload) {
      labelUpload.classList.add("loaded");
      labelUpload.innerHTML = `<i class="fa-solid fa-check"></i> ${fileName} <input type="file" id="excelInput" accept=".xlsx,.xls" style="display:none" />`;
      document.getElementById("excelInput").addEventListener("change", (e) => handleFileUpload(e.target.files[0]));
    }

    updateDataSourceBar(fileName, data.length);

    const liveDot   = document.getElementById("liveDot");
    const liveLabel = document.getElementById("liveLabel");
    if (liveDot)   { liveDot.style.background = ""; liveDot.style.animation = ""; liveDot.className = "live-dot"; }
    if (liveLabel) liveLabel.textContent = "Canlı";

    if (state.cursor >= state.allData.length) {
      showNoDataWarning();
    } else {
      tickInterval = setInterval(tick, 2000);
    }
  } catch {
    // Sunucu kapalıysa veya veri yoksa sessizce devam et
  }
}
