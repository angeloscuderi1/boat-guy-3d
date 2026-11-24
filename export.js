const fs = require('fs');
const path = require('path');
const Engine = require('./meshEngine');
const { buildBoatGuyModel } = require('./buildModel');

const parts = buildBoatGuyModel(Engine);
const outDir = path.join(__dirname, 'output');
fs.mkdirSync(outDir, { recursive: true });

// Default boat look (with cap, sunglasses, dog, helm, base — hide full hair crown under cap)
const boatGroups = new Set(['base', 'body', 'cap', 'sunglasses', 'dog', 'helm']);

const glb = Engine.exportGLB(parts, boatGroups);
const glbPath = path.join(outDir, 'boat-guy-and-dog.glb');
fs.writeFileSync(glbPath, glb);

const stl = Engine.exportSTL(parts, boatGroups, 75.0);
const stlPath = path.join(outDir, 'boat-guy-and-dog.stl');
fs.writeFileSync(stlPath, stl);

// Also export a clean hair-visible (no cap/no sunglasses) variant as GLB
const casualGroups = new Set(['base', 'body', 'hair', 'dog']);
const glbCasual = Engine.exportGLB(parts, casualGroups);
const glbCasualPath = path.join(outDir, 'boat-guy-no-cap.glb');
fs.writeFileSync(glbCasualPath, glbCasual);

let totalVerts = 0, totalTris = 0;
for (const p of parts) {
  if (boatGroups.has(p.group)) {
    totalVerts += p.positions.length / 3;
    totalTris += p.indices.length / 3;
  }
}

console.log(`Exported ${glbPath} (${(glb.byteLength / 1024).toFixed(1)} KB)`);
console.log(`Exported ${stlPath} (${(stl.byteLength / 1024).toFixed(1)} KB)`);
console.log(`Exported ${glbCasualPath} (${(glbCasual.byteLength / 1024).toFixed(1)} KB)`);
console.log(`Boat figurine stats: ${parts.filter(p => boatGroups.has(p.group)).length} meshes, ${totalVerts} vertices, ${totalTris} triangles`);
