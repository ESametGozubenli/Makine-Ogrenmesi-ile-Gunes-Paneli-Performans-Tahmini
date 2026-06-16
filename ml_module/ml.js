"use strict";

const ML_API   = "http://localhost:5000";
const NODE_API = "http://localhost:3000";

let r2Chart      = null;
let columnsCache = [];
let qualityCache = {};   // Sütun bazlı NaN ve kalite bilgileri

/* ─────────────────────────────────────────────
   localStorage — iki sayfa arası veri paylaşımı
   ───────────────────────────────────────────── */
const LS_KEY = "sharedExcelInfo";

function saveSharedInfo(name, rows, columns) {
  localStorage.setItem(LS_KEY, JSON.stringify({ name, rows, columns, loadedAt: Date.now() }));
}

function loadSharedInfo() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "null"); }
  catch { return null; }
}

/* ── Yardımcılar ── */
function showStatus(msg, stats = "", color = "#059669") {
  const bar  = document.getElementById("mlStatusBar");
  const txt  = document.getElementById("mlStatusText");
  const stat = document.getElementById("mlStatusStats");
  bar.style.display     = "flex";
  bar.style.background  = color + "15";
  bar.style.borderColor = color + "55";
  bar.style.color       = color;
  txt.textContent       = msg;
  stat.textContent      = stats;
}

function getSelectedAlgorithms() {
  return Array.from(
    document.querySelectorAll(".algo-cb:checked")
  ).map(cb => cb.value);
}

function getSelectedFeatures() {
  return Array.from(
    document.querySelectorAll(".feature-cb:checked")
  ).map(cb => cb.value);
}

function getTargetColumn() {
  return document.getElementById("targetSelect").value;
}

/* ── Algoritmalar: sunucudan çek ve checkbox listesi oluştur ── */
async function loadAlgorithms() {
  try {
    const res  = await fetch(`${ML_API}/ml/algorithms`);
    const json = await res.json();
    renderAlgorithmList(json.algorithms);
  } catch {
    renderAlgorithmList([
      "Linear Regression","Ridge Regression","Lasso Regression",
      "Decision Tree","Random Forest","Gradient Boosting",
      "Support Vector Machine","Extra Trees","LightGBM","XGBoost"
    ]);
  }
}

function renderAlgorithmList(algorithms) {
  const container = document.getElementById("algoCheckboxes");
  if (!container) return;
  container.innerHTML = algorithms.map(a => `
    <label class="ml-checkbox-item" for="algo_${CSS.escape(a)}">
      <input type="checkbox" class="algo-cb" id="algo_${CSS.escape(a)}" value="${a}" checked />
      ${a}
    </label>
  `).join("");
  document.querySelectorAll(".algo-cb").forEach(cb =>
    cb.addEventListener("change", updateTrainButton)
  );
  updateTrainButton();
}

/* ── Senaryolara Göre Hedef ve Özellik Seçimi ── */
const TARGET_KEYWORDS = ["GÜÇ", "GUC", "SICAKLIK", "SICAKLIĞI", "KAYBI", "KAYIP", "ORANI", "PERFORMANS"];

function getRecommendedFeatures(targetName) {
  const t = targetName.toUpperCase();
  if (t.includes("GÜÇ") || t.includes("GUC")) return ["SICAKLIK", "SICAKLIĞI", "VOLTAJ", "AKIM"];
  if (t.includes("KAYBI") || t.includes("KAYIP")) return ["SICAKLIK", "SICAKLIĞI", "GÜÇ", "GUC", "VOLTAJ", "AKIM"];
  if (t.includes("ORANI") || t.includes("PERFORMANS")) return ["GÜÇ", "GUC", "SICAKLIK", "SICAKLIĞI", "VOLTAJ"];
  if (t.includes("SICAKLIK") || t.includes("SICAKLIĞI")) return ["VOLTAJ", "AKIM", "GÜÇ", "GUC"];
  return [];
}


function renderColumns(columns, qualityReport) {
  columnsCache = columns;
  qualityCache = qualityReport || {};

  // Hedef dropdown: sadece anlamlı tahmin hedefleri gösterilir
  const targetCols = columns.filter(c => {
    const upper = c.toUpperCase();
    return TARGET_KEYWORDS.some(kw => upper.includes(kw));
  });
  const dropdownCols = targetCols.length > 0 ? targetCols : columns;

  const targetSel = document.getElementById("targetSelect");
  targetSel.innerHTML = dropdownCols
    .map(c => `<option value="${c}">${c}</option>`)
    .join("");

  buildFeatureCheckboxes(columns);

  targetSel.removeEventListener("change", onTargetChange);
  targetSel.addEventListener("change", onTargetChange);

  onTargetChange();

  document.querySelectorAll(".feature-cb").forEach(cb =>
    cb.addEventListener("change", updateTrainButton)
  );
  targetSel.addEventListener("change", updateTrainButton);
}

function buildFeatureCheckboxes(columns) {
  const grid = document.getElementById("featureCheckboxes");
  grid.innerHTML = columns.map(c => {
    const q = qualityCache[c];
    let badge = "";
    if (q && q.nan_pct > 0) {
      const color = q.nan_pct > 30 ? "#dc2626" : q.nan_pct > 10 ? "#d97706" : "#64748b";
      badge = `<span style="font-size:.62rem;color:${color};margin-left:.3rem;font-weight:600;">(${q.nan_pct}% eksik)</span>`;
    }
    return `
      <label class="ml-checkbox-item" for="feat_${CSS.escape(c)}">
        <input type="checkbox" class="feature-cb" id="feat_${CSS.escape(c)}" value="${c}" />
        ${c}${badge}
      </label>
    `;
  }).join("");
}

function onTargetChange() {
  const newTarget = getTargetColumn();
  const recommended = getRecommendedFeatures(newTarget);

  document.querySelectorAll(".feature-cb").forEach(cb => {
    const colName = cb.value.toUpperCase();
    const lbl = cb.closest("label");

    if (cb.value === newTarget) {
      cb.checked  = false;
      cb.disabled = true;
      if (lbl) lbl.style.opacity = ".4";
    } else {
      cb.disabled = false;
      if (lbl) lbl.style.opacity = "1";
      
      if (recommended.length > 0) {
        cb.checked = recommended.some(r => colName.includes(r));
      } else {
        cb.checked = true;
      }
    }
  });

  updateTrainButton();
}

function updateTrainButton() {
  const btn      = document.getElementById("btnTrain");
  const features = getSelectedFeatures();
  const target   = getTargetColumn();
  const algos    = getSelectedAlgorithms();
  btn.disabled   = !(features.length > 0 && target && algos.length > 0 && columnsCache.length > 0);
}

/* ── Excel Upload (ML backend) ── */
async function handleMlUpload(file) {
  if (!file) return;

  const label = document.getElementById("mlUploadLabel");
  const info  = document.getElementById("mlFileInfo");
  label.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Yükleniyor… <input type="file" id="mlExcelInput" accept=".xlsx,.xls" style="display:none" />`;

  const formData = new FormData();
  formData.append("excel", file);

  try {
    const res  = await fetch(`${ML_API}/ml/upload`, { method: "POST", body: formData });
    const json = await res.json();

    if (!res.ok) throw new Error(json.error || "Yükleme hatası");

    info.textContent = `${json.rows} satır · ${json.columns.length} sayısal sütun`;
    label.innerHTML  = `<i class="fa-solid fa-check"></i> ${file.name} <input type="file" id="mlExcelInput" accept=".xlsx,.xls" style="display:none" />`;
    label.classList.add("loaded");

    rebindUploadInput();
    renderColumns(json.columns, json.quality_report);
    showStatus(`${file.name} yüklendi`, `${json.rows} satır, ${json.columns.length} sütun`);

    saveSharedInfo(file.name, json.rows, json.columns);

    // Node.js'e de gönder (dashboard için)
    const fd2 = new FormData();
    fd2.append("excel", file);
    await fetch(`${NODE_API}/api/upload`, { method: "POST", body: fd2 }).catch(() => {});

  } catch (err) {
    info.textContent = "Hata: " + err.message;
    label.innerHTML  = `<i class="fa-solid fa-file-excel"></i> Excel Yükle (.xlsx) <input type="file" id="mlExcelInput" accept=".xlsx,.xls" style="display:none" />`;
    label.classList.remove("loaded");
    rebindUploadInput();
    showStatus("Hata: " + err.message, "", "#dc2626");
    console.error(err);
  }
}

function rebindUploadInput() {
  const el = document.getElementById("mlExcelInput");
  if (el) el.addEventListener("change", e => handleMlUpload(e.target.files[0]));
}

/* ── Sayfa açılışında ML sunucusundan mevcut veriyi çek ── */
async function tryLoadExistingData() {
  try {
    const res  = await fetch(`${ML_API}/ml/columns`);
    const json = await res.json();

    if (json.ready && json.columns.length > 0) {
      const info = loadSharedInfo();
      const name = info?.name || "Önceki oturum";

      renderColumns(json.columns, json.quality_report);

      const label = document.getElementById("mlUploadLabel");
      const fileInfo = document.getElementById("mlFileInfo");
      label.innerHTML = `<i class="fa-solid fa-check"></i> ${name} <input type="file" id="mlExcelInput" accept=".xlsx,.xls" style="display:none" />`;
      label.classList.add("loaded");
      fileInfo.textContent = `${json.rows} satır · ${json.columns.length} sayısal sütun`;

      rebindUploadInput();
      showStatus(
        `Veri zaten yüklü: ${name}`,
        `${json.rows} satır, ${json.columns.length} sütun`,
        "#2563eb"
      );
      return true;
    }
  } catch {
    // Sunucu kapalı, sessizce devam et
  }
  return false;
}

/* ── R² badge rengi ── */
function r2Class(r2) {
  if (r2 === null || r2 === undefined) return "";
  if (r2 >= 0.85) return "good";
  if (r2 >= 0.6)  return "mid";
  return "bad";
}

/* ── Eğitim & Test ── */
async function trainModels() {
  const features   = getSelectedFeatures();
  const target     = getTargetColumn();
  const algorithms = getSelectedAlgorithms();
  const testSize   = parseInt(document.getElementById("testSizeRange").value) / 100;

  if (!features.length || !target || !algorithms.length) {
    alert("Lütfen özellikler, hedef değişken ve en az bir algoritma seçin.");
    return;
  }

  document.getElementById("resultsPlaceholder").style.display = "none";
  document.getElementById("resultsPanel").style.display       = "none";
  document.getElementById("chartPanel").style.display         = "none";
  document.getElementById("trainSummary").style.display       = "none";
  document.getElementById("trainWarnings").style.display      = "none";
  document.getElementById("trainSpinner").classList.add("visible");
  document.getElementById("btnTrain").disabled = true;

  try {
    const res  = await fetch(`${ML_API}/ml/train`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ features, target, algorithms, test_size: testSize }),
    });
    const json = await res.json();

    if (!res.ok) throw new Error(json.error || "Sunucu hatası");

    renderResults(json);
    showStatus(
      "Eğitim tamamlandı",
      `${algorithms.length} algoritma · ${json.train_rows} eğitim + ${json.test_rows} test satırı`
    );
  } catch (err) {
    console.error(err);
    showStatus("Hata: " + err.message, "Python sunucusu (port 5000) çalışıyor mu?", "#dc2626");
    const ph = document.getElementById("resultsPlaceholder");
    ph.style.display = "flex";
    ph.innerHTML = `
      <i class="fa-solid fa-triangle-exclamation" style="font-size:2.5rem;color:#fca5a5;margin-bottom:1rem;"></i>
      <p style="font-size:.95rem;font-weight:600;color:#dc2626;">Eğitim Hatası</p>
      <p style="font-size:.82rem;color:var(--text-muted);">${err.message}</p>
      <p style="font-size:.78rem;color:var(--text-muted);margin-top:.5rem;">
        <code>python ml_server.py</code> komutunu çalıştırdığınızdan emin olun.
      </p>
    `;
  } finally {
    document.getElementById("trainSpinner").classList.remove("visible");
    document.getElementById("btnTrain").disabled = false;
  }
}

/* ── Sonuçları render et ── */
function renderResults(json) {
  const { results, train_rows, test_rows, features, target, warnings: warnList } = json;

  // Uyarılar
  const warningsDiv = document.getElementById("trainWarnings");
  if (warnList && warnList.length > 0) {
    warningsDiv.style.display = "block";
    warningsDiv.innerHTML = `
      <div class="ml-panel-title" style="color:#d97706;">
        <i class="fa-solid fa-triangle-exclamation" style="color:#d97706;"></i>
        Veri Kalitesi Uyarıları
      </div>
      <ul style="margin:0; padding-left:1.2rem; font-size:.82rem; color:#92400e; list-style:none;">
        ${warnList.map(w => `<li style="margin-bottom:.4rem;"><i class="fa-solid fa-circle-exclamation" style="color:#d97706; margin-right:.4rem;"></i>${w}</li>`).join("")}
      </ul>
    `;
  } else {
    warningsDiv.style.display = "none";
  }

  const bestAlgo = results.find(r => r.r2 !== null);
  document.getElementById("trainSummaryContent").innerHTML = `
    <div class="col-6 col-md-3">
      <div class="ml-panel" style="text-align:center;padding:1rem;background:var(--gradient1);">
        <div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);">Eğitim Verisi</div>
        <div style="font-size:1.4rem;font-weight:700;color:var(--accent1);">${train_rows}</div>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="ml-panel" style="text-align:center;padding:1rem;background:var(--gradient1);">
        <div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);">Test Verisi</div>
        <div style="font-size:1.4rem;font-weight:700;color:var(--accent1);">${test_rows}</div>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="ml-panel" style="text-align:center;padding:1rem;background:var(--gradient2);">
        <div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);">Özellik Sayısı</div>
        <div style="font-size:1.4rem;font-weight:700;color:var(--accent2);">${features.length}</div>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="ml-panel" style="text-align:center;padding:1rem;background:var(--gradient3);">
        <div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);">En İyi R²</div>
        <div style="font-size:1.4rem;font-weight:700;color:var(--accent3);">${bestAlgo ? bestAlgo.r2 : "—"}</div>
      </div>
    </div>
  `;

  document.getElementById("metricsTableBody").innerHTML = results.map((r, i) => {
    if (r.error) {
      return `<tr>
        <td><span class="algo-rank">${i + 1}</span></td>
        <td class="algo-name">${r.algorithm}</td>
        <td colspan="4" style="color:#dc2626;font-size:.78rem;"><i class="fa-solid fa-triangle-exclamation me-1"></i>${r.error}</td>
      </tr>`;
    }
    const rankClass = i === 0 ? "rank-1" : i === 1 ? "rank-2" : i === 2 ? "rank-3" : "";
    const isLgbm    = r.algorithm === "LightGBM";
    const isXgb     = r.algorithm === "XGBoost";
    return `<tr>
      <td><span class="algo-rank ${rankClass}">${i + 1}</span></td>
      <td class="algo-name">
        ${r.algorithm}
        ${i === 0 ? '<span style="font-size:.65rem;background:#fef3c7;color:#92400e;padding:.15rem .4rem;border-radius:4px;font-weight:700;margin-left:.3rem;">EN İYİ</span>' : ""}
        ${isLgbm   ? '<span style="font-size:.62rem;background:#dbeafe;color:#1d4ed8;padding:.1rem .35rem;border-radius:4px;font-weight:700;margin-left:.3rem;">LGB</span>' : ""}
        ${isXgb    ? '<span style="font-size:.62rem;background:#dcfce7;color:#166534;padding:.1rem .35rem;border-radius:4px;font-weight:700;margin-left:.3rem;">XGB</span>' : ""}
      </td>
      <td><span class="metric-badge ${r2Class(r.r2)}">${r.r2 !== null ? r.r2 : "—"}</span></td>
      <td>${r.mae  !== null ? r.mae  : "—"}</td>
      <td>${r.mse  !== null ? r.mse  : "—"}</td>
      <td>${r.rmse !== null ? r.rmse : "—"}</td>
    </tr>`;
  }).join("");

  document.getElementById("trainSummary").style.display = "block";
  document.getElementById("resultsPanel").style.display = "block";

  // Grafik
  const validResults = results.filter(r => r.r2 !== null);
  const labels  = validResults.map(r => r.algorithm);
  const r2Vals  = validResults.map(r => r.r2);
  const colors  = r2Vals.map(v => v >= 0.85 ? "#059669" : v >= 0.6 ? "#d97706" : "#dc2626");

  if (r2Chart) r2Chart.destroy();
  const ctx = document.getElementById("r2Chart").getContext("2d");
  r2Chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "R² Skoru",
        data:  r2Vals,
        backgroundColor: colors.map(c => c + "cc"),
        borderColor:     colors,
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#fff",
          titleColor: "#1e293b",
          bodyColor: "#64748b",
          borderColor: "#e2e8f0",
          borderWidth: 1,
          callbacks: { label: ctx => ` R² = ${ctx.raw.toFixed(4)}` },
        },
      },
      scales: {
        x: {
          min: Math.min(0, Math.min(...r2Vals) - 0.05),
          max: 1,
          ticks: { color: "#94a3b8", font: { size: 10 } },
          grid:  { color: "#f1f5f9" },
        },
        y: {
          ticks: { color: "#475569", font: { size: 11, family: "Inter" } },
          grid:  { display: false },
        },
      },
    },
  });
  document.getElementById("chartPanel").style.display = "block";
}

/* ── Event Listeners ── */
document.addEventListener("DOMContentLoaded", async () => {
  await loadAlgorithms();
  rebindUploadInput();
  await tryLoadExistingData();
  document.getElementById("btnTrain").addEventListener("click", trainModels);
});
