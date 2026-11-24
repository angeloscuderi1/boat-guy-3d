// Stylized 3D Figurine: Boat Guy + Blenheim Cavalier King Charles Spaniel
// Works in Node.js (require('./meshEngine')) and browser (window.MeshEngine)

(function (root) {
  function buildBoatGuyModel(Engine) {
    const mb = new Engine.MeshBuilder();

    // Shared material palette matched to reference photos
    const M = {
      skin:       { color: '#e0af8f', roughness: 0.58, metalness: 0.0 },
      skinShade:  { color: '#c8987b', roughness: 0.72, metalness: 0.0 }, // subtle stubble
      hair:       { color: '#3b281c', roughness: 0.72, metalness: 0.0 },
      hairDark:   { color: '#2b1c13', roughness: 0.78, metalness: 0.0 },
      fleece:     { color: '#1d263b', roughness: 0.90, metalness: 0.0 },
      fleeceDark: { color: '#151c2d', roughness: 0.92, metalness: 0.0 },
      whiteTee:   { color: '#f2f3f5', roughness: 0.85, metalness: 0.0 },
      khaki:      { color: '#b5ac98', roughness: 0.82, metalness: 0.0 },
      belt:       { color: '#473020', roughness: 0.62, metalness: 0.05 },
      shoeWhite:  { color: '#eceae4', roughness: 0.55, metalness: 0.0 },
      shoeSole:   { color: '#c7a982', roughness: 0.75, metalness: 0.0 },
      capCream:   { color: '#e6e0d2', roughness: 0.82, metalness: 0.0 },
      capPatchBg: { color: '#255c6e', roughness: 0.70, metalness: 0.0 },
      capPatchOr: { color: '#d97b38', roughness: 0.65, metalness: 0.0 },
      frame:      { color: '#1b1816', roughness: 0.25, metalness: 0.08 },
      lens:       { color: '#12151a', roughness: 0.10, metalness: 0.35 },
      silver:     { color: '#d4d8df', roughness: 0.22, metalness: 0.88 },
      watchFace:  { color: '#f5f6f8', roughness: 0.20, metalness: 0.15 },
      teeth:      { color: '#fbfbfb', roughness: 0.25, metalness: 0.0 },
      lip:        { color: '#c4816c', roughness: 0.55, metalness: 0.0 },
      eyeWhite:   { color: '#f8f8fa', roughness: 0.20, metalness: 0.0 },
      eyeDark:    { color: '#1f1612', roughness: 0.12, metalness: 0.05 },
      // Dog (Blenheim Cavalier King Charles Spaniel)
      dogWhite:   { color: '#f5f1e8', roughness: 0.86, metalness: 0.0 },
      dogBrown:   { color: '#8b4924', roughness: 0.84, metalness: 0.0 },
      dogEar:     { color: '#783c1c', roughness: 0.86, metalness: 0.0 },
      dogNose:    { color: '#1a1513', roughness: 0.22, metalness: 0.05 },
      dogTongue:  { color: '#d9767a', roughness: 0.45, metalness: 0.0 },
      harness:    { color: '#4c5e4b', roughness: 0.82, metalness: 0.0 },
      // Teak boat deck display base & helm
      teak:       { color: '#8f623d', roughness: 0.62, metalness: 0.0 },
      teakDark:   { color: '#5c3c22', roughness: 0.70, metalness: 0.0 },
      brass:      { color: '#c9a24b', roughness: 0.28, metalness: 0.82 },
      wheelGrip:  { color: '#22252b', roughness: 0.48, metalness: 0.05 },
      helmWhite:  { color: '#e6e4de', roughness: 0.38, metalness: 0.05 },
    };

    // =========================================================
    // 1. TEAK BOAT-DECK DISPLAY BASE (y = 0 .. 0.09)
    // =========================================================
    mb.addLathe('deck_base', 'base', M.teak, [
      [0.68, 0.00],
      [0.70, 0.015],
      [0.70, 0.068],
      [0.67, 0.088],
      [0.64, 0.090],
    ], { segs: 48 });

    // Dark recessed plank inlay ring
    mb.addTorus('deck_trim_brass', 'base', M.brass, 0.685, 0.014, {
      y: 0.072, segU: 48, segV: 12,
    });

    // Subtle teak caulking lines across deck surface
    for (let k = -3; k <= 3; k++) {
      const zOff = k * 0.16;
      const halfW = Math.sqrt(Math.max(0.01, 0.62 * 0.62 - zOff * zOff));
      mb.addRoundedBox(`deck_seam_${k}`, 'base', M.teakDark, halfW * 2, 0.006, 0.012, {
        y: 0.090, z: zOff, segU: 8, segV: 6, power: 0.2,
      });
    }

    // Small chrome boat cleat at back-right of base
    mb.addRoundedBox('cleat_base', 'base', M.silver, 0.08, 0.018, 0.036, {
      x: 0.38, y: 0.096, z: -0.36, ry: -0.5, segU: 10, segV: 8,
    });
    mb.addTube('cleat_bar', 'base', M.silver, [
      [0.32, 0.125, -0.39], [0.38, 0.128, -0.36], [0.44, 0.125, -0.33],
    ], [0.008, 0.013, 0.008], { segs: 12 });

    // =========================================================
    // 2. THE GUY (centered around gx = -0.14, standing on y=0.09)
    // =========================================================
    const gx = -0.14;

    // --- Shoes (casual off-white sneakers with tan gum soles) ---
    function addShoe(side, sx, sz, rotY) {
      mb.addEllipsoid(`shoe_sole_${side}`, 'body', M.shoeSole, {
        radX: 0.068, radY: 0.022, radZ: 0.128,
        x: sx, y: 0.106, z: sz + 0.025, ry: rotY, segU: 20, segV: 12,
        deform: (x, y, z) => [x * (z > 0 ? 0.94 : 0.85), Math.max(y, -0.016), z],
      });
      mb.addEllipsoid(`shoe_upper_${side}`, 'body', M.shoeWhite, {
        radX: 0.063, radY: 0.048, radZ: 0.120,
        x: sx, y: 0.142, z: sz + 0.022, ry: rotY, segU: 22, segV: 14,
        deform: (x, y, z) => {
          const toeDrop = z > 0.02 ? (z - 0.02) * 0.22 : 0;
          return [x * (z > 0 ? 0.93 : 0.88), Math.max(y - toeDrop, -0.028), z];
        },
      });
      // Ankle collar
      mb.addTorus(`shoe_collar_${side}`, 'body', M.fleece, 0.046, 0.012, {
        x: sx, y: 0.175, z: sz - 0.015, ry: rotY, segU: 18, segV: 10,
      });
    }
    addShoe('R', gx - 0.11, 0.0, -0.16);
    addShoe('L', gx + 0.11, 0.01, 0.14);

    // --- Khaki Chino Pants ---
    function addLeg(side, lx, lz) {
      mb.addLathe(`leg_${side}`, 'body', M.khaki, [
        [0.056, 0.165, 0.058],
        [0.062, 0.20, 0.064],
        [0.068, 0.38, 0.070],
        [0.075, 0.54, 0.078],
        [0.088, 0.72, 0.090],
        [0.092, 0.82, 0.092],
      ], { x: lx, z: lz, segs: 24 });
    }
    addLeg('R', gx - 0.105, -0.01);
    addLeg('L', gx + 0.105, 0.00);

    // Pelvis / hips
    mb.addEllipsoid('hips', 'body', M.khaki, {
      radX: 0.195, radY: 0.115, radZ: 0.125,
      x: gx, y: 0.81, z: -0.005, segU: 26, segV: 16,
    });

    // Leather belt + silver buckle
    mb.addLathe('belt', 'body', M.belt, [
      [0.190, 0.845, 0.122],
      [0.192, 0.885, 0.124],
    ], { x: gx, z: -0.005, segs: 28 });
    mb.addRoundedBox('belt_buckle', 'body', M.silver, 0.045, 0.036, 0.016, {
      x: gx, y: 0.865, z: 0.122, segU: 10, segV: 8,
    });

    // --- Navy Quarter-Zip Fleece Torso ---
    mb.addLathe('torso_fleece', 'body', M.fleece, [
      [0.196, 0.85, 0.128],
      [0.202, 0.90, 0.132],
      [0.194, 1.02, 0.128],
      [0.215, 1.18, 0.138],
      [0.232, 1.31, 0.138],
      [0.210, 1.39, 0.122],
      [0.115, 1.43, 0.098],
    ], {
      x: gx, z: -0.005, segs: 32,
      deform: (x, y, z) => {
        // Slight athletic chest projection & natural back curve
        const chest = (y > 1.10 && y < 1.35 && z > 0) ? 0.018 * Math.sin(((y - 1.10) / 0.25) * Math.PI) : 0;
        return [x, y, z + chest];
      },
    });

    // Standing fleece collar (open slightly in front for white tee)
    mb.addLathe('fleece_collar', 'body', M.fleeceDark, [
      [0.115, 1.39, 0.105],
      [0.112, 1.46, 0.102],
      [0.104, 1.48, 0.095],
    ], {
      x: gx, z: -0.005, segs: 28,
      deform: (x, y, z) => {
        // Dip collar down in front V-opening
        const frontV = z > 0.04 && Math.abs(x) < 0.055 ? (1 - Math.abs(x) / 0.055) * 0.055 : 0;
        return [x, y - frontV, z];
      },
    });

    // White crewneck tee peeking at throat
    mb.addEllipsoid('white_tee_v', 'body', M.whiteTee, {
      radX: 0.068, radY: 0.058, radZ: 0.052,
      x: gx, y: 1.405, z: 0.058, segU: 18, segV: 12,
    });

    // Quarter-zip seam & silver pull tab
    mb.addRoundedBox('zipper_seam', 'body', M.fleeceDark, 0.012, 0.17, 0.012, {
      x: gx, y: 1.285, z: 0.145, rx: 0.08, segU: 8, segV: 8,
    });
    mb.addRoundedBox('zipper_pull', 'body', M.silver, 0.014, 0.026, 0.010, {
      x: gx, y: 1.345, z: 0.152, rx: -0.15, segU: 8, segV: 8,
    });

    // --- Shoulders, Arms, Watch & Hands ---
    // Shoulder caps
    mb.addEllipsoid('shoulder_R', 'body', M.fleece, {
      radX: 0.082, radY: 0.082, radZ: 0.082, x: gx - 0.225, y: 1.31, z: -0.005, segU: 20, segV: 14,
    });
    mb.addEllipsoid('shoulder_L', 'body', M.fleece, {
      radX: 0.082, radY: 0.082, radZ: 0.082, x: gx + 0.225, y: 1.31, z: -0.005, segU: 20, segV: 14,
    });

    // Right arm (viewer's left) — bent forward naturally to grip the boat steering wheel
    const rArmPts = [
      [gx - 0.225, 1.30, -0.005],
      [gx - 0.265, 1.15, 0.025],
      [gx - 0.260, 1.02, 0.120],
      [gx - 0.235, 1.00, 0.245],
    ];
    mb.addTube('arm_R', 'body', M.fleece, rArmPts, [0.068, 0.060, 0.056, 0.048], { segs: 18 });
    // Right cuff
    mb.addTorus('cuff_R', 'body', M.fleeceDark, 0.047, 0.010, {
      x: gx - 0.235, y: 1.00, z: 0.245, rx: Math.PI / 2, segU: 16, segV: 8,
    });
    // Right hand
    mb.addEllipsoid('hand_R', 'body', M.skin, {
      radX: 0.042, radY: 0.038, radZ: 0.052,
      x: gx - 0.232, y: 1.00, z: 0.295, segU: 18, segV: 12,
    });
    mb.addEllipsoid('thumb_R', 'body', M.skin, {
      radX: 0.017, radY: 0.022, radZ: 0.028,
      x: gx - 0.195, y: 1.022, z: 0.285, rz: -0.5, segU: 12, segV: 10,
    });

    // Left arm (viewer's right) — relaxed bent toward his Cavalier dog, displaying silver watch!
    const lArmPts = [
      [gx + 0.225, 1.30, -0.005],
      [gx + 0.275, 1.13, 0.020],
      [gx + 0.290, 0.96, 0.085],
      [gx + 0.315, 0.85, 0.145],
    ];
    mb.addTube('arm_L', 'body', M.fleece, lArmPts, [0.068, 0.060, 0.054, 0.045], { segs: 18 });

    // Silver wristwatch on left wrist (signature detail in photos 1, 2, 3!)
    const wx = gx + 0.322, wy = 0.822, wz = 0.160;
    mb.addTorus('watch_band', 'body', M.silver, 0.044, 0.011, {
      x: wx, y: wy, z: wz, rx: 0.85, rz: -0.25, segU: 20, segV: 10,
    });
    mb.addLathe('watch_case', 'body', M.silver, [
      [0.026, -0.007], [0.028, 0.007],
    ], { x: wx + 0.024, y: wy + 0.012, z: wz + 0.032, rx: 0.9, ry: 0.4, segs: 20 });
    mb.addLathe('watch_dial', 'body', M.watchFace, [
      [0.022, 0.006], [0.022, 0.009],
    ], { x: wx + 0.024, y: wy + 0.012, z: wz + 0.032, rx: 0.9, ry: 0.4, segs: 20 });

    // Left wrist + friendly relaxed hand resting above/near Cavalier
    mb.addEllipsoid('hand_L', 'body', M.skin, {
      radX: 0.040, radY: 0.036, radZ: 0.050,
      x: gx + 0.335, y: 0.785, z: 0.180, rx: 0.4, ry: 0.2, segU: 18, segV: 12,
    });

    // --- Neck & Sculpted Head ---
    mb.addLathe('neck', 'body', M.skin, [
      [0.072, 1.40, 0.070],
      [0.064, 1.47, 0.064],
      [0.068, 1.54, 0.068],
    ], { x: gx, z: -0.005, segs: 24 });

    // Sculpted stylized head with masculine jaw & chin
    const headY = 1.675;
    mb.addEllipsoid('head', 'body', M.skin, {
      radX: 0.155, radY: 0.188, radZ: 0.165,
      x: gx, y: headY, z: 0.005, segU: 32, segV: 24,
      deform: (x, y, z) => {
        let nx = x, ny = y, nz = z;
        // Taper chin gently, broaden jawline slightly for friendly masculine face
        if (y < -0.02) {
          const t = Math.min(1, (-y - 0.02) / 0.16);
          nx *= 1.0 - 0.24 * t * t;
          if (z > 0) nz *= 1.0 + 0.05 * t * (1 - t);
        }
        // Subtle cheekbones
        if (y > -0.04 && y < 0.04 && z > 0.04) {
          nx *= 1.03;
        }
        return [nx, ny, nz];
      },
    });

    // Subtle light stubble along jawline & chin (matches photos 1-3)
    mb.addEllipsoid('stubble', 'body', M.skinShade, {
      radX: 0.140, radY: 0.115, radZ: 0.148,
      x: gx, y: headY - 0.068, z: 0.022, segU: 24, segV: 14,
      deform: (x, y, z) => {
        if (y > 0.03 || z < -0.02) return [x * 0.82, y * 0.82, z * 0.82];
        return [x * 0.96, y, z * 0.99];
      },
    });

    // Ears
    mb.addEllipsoid('ear_R', 'body', M.skin, {
      radX: 0.026, radY: 0.046, radZ: 0.032,
      x: gx - 0.156, y: headY - 0.01, z: -0.008, rz: 0.12, segU: 14, segV: 12,
    });
    mb.addEllipsoid('ear_L', 'body', M.skin, {
      radX: 0.026, radY: 0.046, radZ: 0.032,
      x: gx + 0.156, y: headY - 0.01, z: -0.008, rz: -0.12, segU: 14, segV: 12,
    });

    // Sculpted Nose
    mb.addTube('nose_bridge', 'body', M.skin, [
      [gx, headY + 0.030, 0.155],
      [gx, headY - 0.012, 0.184],
      [gx, headY - 0.026, 0.175],
    ], [0.016, 0.022, 0.019], { segs: 14 });
    mb.addEllipsoid('nose_tip', 'body', M.skin, {
      radX: 0.024, radY: 0.019, radZ: 0.022,
      x: gx, y: headY - 0.022, z: 0.180, segU: 14, segV: 10,
    });

    // Friendly Big Smile (visible in photos 1 & 3)
    const smilePts = [
      [gx - 0.056, headY - 0.068, 0.138],
      [gx - 0.028, headY - 0.082, 0.156],
      [gx,         headY - 0.086, 0.161],
      [gx + 0.028, headY - 0.082, 0.156],
      [gx + 0.056, headY - 0.068, 0.138],
    ];
    mb.addTube('smile_teeth', 'body', M.teeth, smilePts, [0.008, 0.014, 0.015, 0.014, 0.008], { segs: 12 });
    mb.addTube('smile_lip_top', 'body', M.lip, [
      [gx - 0.058, headY - 0.065, 0.137],
      [gx - 0.025, headY - 0.070, 0.157],
      [gx,         headY - 0.071, 0.163],
      [gx + 0.025, headY - 0.070, 0.157],
      [gx + 0.058, headY - 0.065, 0.137],
    ], [0.006, 0.008, 0.009, 0.008, 0.006], { segs: 10 });
    mb.addTube('smile_lip_bot', 'body', M.lip, [
      [gx - 0.052, headY - 0.073, 0.138],
      [gx - 0.024, headY - 0.092, 0.155],
      [gx,         headY - 0.097, 0.160],
      [gx + 0.024, headY - 0.092, 0.155],
      [gx + 0.052, headY - 0.073, 0.138],
    ], [0.005, 0.009, 0.010, 0.009, 0.005], { segs: 10 });

    // Eyes & Eyebrows (revealed when sunglasses are toggled off!)
    for (const side of [-1, 1]) {
      const ex = gx + side * 0.056;
      mb.addEllipsoid(`eye_white_${side}`, 'body', M.eyeWhite, {
        radX: 0.024, radY: 0.017, radZ: 0.016,
        x: ex, y: headY + 0.022, z: 0.147, ry: side * 0.18, segU: 14, segV: 10,
      });
      mb.addEllipsoid(`eye_iris_${side}`, 'body', M.eyeDark, {
        radX: 0.013, radY: 0.014, radZ: 0.012,
        x: ex, y: headY + 0.022, z: 0.156, segU: 12, segV: 10,
      });
      mb.addEllipsoid(`eye_glint_${side}`, 'body', M.teeth, {
        radX: 0.004, radY: 0.004, radZ: 0.004,
        x: ex + 0.005, y: headY + 0.027, z: 0.166, segU: 8, segV: 6,
      });
      // Sculpted dark-brown eyebrow
      mb.addTube(`brow_${side}`, 'body', M.hairDark, [
        [gx + side * 0.022, headY + 0.052, 0.154],
        [gx + side * 0.058, headY + 0.059, 0.151],
        [gx + side * 0.094, headY + 0.051, 0.134],
      ], [0.008, 0.011, 0.007], { segs: 10 });
    }

    // --- Full Sculpted Wavy Brown Hair ---
    // 1) Lower/back/side hair (group: 'body' — ALWAYS visible both with hat ON and hat OFF,
    //    tucked cleanly inside the cap crown above y=1.74 so zero bare skull ever shows on the back!)
    mb.addEllipsoid('hair_back_shell', 'body', M.hair, {
      radX: 0.166, radY: 0.168, radZ: 0.172,
      x: gx, y: headY - 0.008, z: -0.018, segU: 32, segV: 22,
      deform: (x, y, z) => {
        let nx = x, ny = y, nz = z;
        // Keep front face clear (z > 0.015), wrap snugly around temples & full back of head
        if (z > 0.015) {
          nz = 0.015 + (z - 0.015) * 0.22;
          nx *= 0.88;
        }
        // Taper top slightly above cap rim (local y > 0.065 => world y > 1.732) so it tucks inside cap
        if (y > 0.065) {
          const t = (y - 0.065) / 0.105;
          nx *= 1.0 - 0.10 * t;
          nz *= 1.0 - 0.08 * t;
        }
        // Subtle natural wave ripple on back surface
        if (z < -0.04) {
          nz -= 0.006 * Math.cos(x * 38.0) * Math.cos(y * 24.0);
        }
        return [nx, ny, nz];
      },
    });

    // Sculpted smooth wavy locks across the back & sides of the head (visible under cap & without cap)
    const backAngles = [-1.00, -0.68, -0.35, 0.0, 0.35, 0.68, 1.00];
    backAngles.forEach((ang, idx) => {
      const sa = Math.sin(ang), ca = Math.cos(ang);
      const matChoice = idx % 2 === 0 ? M.hair : M.hairDark;
      const w = (idx % 2 === 0 ? 1 : -1) * 0.006;
      mb.addTube(`hair_back_lock_${idx}`, 'body', matChoice, [
        [gx + sa * 0.146, headY + 0.062, -ca * 0.152],
        [gx + sa * 0.156 + w, headY + 0.025, -ca * 0.165],
        [gx + sa * 0.160, headY - 0.015, -ca * 0.170],
        [gx + sa * 0.155 - w, headY - 0.058, -ca * 0.164],
        [gx + sa * 0.144, headY - 0.095, -ca * 0.152],
        [gx + sa * 0.128, headY - 0.122, -ca * 0.136],
      ], [0.032, 0.038, 0.040, 0.038, 0.032, 0.020], { segs: 16 });
    });

    // Sideburns / temple waves in front of & behind ears
    for (const side of [-1, 1]) {
      mb.addTube(`hair_sideburn_${side}`, 'body', M.hairDark, [
        [gx + side * 0.150, headY + 0.068, 0.052],
        [gx + side * 0.156, headY + 0.025, 0.032],
        [gx + side * 0.153, headY - 0.018, 0.020],
      ], [0.022, 0.019, 0.013], { segs: 12 });
    }

    // 2) Upper Crown & Signature Middle-Parted Curtain Waves (group: 'hair' — revealed when Hat is OFF!)
    mb.addEllipsoid('hair_upper_crown', 'hair', M.hair, {
      radX: 0.172, radY: 0.155, radZ: 0.178,
      x: gx, y: headY + 0.072, z: -0.022, segU: 36, segV: 24,
      deform: (x, y, z) => {
        let nx = x, ny = y, nz = z;
        // Keep forehead & eyebrows completely open in front (arch hairline up in front center)
        if (z > 0.0) {
          const frontFactor = z / 0.178;
          const centerArch = Math.max(0, 1.0 - (x / 0.13) ** 2);
          ny += frontFactor * centerArch * 0.068;
          nz -= frontFactor * (0.038 + 0.025 * centerArch);
        }
        // Carve natural middle part groove along top crown (x ~ 0)
        if (y > 0.04 && z > -0.06) {
          ny -= Math.exp(-(x * x) / 0.0010) * 0.020;
        }
        return [nx, ny, nz];
      },
    });

    // Lush swept-back middle-parted curtain waves framing forehead & temples (matching Photo 1 & 2!)
    for (const side of [-1, 1]) {
      mb.addTube(`hair_curtain_front_${side}`, 'hair', M.hair, [
        [gx + side * 0.010, headY + 0.168, 0.122],
        [gx + side * 0.052, headY + 0.175, 0.145],
        [gx + side * 0.105, headY + 0.152, 0.132],
        [gx + side * 0.148, headY + 0.108, 0.092],
        [gx + side * 0.168, headY + 0.052, 0.032],
        [gx + side * 0.164, headY - 0.005, -0.032],
      ], [0.026, 0.038, 0.044, 0.044, 0.038, 0.028], { segs: 16 });

      mb.addTube(`hair_wave_mid_${side}`, 'hair', M.hairDark, [
        [gx + side * 0.016, headY + 0.195, 0.055],
        [gx + side * 0.078, headY + 0.198, 0.068],
        [gx + side * 0.142, headY + 0.155, 0.035],
        [gx + side * 0.172, headY + 0.092, -0.018],
        [gx + side * 0.170, headY + 0.025, -0.068],
      ], [0.032, 0.044, 0.046, 0.042, 0.032], { segs: 16 });

      mb.addTube(`hair_wave_back_${side}`, 'hair', M.hair, [
        [gx + side * 0.020, headY + 0.202, -0.025],
        [gx + side * 0.092, headY + 0.192, -0.055],
        [gx + side * 0.152, headY + 0.135, -0.102],
        [gx + side * 0.160, headY + 0.058, -0.142],
      ], [0.034, 0.045, 0.044, 0.034], { segs: 16 });
    }

    // --- Cream Baseball Cap with Round Embroidered Patch & Back Strap (group: 'cap') ---
    const capY = headY + 0.095;
    mb.addEllipsoid('cap_crown', 'cap', M.capCream, {
      radX: 0.174, radY: 0.136, radZ: 0.182,
      x: gx, y: capY, z: -0.004, rx: -0.08, segU: 34, segV: 20,
      deform: (x, y, z) => {
        let ny = Math.max(y, -0.034);
        // Classic baseball cap back keyhole arch cutout above the strap
        if (z < -0.12 && Math.abs(x) < 0.055 && ny < 0.012) {
          const arch = Math.sqrt(Math.max(0, 1 - (x / 0.055) ** 2)) * 0.042;
          ny = Math.max(ny, -0.034 + arch);
        }
        return [x, ny, z];
      },
    });
    // Dark hair visible right inside the cap's back keyhole arch
    mb.addEllipsoid('cap_keyhole_hair', 'cap', M.hairDark, {
      radX: 0.052, radY: 0.034, radZ: 0.025,
      x: gx, y: capY - 0.008, z: -0.168, segU: 14, segV: 10,
    });
    // Adjustable cream back strap across the bottom of the keyhole
    mb.addTube('cap_back_strap', 'cap', M.capCream, [
      [gx - 0.058, capY - 0.018, -0.170],
      [gx,         capY - 0.020, -0.182],
      [gx + 0.058, capY - 0.018, -0.170],
    ], [0.009, 0.009, 0.009], { segs: 10 });
    // Top button
    mb.addEllipsoid('cap_button', 'cap', M.capCream, {
      radX: 0.016, radY: 0.010, radZ: 0.016,
      x: gx, y: capY + 0.132, z: -0.015, segU: 12, segV: 8,
    });
    // Curved baseball cap brim
    mb.addEllipsoid('cap_brim', 'cap', M.capCream, {
      radX: 0.152, radY: 0.014, radZ: 0.145,
      x: gx, y: capY - 0.024, z: 0.152, rx: 0.05, segU: 26, segV: 10,
      deform: (x, y, z) => {
        // Classic curved baseball visor arch
        const arch = -(x * x) * 1.45;
        return [x, y + arch, z];
      },
    });
    // Circular embroidered crest patch on front of cream cap (Photo 3)
    mb.addLathe('cap_patch_ring', 'cap', M.capPatchBg, [
      [0.040, 0.0], [0.040, 0.010],
    ], { x: gx, y: capY + 0.045, z: 0.168, rx: 1.32, segs: 24 });
    mb.addLathe('cap_patch_inner', 'cap', M.capPatchOr, [
      [0.025, 0.009], [0.025, 0.014],
    ], { x: gx, y: capY + 0.045, z: 0.170, rx: 1.32, segs: 20 });

    // --- Classic Dark Wayfarer Sunglasses (group: 'sunglasses') ---
    const sgY = headY + 0.022;
    const sgZ = 0.168;
    for (const side of [-1, 1]) {
      const lx = gx + side * 0.062;
      // Outer rim
      mb.addRoundedBox(`sg_frame_${side}`, 'sunglasses', M.frame, 0.096, 0.066, 0.016, {
        x: lx, y: sgY, z: sgZ, ry: side * 0.14, power: 0.38, segU: 16, segV: 12,
      });
      // Glossy dark tinted lens
      mb.addRoundedBox(`sg_lens_${side}`, 'sunglasses', M.lens, 0.080, 0.052, 0.018, {
        x: lx, y: sgY - 0.001, z: sgZ + 0.002, ry: side * 0.14, power: 0.38, segU: 14, segV: 10,
      });
      // Temple arm back to ear
      mb.addTube(`sg_temple_${side}`, 'sunglasses', M.frame, [
        [gx + side * 0.112, sgY + 0.012, sgZ - 0.008],
        [gx + side * 0.160, sgY + 0.010, 0.070],
        [gx + side * 0.166, sgY - 0.004, -0.018],
        [gx + side * 0.160, sgY - 0.032, -0.052],
      ], [0.008, 0.007, 0.007, 0.006], { segs: 10 });
    }
    // Nose bridge
    mb.addRoundedBox('sg_bridge', 'sunglasses', M.frame, 0.036, 0.016, 0.016, {
      x: gx, y: sgY + 0.014, z: sgZ + 0.004, segU: 10, segV: 8,
    });

    // =========================================================
    // 3. COMPACT BOAT HELM / STEERING WHEEL (group: 'helm')
    // =========================================================
    const hx = gx - 0.35, hz = 0.34;
    // Short pontoon helm pedestal
    mb.addLathe('helm_post', 'helm', M.helmWhite, [
      [0.095, 0.09],
      [0.085, 0.15],
      [0.068, 0.80],
      [0.078, 0.88],
      [0.060, 0.94],
    ], { x: hx, z: hz + 0.04, segs: 22 });
    // Wheel hub & angled column
    mb.addTube('helm_shaft', 'helm', M.silver, [
      [hx, 0.92, hz + 0.04],
      [hx + 0.03, 0.98, hz - 0.03],
    ], [0.030, 0.024], { segs: 14 });
    // Stainless steel + black-grip boat steering wheel
    const wx0 = hx + 0.04, wy0 = 0.99, wz0 = hz - 0.045;
    mb.addTorus('boat_wheel_rim', 'helm', M.wheelGrip, 0.145, 0.017, {
      x: wx0, y: wy0, z: wz0, rx: 1.25, ry: 0.32, segU: 32, segV: 12,
    });
    mb.addEllipsoid('boat_wheel_hub', 'helm', M.silver, {
      radX: 0.032, radY: 0.032, radZ: 0.025,
      x: wx0, y: wy0, z: wz0, segU: 16, segV: 12,
    });
    // 3 metallic spokes
    for (let s = 0; s < 3; s++) {
      const a = (s * Math.PI * 2) / 3 + 0.4;
      const sx = Math.cos(a) * 0.135;
      const sy = Math.sin(a) * 0.135 * Math.cos(0.32);
      const sz = Math.sin(a) * 0.135 * Math.sin(0.32);
      mb.addTube(`wheel_spoke_${s}`, 'helm', M.silver, [
        [wx0, wy0, wz0],
        [wx0 + sx * 0.92, wy0 + sy * 0.95, wz0 - sz * 0.45],
      ], [0.012, 0.010], { segs: 10 });
    }

    // =========================================================
    // 4. BLENHEIM CAVALIER KING CHARLES SPANIEL (group: 'dog')
    //    Sitting proudly beside him at dx = +0.29, dz = +0.07
    // =========================================================
    const dx = 0.29, dy = 0.09, dz = 0.07;
    const dRotY = -0.26; // slightly angled inward/front

    // Helper to place parts in dog's local frame (rotated by dRotY around (dx, dy, dz))
    function dogTf(lx, ly, lz, extra = {}) {
      const c = Math.cos(dRotY), s = Math.sin(dRotY);
      return {
        ...extra,
        x: dx + lx * c + lz * s,
        y: dy + ly,
        z: dz - lx * s + lz * c,
        ry: (extra.ry ?? 0) + dRotY,
      };
    }

    function dogPt(lx, ly, lz) {
      const c = Math.cos(dRotY), s = Math.sin(dRotY);
      return [dx + lx * c + lz * s, dy + ly, dz - lx * s + lz * c];
    }

    // Seated body (fluffy white chest & torso)
    mb.addEllipsoid('dog_torso_white', 'dog', M.dogWhite, dogTf(0, 0.21, -0.02, {
      radX: 0.125, radY: 0.175, radZ: 0.145, rx: 0.22, segU: 26, segV: 18,
    }));
    // Fluffy white chest ruff
    mb.addEllipsoid('dog_chest_fluff', 'dog', M.dogWhite, dogTf(0, 0.25, 0.08, {
      radX: 0.095, radY: 0.115, radZ: 0.085, segU: 20, segV: 14,
    }));
    // Blenheim chestnut-brown saddle patches on back & sides
    mb.addEllipsoid('dog_back_patch', 'dog', M.dogBrown, dogTf(0, 0.22, -0.065, {
      radX: 0.124, radY: 0.145, radZ: 0.115, rx: 0.25, segU: 22, segV: 16,
    }));
    mb.addEllipsoid('dog_rump_patch', 'dog', M.dogBrown, dogTf(-0.04, 0.12, -0.10, {
      radX: 0.105, radY: 0.095, radZ: 0.105, segU: 18, segV: 12,
    }));

    // Sage/Olive-Green Padded Harness (matches Photos 3 & 4!)
    mb.addTorus('dog_harness_chest', 'dog', M.harness, 0.112, 0.022, dogTf(0, 0.28, 0.02, {
      rx: 0.42, segU: 24, segV: 10,
    }));
    mb.addTorus('dog_harness_belly', 'dog', M.harness, 0.124, 0.020, dogTf(0, 0.20, -0.02, {
      rx: 0.22, segU: 24, segV: 10,
    }));
    mb.addRoundedBox('dog_harness_backpad', 'dog', M.harness, 0.095, 0.11, 0.032, dogTf(0, 0.26, -0.12, {
      rx: 0.30, segU: 12, segV: 10,
    }));
    mb.addTorus('dog_harness_ring', 'dog', M.silver, 0.016, 0.004, dogTf(0, 0.29, -0.145, {
      rx: Math.PI / 2, segU: 14, segV: 8,
    }));

    // Seated hind haunches & paws
    for (const side of [-1, 1]) {
      mb.addEllipsoid(`dog_haunch_${side}`, 'dog', M.dogWhite, dogTf(side * 0.105, 0.10, -0.03, {
        radX: 0.068, radY: 0.095, radZ: 0.095, segU: 16, segV: 12,
      }));
      mb.addEllipsoid(`dog_back_paw_${side}`, 'dog', M.dogWhite, dogTf(side * 0.105, 0.032, 0.06, {
        radX: 0.042, radY: 0.032, radZ: 0.062, segU: 14, segV: 10,
      }));
      // Front legs + fluffy feathered paws
      mb.addTube(`dog_front_leg_${side}`, 'dog', M.dogWhite, [
        dogPt(side * 0.065, 0.24, 0.075),
        dogPt(side * 0.062, 0.14, 0.105),
        dogPt(side * 0.060, 0.04, 0.118),
      ], [0.038, 0.033, 0.032], { segs: 14 });
      mb.addEllipsoid(`dog_front_paw_${side}`, 'dog', M.dogWhite, dogTf(side * 0.060, 0.028, 0.142, {
        radX: 0.036, radY: 0.026, radZ: 0.048, segU: 14, segV: 10,
      }));
    }

    // Fluffy feathered white tail curving gracefully behind
    mb.addTube('dog_tail', 'dog', M.dogWhite, [
      dogPt(0.0, 0.08, -0.14),
      dogPt(0.05, 0.07, -0.22),
      dogPt(0.12, 0.11, -0.27),
      dogPt(0.17, 0.16, -0.25),
    ], [0.028, 0.042, 0.046, 0.024], { segs: 14 });

    // Cavalier King Charles Spaniel Head (tilted slightly up & cute!)
    const dhY = 0.445, dhZ = 0.085;
    // White domed skull with iconic white center blaze
    mb.addEllipsoid('dog_head_white', 'dog', M.dogWhite, dogTf(0, dhY, dhZ, {
      radX: 0.112, radY: 0.108, radZ: 0.115, rx: -0.15, segU: 26, segV: 18,
    }));
    // Blenheim chestnut-brown patches framing both eyes & crown (leaving white center blaze!)
    for (const side of [-1, 1]) {
      mb.addEllipsoid(`dog_face_patch_${side}`, 'dog', M.dogBrown, dogTf(side * 0.064, dhY + 0.020, dhZ + 0.015, {
        radX: 0.062, radY: 0.082, radZ: 0.095, rx: -0.12, ry: side * 0.15, segU: 18, segV: 14,
      }));
    }

    // Short cute Cavalier muzzle
    mb.addEllipsoid('dog_muzzle', 'dog', M.dogWhite, dogTf(0, dhY - 0.032, dhZ + 0.105, {
      radX: 0.056, radY: 0.044, radZ: 0.058, segU: 18, segV: 12,
    }));
    // Glossy dark button nose
    mb.addEllipsoid('dog_nose', 'dog', M.dogNose, dogTf(0, dhY - 0.015, dhZ + 0.158, {
      radX: 0.024, radY: 0.018, radZ: 0.018, segU: 14, segV: 10,
    }));
    // Happy little pink tongue
    mb.addEllipsoid('dog_tongue', 'dog', M.dogTongue, dogTf(0, dhY - 0.064, dhZ + 0.135, {
      radX: 0.018, radY: 0.016, radZ: 0.022, rx: 0.4, segU: 12, segV: 8,
    }));

    // Big soulful glossy Cavalier eyes with bright catchlights
    for (const side of [-1, 1]) {
      mb.addEllipsoid(`dog_eye_${side}`, 'dog', M.dogNose, dogTf(side * 0.048, dhY + 0.010, dhZ + 0.096, {
        radX: 0.022, radY: 0.023, radZ: 0.018, segU: 14, segV: 12,
      }));
      mb.addEllipsoid(`dog_eye_glint_${side}`, 'dog', M.teeth, dogTf(side * 0.048 + 0.007, dhY + 0.018, dhZ + 0.111, {
        radX: 0.006, radY: 0.006, radZ: 0.006, segU: 8, segV: 6,
      }));
    }

    // Signature Long Fluffy Wavy Chestnut Feathered Ears (multi-strand for lush volume!)
    for (const side of [-1, 1]) {
      mb.addTube(`dog_ear_main_${side}`, 'dog', M.dogEar, [
        dogPt(side * 0.095, dhY + 0.045, dhZ - 0.005),
        dogPt(side * 0.138, dhY - 0.015, dhZ + 0.005),
        dogPt(side * 0.148, dhY - 0.115, dhZ + 0.012),
        dogPt(side * 0.136, dhY - 0.195, dhZ + 0.002),
      ], [0.036, 0.048, 0.052, 0.036], { segs: 16, ovalX: 0.65, ovalY: 1.25 });

      mb.addTube(`dog_ear_curl_${side}`, 'dog', M.dogBrown, [
        dogPt(side * 0.092, dhY + 0.032, dhZ - 0.035),
        dogPt(side * 0.135, dhY - 0.040, dhZ - 0.038),
        dogPt(side * 0.142, dhY - 0.135, dhZ - 0.032),
        dogPt(side * 0.125, dhY - 0.205, dhZ - 0.028),
      ], [0.030, 0.042, 0.045, 0.030], { segs: 14, ovalX: 0.65, ovalY: 1.15 });
    }

    return mb.parts;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildBoatGuyModel };
  } else {
    root.buildBoatGuyModel = buildBoatGuyModel;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
