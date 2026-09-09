"""Inspect production PDF exports and render print/mobile fixtures (WeasyPrint QA only).
Generate fixtures first: DOCUMENT_QA=1 npm test -- BillingDocument.test.tsx
Usage: python scripts/verify-documents.py path/to/weasyprint.exe
"""
from pathlib import Path
import concurrent.futures
import subprocess
import sys
import pymupdf

root = Path(__file__).resolve().parents[1]
output = root / 'output/pdf'
renderer = Path(sys.argv[1]).resolve()
widths = [320, 375, 390, 414, 768, 1024, 1440]
jobs = []
for kind in ('invoice', 'receipt'):
    html = (output / f'{kind}-print.html').read_text(encoding='utf-8')
    for width in widths:
        # WeasyPrint does not evaluate viewport media features. Resolve that one
        # breakpoint explicitly for this supplementary layout test, not browser QA.
        mobile = html.replace('@media screen and (max-width: 600px)', '@media screen' if width <= 600 else '@media not all')
        css = mobile[mobile.index('<style>')+7:mobile.index('</style>')]
        article = mobile[mobile.index('<article'):mobile.index('</article>')+10]
        extra = f'@page {{ size: {width}px 2400px; margin: 0; }} body {{ margin: 0; }}'
        fixture = output / f'{kind}-preview-{width}.html'
        fixture.write_text(f'<!doctype html><html><head><meta charset="utf-8"><style>{css}{extra}</style></head><body>{article}</body></html>', encoding='utf-8')
        jobs.append((fixture, output / f'{kind}-preview-{width}.pdf'))

def render(job):
    source, target = job
    subprocess.run([str(renderer), '-m', 'screen', str(source), str(target)], check=True, capture_output=True)
    return target
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    list(pool.map(render, jobs))

for path in output.glob('*.pdf'):
    doc = pymupdf.open(path)
    content = '\n'.join(page.get_text() for page in doc)
    assert 'Biki' in content and '1,145.00' in content and '6.15' in content, path.name
    assert all(word not in content for word in ('SEARCH', 'PROFILE', 'NOTIFICATIONS', 'SIDEBAR', 'Download PDF', 'My Bills')), path.name
    assert len(doc) == 1, (path.name, len(doc))
    for page in doc:
        for block in page.get_text('blocks'):
            assert block[0] >= -1 and block[2] <= page.rect.width + 1 and block[1] >= 0 and block[3] <= page.rect.height, (path.name, block)
    if 'preview' not in path.name or '320' in path.name or '768' in path.name:
        page = doc[0]
        blocks = page.get_text('blocks')
        bottom = min(page.rect.height, max(block[3] for block in blocks) + 20) if 'preview' in path.name else page.rect.height
        page.get_pixmap(matrix=pymupdf.Matrix(1.4,1.4), clip=pymupdf.Rect(0,0,page.rect.width,bottom)).save(path.with_suffix('.png'))
    print(path.name, 'PASS: content, no chrome, one page, within bounds')
