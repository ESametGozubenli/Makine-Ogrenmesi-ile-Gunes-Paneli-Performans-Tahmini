import requests, json, sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
url = 'http://localhost:5000'

# Tum xlsx dosyalari listele
print("Dosyalar:", [f for f in os.listdir('..') if f.endswith('.xlsx')])

# Ilk xlsx dosyasini yukle
for fname in os.listdir('..'):
    if fname.endswith('.xlsx'):
        fpath = os.path.join('..', fname)
        print(f"\n--- {fname} ---")
        with open(fpath, 'rb') as f:
            r = requests.post(url+'/ml/upload', files={'excel': (fname, f)}, timeout=15)
            d = r.json()
            print('Status:', r.status_code)
            if 'error' in d:
                print('HATA:', d['error'])
            else:
                print('Kolonlar:', d.get('columns'))
                print('Satir:', d.get('rows'))
                
                # Egitim testi
                cols = d.get('columns', [])
                target = None
                features = []
                for c in cols:
                    cu = c.upper().replace('\u0130','I').replace('\u011e','G').replace('\u015e','S').replace('\u00c7','C').replace('\u00d6','O').replace('\u00dc','U')
                    if 'RETILEN' in cu and 'G' in cu:
                        target = c
                    else:
                        features.append(c)
                
                if target:
                    print(f'Hedef: {target}, Ozellikler: {features}')
                    payload = {
                        'features': features,
                        'target': target,
                        'algorithms': ['Linear Regression','Random Forest','Gradient Boosting','LightGBM','XGBoost'],
                        'test_size': 0.2
                    }
                    r2 = requests.post(url+'/ml/train', json=payload, timeout=60)
                    d2 = r2.json()
                    print('Train response keys:', sorted(d2.keys()))
                    print('target_std var mi?', 'target_std' in d2)
                    print()
                    for res in d2.get('results', []):
                        if 'error' in res:
                            print(f"  {res['algorithm']}: HATA")
                        else:
                            print(f"  {res['algorithm']:30s} R2={res['r2']:.4f} r2_raw={res.get('r2_raw', 'YOK')} MAE={res['mae']}")
                    print("Uyarilar:", d2.get('warnings', []))
        break
