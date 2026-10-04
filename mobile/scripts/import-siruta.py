"""Import INS SIRUTA S1 2026 (CC BY 4.0); preserve IDs and modernize cedilla spelling."""
import csv, hashlib, io, json, pathlib, urllib.request
SOURCE = 'https://data.gov.ro/dataset/721c9059-5f87-4c79-9854-a1d5c18f58d5/resource/dac903f0-32b5-489a-89e7-2c80d96cf68d/download/siruta_s1_2026.csv'
def name(value):
    value = value.replace('Ş','Ș').replace('Ţ','Ț').replace('ş','ș').replace('ţ','ț')
    for prefix in ('JUDEȚUL ', 'MUNICIPIUL ', 'ORAȘ ', 'ORAȘUL ', 'COMUNA '):
        if value.startswith(prefix): value = value[len(prefix):]
    return value.title()
def build(raw):
    rows = list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig')), delimiter=';'))
    by_id = {r['SIRUTA']: r for r in rows}
    counties = {r['JUD']: {'name': name(r['DENLOC']), 'localities': []} for r in rows if r['NIV'] == '1'}
    for row in rows:
        if row['NIV'] != '3' and not (row['JUD'] == '40' and row['SIRUTA'] == '179132'): continue
        parent = by_id.get(row['SIRSUP'],row)
        counties[row['JUD']]['localities'].append({'id': row['SIRUTA'], 'name': name(row['DENLOC']), 'area': name(parent['DENLOC'])})
    for county in counties.values(): county['localities'].sort(key=lambda r: (r['name'], r['area'], r['id']))
    return sorted(counties.values(),key=lambda r:r['name'])
if __name__ == '__main__':
    raw = urllib.request.urlopen(SOURCE).read()
    data = build(raw)
    assert len(data) == 42 and sum(len(c['localities']) for c in data) == 13756
    root=pathlib.Path(__file__).resolve().parents[2]
    output=json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n'
    for path in (root/'mobile/src/data/romania-localities.json',root/'api/internal/server/data/romania-localities.json'): path.write_text(output)
    print('42 county entries; 13,756 locality entries; source SHA256:',hashlib.sha256(raw).hexdigest())
