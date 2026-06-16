from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import numpy as np
import io
import sys
import re
import warnings
warnings.filterwarnings("ignore")

from sklearn.linear_model import LinearRegression, Ridge, Lasso
from sklearn.tree import DecisionTreeRegressor
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor, ExtraTreesRegressor
from sklearn.svm import SVR
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error

# Windows terminali için UTF-8 çıktı
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

_LGBM_AVAILABLE = False
_XGB_AVAILABLE  = False

try:
    from lightgbm import LGBMRegressor
    _LGBM_AVAILABLE = True
except ImportError:
    print("[uyarı] LightGBM kurulu değil (pip install lightgbm)")

try:
    from xgboost import XGBRegressor
    _XGB_AVAILABLE = True
except ImportError:
    print("[uyarı] XGBoost kurulu değil (pip install xgboost)")

app = Flask(__name__)
CORS(app)

stored_df = None   # Yüklenen Excel verisi bellekte tutulur


def make_model(name: str):
    """Her eğitim çağrısında yeni bir model nesnesi döndürür."""
    models = {
        "Linear Regression":      LinearRegression(),
        "Ridge Regression":       Ridge(random_state=42),
        "Lasso Regression":       Lasso(random_state=42),
        "Decision Tree":          DecisionTreeRegressor(random_state=42),
        "Random Forest":          RandomForestRegressor(random_state=42, n_estimators=100),
        "Gradient Boosting":      GradientBoostingRegressor(random_state=42),
        "Support Vector Machine": SVR(),
        "Extra Trees":            ExtraTreesRegressor(random_state=42, n_estimators=100),
    }
    if _LGBM_AVAILABLE:
        models["LightGBM"] = LGBMRegressor(random_state=42, verbose=-1)
    if _XGB_AVAILABLE:
        models["XGBoost"] = XGBRegressor(random_state=42, objective='reg:squarederror')
    return models.get(name)


def available_algorithms():
    names = [
        "Linear Regression", "Ridge Regression", "Lasso Regression",
        "Decision Tree", "Random Forest", "Gradient Boosting",
        "Support Vector Machine", "Extra Trees",
    ]
    if _LGBM_AVAILABLE:
        names.append("LightGBM")
    if _XGB_AVAILABLE:
        names.append("XGBoost")
    return names


# Zaman/meta sütunlarını atlamak için regex tabanlı tam kelime eşleşmesi.
# NOT: Basit substring eşleşmesi kullanılmamalı — örneğin 'AY' kelimesi
# 'VERİM KAYBI' içinde de geçer ve sütunu hatalı şekilde atlatır.
_SKIP_PATTERNS = [
    r'\bTARİH\b', r'\bTARIH\b', r'\bDATE\b',
    r'\bSAAT\b',  r'\bTIME\b',
    r'\bAY\b',    r'\bGUN\b',   r'\bGÜN\b',  r'\bDAY\b',
    r'\bMONTH\b', r'\bYIL\b',  r'\bYEAR\b',
    r'\bSAAT_DİLİMİ\b', r'\bSAAT_DILIMI\b',
]
_SKIP_REGEX = re.compile('|'.join(_SKIP_PATTERNS), re.IGNORECASE)


@app.route("/ml/upload", methods=["POST"])
def ml_upload():
    """Excel dosyasını al, DataFrame olarak sakla, sütun isimlerini döndür."""
    global stored_df

    if "excel" not in request.files:
        return jsonify({"error": "Dosya bulunamadı (alan adı: 'excel')."}), 400

    file = request.files["excel"]
    try:
        content = file.read()
        df = pd.read_excel(io.BytesIO(content))
        df.columns = df.columns.str.strip()

        # 1. Klasik 'tarih' ve 'Saat' birleştirme
        if 'tarih' in df.columns and 'Saat' in df.columns:
            try:
                df['Datetime'] = pd.to_datetime(
                    df['tarih'].astype(str) + ' ' + df['Saat'].astype(str)
                )
                df['Ay']          = df['Datetime'].dt.month
                df['Gun']         = df['Datetime'].dt.day
                df['Saat_Dilimi'] = df['Datetime'].dt.hour
                df = df.drop(columns=['tarih', 'Saat', 'Datetime'])
            except:
                pass

        # 2. Datetime sütunlarından özellik çıkarımı ve object/time sütunlarını düşürme
        kolonlar = df.columns.tolist()
        for kolon in kolonlar:
            if pd.api.types.is_datetime64_any_dtype(df[kolon]):
                df[f'{kolon}_Ay']   = df[kolon].dt.month
                df[f'{kolon}_Gun']  = df[kolon].dt.day
                df[f'{kolon}_Saat'] = df[kolon].dt.hour
                df = df.drop(columns=[kolon])
            elif df[kolon].dtype == 'object' or df[kolon].dtype.name == 'time':
                df = df.drop(columns=[kolon])

        # 3. Tüm boş (NaN) satırları düşür
        df = df.dropna()

        # 4. Her şey sayı mı kontrolü ve numeric'e zorlama
        df = df.apply(pd.to_numeric, errors='coerce').dropna()

        # 5. Sabit değerli (varyans=0) sütunları düşür
        constant_cols = [c for c in df.columns if df[c].std() < 1e-10]
        if constant_cols:
            df = df.drop(columns=constant_cols)
            print(f"[upload] Sabit sütunlar düşürüldü: {constant_cols}")

        stored_df = df.copy()
        numeric_cols = stored_df.columns.tolist()

        # Veri kalitesi raporu
        quality_report = {}
        for col in numeric_cols:
            nan_count = int(stored_df[col].isna().sum())
            total     = len(stored_df)
            quality_report[col] = {
                "nan_count":   nan_count,
                "nan_pct":     round(nan_count / total * 100, 1),
                "usable_rows": total - nan_count,
                "std":         round(float(stored_df[col].std()), 4),
                "mean":        round(float(stored_df[col].mean()), 4),
            }

        print(f"[upload] {file.filename} — {len(stored_df)} satır, sütunlar: {numeric_cols}")
        return jsonify({
            "rows":           len(stored_df),
            "columns":        numeric_cols,
            "quality_report": quality_report,
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/ml/columns", methods=["GET"])
def ml_columns():
    """Mevcut DataFrame'in sayısal sütunlarını döndür."""
    if stored_df is None:
        return jsonify({"columns": [], "rows": 0, "ready": False})

    quality_report = {}
    for col in stored_df.columns:
        nan_count = int(stored_df[col].isna().sum())
        total     = len(stored_df)
        quality_report[col] = {
            "nan_count":   nan_count,
            "nan_pct":     round(nan_count / total * 100, 1),
            "usable_rows": total - nan_count,
        }
    return jsonify({
        "columns":        stored_df.columns.tolist(),
        "rows":           len(stored_df),
        "ready":          True,
        "quality_report": quality_report,
    })


@app.route("/ml/algorithms", methods=["GET"])
def ml_algorithms():
    return jsonify({"algorithms": available_algorithms()})


@app.route("/ml/train", methods=["POST"])
def ml_train():
    global stored_df
    if stored_df is None:
        return jsonify({"error": "Önce /ml/upload ile Excel dosyası yükleyin."}), 400

    body = request.get_json()
    if not body:
        return jsonify({"error": "JSON gövdesi gerekli."}), 400

    features   = body.get("features", [])
    target     = body.get("target")
    algorithms = body.get("algorithms", available_algorithms())
    test_size  = float(body.get("test_size", 0.2))

    # ── Doğrulama ──────────────────────────────────────────────────────────
    if not features:
        return jsonify({"error": "En az bir özellik sütunu seçin."}), 400
    if not target:
        return jsonify({"error": "'target' belirtilmedi."}), 400
    if target in features:
        return jsonify({"error": "Hedef değişken özellik listesinde olamaz."}), 400

    missing = [c for c in features + [target] if c not in stored_df.columns]
    if missing:
        return jsonify({"error": f"Sütunlar bulunamadı: {missing}"}), 400

    # ── Veri hazırlama ──────────────────────────────────────────────────────
    df_sel = stored_df[features + [target]].dropna()
    warn_list = []

    dropped = len(stored_df) - len(df_sel)
    if dropped > 0:
        warn_list.append(
            f"{dropped} satır eksik veri nedeniyle çıkarıldı "
            f"({len(stored_df)} → {len(df_sel)})."
        )

    if len(df_sel) < 20:
        return jsonify({"error": "Yeterli veri yok (min 20 satır)."}), 400

    y_std  = float(df_sel[target].std())
    y_mean = float(df_sel[target].mean())
    if y_std < 1e-6:
        return jsonify({"error": f"'{target}' sabit değer içeriyor (std≈0)."}), 400

    cv = y_std / abs(y_mean) if y_mean != 0 else 0
    if cv < 0.10:
        warn_list.append(
            f"⚠ '{target}' değişim katsayısı düşük (CV={cv:.4f}). "
            "Değerler birbirine çok yakın olduğu için R² düşük çıkabilir — "
            "bu verinin yapısından kaynaklanır."
        )

    X = df_sel[features].values
    y = df_sel[target].values

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=42
    )

    scaler     = StandardScaler()
    X_train_sc = scaler.fit_transform(X_train)
    X_test_sc  = scaler.transform(X_test)

    results = []
    for algo_name in algorithms:
        model = make_model(algo_name)
        if model is None:
            continue
        try:
            model.fit(X_train_sc, y_train)
            y_pred = model.predict(X_test_sc)

            r2   = float(r2_score(y_test, y_pred))
            mae  = float(mean_absolute_error(y_test, y_pred))
            mse  = float(mean_squared_error(y_test, y_pred))
            rmse = float(np.sqrt(mse))

            results.append({
                "algorithm": algo_name,
                "r2":   round(r2,   4),
                "mae":  round(mae,  4),
                "mse":  round(mse,  4),
                "rmse": round(rmse, 4),
            })
            print(f"[train] {algo_name}: R²={r2:.4f}  MAE={mae:.4f}")

        except Exception as e:
            results.append({
                "algorithm": algo_name,
                "error":     str(e),
                "r2": None, "mae": None, "mse": None, "rmse": None,
            })
            print(f"[train] {algo_name} HATA: {e}")

    results.sort(
        key=lambda x: (x["r2"] is not None, x["r2"] if x["r2"] is not None else -9999),
        reverse=True,
    )

    return jsonify({
        "results":    results,
        "train_rows": len(X_train),
        "test_rows":  len(X_test),
        "features":   features,
        "target":     target,
        "warnings":   warn_list,
    })


if __name__ == "__main__":
    print("Python ML sunucusu başlatılıyor: http://localhost:5000")
    app.run(host="0.0.0.0", port=5000, debug=False)
