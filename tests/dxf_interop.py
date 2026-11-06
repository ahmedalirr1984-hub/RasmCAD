"""Independent parser checks for browser-generated files; not an app dependency."""
from pathlib import Path
import math
import sys
import ezdxf

directory = Path(sys.argv[1] if len(sys.argv) > 1 else "build/test-artifacts")

def check(condition, message):
    if not condition:
        raise AssertionError(message)

def audit_clean(document, filename):
    audit = document.audit()
    check(not audit.errors, f"{filename}: independent DXF audit errors: {audit.errors}")
    check(not audit.fixes, f"{filename}: independent DXF audit made repairs: {audit.fixes}")
    check(document.header.get("$INSUNITS") == 0, f"{filename}: drawing units must remain unitless")
    lines = (directory / filename).read_text(encoding="utf-8").splitlines()
    check(len(lines) % 2 == 0, f"{filename}: complete DXF code/value pairs")
    records = []
    current = None
    for i in range(0, len(lines), 2):
        code, value = int(lines[i]), lines[i + 1]
        if code == 0:
            if current is not None:
                records.append(current)
            current = [(code, value)]
        elif current is not None:
            current.append((code, value))
    if current is not None:
        records.append(current)
    handles = []
    for record in records:
        if record[0][1] in {"TABLE", "LAYER", "LINE", "LWPOLYLINE", "CIRCLE", "ARC", "TEXT"}:
            record_handles = [value.upper() for code, value in record if code == 5]
            check(len(record_handles) == 1 and int(record_handles[0], 16) > 0,
                  f"{filename}: {record[0][1]} requires one nonzero handle")
            handles.extend(record_handles)
    check(len(handles) == len(set(handles)), f"{filename}: exported handles must be unique")
    print(f"PASS {filename}: audit errors=0 fixes=0 INSUNITS=0; {len(handles)} unique handles")

doc = ezdxf.readfile(directory / "roundtrip.dxf")
check(doc.dxfversion == "AC1021", "export is R2007 UTF-8 DXF")
entities = list(doc.modelspace())
check([e.dxftype() for e in entities] == ["LINE", "LWPOLYLINE", "CIRCLE", "ARC", "TEXT"], "supported entity types independently readable")
check(tuple(entities[0].dxf.start)[:2] == (0, 0), "line start preserved")
check(tuple(entities[0].dxf.end)[:2] == (100, 50), "line end preserved")
check(entities[0].dxf.layer == "الجدران", "Arabic layer assignment preserved")
check(entities[1].closed, "polyline closing flag preserved")
check(math.isclose(entities[2].dxf.radius, 7.5), "circle radius preserved")
check(math.isclose(entities[3].dxf.start_angle, 30), "arc start uses DXF degrees")
check(math.isclose(entities[3].dxf.end_angle, 240), "arc end uses DXF degrees")
check(entities[4].dxf.text == "غرفة مكتب — Room 01", "Arabic text preserved")
audit_clean(doc, "roundtrip.dxf")

dim = ezdxf.readfile(directory / "dimensions.dxf")
check(len(dim.modelspace().query("LINE")) >= 3, "dimension exports visible lines")
check(len(dim.modelspace().query("TEXT")) >= 1, "dimension exports measurement text")
audit_clean(dim, "dimensions.dxf")
legacy = ezdxf.readfile(directory / "legacy-plan.dxf")
check(len(legacy.modelspace()) >= 77, "legacy architectural project exports all visible geometry")
audit_clean(legacy, "legacy-plan.dxf")
sample = ezdxf.readfile(directory / "sample-plan.dxf")
check(len(sample.modelspace()) > 20, "sample independently readable")
audit_clean(sample, "sample-plan.dxf")
print("PASS independent ezdxf parsing/audit, geometry, Arabic, dimensions and legacy plan")
