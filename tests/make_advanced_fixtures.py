"""Create independent DXF fixtures; ezdxf is development-only tooling."""
from pathlib import Path
import json
import ezdxf

folder = Path(__file__).resolve().parent / "fixtures"
folder.mkdir(parents=True, exist_ok=True)
manifest = {}

def save(name, doc, expected):
    audit = doc.audit()
    assert not audit.errors and not audit.fixes, (name, audit.errors, audit.fixes)
    doc.saveas(folder / name)
    manifest[name] = expected
    print(f"PASS fixture {name}: entities={len(doc.modelspace())}, audit errors=0 fixes=0")

doc = ezdxf.new("R2007")
doc.layers.new("الجدران", dxfattribs={"color": 3})
doc.layers.new("Hidden", dxfattribs={"color": 1})
doc.layers.get("Hidden").off()
m = doc.modelspace()
m.add_line((-12.5, 3.25), (22, 7.5), dxfattribs={"layer": "الجدران"})
m.add_circle((25, 30), 7.5)
m.add_arc((80, 60), 12, start_angle=30, end_angle=240)
m.add_text("غرفة مكتب — Room 01", dxfattribs={"height": 8, "insert": (10, 85), "layer": "الجدران"})
m.add_line((0, 0), (5, 0), dxfattribs={"layer": "Hidden"})
save("advanced-basic.dxf", doc, {"types": ["LINE", "CIRCLE", "ARC", "TEXT", "LINE"], "arabic": "غرفة مكتب — Room 01", "arc_degrees": [30, 240]})

doc = ezdxf.new("R2007")
block = doc.blocks.new("FixtureBlock")
block.add_line((0, 0), (10, 0))
block.add_circle((5, 5), 2)
doc.modelspace().add_blockref("FixtureBlock", (100, 200), dxfattribs={"xscale": 2, "yscale": 2, "rotation": 90})
save("advanced-blocks.dxf", doc, {"line": [[100, 200], [100, 220]], "circle_center": [90, 210], "circle_radius": 4})

doc = ezdxf.new("R2007")
inner = doc.blocks.new("Inner")
inner.add_line((0, 0), (10, 0))
outer = doc.blocks.new("Outer")
outer.add_blockref("Inner", (10, 0), dxfattribs={"rotation": 90})
doc.modelspace().add_blockref("Outer", (100, 0), dxfattribs={"xscale": 2, "yscale": 2})
save("advanced-nested-blocks.dxf", doc, {"line": [[120, 0], [120, 20]]})

doc = ezdxf.new("R2007")
m = doc.modelspace()
m.add_lwpolyline([(0, 0, 1), (10, 0, 0)], format="xyb")
m.add_ellipse((30, 0), major_axis=(8, 0), ratio=0.5)
m.add_open_spline([(50, 0), (50, 10), (60, 10), (60, 0)], degree=3)
save("advanced-curves.dxf", doc, {
    "bulge_semicircle": {"center": [5, 0], "radius": 5, "bounds": [[0, -5], [10, 0]], "midpoint": [5, -5]},
    "ellipse": {"bounds": [[22, -4], [38, 4]]},
    "cubic_spline": {"bounds": [[50, 0], [60, 7.5]], "midpoint": [55, 7.5]},
})

doc = ezdxf.new("R2007")
m = doc.modelspace()
dim = m.add_linear_dim(base=(0, 20), p1=(0, 0), p2=(100, 0), angle=0, dimstyle="EZDXF")
dim.render()
save("advanced-dimension.dxf", doc, {"measured_length": 100, "dimension_line_y": 20, "rendered_block": dim.dimension.dxf.geometry})

doc = ezdxf.new("R2007")
m = doc.modelspace()
m.add_line((0, 0), (10, 0))
m.add_3dface([(0, 0, 0), (5, 0, 1), (5, 5, 1), (0, 5, 0)])
save("advanced-unsupported3d.dxf", doc, {"supported_line": [[0, 0], [10, 0]], "unsupported_types": ["3DFACE"]})

(folder / "advanced-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
