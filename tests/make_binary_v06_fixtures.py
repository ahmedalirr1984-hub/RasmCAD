"""Create paired ASCII/binary DXF fixtures using development-only ezdxf.

These are synthetic independent regression drawings, not Autodesk samples.
Run from the project directory with Python and ezdxf installed.
"""
from pathlib import Path
import ezdxf

out = Path(__file__).resolve().parent / "fixtures"
out.mkdir(exist_ok=True)

for label, version, encoding, text in [
    ("r12", "R12", "cp1252", "Cafe \u00e9"),
    ("r2000-arabic", "R2000", "cp1256", "\u0645\u062e\u0637\u0637 \u0645\u0643\u062a\u0628"),
    ("r2018-unicode", "R2018", "utf8", "\u0645\u062e\u0637\u0637 \u6e2c\u8a66 \U0001f4d0"),
]:
    drawing = ezdxf.new(version)
    drawing.encoding = encoding
    drawing.layers.new("WORK", dxfattribs={"color": 3})
    drawing.layers.new("LOCKED", dxfattribs={"color": 2})
    drawing.layers.get("LOCKED").lock()
    drawing.header["$CLAYER"] = "WORK"
    model = drawing.modelspace()
    item = model.add_line((10.25, -20.5), (110.25, 79.5), dxfattribs={"layer": "WORK"})
    if version == "R2018":
        item.rgb = (12, 145, 230)
    model.add_circle((40, 50), 12.5, dxfattribs={"layer": "LOCKED"})
    model.add_text(text, dxfattribs={"height": 4, "insert": (0, 80), "layer": "WORK"})
    block = drawing.blocks.new("SYMBOL")
    block.add_line((0, 0), (10, 0))
    block.add_circle((5, 5), 3)
    model.add_blockref("SYMBOL", (100, 100), dxfattribs={"layer": "WORK"})
    drawing.saveas(out / f"binary-v06-{label}-ascii.dxf", fmt="asc")
    drawing.saveas(out / f"binary-v06-{label}.dxf", fmt="bin")

print("Created three paired synthetic ASCII/binary fixtures with ezdxf " + ezdxf.__version__)
