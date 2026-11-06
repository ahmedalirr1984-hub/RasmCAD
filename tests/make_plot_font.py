"""Rebuild the offline PDF font data from vendor/plot-font-source.ttf.
Requires development-only fontTools. Run from Source: python tests/make_plot_font.py
The original DejaVu font and its license are retained in vendor.
"""
from pathlib import Path
from io import BytesIO
import base64,json,re
from fontTools import subset
from fontTools.ttLib import TTFont
ROOT=Path(__file__).resolve().parents[1]
font=TTFont(ROOT/'vendor/plot-font-source.ttf',recalcTimestamp=False)
options=subset.Options();options.recalc_timestamp=False;options.canonical_order=True
options.layout_features=['*'];options.name_IDs=['*'];options.name_legacy=True
processor=subset.Subsetter(options=options)
ranges=[(0x20,0x24f),(0x370,0x52f),(0x590,0x77f),(0x8a0,0x8ff),(0x2000,0x206f),(0x20a0,0x20cf),(0x2190,0x22ff),(0xfb1d,0xfdff),(0xfe70,0xfeff)]
processor.populate(unicodes=[code for a,b in ranges for code in range(a,b+1)])
processor.subset(font)
for record in font['name'].names:
 if record.nameID in [1,3,4,6]:record.string=('RasmCADPlot' if record.nameID==6 else 'RasmCAD Plot').encode(record.getEncoding(),errors='replace')
stream=BytesIO();font.save(stream,reorderTables=True)
font=TTFont(BytesIO(stream.getvalue()))
cmap={str(code):font.getGlyphID(name) for code,name in font.getBestCmap().items()}
widths={str(font.getGlyphID(name)):width for name,(width,_) in font['hmtx'].metrics.items()}
head=font['head'];hhea=font['hhea']
data={'base64':base64.b64encode(stream.getvalue()).decode(),'cmap':cmap,'widths':widths,'units':head.unitsPerEm,'bbox':[head.xMin,head.yMin,head.xMax,head.yMax],'ascent':hhea.ascent,'descent':hhea.descent}
path=ROOT/'src/plot.js';source=path.read_text()
start=source.index('/* FONT_DATA_START */');end=source.index('/* FONT_DATA_END */',start)+len('/* FONT_DATA_END */')
source=source[:start]+'/* FONT_DATA_START */\nconst FONT='+json.dumps(data,separators=(',',':'))+';\n/* FONT_DATA_END */'+source[end:]
path.write_text(source)
print('Embedded offline subset:',len(stream.getvalue()),'bytes,',len(cmap),'Unicode mappings')
