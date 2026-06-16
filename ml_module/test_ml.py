import requests

# 1) Upload
with open('../sadeleşmiş_veri_DÜZELTİLMİŞ.xlsx', 'rb') as f:
    r = requests.post('http://localhost:5000/ml/upload', files={'excel': f})
    data = r.json()
    print('Columns:', data['columns'])
    print('Quality Report:')
    for col, q in data.get('quality_report', {}).items():
        print(f'  {col}: {q}')

# 2) GUC tahmini
cols = data['columns']
features = [c for c in cols if 'AKIM' in c or 'SICAK' in c or 'VOLTAJ' in c]
target = [c for c in cols if 'RET' in c or 'GUC' in c or 'G\u00dc\u00c7' in c][0]

print(f'\nFeatures: {features}')
print(f'Target: {target}')

r2 = requests.post('http://localhost:5000/ml/train', json={
    'features': features,
    'target': target,
    'test_size': 0.2
})
result = r2.json()
print(f'\nTarget CV: {result.get("target_cv")}')
print(f'Target std: {result.get("target_std")}')
print(f'Target mean: {result.get("target_mean")}')
print(f'Warnings: {result.get("warnings", [])}')
print(f'Train rows: {result.get("train_rows")}')
print(f'Test rows: {result.get("test_rows")}')
print('\nResults:')
for algo in result['results']:
    name = algo['algorithm']
    r2v = algo.get('r2')
    r2raw = algo.get('r2_raw')
    mae = algo.get('mae')
    print(f'  {name:25s}  R2={r2v}  R2_raw={r2raw}  MAE={mae}')

# 3) Performans Orani
target3 = [c for c in cols if 'PERFORMANS' in c or 'ORANI' in c][0]
features3 = [c for c in cols if c != target3 and ('AKIM' in c or 'SICAK' in c or 'VOLTAJ' in c)]
print(f'\n--- PERFORMANS ---')
print(f'Features: {features3}')
print(f'Target: {target3}')
r3 = requests.post('http://localhost:5000/ml/train', json={
    'features': features3,
    'target': target3,
    'test_size': 0.2
})
result3 = r3.json()
print(f'Target CV: {result3.get("target_cv")}')
print(f'Warnings: {result3.get("warnings", [])}')
for algo in result3['results']:
    name = algo['algorithm']
    r2v = algo.get('r2')
    r2raw = algo.get('r2_raw')
    print(f'  {name:25s}  R2={r2v}  R2_raw={r2raw}')
