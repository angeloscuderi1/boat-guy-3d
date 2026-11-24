#!/usr/bin/env python3
"""Generate multi-view photorealistic PBR .GLB meshes using Hunyuan3D-2mv + Full Paint + Photo Projection on Apple MPS."""

import argparse
import io
import os
import sys
import time
from pathlib import Path

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import cv2
import numpy as np
import pygltflib
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
    "bust": {
        "views": {
            "front": (ROOT / "turnarounds/bust_front.png", 0.0),
            "left": (ROOT / "turnarounds/bust_side.png", 0.0),
            "back": (ROOT / "turnarounds/bust_back.png", 0.0),
        },
        "out": ROOT / "output/photoreal_portrait_bust.glb",
        "target_height": 0.62,
        "allow_front_proj": True,
    },
    "boat": {
        "views": {
            "front": (ROOT / "turnarounds/boat_front.png", 0.0),
            "left": (ROOT / "turnarounds/boat_side.png", 0.0),
            "back": (ROOT / "turnarounds/boat_back.png", 0.0),
        },
        "out": ROOT / "output/photoreal_boat_guy.glb",
        "target_height": 1.78,
        "allow_front_proj": True,
    },
    "denim": {
        "views": {
            "front": (ROOT / "turnarounds/denim_front.png", 0.0),
            "left": (ROOT / "turnarounds/denim_side.png", 0.0),
            "back": (ROOT / "turnarounds/denim_back.png", 0.0),
        },
        "out": ROOT / "output/photoreal_denim_guy.glb",
        "target_height": 1.78,
        "allow_front_proj": True,
    },
    "dog": {
        "views": {
            "front": (ROOT / "turnarounds/dog_front.png", 0.0),
            "right": (ROOT / "turnarounds/dog_side.png", 0.02),
            "back": (ROOT / "turnarounds/dog_back.png", 0.0),
        },
        "out": ROOT / "output/photoreal_cavalier_dog.glb",
        "target_height": 0.56,
        "allow_front_proj": False,
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


def _recenter_square_rgba(image: Image.Image, border_ratio: float = 0.2) -> Image.Image:
    """Match Hunyuan3DPaintPipeline.recenter_image framing cleanly."""
    alpha_channel = np.array(image)[:, :, 3]
    nz = np.argwhere(alpha_channel > 16)
    if nz.size == 0:
        return image
    min_r, min_c = nz.min(axis=0)
    max_r, max_c = nz.max(axis=0)
    cropped = image.crop((min_c, min_r, max_c + 1, max_r + 1))
    w, h = cropped.size
    bw, bh = int(w * border_ratio), int(h * border_ratio)
    sq = max(w + 2 * bw, h + 2 * bh)
    canvas = Image.new("RGBA", (sq, sq), (255, 255, 255, 0))
    canvas.paste(cropped, ((sq - (w + 2 * bw)) // 2 + bw, (sq - (h + 2 * bh)) // 2 + bh))
    return canvas


def project_front_photo_to_uv(render, front_rgba: Image.Image, render_res: int = 1024):
    """Align high-res front turnaround photo to the painted mesh's front render and blend crisp details into UV atlas."""
    with torch.no_grad():
        _, pos_clip = render.get_pos_from_mvp(0, 0, None, None)
        rast_out, _ = render.raster_rasterize(pos_clip, render.pos_idx, resolution=[render_res, render_res])
        vis = (rast_out[0, ..., -1] > 0).cpu().numpy()
        uv_img, _ = render.raster_interpolate(render.vtx_uv[None, ...], rast_out, render.uv_idx)
        uv_np = uv_img[0].cpu().numpy()

        ys, xs = np.where(vis)
        if xs.size < 500:
            print("  front projection skipped: mesh front silhouette too small")
            return
        mx0, my0, mx1, my1 = int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())
        mw, mh = max(mx1 - mx0 + 1, 1), max(my1 - my0 + 1, 1)

        sq_photo = _recenter_square_rgba(front_rgba, border_ratio=0.12)
        p_arr = np.array(sq_photo)
        p_mask = p_arr[:, :, 3] > 32
        pys, pxs = np.where(p_mask)
        if pxs.size < 200:
            print("  front projection skipped: photo foreground too small")
            return
        px0, py0, px1, py1 = int(pxs.min()), int(pys.min()), int(pxs.max()), int(pys.max())
        pw, ph = max(px1 - px0 + 1, 1), max(py1 - py0 + 1, 1)

        # Aspect-clamped bounding-box alignment to ortho render silhouette
        sx = mw / pw
        sy = mh / ph
        s_mid = 0.5 * (sx + sy)
        sx = float(np.clip(sx, s_mid * 0.93, s_mid * 1.07))
        sy = float(np.clip(sy, s_mid * 0.93, s_mid * 1.07))
        nw, nh = max(int(round(pw * sx)), 2), max(int(round(ph * sy)), 2)

        crop_rgba = Image.fromarray(p_arr[py0 : py1 + 1, px0 : px1 + 1], mode="RGBA")
        resized_rgba = np.array(crop_rgba.resize((nw, nh), Image.Resampling.LANCZOS))

        aligned_rgba = np.zeros((render_res, render_res, 4), dtype=np.uint8)
        ox = int(round(mx0 + (mw - nw) * 0.5))
        oy = int(round(my0 + (mh - nh) * 0.5))
        dst_x0, dst_y0 = max(ox, 0), max(oy, 0)
        dst_x1, dst_y1 = min(ox + nw, render_res), min(oy + nh, render_res)
        src_x0, src_y0 = dst_x0 - ox, dst_y0 - oy
        src_x1, src_y1 = src_x0 + (dst_x1 - dst_x0), src_y0 + (dst_y1 - dst_y0)
        if dst_x1 <= dst_x0 or dst_y1 <= dst_y0:
            return
        aligned_rgba[dst_y0:dst_y1, dst_x0:dst_x1] = resized_rgba[src_y0:src_y1, src_x0:src_x1]

        photo_fg = aligned_rgba[:, :, 3] > 32
        inter = np.logical_and(vis, photo_fg).sum()
        union = np.logical_or(vis, photo_fg).sum()
        iou = float(inter / max(union, 1))
        print(f"  front projection alignment IoU={iou:.3f}")
        if iou < 0.76:
            print(f"  front projection skipped (IoU {iou:.3f} < 0.76)")
            return

        # Sample current painted mesh front RGB for gentle color harmonization
        tex_np = render.get_texture()
        ht, wt = tex_np.shape[:2]
        uu = np.clip((uv_np[..., 0] * (wt - 1)).round().astype(np.int32), 0, wt - 1)
        vv = np.clip((uv_np[..., 1] * (ht - 1)).round().astype(np.int32), 0, ht - 1)
        mesh_front_rgb = tex_np[vv, uu]

        photo_rgb = aligned_rgba[:, :, :3].astype(np.float32) / 255.0
        common = np.logical_and(vis, photo_fg)
        if common.sum() > 200:
            for c in range(3):
                pm = float(photo_rgb[common, c].mean())
                ps = max(float(photo_rgb[common, c].std()), 1e-4)
                mm = float(mesh_front_rgb[common, c].mean())
                ms = max(float(mesh_front_rgb[common, c].std()), 1e-4)
                matched = (photo_rgb[:, :, c] - pm) * (ms / ps) + mm
                # Gentle 40% shift toward painted illumination to avoid washing out skin warmth
                photo_rgb[:, :, c] = np.clip(0.62 * photo_rgb[:, :, c] + 0.38 * matched, 0.0, 1.0)

        # Erode photo mask inward so background fringe never leaks onto edges
        eroded = cv2.erode((photo_fg.astype(np.uint8) * 255), np.ones((7, 7), np.uint8), iterations=1)
        feathered = cv2.GaussianBlur(eroded.astype(np.float32) / 255.0, (7, 7), 1.8)
        alpha_u8 = np.clip(feathered * 255.0, 0, 255).astype(np.uint8)
        rgb_u8 = np.clip(photo_rgb * 255.0, 0, 255).astype(np.uint8)

        proj_rgb, proj_cos, _ = render.back_project(Image.fromarray(rgb_u8), elev=0, azim=0)
        proj_alpha, _, _ = render.back_project(Image.fromarray(alpha_u8), elev=0, azim=0)

        # Normalize back_project linear_grid_put_2d coverage near UV islands
        proj_alpha_norm = torch.clamp(proj_alpha[..., :1], 0.0, 1.0)
        w = torch.clamp((torch.clamp(proj_cos, 0.0, 1.0) ** 4.0) * proj_alpha_norm, 0.0, 0.90)
        valid = (proj_cos > 0.15) & (proj_alpha_norm > 0.25)
        w = torch.where(valid, w, torch.zeros_like(w))

        base_tex = render.tex.clone()
        blended = base_tex * (1.0 - w) + proj_rgb * w
        render.set_texture(blended)
        cov_pct = float(valid.float().mean().item() * 100.0)
        print(f"  blended crisp front photo onto {cov_pct:.1f}% of UV texels")


def generate_pbr_maps(albedo_pil: Image.Image) -> tuple[Image.Image, Image.Image]:
    """Synthesize subtle tangent-space normal map and material-aware metallicRoughness map from 2048px albedo."""
    rgb = np.array(albedo_pil.convert("RGB"), dtype=np.float32) / 255.0
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    h, s, v = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    lum = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]

    skin_mask = ((h <= 32.0) | (h >= 342.0)) & (s >= 0.12) & (s <= 0.65) & (v >= 0.34) & (v <= 0.96)
    skin_soft = cv2.GaussianBlur(skin_mask.astype(np.float32), (11, 11), 3.0)

    # Normal map from gently smoothed luminance; stronger on cloth/hair, very gentle on skin
    lum_smooth = cv2.GaussianBlur(lum, (5, 5), 0.9)
    dx = cv2.Sobel(lum_smooth, cv2.CV_32F, 1, 0, ksize=3) * 0.25
    dy = cv2.Sobel(lum_smooth, cv2.CV_32F, 0, 1, ksize=3) * 0.25
    strength = 0.32 * (1.0 - skin_soft) + 0.10 * skin_soft
    nx = -dx * strength
    ny = dy * strength
    nz = np.ones_like(lum)
    inv = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz + 1e-8)
    nrm = np.stack([nx * inv * 0.5 + 0.5, ny * inv * 0.5 + 0.5, nz * inv * 0.5 + 0.5], axis=-1)
    normal_pil = Image.fromarray(np.clip(nrm * 255.0, 0, 255).astype(np.uint8), mode="RGB")

    # MetallicRoughness: G=roughness, B=metallic (glTF 2.0 channel layout)
    dark_gloss = np.clip((0.15 - lum) / 0.15, 0.0, 1.0)
    rough = 0.80 * (1.0 - skin_soft) + 0.54 * skin_soft
    rough = rough * (1.0 - dark_gloss * 0.72) + 0.22 * (dark_gloss * 0.72)
    rough_u8 = np.clip(rough * 255.0, 35, 235).astype(np.uint8)
    mr_arr = np.zeros((rgb.shape[0], rgb.shape[1], 3), dtype=np.uint8)
    mr_arr[:, :, 1] = rough_u8
    mr_pil = Image.fromarray(mr_arr, mode="RGB")
    return normal_pil, mr_pil


def export_compact_pbr_glb(mesh: trimesh.Trimesh, albedo: Image.Image, normal: Image.Image, mr: Image.Image, out_path: Path):
    """Export mesh with PBRMaterial and re-pack baseColor & normal textures as q=91 4:4:4 JPEGs inside GLB."""
    uv = mesh.visual.uv
    mat = trimesh.visual.material.PBRMaterial(
        baseColorTexture=albedo,
        normalTexture=normal,
        metallicRoughnessTexture=mr,
        metallicFactor=0.0,
        roughnessFactor=1.0,
    )
    mesh.visual = trimesh.visual.TextureVisuals(uv=uv, material=mat)

    tmp_path = out_path.with_suffix(".tmp.glb")
    mesh.export(tmp_path)

    gltf = pygltflib.GLTF2().load_binary(str(tmp_path))
    blob = gltf.binary_blob()

    # Encode JPEG bytes for baseColorTexture (idx 0) and normalTexture (idx 1) when matched via gltf.textures
    pbr = gltf.materials[0].pbrMetallicRoughness if gltf.materials else None
    jpeg_indices = set()
    if pbr and pbr.baseColorTexture is not None:
        jpeg_indices.add(gltf.textures[pbr.baseColorTexture.index].source)
    if gltf.materials and gltf.materials[0].normalTexture is not None:
        jpeg_indices.add(gltf.textures[gltf.materials[0].normalTexture.index].source)

    pil_by_idx = {}
    if pbr and pbr.baseColorTexture is not None:
        pil_by_idx[gltf.textures[pbr.baseColorTexture.index].source] = albedo
    if gltf.materials and gltf.materials[0].normalTexture is not None:
        pil_by_idx[gltf.textures[gltf.materials[0].normalTexture.index].source] = normal
    if pbr and pbr.metallicRoughnessTexture is not None:
        pil_by_idx[gltf.textures[pbr.metallicRoughnessTexture.index].source] = mr

    # Rebuild binary buffer keeping non-image bufferViews intact and re-packing image bufferViews
    img_bvs = {img.bufferView: idx for idx, img in enumerate(gltf.images) if img.bufferView is not None}
    new_chunks = []
    cur_offset = 0

    def append_chunk(data: bytes) -> tuple[int, int]:
        nonlocal cur_offset
        off = cur_offset
        pad = (4 - (len(data) % 4)) % 4
        new_chunks.append(data + b"\x00" * pad)
        cur_offset += len(data) + pad
        return off, len(data)

    for bv_idx, bv in enumerate(gltf.bufferViews):
        if bv_idx in img_bvs:
            img_idx = img_bvs[bv_idx]
            img_obj = gltf.images[img_idx]
            pil_img = pil_by_idx.get(img_idx)
            if pil_img is not None and img_idx in jpeg_indices:
                buf = io.BytesIO()
                pil_img.save(buf, format="JPEG", quality=91, subsampling=0)
                raw = buf.getvalue()
                img_obj.mimeType = "image/jpeg"
            elif pil_img is not None:
                buf = io.BytesIO()
                pil_img.save(buf, format="PNG", optimize=True)
                raw = buf.getvalue()
                img_obj.mimeType = "image/png"
            else:
                start = bv.byteOffset or 0
                raw = blob[start : start + bv.byteLength]
            off, ln = append_chunk(raw)
        else:
            start = bv.byteOffset or 0
            raw = blob[start : start + bv.byteLength]
            off, ln = append_chunk(raw)
        bv.byteOffset = off
        bv.byteLength = ln

    new_blob = b"".join(new_chunks)
    gltf.buffers[0].byteLength = len(new_blob)
    gltf.set_binary_blob(new_blob)
    gltf.save_binary(str(out_path))
    tmp_path.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("subjects", nargs="*", default=["bust"])
    parser.add_argument("--steps", type=int, default=45)
    parser.add_argument("--octree", type=int, default=384)
    parser.add_argument("--max-faces", type=int, default=85000)
    parser.add_argument("--render-size", type=int, default=1024)
    parser.add_argument("--tex-size", type=int, default=2048)
    parser.add_argument("--paint-subfolder", default="hunyuan3d-paint-v2-0")
    parser.add_argument("--front-proj", action="store_true", help="Enable experimental orthographic front photo UV projection")
    args = parser.parse_args()

    device = "mps" if torch.backends.mps.is_available() else ("cuda" if torch.cuda.is_available() else "cpu")
    dtype = torch.float16 if device in ("mps", "cuda") else torch.float32
    print(f"Using shape device={device}, dtype={dtype}, paint={args.paint_subfolder}")

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

    tp = time.time()
    print(f"Loading Hunyuan3D-Paint pipeline ({args.paint_subfolder})...")
    paint_pipe = Hunyuan3DPaintPipeline.from_pretrained(
        "tencent/Hunyuan3D-2",
        subfolder=args.paint_subfolder,
    )
    paint_pipe.config.render_size = args.render_size
    paint_pipe.config.texture_size = args.tex_size
    paint_pipe.render.set_default_render_resolution(args.render_size)
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

        t_paint = time.time()
        print("  running Hunyuan3D-Paint multi-view texture synthesis...")
        mesh = paint_pipe(mesh, image=list(views.values()))
        print(f"  painted in {time.time() - t_paint:.1f}s")

        if spec.get("allow_front_proj", False) and args.front_proj:
            # Reload mesh into render because save_mesh() mutates CPU vtx_pos/vtx_uv in-place
            tex_backup = paint_pipe.render.get_texture().copy()
            paint_pipe.render.load_mesh(mesh)
            paint_pipe.render.set_texture(tex_backup)
            project_front_photo_to_uv(paint_pipe.render, views["front"], render_res=args.render_size)
            mesh = paint_pipe.render.save_mesh()

        albedo_np = np.clip(paint_pipe.render.get_texture() * 255.0, 0, 255).astype(np.uint8)
        albedo_pil = Image.fromarray(albedo_np, mode="RGB")
        normal_pil, mr_pil = generate_pbr_maps(albedo_pil)

        mesh = normalize_mesh_upright(mesh, spec["target_height"])
        out_path = spec["out"]
        export_compact_pbr_glb(mesh, albedo_pil, normal_pil, mr_pil, out_path)
        size_mb = out_path.stat().st_size / (1024 * 1024)
        print(f"  exported {out_path} ({size_mb:.2f} MB)")


if __name__ == "__main__":
    main()
