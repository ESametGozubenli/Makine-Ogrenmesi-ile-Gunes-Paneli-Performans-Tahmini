import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error
import time
import warnings
import os

# Gereksiz uyarıları gizlemek için
warnings.filterwarnings('ignore')

# Algoritmalar
from sklearn.linear_model import LinearRegression, Ridge, Lasso
from sklearn.tree import DecisionTreeRegressor
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor, ExtraTreesRegressor
from sklearn.svm import SVR
from xgboost import XGBRegressor
from lightgbm import LGBMRegressor

print("Veri yükleniyor ve ön işlemler yapılıyor...")

# 1. Veriyi İçe Aktarma
dosya_adi = 'sadeleşmiş_veri_DÜZELTİLMİŞ.xlsx'
try:
    df = pd.read_excel(dosya_adi)
    df.columns = df.columns.str.strip()
except FileNotFoundError:
    print(f"HATA: '{dosya_adi}' bulunamadı. Lütfen dosyanın panel.py ile aynı klasörde olduğundan emin olun.")
    exit()

# 2. Veri Ön İşleme (Dinamik Tarih/Saat Yakalama)
print("Veri tipleri kontrol ediliyor ve makine öğrenmesine uygun hale getiriliyor...")

# Eğer klasik 'tarih' ve 'Saat' isimli sütunlar varsa birleştirmeyi dene
if 'tarih' in df.columns and 'Saat' in df.columns:
    try:
        df['Datetime'] = pd.to_datetime(df['tarih'].astype(str) + ' ' + df['Saat'].astype(str))
        df['Ay'] = df['Datetime'].dt.month
        df['Gun'] = df['Datetime'].dt.day
        df['Saat_Dilimi'] = df['Datetime'].dt.hour
        df = df.drop(columns=['tarih', 'Saat', 'Datetime'])
    except:
        pass

# Veri setindeki TÜM sütunları tek tek gezerek kontrol et
kolonlar = df.columns.tolist()
for kolon in kolonlar:
    # 1. Eğer sütun Excel'den 'Timestamp' (Tarih/Zaman) olarak geldiyse
    if pd.api.types.is_datetime64_any_dtype(df[kolon]):
        df[f'{kolon}_Ay'] = df[kolon].dt.month
        df[f'{kolon}_Gun'] = df[kolon].dt.day
        df[f'{kolon}_Saat'] = df[kolon].dt.hour
        df = df.drop(columns=[kolon]) # Orijinal timestamp'i sil
        
    # 2. Eğer sütun makine öğrenmesine giremeyecek bir metin/zaman (object) formatındaysa
    elif df[kolon].dtype == 'object' or df[kolon].dtype.name == 'time':
        print(f"Bilgi: '{kolon}' sütunu metin/saat formatında olduğu için temizlendi.")
        df = df.drop(columns=[kolon]) # Hata vermemesi için verisetinden çıkar

# Tüm boş (NaN) satırları düşür
df = df.dropna()

# Modellerin hata vermediğinden emin olmak için son kontrol: her şey sayı mı?
df = df.apply(pd.to_numeric, errors='coerce').dropna()

# 3. Modellerin Tanımlanması
models = {
    "Linear Regression": LinearRegression(),
    "Ridge Regression": Ridge(random_state=42),
    "Lasso Regression": Lasso(random_state=42),
    "Decision Tree": DecisionTreeRegressor(random_state=42),
    "Random Forest": RandomForestRegressor(random_state=42, n_estimators=100),
    "Gradient Boosting": GradientBoostingRegressor(random_state=42),
    "Support Vector Machine": SVR(),
    "Extra Trees": ExtraTreesRegressor(random_state=42, n_estimators=100),
    "LightGBM": LGBMRegressor(random_state=42, verbose=-1),
    "XGBoost": XGBRegressor(random_state=42, objective='reg:squarederror')
}

# Tahmin edilecek tüm hedef değişkenlerin listesi
hedef_kolonlar = [
    'PERFORMANS ORANI', 
    'VERİM KAYBI', 
    'ÜRETİLEN GÜÇ (mW)', 
    'PANEL SICAKLIĞI (°C)', 
    'PANEL AKIMI (mA)', 
    'PANEL VOLTAJI (V)'
]

tum_sonuclar = []

print("\nTüm değişkenler için model eğitimleri başlıyor...\n" + "-"*60)

# 4. Her bir sütun için ayrı ayrı model eğitimi
for hedef in hedef_kolonlar:
    # Eğer kolon veriseti içinde yoksa atla
    if hedef not in df.columns:
        print(f"Uyarı: '{hedef}' kolonu bulunamadı, atlanıyor.")
        continue
        
    print(f"\n>>> Hedef Değişken: {hedef} <<<")
    
    # Bağımsız değişkenler (X) ve hedef değişken (y)
    X = df.drop(columns=[hedef])
    y = df[hedef]
    
    # Eğitim ve Test Setlerine Ayırma
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    # Ölçeklendirme
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    # Bu hedef değişken için modelleri çalıştır
    for name, model in models.items():
        start_time = time.time()
        
        # Modeli Eğit
        model.fit(X_train_scaled, y_train)
        
        # Tahmin ve Metrikler
        y_pred = model.predict(X_test_scaled)
        
        r2 = r2_score(y_test, y_pred)
        mae = mean_absolute_error(y_test, y_pred)
        mse = mean_squared_error(y_test, y_pred)
        rmse = np.sqrt(mse)
        train_time = time.time() - start_time
        
        # Sonuçları Listeye Ekle (Virgülden sonra 2 basamak)
        tum_sonuclar.append({
            "Hedef Değişken": hedef,
            "Model": name,
            "R2 Skoru": round(r2, 2),
            "MAE": round(mae, 2),
            "MSE": round(mse, 2),
            "RMSE": round(rmse, 2),
            "Süre (sn)": round(train_time, 2)
        })

# 5. Tüm Sonuçları Devasa Bir Tabloya Dönüştürme
results_df = pd.DataFrame(tum_sonuclar)

# Tabloyu önce Hedef Değişkene, sonra R2 skoruna (büyükten küçüğe) göre sıralayalım
results_df = results_df.sort_values(by=["Hedef Değişken", "R2 Skoru"], ascending=[True, False]).reset_index(drop=True)

# Terminalde yazdırırken virgülden sonra sadece 2 hane göstermesi için Pandas ayarı
pd.set_option('display.float_format', lambda x: '%.2f' % x)

print("\n" + "="*80)
print("TÜM DEĞİŞKENLER İÇİN KAPSAMLI MODEL KARŞILAŞTIRMA TABLOSU")
print("="*80)
print(results_df.to_string())

# İncelemesi kolay olsun diye Excel olarak dışa aktar
cikis_dosyasi = 'tum_hedefler_model_karsilastirmasi.xlsx'
results_df.to_excel(cikis_dosyasi, index=False)
print(f"\nİşlem Tamamlandı! Sonuçlar '{cikis_dosyasi}' adıyla kaydedildi.")