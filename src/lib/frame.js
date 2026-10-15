// Минимальная математика поворотов без three.js — работает и в Web Worker.

// Матрица поворота 3×3 по углам Эйлера (порядок XYZ, как в three.js), по строкам.
export function rotationMatrix([ax, ay, az] = [0, 0, 0]) {
  const a = Math.cos(ax);
  const b = Math.sin(ax);
  const c = Math.cos(ay);
  const d = Math.sin(ay);
  const e = Math.cos(az);
  const f = Math.sin(az);
  const ae = a * e;
  const af = a * f;
  const be = b * e;
  const bf = b * f;
  return [
    c * e, -c * f, d,
    af + be * d, ae - bf * d, -b * c,
    bf - ae * d, be + af * d, a * c,
  ];
}

export function applyMatrix(m, [x, y, z]) {
  return [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];
}

// Тело (диск, сфероид) со своим положением и наклоном.
// Координаты диска: x, y — в плоскости диска, h — высота над ним (как у M51: X = x, Y = h, Z = −y).
export function bodyFrame(position = [0, 0, 0], rotation = [0, 0, 0]) {
  const m = rotationMatrix(rotation);
  const normal = applyMatrix(m, [0, 1, 0]);
  return {
    m,
    normal,
    position,
    toWorld(x, y, h = 0) {
      const p = applyMatrix(m, [x, h, -y]);
      return [p[0] + position[0], p[1] + position[1], p[2] + position[2]];
    },
    // Смещение, уже заданное в мировых осях тела (для точек, сгенерированных в 3D)
    offset(dx, dy, dz) {
      const p = applyMatrix(m, [dx, dy, dz]);
      return [p[0] + position[0], p[1] + position[1], p[2] + position[2]];
    },
  };
}

// Направления «вправо», «вверх» и «к зрителю» для камеры, стоящей на сферических углах phi/theta,
// как их задаёт OrbitControls. Нужны, чтобы расставлять объекты так, как они видны с Земли.
export function skyFrame(phi, theta) {
  const toCam = [Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta)];
  // right = forward × up, где forward = −toCam, up = (0, 1, 0)
  let right = [toCam[2], 0, -toCam[0]];
  const len = Math.hypot(right[0], right[2]) || 1;
  right = [right[0] / len, 0, right[2] / len];
  const up = [
    toCam[1] * right[2] - toCam[2] * right[1],
    toCam[2] * right[0] - toCam[0] * right[2],
    toCam[0] * right[1] - toCam[1] * right[0],
  ];
  return {
    right,
    up,
    toCam,
    // sx — вправо, sy — вверх на экране (тыс. св. лет), depth — к зрителю
    at(sx, sy, depth = 0, origin = [0, 0, 0]) {
      return [0, 1, 2].map((i) => origin[i] + right[i] * sx + up[i] * sy + toCam[i] * depth);
    },
  };
}
