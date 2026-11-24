// Procedural 3D Mesh Engine + glTF 2.0 (.glb) & Binary STL (.stl) Exporters
// Zero external dependencies — works identically in Node.js and browsers.

(function (root) {
  function vec3Normalize(x, y, z) {
    const l = Math.hypot(x, y, z) || 1;
    return [x / l, y / l, z / l];
  }

  function vec3Cross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  }

  function transformPoint(x, y, z, t) {
    const sx = t.sx ?? 1, sy = t.sy ?? 1, sz = t.sz ?? 1;
    let px = x * sx, py = y * sy, pz = z * sz;
    const rx = t.rx ?? 0, ry = t.ry ?? 0, rz = t.rz ?? 0;
    if (rx) {
      const c = Math.cos(rx), s = Math.sin(rx);
      const ny = py * c - pz * s;
      const nz = py * s + pz * c;
      py = ny; pz = nz;
    }
    if (ry) {
      const c = Math.cos(ry), s = Math.sin(ry);
      const nx = px * c + pz * s;
      const nz = -px * s + pz * c;
      px = nx; pz = nz;
    }
    if (rz) {
      const c = Math.cos(rz), s = Math.sin(rz);
      const nx = px * c - py * s;
      const ny = px * s + py * c;
      px = nx; py = ny;
    }
    return [px + (t.x ?? 0), py + (t.y ?? 0), pz + (t.z ?? 0)];
  }

  function computeSmoothNormals(positions, indices) {
    const normals = new Float32Array(positions.length);
    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i] * 3;
      const i1 = indices[i + 1] * 3;
      const i2 = indices[i + 2] * 3;
      const ax = positions[i1] - positions[i0];
      const ay = positions[i1 + 1] - positions[i0 + 1];
      const az = positions[i1 + 2] - positions[i0 + 2];
      const bx = positions[i2] - positions[i0];
      const by = positions[i2 + 1] - positions[i0 + 1];
      const bz = positions[i2 + 2] - positions[i0 + 2];
      const nx = ay * bz - az * by;
      const ny = az * bx - ax * bz;
      const nz = ax * by - ay * bx;
      normals[i0] += nx; normals[i0 + 1] += ny; normals[i0 + 2] += nz;
      normals[i1] += nx; normals[i1 + 1] += ny; normals[i1 + 2] += nz;
      normals[i2] += nx; normals[i2 + 1] += ny; normals[i2 + 2] += nz;
    }
    for (let i = 0; i < normals.length; i += 3) {
      const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
      normals[i] /= l;
      normals[i + 1] /= l;
      normals[i + 2] /= l;
    }
    return normals;
  }

  function hexToRgb(hex) {
    const v = typeof hex === 'string' ? parseInt(hex.replace('#', ''), 16) : hex;
    return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
  }

  function srgbToLinear(c) {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  class MeshBuilder {
    constructor() {
      this.parts = [];
    }

    addPart(name, group, material, rawPositions, rawIndices, transform = {}) {
      const positions = new Float32Array(rawPositions.length);
      for (let i = 0; i < rawPositions.length; i += 3) {
        const p = transformPoint(rawPositions[i], rawPositions[i + 1], rawPositions[i + 2], transform);
        positions[i] = p[0];
        positions[i + 1] = p[1];
        positions[i + 2] = p[2];
      }
      const indices = new Uint32Array(rawIndices);
      const normals = computeSmoothNormals(positions, indices);
      const rgb = Array.isArray(material.color) ? material.color : hexToRgb(material.color);
      this.parts.push({
        name,
        group,
        material: {
          color: rgb,
          roughness: material.roughness ?? 0.65,
          metalness: material.metalness ?? 0.0,
        },
        positions,
        normals,
        indices,
      });
    }

    addEllipsoid(name, group, material, opts = {}) {
      const segU = opts.segU ?? 24;
      const segV = opts.segV ?? 16;
      const rx = opts.radX ?? 1;
      const ry = opts.radY ?? 1;
      const rz = opts.radZ ?? 1;
      const deform = opts.deform;
      const pos = [];
      const idx = [];

      for (let v = 0; v <= segV; v++) {
        const phi = (v / segV) * Math.PI;
        const sp = Math.sin(phi);
        const cp = Math.cos(phi);
        for (let u = 0; u <= segU; u++) {
          const theta = (u / segU) * Math.PI * 2;
          let x = Math.cos(theta) * sp * rx;
          let y = cp * ry;
          let z = Math.sin(theta) * sp * rz;
          if (deform) {
            const d = deform(x, y, z, u / segU, v / segV);
            x = d[0]; y = d[1]; z = d[2];
          }
          pos.push(x, y, z);
        }
      }
      const stride = segU + 1;
      for (let v = 0; v < segV; v++) {
        for (let u = 0; u < segU; u++) {
          const a = v * stride + u;
          const b = (v + 1) * stride + u;
          const c = (v + 1) * stride + u + 1;
          const d = v * stride + u + 1;
          // Outward winding for (x=cos*sin, y=cos, z=sin*sin)
          if (v !== 0) idx.push(a, d, b);
          if (v !== segV - 1) idx.push(b, d, c);
        }
      }
      this.addPart(name, group, material, pos, idx, opts);
    }

    // Profile is array of [radius, y] or [rx, y, rz] from bottom to top
    addLathe(name, group, material, profile, opts = {}) {
      const segs = opts.segs ?? 28;
      const closeBottom = opts.closeBottom ?? true;
      const closeTop = opts.closeTop ?? true;
      const deform = opts.deform;
      const pos = [];
      const idx = [];

      for (let j = 0; j < profile.length; j++) {
        const rx = profile[j][0];
        const y = profile[j][1];
        const rz = profile[j][2] ?? rx;
        for (let i = 0; i <= segs; i++) {
          const a = (i / segs) * Math.PI * 2;
          let x = Math.cos(a) * rx;
          let z = Math.sin(a) * rz;
          let py = y;
          if (deform) {
            const d = deform(x, py, z, i / segs, j / (profile.length - 1));
            x = d[0]; py = d[1]; z = d[2];
          }
          pos.push(x, py, z);
        }
      }
      const stride = segs + 1;
      for (let j = 0; j < profile.length - 1; j++) {
        for (let i = 0; i < segs; i++) {
          const a = j * stride + i;
          const b = (j + 1) * stride + i;
          const c = (j + 1) * stride + i + 1;
          const d = j * stride + i + 1;
          idx.push(a, b, d, b, c, d);
        }
      }
      if (closeBottom && profile[0][0] > 1e-5) {
        const centerIdx = pos.length / 3;
        pos.push(0, profile[0][1], 0);
        for (let i = 0; i < segs; i++) {
          idx.push(centerIdx, i, i + 1);
        }
      }
      if (closeTop && profile[profile.length - 1][0] > 1e-5) {
        const topRow = (profile.length - 1) * stride;
        const centerIdx = pos.length / 3;
        pos.push(0, profile[profile.length - 1][1], 0);
        for (let i = 0; i < segs; i++) {
          idx.push(centerIdx, topRow + i + 1, topRow + i);
        }
      }
      this.addPart(name, group, material, pos, idx, opts);
    }

    // Smooth tube along 3D polyline points: [[x,y,z], ...] with per-point radius (or scalar)
    addTube(name, group, material, points, radii, opts = {}) {
      const segs = opts.segs ?? 16;
      const capStart = opts.capStart ?? true;
      const capEnd = opts.capEnd ?? true;
      const ovalX = opts.ovalX ?? 1.0;
      const ovalY = opts.ovalY ?? 1.0;
      const n = points.length;
      if (n < 2) return;

      const pos = [];
      const idx = [];

      // Compute parallel transport frames to prevent twisting
      const tangents = [];
      for (let i = 0; i < n; i++) {
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[Math.min(n - 1, i + 1)];
        tangents.push(vec3Normalize(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]));
      }

      let ref = Math.abs(tangents[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      let normal = vec3Normalize(...vec3Cross(tangents[0], ref));
      let binormal = vec3Cross(tangents[0], normal);

      const rings = [];
      for (let i = 0; i < n; i++) {
        if (i > 0) {
          const tPrev = tangents[i - 1];
          const tCurr = tangents[i];
          const axis = vec3Cross(tPrev, tCurr);
          const axisLen = Math.hypot(axis[0], axis[1], axis[2]);
          if (axisLen > 1e-5) {
            const k = [axis[0] / axisLen, axis[1] / axisLen, axis[2] / axisLen];
            const dot = Math.max(-1, Math.min(1, tPrev[0] * tCurr[0] + tPrev[1] * tCurr[1] + tPrev[2] * tCurr[2]));
            const angle = Math.acos(dot);
            const ca = Math.cos(angle), sa = Math.sin(angle);
            const rotate = (v) => {
              const kv = vec3Cross(k, v);
              const kdot = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
              return [
                v[0] * ca + kv[0] * sa + k[0] * kdot * (1 - ca),
                v[1] * ca + kv[1] * sa + k[1] * kdot * (1 - ca),
                v[2] * ca + kv[2] * sa + k[2] * kdot * (1 - ca),
              ];
            };
            normal = vec3Normalize(...rotate(normal));
            binormal = vec3Normalize(...vec3Cross(tCurr, normal));
          }
        }
        const r = Array.isArray(radii) ? radii[i] : radii;
        const p = points[i];
        const ringStart = pos.length / 3;
        rings.push(ringStart);
        for (let j = 0; j <= segs; j++) {
          const a = (j / segs) * Math.PI * 2;
          const ca = Math.cos(a) * r * ovalX;
          const sa = Math.sin(a) * r * ovalY;
          pos.push(
            p[0] + normal[0] * ca + binormal[0] * sa,
            p[1] + normal[1] * ca + binormal[1] * sa,
            p[2] + normal[2] * ca + binormal[2] * sa
          );
        }
      }

      for (let i = 0; i < n - 1; i++) {
        const r0 = rings[i];
        const r1 = rings[i + 1];
        for (let j = 0; j < segs; j++) {
          const a = r0 + j;
          const b = r1 + j;
          const c = r1 + j + 1;
          const d = r0 + j + 1;
          idx.push(a, d, b, b, d, c);
        }
      }

      if (capStart) {
        const cIdx = pos.length / 3;
        const p = points[0];
        const r = Array.isArray(radii) ? radii[0] : radii;
        pos.push(p[0] - tangents[0][0] * r * 0.4, p[1] - tangents[0][1] * r * 0.4, p[2] - tangents[0][2] * r * 0.4);
        for (let j = 0; j < segs; j++) idx.push(cIdx, rings[0] + j, rings[0] + j + 1);
      }
      if (capEnd) {
        const cIdx = pos.length / 3;
        const p = points[n - 1];
        const r = Array.isArray(radii) ? radii[n - 1] : radii;
        const t = tangents[n - 1];
        pos.push(p[0] + t[0] * r * 0.4, p[1] + t[1] * r * 0.4, p[2] + t[2] * r * 0.4);
        const last = rings[n - 1];
        for (let j = 0; j < segs; j++) idx.push(cIdx, last + j + 1, last + j);
      }

      this.addPart(name, group, material, pos, idx, opts);
    }

    addTorus(name, group, material, R, r, opts = {}) {
      const segU = opts.segU ?? 32;
      const segV = opts.segV ?? 14;
      const pos = [];
      const idx = [];
      for (let i = 0; i <= segU; i++) {
        const u = (i / segU) * Math.PI * 2;
        const cu = Math.cos(u), su = Math.sin(u);
        for (let j = 0; j <= segV; j++) {
          const v = (j / segV) * Math.PI * 2;
          const cv = Math.cos(v), sv = Math.sin(v);
          const rad = R + r * cv;
          pos.push(rad * cu, r * sv, rad * su);
        }
      }
      const stride = segV + 1;
      for (let i = 0; i < segU; i++) {
        for (let j = 0; j < segV; j++) {
          const a = i * stride + j;
          const b = (i + 1) * stride + j;
          const c = (i + 1) * stride + j + 1;
          const d = i * stride + j + 1;
          idx.push(a, d, b, b, d, c);
        }
      }
      this.addPart(name, group, material, pos, idx, opts);
    }

    addRoundedBox(name, group, material, w, h, d, opts = {}) {
      const segU = opts.segU ?? 18;
      const segV = opts.segV ?? 12;
      const p = opts.power ?? 0.35; // superellipsoid sharpness
      const spow = (val, exp) => Math.sign(val) * Math.pow(Math.abs(val), exp);
      this.addEllipsoid(name, group, material, {
        ...opts,
        segU,
        segV,
        radX: 1,
        radY: 1,
        radZ: 1,
        deform: (x, y, z) => [
          spow(x, p) * (w * 0.5),
          spow(y, p) * (h * 0.5),
          spow(z, p) * (d * 0.5),
        ],
      });
    }
  }

  // Export valid glTF 2.0 binary (.glb) Uint8Array
  function exportGLB(parts, visibleGroups = null) {
    const active = visibleGroups
      ? parts.filter((p) => visibleGroups.has(p.group))
      : parts;

    const bufferViews = [];
    const accessors = [];
    const materials = [];
    const primitives = [];
    const binChunks = [];
    let byteOffset = 0;

    function pushBin(typedArray, target) {
      const bytes = new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
      const pad = (4 - (bytes.byteLength % 4)) % 4;
      const viewIdx = bufferViews.length;
      bufferViews.push({
        buffer: 0,
        byteOffset,
        byteLength: bytes.byteLength,
        ...(target ? { target } : {}),
      });
      binChunks.push(bytes);
      if (pad > 0) binChunks.push(new Uint8Array(pad));
      byteOffset += bytes.byteLength + pad;
      return viewIdx;
    }

    for (const part of active) {
      const matIdx = materials.length;
      const [r, g, b] = part.material.color;
      materials.push({
        name: part.name + '_mat',
        pbrMetallicRoughness: {
          baseColorFactor: [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b), 1.0],
          metallicFactor: part.material.metalness,
          roughnessFactor: part.material.roughness,
        },
      });

      const posView = pushBin(part.positions, 34962);
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (let i = 0; i < part.positions.length; i += 3) {
        const x = part.positions[i], y = part.positions[i + 1], z = part.positions[i + 2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      const posAcc = accessors.length;
      accessors.push({
        bufferView: posView,
        componentType: 5126, // FLOAT
        count: part.positions.length / 3,
        type: 'VEC3',
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
      });

      const normView = pushBin(part.normals, 34962);
      const normAcc = accessors.length;
      accessors.push({
        bufferView: normView,
        componentType: 5126,
        count: part.normals.length / 3,
        type: 'VEC3',
      });

      const idxView = pushBin(part.indices, 34963);
      const idxAcc = accessors.length;
      accessors.push({
        bufferView: idxView,
        componentType: 5125, // UNSIGNED_INT
        count: part.indices.length,
        type: 'SCALAR',
      });

      primitives.push({
        attributes: { POSITION: posAcc, NORMAL: normAcc },
        indices: idxAcc,
        material: matIdx,
      });
    }

    const gltf = {
      asset: { version: '2.0', generator: 'Antigravity Procedural 3D Builder' },
      scene: 0,
      scenes: [{ name: 'BoatGuyFigurine', nodes: [0] }],
      nodes: [{ name: 'FigurineRoot', mesh: 0 }],
      meshes: [{ name: 'BoatGuyAndCavalier', primitives }],
      materials,
      accessors,
      bufferViews,
      buffers: [{ byteLength: byteOffset }],
    };

    const jsonStr = JSON.stringify(gltf);
    const jsonBytesRaw = new TextEncoder().encode(jsonStr);
    const jsonPad = (4 - (jsonBytesRaw.length % 4)) % 4;
    const jsonLen = jsonBytesRaw.length + jsonPad;

    const totalLen = 12 + 8 + jsonLen + 8 + byteOffset;
    const out = new Uint8Array(totalLen);
    const dv = new DataView(out.buffer);

    // Header
    dv.setUint32(0, 0x46546C67, true); // 'glTF'
    dv.setUint32(4, 2, true);          // version 2
    dv.setUint32(8, totalLen, true);

    // JSON chunk
    dv.setUint32(12, jsonLen, true);
    dv.setUint32(16, 0x4E4F534A, true); // 'JSON'
    out.set(jsonBytesRaw, 20);
    for (let i = 0; i < jsonPad; i++) out[20 + jsonBytesRaw.length + i] = 0x20;

    // BIN chunk
    const binHeaderOffset = 20 + jsonLen;
    dv.setUint32(binHeaderOffset, byteOffset, true);
    dv.setUint32(binHeaderOffset + 4, 0x004E4942, true); // 'BIN\0'
    let cursor = binHeaderOffset + 8;
    for (const chunk of binChunks) {
      out.set(chunk, cursor);
      cursor += chunk.byteLength;
    }
    return out;
  }

  // Export binary STL (.stl) scaled to ~150mm tall (Z-up for 3D printers)
  function exportSTL(parts, visibleGroups = null, scaleMm = 75.0) {
    const active = visibleGroups
      ? parts.filter((p) => visibleGroups.has(p.group))
      : parts;
    let triCount = 0;
    for (const p of active) triCount += p.indices.length / 3;

    const buf = new ArrayBuffer(84 + triCount * 50);
    const dv = new DataView(buf);
    const header = 'Antigravity Boat Guy & Cavalier Figurine (mm, Z-up)';
    for (let i = 0; i < header.length && i < 80; i++) dv.setUint8(i, header.charCodeAt(i));
    dv.setUint32(80, triCount, true);

    let offset = 84;
    for (const p of active) {
      const pos = p.positions;
      const idx = p.indices;
      for (let i = 0; i < idx.length; i += 3) {
        const i0 = idx[i] * 3, i1 = idx[i + 1] * 3, i2 = idx[i + 2] * 3;
        // Convert Y-up (x, y, z) -> Z-up (x, -z, y) for standard slicers
        const v0 = [pos[i0] * scaleMm, -pos[i0 + 2] * scaleMm, pos[i0 + 1] * scaleMm];
        const v1 = [pos[i1] * scaleMm, -pos[i1 + 2] * scaleMm, pos[i1 + 1] * scaleMm];
        const v2 = [pos[i2] * scaleMm, -pos[i2 + 2] * scaleMm, pos[i2 + 1] * scaleMm];
        const ux = v1[0] - v0[0], uy = v1[1] - v0[1], uz = v1[2] - v0[2];
        const vx = v2[0] - v0[0], vy = v2[1] - v0[1], vz = v2[2] - v0[2];
        const [nx, ny, nz] = vec3Normalize(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);

        dv.setFloat32(offset, nx, true); offset += 4;
        dv.setFloat32(offset, ny, true); offset += 4;
        dv.setFloat32(offset, nz, true); offset += 4;
        for (const v of [v0, v1, v2]) {
          dv.setFloat32(offset, v[0], true); offset += 4;
          dv.setFloat32(offset, v[1], true); offset += 4;
          dv.setFloat32(offset, v[2], true); offset += 4;
        }
        dv.setUint16(offset, 0, true); offset += 2;
      }
    }
    return new Uint8Array(buf);
  }

  const api = { MeshBuilder, exportGLB, exportSTL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MeshEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
