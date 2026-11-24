import os
import sys
import types
import time
import numpy as np
import torch
import mcubes
import trimesh
import rembg
from PIL import Image

# --- 1. Shims for macOS (CPU PyMCubes in place of CUDA torchmcubes) ---
torchmcubes_mod = types.ModuleType("torchmcubes")
def _mcubes_shim(volume, threshold):
    vol_np = volume.detach().cpu().numpy().astype(np.float32)
    verts, faces = mcubes.marching_cubes(vol_np, float(threshold))
    verts = verts[:, [2, 1, 0]].copy().astype(np.float32)
    faces = faces[:, [0, 2, 1]].copy().astype(np.int64)
    return torch.from_numpy(verts), torch.from_numpy(faces)

torchmcubes_mod.marching_cubes = _mcubes_shim
sys.modules["torchmcubes"] = torchmcubes_mod

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, ".triposr"))

from tsr.system import TSR
from tsr.utils import remove_background, resize_foreground


def prep_image(img_path: str, rembg_session, ratio: float = 0.85) -> Image.Image:
    """Use TripoSR's official rembg + resize_foreground + 0.5 grey composite."""
    im = Image.open(img_path).convert("RGB")
    fg = remove_background(im, rembg_session)
    fg = resize_foreground(fg, ratio)
    arr = np.asarray(fg, dtype=np.float32) / 255.0
    comp = arr[:, :, :3] * arr[:, :, 3:4] + (1.0 - arr[:, :, 3:4]) * 0.5
    return Image.fromarray((np.clip(comp, 0.0, 1.0) * 255.0).astype(np.uint8))


def normalize_mesh(mesh: trimesh.Trimesh, target_height: float = 1.85, extra_yaw: float = 0.0) -> trimesh.Trimesh:
    """Orient TripoSR NeRF output upright (Y-up, front facing +Z), rest at y=0, and clean normals."""
    # TripoSR NeRF coords -> standard Y-up, camera-facing side at +Z
    mesh.apply_transform(trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0]))
    mesh.apply_transform(trimesh.transformations.rotation_matrix(-np.pi / 2, [0, 1, 0]))
    if abs(extra_yaw) > 1e-5:
        mesh.apply_transform(trimesh.transformations.rotation_matrix(extra_yaw, [0, 1, 0]))

    # Keep largest connected component to drop any tiny floating specks
    components = mesh.split(only_watertight=False)
    if len(components) > 1:
        mesh = max(components, key=lambda c: len(c.vertices))

    bounds = mesh.bounds
    h = float(bounds[1][1] - bounds[0][1])
    if h > 1e-5:
        mesh.apply_scale(target_height / h)

    bounds = mesh.bounds
    cx = 0.5 * (bounds[0][0] + bounds[1][0])
    cz = 0.5 * (bounds[0][2] + bounds[1][2])
    min_y = bounds[0][1]
    mesh.apply_translation([-cx, -min_y, -cz])

    trimesh.repair.fix_winding(mesh)
    trimesh.repair.fix_normals(mesh)
    return mesh


def main():
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"Using device: {device}")

    t0 = time.time()
    print("Loading stabilityai/TripoSR & rembg...")
    rembg_session = rembg.new_session()
    model = TSR.from_pretrained("stabilityai/TripoSR", config_name="config.yaml", weight_name="model.ckpt")
    model.renderer.set_chunk_size(8192)
    try:
        model.to(device)
    except Exception as e:
        print(f"MPS .to() fallback to CPU: {e}")
        device = "cpu"
        model.to(device)
    print(f"Models loaded in {time.time() - t0:.1f}s")

    # Note: dog_side.png gives full 3D body/leg/tail depth for quadruped TripoSR reconstruction;
    # extra_yaw = -np.pi / 2 turns the right-facing profile so the dog's nose faces +Z!
    jobs = [
        ("boat_guy", os.path.join(ROOT, "turnarounds", "boat_front.png"), os.path.join(ROOT, "output", "photoreal_boat_guy.glb"), 1.85, 256, 0.0),
        ("denim_guy", os.path.join(ROOT, "turnarounds", "denim_front.png"), os.path.join(ROOT, "output", "photoreal_denim_guy.glb"), 1.85, 256, 0.0),
        ("cavalier_dog", os.path.join(ROOT, "turnarounds", "dog_side.png"), os.path.join(ROOT, "output", "photoreal_cavalier_dog.glb"), 0.56, 256, -np.pi / 2),
    ]

    debug_dir = "/Users/angelo/.gemini/antigravity/brain/45857759-2288-4c59-b707-370644eb3fce/scratch"
    os.makedirs(debug_dir, exist_ok=True)
    os.makedirs(os.path.join(ROOT, "output"), exist_ok=True)

    only = set(sys.argv[1:]) if len(sys.argv) > 1 else None
    for name, src_path, out_path, target_h, mc_res, extra_yaw in jobs:
        if only and name not in only:
            continue
        t_start = time.time()
        img = prep_image(src_path, rembg_session, ratio=0.85)
        img.save(os.path.join(debug_dir, f"triposr_in_{name}.png"))

        print(f"[{name}] Running TripoSR inference (res={mc_res})...")
        try:
            with torch.no_grad():
                scene_codes = model([img], device=device)
                meshes = model.extract_mesh(scene_codes, has_vertex_color=True, resolution=mc_res)
        except Exception as e:
            print(f"[{name}] MPS error ({e}), retrying on CPU...")
            device = "cpu"
            model.to(device)
            with torch.no_grad():
                scene_codes = model([img], device=device)
                meshes = model.extract_mesh(scene_codes, has_vertex_color=True, resolution=mc_res)

        mesh = normalize_mesh(meshes[0], target_height=target_h, extra_yaw=extra_yaw)
        if mesh.visual.vertex_colors is not None:
            vc = np.asarray(mesh.visual.vertex_colors)
            if vc.dtype != np.uint8:
                vc = np.clip(vc * 255.0, 0, 255).astype(np.uint8)
                mesh.visual.vertex_colors = vc

        mesh.export(out_path)
        size_mb = os.path.getsize(out_path) / (1024 * 1024)
        print(f"[{name}] Saved {out_path}: {len(mesh.vertices)} verts, {len(mesh.faces)} faces, {size_mb:.2f} MB ({time.time() - t_start:.1f}s)")


if __name__ == "__main__":
    main()
