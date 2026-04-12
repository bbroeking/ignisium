"""Headless Blender post-processing for batch-generated GLBs.

Pipeline (per GLB):
  1. Import, flatten/join meshes
  2. Mesh cleanup: merge by distance, recalc normals, remove loose, shade smooth
  3. Normalize transform: scale to max-dim=4, center XY, drop min-Z to 0,
     apply transforms (matches main.js normalizeBuildingGlb so runtime is no-op)
  4. Material tweaks: roughness=0.7, metallic=0, ensure base color hooked up
  5. LOD generation: export at 1.0, 0.5, 0.25, 0.10 of cleaned face count

Outputs:
  processed/<asset>.glb            (LOD0)
  processed/lods/<asset>_lod1.glb  (50%)
  processed/lods/<asset>_lod2.glb  (25%)
  processed/lods/<asset>_lod3.glb  (10%)
  processed/_report.csv

Usage (via wrapper):
  blender --background --python postprocess.py -- [input_folder] [--no-lods]

Defaults:
  input_folder = output/
"""
import bpy
import bmesh
import csv
import re
import sys
import time
import traceback
from pathlib import Path
from mathutils import Vector

TARGET_MAX_DIM = 4.0
LOD_RATIOS = [0.5, 0.25, 0.10]  # LOD1, LOD2, LOD3 (LOD0 is the cleaned mesh)
ROUGHNESS = 0.7
METALLIC = 0.0
MERGE_DISTANCE = 0.0001


# ---- arg parsing -----------------------------------------------------------

def parse_args():
    if "--" in sys.argv:
        argv = sys.argv[sys.argv.index("--") + 1:]
    else:
        argv = []
    folder = "output"
    no_lods = False
    for a in argv:
        if a == "--no-lods":
            no_lods = True
        elif not a.startswith("--"):
            folder = a
    return Path(folder), no_lods


# ---- scene helpers ---------------------------------------------------------

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images,
                  bpy.data.textures, bpy.data.armatures, bpy.data.objects,
                  bpy.data.node_groups):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def get_meshes():
    return [o for o in bpy.context.scene.objects if o.type == 'MESH']


def select_only(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


# ---- pipeline steps --------------------------------------------------------

def import_glb(path: Path):
    bpy.ops.import_scene.gltf(filepath=str(path))


def flatten_and_join():
    """Clear parents (keeping world transform), delete non-mesh objects,
    join all meshes into one. Returns joined object or None."""
    meshes = get_meshes()
    if not meshes:
        return None

    # Clear parents while preserving world transforms
    bpy.ops.object.select_all(action='SELECT')
    if bpy.context.selected_objects:
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')

    # Delete all non-mesh objects (empties left over from the GLB hierarchy)
    bpy.ops.object.select_all(action='DESELECT')
    for o in list(bpy.context.scene.objects):
        if o.type != 'MESH':
            o.select_set(True)
    if bpy.context.selected_objects:
        bpy.ops.object.delete()

    meshes = get_meshes()
    if not meshes:
        return None

    # Apply transforms on all meshes so geometry is in world coords
    bpy.ops.object.select_all(action='SELECT')
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # Join everything into one mesh
    if len(meshes) > 1:
        bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    return joined


def cleanup_mesh(obj):
    """Merge by distance, recalc normals, remove loose, drop zero-area faces,
    shade smooth."""
    select_only(obj)
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(obj.data)

    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=MERGE_DISTANCE)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))

    loose_verts = [v for v in bm.verts if not v.link_edges]
    if loose_verts:
        bmesh.ops.delete(bm, geom=loose_verts, context='VERTS')

    bm.faces.ensure_lookup_table()
    degenerate = [f for f in bm.faces if f.calc_area() < 1e-10]
    if degenerate:
        bmesh.ops.delete(bm, geom=degenerate, context='FACES')

    bmesh.update_edit_mesh(obj.data)
    bpy.ops.object.mode_set(mode='OBJECT')

    for poly in obj.data.polygons:
        poly.use_smooth = True


def normalize_transform(obj):
    """Scale to TARGET_MAX_DIM, center XY at origin, drop min-Z to 0.
    Bakes transforms into geometry."""
    select_only(obj)

    # Bbox from mesh in current world space (transforms already applied earlier
    # but call again for safety after joining).
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    coords = [obj.matrix_world @ v.co for v in obj.data.vertices]
    if not coords:
        return
    mins = Vector((min(c[i] for c in coords) for i in range(3)))
    maxs = Vector((max(c[i] for c in coords) for i in range(3)))
    size = maxs - mins
    max_dim = max(size.x, size.y, size.z)
    if max_dim <= 0:
        return

    scale = TARGET_MAX_DIM / max_dim
    obj.scale = (scale, scale, scale)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    # Recompute bbox after scaling, then translate.
    coords = [obj.matrix_world @ v.co for v in obj.data.vertices]
    mins = Vector((min(c[i] for c in coords) for i in range(3)))
    maxs = Vector((max(c[i] for c in coords) for i in range(3)))
    size = maxs - mins

    # Blender Z-up: center X and Y, drop min Z to 0.
    # On glTF export with Y-up (default), Blender Z becomes glTF Y, so the
    # building lands on the ground in three.js as expected.
    obj.location.x -= (mins.x + size.x / 2.0)
    obj.location.y -= (mins.y + size.y / 2.0)
    obj.location.z -= mins.z
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)


def fix_materials(obj):
    """Generic PBR pass. Set roughness/metallic on every Principled BSDF
    found in the object's materials. If a base color texture is present but
    not connected, hook it up."""
    for slot in obj.material_slots:
        mat = slot.material
        if mat is None or not mat.use_nodes:
            continue
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf is None:
            continue
        if 'Roughness' in bsdf.inputs:
            bsdf.inputs['Roughness'].default_value = ROUGHNESS
        if 'Metallic' in bsdf.inputs:
            bsdf.inputs['Metallic'].default_value = METALLIC
        base = bsdf.inputs.get('Base Color')
        if base is not None and not base.is_linked:
            tex = next((n for n in nodes
                        if n.type == 'TEX_IMAGE' and n.image is not None), None)
            if tex is not None:
                links.new(tex.outputs['Color'], base)


def decimate_copy(source, ratio: float):
    """Duplicate source, apply Decimate at ratio. Returns the new object."""
    select_only(source)
    bpy.ops.object.duplicate()
    dup = bpy.context.view_layer.objects.active
    if ratio < 1.0:
        mod = dup.modifiers.new(name="DEC", type='DECIMATE')
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return dup


def export_glb(path: Path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    select_only(obj)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
    )


def face_count(obj):
    return len(obj.data.polygons) if (obj and obj.type == 'MESH') else 0


# ---- per-asset orchestration ----------------------------------------------

def asset_name_from(stem: str) -> str:
    """Strip trailing _YYYYMMDD_HHMMSS timestamp added by batch.py."""
    return re.sub(r'_\d{8}_\d{6}$', '', stem)


def process_one(glb_path: Path, out_dir: Path, lods_dir: Path, do_lods: bool):
    asset = asset_name_from(glb_path.stem)
    print(f"\n=== {asset}  ({glb_path.name}) ===")
    t0 = time.time()

    clear_scene()
    import_glb(glb_path)

    src_faces = sum(face_count(o) for o in get_meshes())
    print(f"  Imported: {src_faces} faces")

    joined = flatten_and_join()
    if joined is None:
        print("  No mesh objects, skipping")
        return None

    cleanup_mesh(joined)
    normalize_transform(joined)
    fix_materials(joined)

    cleaned_faces = face_count(joined)
    lod0_path = out_dir / f"{asset}.glb"
    export_glb(lod0_path, joined)
    lod0_size = lod0_path.stat().st_size
    print(f"  LOD0: {cleaned_faces} faces, {lod0_size/1e6:.2f} MB -> {lod0_path.name}")

    lod_stats = []
    if do_lods:
        for i, ratio in enumerate(LOD_RATIOS, start=1):
            dup = decimate_copy(joined, ratio)
            lf = face_count(dup)
            lp = lods_dir / f"{asset}_lod{i}.glb"
            export_glb(lp, dup)
            ls = lp.stat().st_size
            print(f"  LOD{i}: {lf} faces, {ls/1e6:.2f} MB -> lods/{lp.name}")
            lod_stats.append((i, lf, ls))
            select_only(dup)
            bpy.ops.object.delete()

    elapsed = time.time() - t0
    print(f"  Done in {elapsed:.1f}s")
    return {
        "asset": asset,
        "src_faces": src_faces,
        "lod0_faces": cleaned_faces,
        "lod0_bytes": lod0_size,
        "lods": lod_stats,
        "elapsed": elapsed,
    }


# ---- main ------------------------------------------------------------------

def main():
    here = Path(__file__).parent.resolve()
    input_folder, no_lods = parse_args()
    if not input_folder.is_absolute():
        input_folder = here / input_folder

    if not input_folder.exists():
        print(f"ERROR: Input folder not found: {input_folder}")
        sys.exit(1)

    glbs = sorted(input_folder.glob("*.glb"))
    if not glbs:
        print(f"No GLBs in {input_folder}")
        sys.exit(0)

    out_dir = here / "processed"
    lods_dir = out_dir / "lods"
    out_dir.mkdir(exist_ok=True)
    lods_dir.mkdir(exist_ok=True)

    print(f"Post-processing {len(glbs)} GLB(s)")
    print(f"  Input:  {input_folder}")
    print(f"  Output: {out_dir}")
    print(f"  LODs:   {'off' if no_lods else 'on (0.5, 0.25, 0.10)'}")

    results = []
    for glb in glbs:
        try:
            r = process_one(glb, out_dir, lods_dir, do_lods=not no_lods)
            if r:
                results.append(r)
        except Exception as e:
            print(f"  FAILED on {glb.name}: {e}")
            traceback.print_exc()

    report = out_dir / "_report.csv"
    with open(report, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow([
            "asset", "src_faces", "lod0_faces", "lod0_MB",
            "lod1_faces", "lod1_MB",
            "lod2_faces", "lod2_MB",
            "lod3_faces", "lod3_MB",
            "elapsed_s",
        ])
        for r in results:
            row = [r["asset"], r["src_faces"], r["lod0_faces"],
                   f"{r['lod0_bytes']/1e6:.2f}"]
            lods = {i: (faces, size) for i, faces, size in r["lods"]}
            for i in (1, 2, 3):
                if i in lods:
                    row.extend([lods[i][0], f"{lods[i][1]/1e6:.2f}"])
                else:
                    row.extend(["", ""])
            row.append(f"{r['elapsed']:.1f}")
            w.writerow(row)

    print(f"\n{'='*50}")
    print(f"Done: {len(results)}/{len(glbs)} processed")
    print(f"Report: {report}")


if __name__ == "__main__":
    main()
