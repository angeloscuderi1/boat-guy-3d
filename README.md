# Boat Guy & Cavalier — Interactive 3D Model & Photorealistic Turnaround Studio

Interactive WebGL2 stylized 3D character figurine + studio-lit photorealistic orthographic turnaround sheets (ready for Meshy, Tripo3D, Rodin, or Blender), complete with a Blenheim Cavalier King Charles Spaniel and teak boat-deck display pedestal.

### Live Interactive 3D Viewer & 3D Cruise Video
- **3D Studio:** **[https://angeloscuderi1.github.io/boat-guy-3d/](https://angeloscuderi1.github.io/boat-guy-3d/)** — switch between:
  - **Stylized 3D Model** — Animated WebGL2 PBR figurine with lake-wave boat rock, wagging dog tail, Cavalier head tilt, camera presets, **`Hat: On / Off`** toggle (revealing full middle-parted wavy brown hair), **`Sunglasses`** toggle, and instant **`.GLB`** / **`.STL`** export.
  - **Photorealistic Turnaround Studio** — Switch between **Boat Outfit**, **Denim (Clear Face)**, and **Cavalier Dog** across **Photorealistic 3D Mesh** (true TripoSR vertex-colored 3D `.glb` meshes), **3-View Sheet**, **Turntable Scrub**, and **3D Intersecting Reference Planes**.
- **Interactive 3D Sunset Boat Cruise:** **[https://angeloscuderi1.github.io/boat-guy-3d/boat_video.html](https://angeloscuderi1.github.io/boat-guy-3d/boat_video.html)** · **10s HD Video:** [`output/boat-cruise.mp4`](./output/boat-cruise.mp4) (1280×720, 30fps H.264)

---

### Photorealistic 3D Turnaround Sheets
![Boat Outfit Turnaround](./turnarounds/boat_outfit_sheet.jpg)
![Denim Clear-Face Turnaround](./turnarounds/denim_look_sheet.jpg)
![Cavalier Dog Turnaround](./turnarounds/cavalier_dog_sheet.jpg)

Individual cropped Front / Side / Back orthographic PNGs are in [`./turnarounds/`](./turnarounds/).

### 3D Mesh Exports (`./output/`)
**Photorealistic 3D Meshes (generated locally via TripoSR):**
- [`output/photoreal_boat_guy.glb`](./output/photoreal_boat_guy.glb) — Boat outfit photorealistic vertex-colored 3D `.glb`
- [`output/photoreal_denim_guy.glb`](./output/photoreal_denim_guy.glb) — Clear-face denim jacket photorealistic 3D `.glb`
- [`output/photoreal_cavalier_dog.glb`](./output/photoreal_cavalier_dog.glb) — Blenheim Cavalier King Charles Spaniel photorealistic 3D `.glb`

**Stylized Figurine Exports:**
- [`output/boat-guy-and-dog.glb`](./output/boat-guy-and-dog.glb) — glTF 2.0 binary with PBR materials
- [`output/boat-guy-no-cap.glb`](./output/boat-guy-no-cap.glb) — Hat-off / wavy-hair variant
- [`output/boat-guy-and-dog.stl`](./output/boat-guy-and-dog.stl) — Binary STL (~150 mm tall, Z-up) ready for 3D printing slicers

### Regenerating Locally
```bash
node export.js          # Stylized .glb & .stl exports
node render_video.mjs   # 10s HD 1280x720 boat-cruise.mp4 render via Chrome + ffmpeg
python run_triposr.py   # Photorealistic TripoSR .glb exports (using .venv-3d)
```
