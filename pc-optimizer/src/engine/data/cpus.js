// Gaming index: Ryzen 7 9800X3D = 100 (1080p avg across review suites). cores = physical P-cores (+E for Intel in eCores).
function c(name, idx, cores, threads, extra = {}) {
  return { name, idx, cores, threads, mobile: !!extra.mobile, vendor: name.startsWith('AMD') ? 'AMD' : name.startsWith('Intel') ? 'Intel' : 'Apple', ...extra };
}
export const CPUS = [
  // AMD desktop
  c('AMD Ryzen 7 9800X3D', 100, 8, 16), c('AMD Ryzen 9 9950X3D', 100, 16, 32), c('AMD Ryzen 9 9900X3D', 97, 12, 24),
  c('AMD Ryzen 7 7800X3D', 92, 8, 16), c('AMD Ryzen 9 7950X3D', 92, 16, 32), c('AMD Ryzen 9 7900X3D', 88, 12, 24),
  c('AMD Ryzen 9 9950X', 85, 16, 32), c('AMD Ryzen 9 9900X', 83, 12, 24), c('AMD Ryzen 7 9700X', 82, 8, 16), c('AMD Ryzen 5 9600X', 80, 6, 12), c('AMD Ryzen 5 9600', 79, 6, 12),
  c('AMD Ryzen 9 7950X', 82, 16, 32), c('AMD Ryzen 9 7900X', 80, 12, 24), c('AMD Ryzen 9 7900', 78, 12, 24), c('AMD Ryzen 7 7700X', 78, 8, 16), c('AMD Ryzen 7 7700', 77, 8, 16),
  c('AMD Ryzen 5 7600X', 76, 6, 12), c('AMD Ryzen 5 7600', 74, 6, 12), c('AMD Ryzen 5 7500F', 73, 6, 12), c('AMD Ryzen 5 8600G', 66, 6, 12), c('AMD Ryzen 7 8700G', 68, 8, 16),
  c('AMD Ryzen 7 5800X3D', 78, 8, 16), c('AMD Ryzen 7 5700X3D', 74, 8, 16), c('AMD Ryzen 5 5600X3D', 70, 6, 12),
  c('AMD Ryzen 9 5950X', 68, 16, 32), c('AMD Ryzen 9 5900X', 67, 12, 24), c('AMD Ryzen 7 5800X', 65, 8, 16), c('AMD Ryzen 7 5700X', 63, 8, 16), c('AMD Ryzen 7 5700G', 58, 8, 16),
  c('AMD Ryzen 5 5600X', 62, 6, 12), c('AMD Ryzen 5 5600', 60, 6, 12), c('AMD Ryzen 5 5600G', 55, 6, 12), c('AMD Ryzen 5 5500', 52, 6, 12),
  c('AMD Ryzen 9 3950X', 54, 16, 32), c('AMD Ryzen 9 3900X', 53, 12, 24), c('AMD Ryzen 7 3800X', 51, 8, 16), c('AMD Ryzen 7 3700X', 50, 8, 16), c('AMD Ryzen 5 3600X', 48, 6, 12), c('AMD Ryzen 5 3600', 47, 6, 12), c('AMD Ryzen 5 3400G', 36, 4, 8),
  c('AMD Ryzen 7 2700X', 41, 8, 16), c('AMD Ryzen 5 2600X', 39, 6, 12), c('AMD Ryzen 5 2600', 38, 6, 12), c('AMD Ryzen 7 1800X', 34, 8, 16), c('AMD Ryzen 5 1600', 30, 6, 12),
  // Intel desktop
  c('Intel Core Ultra 9 285K', 85, 8, 24, { eCores: 16 }), c('Intel Core Ultra 7 265K', 82, 8, 20, { eCores: 12 }), c('Intel Core Ultra 5 245K', 78, 6, 14, { eCores: 8 }), c('Intel Core Ultra 5 225', 70, 6, 10, { eCores: 4 }),
  c('Intel Core i9-14900K', 90, 8, 32, { eCores: 16 }), c('Intel Core i7-14700K', 88, 8, 28, { eCores: 12 }), c('Intel Core i5-14600K', 83, 6, 20, { eCores: 8 }), c('Intel Core i5-14400', 72, 6, 16, { eCores: 4 }),
  c('Intel Core i9-13900K', 89, 8, 32, { eCores: 16 }), c('Intel Core i7-13700K', 86, 8, 24, { eCores: 8 }), c('Intel Core i5-13600K', 81, 6, 20, { eCores: 8 }), c('Intel Core i5-13400', 70, 6, 16, { eCores: 4 }), c('Intel Core i3-13100', 58, 4, 8),
  c('Intel Core i9-12900K', 80, 8, 24, { eCores: 8 }), c('Intel Core i7-12700K', 77, 8, 20, { eCores: 4 }), c('Intel Core i5-12600K', 73, 6, 16, { eCores: 4 }), c('Intel Core i5-12400', 65, 6, 12), c('Intel Core i3-12100', 55, 4, 8),
  c('Intel Core i9-11900K', 66, 8, 16), c('Intel Core i7-11700K', 63, 8, 16), c('Intel Core i5-11600K', 60, 6, 12), c('Intel Core i5-11400', 56, 6, 12),
  c('Intel Core i9-10900K', 64, 10, 20), c('Intel Core i7-10700K', 61, 8, 16), c('Intel Core i5-10600K', 58, 6, 12), c('Intel Core i5-10400', 53, 6, 12), c('Intel Core i3-10100', 44, 4, 8),
  c('Intel Core i9-9900K', 60, 8, 16), c('Intel Core i7-9700K', 58, 8, 8), c('Intel Core i5-9600K', 54, 6, 6), c('Intel Core i5-9400F', 48, 6, 6),
  c('Intel Core i7-8700K', 55, 6, 12), c('Intel Core i5-8600K', 52, 6, 6), c('Intel Core i5-8400', 47, 6, 6), c('Intel Core i7-7700K', 46, 4, 8), c('Intel Core i5-7600K', 40, 4, 4), c('Intel Core i7-6700K', 42, 4, 8), c('Intel Core i5-6600K', 37, 4, 4), c('Intel Core i7-4790K', 36, 4, 8),
  // Laptop
  c('AMD Ryzen 9 9955HX3D', 92, 16, 32, { mobile: true }), c('AMD Ryzen 9 9955HX', 82, 16, 32, { mobile: true }), c('AMD Ryzen 9 7945HX3D', 88, 16, 32, { mobile: true }), c('AMD Ryzen 9 7945HX', 80, 16, 32, { mobile: true }), c('AMD Ryzen 7 7745HX', 76, 8, 16, { mobile: true }),
  c('AMD Ryzen AI 9 HX 370', 70, 12, 24, { mobile: true }), c('AMD Ryzen AI 9 365', 67, 10, 20, { mobile: true }), c('AMD Ryzen AI Max+ 395', 75, 16, 32, { mobile: true }),
  c('AMD Ryzen 7 8845HS', 66, 8, 16, { mobile: true }), c('AMD Ryzen 7 7840HS', 65, 8, 16, { mobile: true }), c('AMD Ryzen 7 7735HS', 58, 8, 16, { mobile: true }), c('AMD Ryzen 5 7640HS', 60, 6, 12, { mobile: true }), c('AMD Ryzen 7 6800H', 57, 8, 16, { mobile: true }), c('AMD Ryzen 7 5800H', 52, 8, 16, { mobile: true }), c('AMD Ryzen 5 5600H', 48, 6, 12, { mobile: true }),
  c('Intel Core i9-14900HX', 82, 8, 32, { mobile: true, eCores: 16 }), c('Intel Core i7-14700HX', 79, 8, 28, { mobile: true, eCores: 12 }), c('Intel Core i7-14650HX', 75, 8, 24, { mobile: true, eCores: 8 }), c('Intel Core i5-14450HX', 68, 6, 16, { mobile: true, eCores: 4 }),
  c('Intel Core i9-13980HX', 80, 8, 32, { mobile: true, eCores: 16 }), c('Intel Core i9-13900HX', 78, 8, 32, { mobile: true, eCores: 16 }), c('Intel Core i7-13700HX', 76, 8, 24, { mobile: true, eCores: 8 }), c('Intel Core i7-13650HX', 72, 6, 20, { mobile: true, eCores: 8 }), c('Intel Core i5-13500HX', 70, 6, 20, { mobile: true, eCores: 8 }),
  c('Intel Core i7-13700H', 68, 6, 20, { mobile: true, eCores: 8 }), c('Intel Core i7-12700H', 64, 6, 20, { mobile: true, eCores: 8 }), c('Intel Core i5-12500H', 60, 4, 16, { mobile: true, eCores: 8 }), c('Intel Core i7-11800H', 56, 8, 16, { mobile: true }), c('Intel Core i7-10750H', 48, 6, 12, { mobile: true }),
  c('Intel Core Ultra 9 275HX', 84, 8, 24, { mobile: true, eCores: 16 }), c('Intel Core Ultra 7 255HX', 80, 8, 20, { mobile: true, eCores: 12 }), c('Intel Core Ultra 9 185H', 66, 6, 22, { mobile: true, eCores: 8 }), c('Intel Core Ultra 7 155H', 62, 6, 22, { mobile: true, eCores: 8 }), c('Intel Core Ultra 7 258V', 60, 4, 8, { mobile: true, eCores: 4 }), c('Intel Core Ultra 5 125H', 56, 4, 18, { mobile: true, eCores: 8 }),
  c('Apple M1', 45, 8, 8, { mobile: true }), c('Apple M2', 50, 8, 8, { mobile: true }), c('Apple M3', 56, 8, 8, { mobile: true }), c('Apple M4', 64, 10, 10, { mobile: true }), c('Apple M3 Max', 60, 16, 16, { mobile: true }), c('Apple M4 Max', 70, 16, 16, { mobile: true }),
];
export const CPU_BY_NAME = Object.fromEntries(CPUS.map((x) => [x.name, x]));
