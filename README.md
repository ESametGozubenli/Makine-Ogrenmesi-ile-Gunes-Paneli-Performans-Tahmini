# Güneş Paneli Performans İzleme ve Makine Öğrenmesi Sistemi

Bu proje, güneş panellerinin anlık performansını izlemek ve toplanan veriler üzerinden çeşitli Makine Öğrenmesi (Machine Learning) algoritmalarını test etmek için geliştirilmiş çift sunuculu tam kapsamlı bir web uygulamasıdır.

## 📁 Proje Yapısı ve Dosyaların Görevleri

Proje klasöründeki her bir dosyanın özel bir amacı vardır. Kullanılmayan veya gereksiz hiçbir dosya bulunmamaktadır:

*   **`index.html`**: Uygulamanın ana ekranıdır (Dashboard). Anlık değerlerin, grafiklerin ve son ölçümlerin gösterildiği kullanıcı arayüzünü içerir.
*   **`app.js`**: Ana sayfanın beyni olarak çalışır. Excel dosyasını sunucuya yükler, verileri saniye saniye işler, kartları ve grafikleri günceller.
*   **`style.css`**: Tüm uygulamanın (hem Dashboard hem ML sayfası) renk, boyut ve tasarım (Açık Tema) özelliklerini barındırır.
*   **`server.js`**: Node.js tabanlı ana sunucudur (Port: 3000). Kullanıcının yüklediği Excel dosyasını bellekte (RAM) tutar, içindeki verileri temizler ve sayfaya JSON formatında servis eder.
*   **`ml_module/`**: Makine Öğrenmesi ile ilgili tüm dosyaların düzenli durması için ayrılmış klasördür.
    *   **`ml.html`**: Makine Öğrenmesi modülünün arayüzüdür. Kullanıcının özellik ve hedef değişkenleri seçtiği, modelleri eğittiği sayfadır.
    *   **`ml.js`**: Makine Öğrenmesi sayfasının JavaScript kodudur. Python sunucusuyla iletişim kurar ve R² skor grafiklerini çizer.
    *   **`ml_server.py`**: Python tabanlı Makine Öğrenmesi sunucusudur (Port: 5000). Flask ile çalışır, Scikit-Learn kütüphanesini kullanarak modelleri eğitir ve test sonuçlarını (R², MAE, MSE, RMSE) geri gönderir.
*   **`package.json` & `package-lock.json`**: Node.js projesinin kütüphane bağımlılıklarını (express, multer, cors, xlsx) tanımlar.
*   **`node_modules/`**: Kurulan Node.js paketlerinin bulunduğu klasördür.

*(Klasörde kullanılmayan herhangi bir dosya tespit edilmemiştir, hepsi aktif olarak sistemin bir parçasıdır.)*

---

## 🚀 Projeyi Çalıştırma (Başlangıç Rehberi)

Sistemin düzgün çalışması için iki farklı sunucunun **aynı anda** çalıştırılması gerekmektedir. 

### Adım 1: Node.js Sunucusunu Başlatma (Dashboard İçin)
1. Yeni bir terminal/komut satırı penceresi açın.
2. Proje klasörüne gidin.
3. Şu komutu çalıştırın:
   ```bash
   node server.js
   ```
   *Ekranda "Node.js sunucusu çalışıyor: http://localhost:3000" yazısını görmelisiniz.*

### Adım 2: Python Sunucusunu Başlatma (Makine Öğrenmesi İçin)
1. **İkinci** bir terminal penceresi açın.
2. Proje klasörünün içindeki `ml_module` klasörüne gidin.
3. Şu komutu çalıştırın:
   ```bash
   cd ml_module
   python ml_server.py
   ```
   *Ekranda "Python ML sunucusu başlatılıyor: http://localhost:5000" yazısını görmelisiniz.*

### Adım 3: Tarayıcıdan Giriş
Herhangi bir web tarayıcısını (Chrome, Edge vb.) açın ve adres çubuğuna şunu yazın:
**http://localhost:3000**

---

## 💡 Nasıl Kullanılır?

### 1. Dashboard (Gözlem Ekranı)
*   Sisteme girdiğinizde sağ üstteki **"Excel Yükle"** butonuna tıklayın.
*   Sütunlarında `VOLTAJ`, `AKIM`, `GÜÇ`, `SICAKLIK` vb. başlıklar olan `.xlsx` formatındaki veri dosyanızı seçin.
*   Yükleme sonrası sistem verileri sanki canlı bir cihazdan geliyormuş gibi her 2 saniyede bir ekrana aktarmaya ve grafikleri çizmeye başlayacaktır.

### 2. Makine Öğrenmesi Modülü
*   Sağ üstteki **"Makine Öğrenmesi"** butonuna tıklayarak ilgili sayfaya geçin.
*   **Veri Kaynağı:** Tekrar Excel dosyanızı yükleyin.
*   **Hedef Değişken (Y):** Sistemin gelecekte tahmin etmesini istediğiniz değeri seçin (Örn: `GÜÇ`).
*   **Özellik Değişkenleri (X):** Sisteme tahmin yaparken ipucu olarak kullanması için vereceğiniz verileri seçin (Örn: `SICAKLIK`, `VOLTAJ`, `AKIM`).
*   **Eğitim Parametreleri:** Test oranını (genelde %20 idealdir) ve denemek istediğiniz algoritmaları seçin.
*   **Eğit ve Test Et:** Butona tıkladığınızda Python sunucusu verileri ayırır, modelleri eğitir ve hangi algoritmanın daha başarılı sonuç verdiğini R² skoru ile listeler.

---

## 🤖 Örnek Makine Öğrenmesi Senaryoları (X ve Y Seçimi)

Makine öğrenmesinde **Hedef Değişken (Y)** tahmin etmek istediğiniz sonuç, **Özellik Değişkenleri (X)** ise bu tahmini yaparken modele vereceğiniz ipuçlarıdır. Projenizdeki verilere göre amacınıza uygun şu senaryoları uygulayabilirsiniz:

### Senaryo 1: Hava Durumuna Göre Üretimi Tahmin Etmek (En Yaygın)
Güneş panellerinin ana amacı güç üretmektir. Eğer elinizdeki sıcaklık ve akım/voltaj değerlerine bakarak sistemin **ne kadar güç üreteceğini** tahmin etmek istiyorsanız:
*   **Hedef Değişken (Y):** `GÜÇ`
*   **Özellik Değişkenleri (X):** `SICAKLIK`, `VOLTAJ`, `AKIM`
*   **Açıklama:** Çünkü sıcaklık ve elektriksel değerler gücü doğrudan etkileyen faktörlerdir. Güç ise ortaya çıkan sonuçtur.

### Senaryo 2: Sıcaklığın Verim Üzerindeki Etkisini Ölçmek
Güneş panelleri çok ısındığında verimleri düşer. Eğer sistemin hangi sıcaklıkta çalışırken **ne kadar verim kaybı yaşayacağını** önceden tahmin etmek istiyorsanız:
*   **Hedef Değişken (Y):** `KAYBI` (Verim Kaybı)
*   **Özellik Değişkenleri (X):** `SICAKLIK`, `GÜÇ`, `VOLTAJ`, `AKIM`
*   **Açıklama:** Çünkü asıl bilmek istediğimiz şey (sonuç) sistemin ne kadar kayıp yaşadığıdır. Bunu da panele binen yüke (güç, akım) ve çevresel etmenlere (sıcaklık) bakarak hesaplatırız.

### Senaryo 3: Panel Arızasını Önceden Sezmek (Performans Tahmini)
Sistemin anlık elektriksel yüküne ve hava durumuna bakarak o an **gerçekte yüzde kaç performansla çalışması gerektiğini** bulmak istiyorsanız:
*   **Hedef Değişken (Y):** `ORANI` (Performans Oranı)
*   **Özellik Değişkenleri (X):** `GÜÇ`, `SICAKLIK`, `VOLTAJ`
*   **Açıklama:** Model size "Bu şartlar altında panelin performansı %92 olmalı" tahmini verir. Eğer dashboard üzerindeki gerçek performansınız örneğin %80'lerde ise, panelin kirlendiği veya teknik bir arıza yaşadığı sonucuna varabilirsiniz.
