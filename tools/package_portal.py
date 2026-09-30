"""Turn the zeus build (.zab) into the file amazfitwatchfaces.com wants.

    npm run build          # makes app/dist/*.zab
    python tools/package_portal.py [project-dir]     (default: app)

A .zab is a bundle: a zip holding manifest.json + one .zpk per device, and
each .zpk is a zip holding device.zip (+ app-side.zip). device.zip is the
watch face itself - app.json, app.js/app.bin, watchface/ and assets/ at its
root - which is the same .zip community editors produce and the catalog
accepts. This script digs it out and writes:

    release/Rampart_GMT_v<version>.zip   upload this to the catalog
    release/Rampart_GMT_v<version>.zpk   optional, for QR / sideload tools

Standard library only.
"""
import glob
import io
import json
import os
import sys
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def looks_like_face(zf):
    names = set(zf.namelist())
    has_json = "app.json" in names
    has_js = "app.js" in names or "app.bin" in names
    has_assets = any(n.startswith("assets/") for n in names)
    return has_json and has_js and has_assets


def find_device_zip(data, path="bundle", depth=0):
    """Depth-first search through nested zips for the watch face package.
    Returns (device_zip_bytes, zpk_bytes_or_None)."""
    if depth > 4:
        return None, None
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        return None, None
    if looks_like_face(zf):
        return data, None
    for name in zf.namelist():
        if name.lower().endswith((".zpk", ".zip", ".zab")):
            inner = zf.read(name)
            dev, zpk = find_device_zip(inner, f"{path}/{name}", depth + 1)
            if dev is not None:
                if zpk is None and name.lower().endswith(".zpk"):
                    zpk = inner
                return dev, zpk
    return None, None


def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else "app"
    project = "app"
    if arg.lower().endswith(".zab"):
        zabs = [arg]
    else:
        project = arg
        zabs = sorted(glob.glob(os.path.join(ROOT, project, "dist", "*.zab")), key=os.path.getmtime)
        if not zabs:
            sys.exit(f"No .zab found in {project}/dist - build that project first.")
    src = zabs[-1]
    with open(src, "rb") as f:
        dev, zpk = find_device_zip(f.read())
    if dev is None:
        sys.exit(f"Couldn't find the watch face (app.json + assets/) inside {os.path.basename(src)}.")

    with zipfile.ZipFile(io.BytesIO(dev)) as zf:
        app = json.loads(zf.read("app.json"))
    version = app.get("app", {}).get("version", {}).get("name", "0")
    name = app.get("app", {}).get("appName", "watchface").replace(" ", "_")
    # Other device projects get their model in the file name
    # (Rampart_GMT_Balance_v...), read from that project's own app.json.
    if project != "app":
        with open(os.path.join(ROOT, project, "app.json")) as f:
            target = next(iter(json.load(f)["targets"]))
        name += "_" + target.replace("-", " ").title().replace(" ", "_")

    out_dir = os.path.join(ROOT, "release")
    os.makedirs(out_dir, exist_ok=True)
    out_zip = os.path.join(out_dir, f"{name}_v{version}.zip")
    with open(out_zip, "wb") as f:
        f.write(dev)
    print(f"from   {os.path.relpath(src, ROOT)}")
    print(f"upload {os.path.relpath(out_zip, ROOT)}  ({len(dev) // 1024} KB)")
    if zpk:
        out_zpk = os.path.join(out_dir, f"{name}_v{version}.zpk")
        with open(out_zpk, "wb") as f:
            f.write(zpk)
        print(f"extra  {os.path.relpath(out_zpk, ROOT)}")


if __name__ == "__main__":
    main()
