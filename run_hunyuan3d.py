#!/usr/bin/env python3
"""Generate multi-view photorealistic textured .GLB meshes using Hunyuan3D-2mv + Hunyuan3D-Paint on Apple MPS."""

import argparse
import os
import sys
import time
from pathlib import Path

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import cv2
import numpy as np
import torch
import trimesh
from PIL import Image
from rembg import remove, new_session

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / ".hunyuan3d"))

from hy3dgen.shapegen import (
    Hunyuan3DDiTFlowMatchingPipeline,
    FloaterRemover,
    DegenerateFaceRemover,
    FaceReducer,
)
from hy3dgen.texgen import Hunyuan3DPaintPipeline


SUBJECTS = {
    "boat": {
        "views": {
            "front": (ROOT / "turnarounds/boat_front.png", 0.0),
            "left": (ROOT / "turnarounds/boat_side.png", 0.03),
            "back": (ROOT / "turnarounds/boat_back.png", 0.0),
        },
        "out": ROOT / "output/photoreal_boat_guy.glb",
        "pilot_out": ROOT / "output/hy3d_test_boat.glb",
        "target_height": 1.78,
    },
    "denim": {
        "views": {
            "front": (ROOT / "turnarounds/denim_front.png", 0.0),
            # Trim 9% left/right edges to crop out adjacent-view hand slivers on the turnaround sheet
            "left": (ROOT / "turnarounds/denim_side.png", 0.09),
            "back": (ROOT / "turnarounds/denim_back.png", 0.0),
        },
        "out": ROOT / "output/photoreal_denim_guy.glb",
        "target_height": 1.78,
    },
    "dog": {
        "views": {
            "front": (ROOT / "turnarounds/dog_front.png", 0.0),
            # dog_side.png faces right (head right, tail left)
            "right": (ROOT / "turnarounds/dog_side.png", 0.02),
            "back": (ROOT / "turnarounds/dog_back.png", 0.0),
        },
        "out": ROOT / "output/photoreal_cavalier_dog.glb",
        "target_height": 0.56,
    },
}


def get_rembg_session():
    for model_name in ("bria-rmbg", "u2net"):
        try:
            return new_session(model_name), model_name
        except Exception:
            continue
    return None, "default"


def cutout_rgba(path: Path, session, trim_lr: float = 0.0) -> Image.Image:
    im = Image.open(path).convert("RGB")
    if trim_lr > 0:
        w, h = im.size
        pad = int(w * trim_lr)
        cropped = im.crop((pad, 0, w - pad, h))
        # Pad back with corner background color so framing stays centered
        bg = tuple(int(c) for c in np.array(im)[4, 4])
        canvas = Image.new("RGB", (w, h), bg)
        canvas.paste(cropped, (pad, 0))
        im = canvas

    rgba = remove(im, session=session) if session is not None else remove(im)
    arr = np.array(rgba)
    alpha = (arr[:, :, 3] > 24).astype(np.uint8)
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(alpha, connectivity=8)
    if num_labels > 1:
        areas = stats[1:, cv2.CC_STAT_AREA]
        max_area = areas.max()
        keep_mask = np.zeros_like(alpha, dtype=bool)
        for idx, area in enumerate(areas, start=1):
            if area >= max_area * 0.04:
                keep_mask |= (labels == idx)
        arr[~keep_mask, 3] = 0
    return Image.fromarray(arr, mode="RGBA")


def normalize_mesh_upright(mesh, target_dim: float):
    if isinstance(mesh, trimesh.Scene):
        # Preserve textures while normalizing transform at scene level if single geometry,
        # or concatenate only if untextured.
        bounds = mesh.bounds
        extents = bounds[1] - bounds[0]
        scale = target_dim / max(float(extents.max()), 1e-4)
        center_xz = (bounds[0] + bounds[1]) * 0.5
        mat = np.eye(4)
        mat[:3, :3] *= scale
        mat[0, 3] = -center_xz[0] * scale
        mat[1, 3] = -bounds[0][1] * scale
        mat[2, 3] = -center_xz[2] * scale
        mesh.apply_transform(mat)
        return mesh

    bounds = mesh.bounds
    extents = bounds[1] - bounds[0]
    scale = target_dim / max(float(extents.max()), 1e-4)
    center = (bounds[0] + bounds[1]) * 0.5
    v = mesh.vertices.copy()
    v[:, 0] = (v[:, 0] - center[0]) * scale
    v[:, 1] = (v[:, 1] - bounds[0][1]) * scale
    v[:, 2] = (v[:, 2] - center[2]) * scale
    mesh.vertices = v
    return mesh


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("subjects", nargs="*", default=["boat"])
    parser.add_argument("--pilot", action="store_true", help="Write to hy3d_test_*.glb instead of overwriting output/photoreal_*.glb")
    parser.add_argument("--steps", type=int, default=30)
    parser.add_argument("--octree", type=int, default=320)
    parser.add_argument("--max-faces", type=int, default=45000)
    parser.add_argument("--tex-size", type=int, default=1024)
    parser.add_argument("--skip-paint", action="store_true")
    args = parser.parse_args()

    device = "mps" if torch.backends.mps.is_available() else ("cuda" if torch.cuda.is_available() else "cpu")
    dtype = torch.float16 if device in ("mps", "cuda") else torch.float32
    print(f"Using shape device={device}, dtype={dtype}")

    rembg_session, rembg_name = get_rembg_session()
    print(f"Background remover session: {rembg_name}")

    t0 = time.time()
    print("Loading Hunyuan3D-2mv shape pipeline...")
    shape_pipe = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
        "tencent/Hunyuan3D-2mv",
        subfolder="hunyuan3d-dit-v2-mv",
        variant="fp16",
        device=device,
        dtype=dtype,
    )
    print(f"Shape pipeline loaded in {time.time() - t0:.1f}s")

    paint_pipe = None
    if not args.skip_paint:
        tp = time.time()
        print("Loading Hunyuan3D-Paint pipeline...")
        paint_pipe = Hunyuan3DPaintPipeline.from_pretrained(
            "tencent/Hunyuan3D-2",
            subfolder="hunyuan3d-paint-v2-0-turbo",
        )
        paint_pipe.config.render_size = args.tex_size
        paint_pipe.config.texture_size = args.tex_size
        paint_pipe.render.set_default_render_resolution(args.tex_size)
        paint_pipe.render.set_default_texture_resolution(args.tex_size)
        print(f"Paint pipeline loaded in {time.time() - tp:.1f}s")

    floater_rm = FloaterRemover()
    degen_rm = DegenerateFaceRemover()
    face_red = FaceReducer()

    for name in args.subjects:
        if name not in SUBJECTS:
            raise ValueError(f"Unknown subject: {name}")
        spec = SUBJECTS[name]
        print(f"\n=== Generating {name} ===")
        views = {}
        for vtag, (vpath, trim_lr) in spec["views"].items():
            views[vtag] = cutout_rgba(vpath, rembg_session, trim_lr=trim_lr)
            print(f"  prepared view '{vtag}' from {vpath.name}")

        ts = time.time()
        mesh = shape_pipe(
            image=views,
            num_inference_steps=args.steps,
            octree_resolution=args.octree,
            num_chunks=20000,
            mc_algo="mc",
            generator=torch.manual_seed(42),
            output_type="trimesh",
        )[0]
        print(f"  shape generated in {time.time() - ts:.1f}s: {len(mesh.vertices)} verts, {len(mesh.faces)} faces")

        mesh = floater_rm(mesh)
        mesh = degen_rm(mesh)
        if len(mesh.faces) > args.max_faces:
            mesh = face_red(mesh, max_facenum=args.max_faces)
        print(f"  after cleanup/reduction: {len(mesh.vertices)} verts, {len(mesh.faces)} faces")

        if args.pilot:
            shape_out = ROOT / f"output/hy3d_shape_{name}.glb"
            mesh.export(shape_out)
            print(f"  saved untextured shape backup: {shape_out.name}")

        if paint_pipe is not None:
            t_paint = time.time()
            print("  running Hunyuan3D-Paint multi-view texture synthesis...")
            mesh = paint_pipe(mesh, image=list(views.values()))
            print(f"  painted in {time.time() - t_paint:.1f}s")

        mesh = normalize_mesh_upright(mesh, spec["target_height"])
        out_path = spec.get("pilot_out", spec["out"]) if args.pilot else spec["out"]
        mesh.export(out_path)
        size_mb = out_path.stat().st_size / (1024 * 1024)
        print(f"  exported {out_path} ({size_mb:.2f} MB)")


if __name__ == "__main__":
    main()
