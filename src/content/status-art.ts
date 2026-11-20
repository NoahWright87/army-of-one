/** Native vector sources for small status annotations, matching the existing role/HUD icons. */
const svg = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const ring = (color: string, r: number) =>
  `<circle cx="48" cy="48" r="${r}" fill="none" stroke="#10171c" stroke-width="6"/><circle cx="48" cy="48" r="${r}" fill="none" stroke="${color}" stroke-width="3"/><circle cx="48" cy="48" r="${r - 5}" fill="none" stroke="${color}" stroke-opacity=".2" stroke-width="2"/>`;
const flag = (color: string, light: string) =>
  svg(
    48,
    32,
    `<defs><linearGradient id="cloth"><stop stop-color="${color}"/><stop offset=".35" stop-color="${light}"/><stop offset=".65" stop-color="${color}"/><stop offset="1" stop-color="${light}"/></linearGradient></defs><path d="M2 3C16 0 27 8 45 4L42 28C26 31 17 23 2 28Z" fill="url(#cloth)" stroke="#15191c" stroke-width="2" stroke-linejoin="round"/><path d="M16 9L25 16 16 22" fill="none" stroke="#f1e7bc" stroke-opacity=".9" stroke-width="3"/><path d="M3 4V27M31 7L29 27" stroke="#fff" stroke-opacity=".18" fill="none"/>`,
  );

export const STATUS_SVGS = {
  flag_pole: svg(
    12,
    96,
    '<defs><linearGradient id="steel"><stop stop-color="#252d35"/><stop offset=".5" stop-color="#b3bdc8"/><stop offset="1" stop-color="#39434e"/></linearGradient></defs><path d="M4 8H8V88H4Z" fill="url(#steel)" stroke="#151b21"/><circle cx="6" cy="7" r="3.5" fill="#b4b9af" stroke="#222930"/><path d="M1 88H11V94H1Z" fill="#616b70" stroke="#192128"/>',
  ),
  flag_ours: flag('#237a4e', '#5fbb77'),
  flag_enemy: flag('#963f38', '#d56a54'),
  spawn_marker: svg(
    64,
    64,
    '<circle cx="32" cy="32" r="27" fill="#28633e" fill-opacity=".12" stroke="#16251d" stroke-width="5"/><circle cx="32" cy="32" r="27" fill="none" stroke="#68c67e" stroke-width="2.5" stroke-dasharray="31 5"/><path d="M14 26H32V17L51 32 32 47V38H14Z" fill="#79c78b" stroke="#15271c" stroke-width="2" stroke-linejoin="round"/>',
  ),
  soldier_shield_ring: svg(
    96,
    96,
    ring('#7adce8', 32) +
      '<path d="M43 13H53M43 83H53M13 43V53M83 43V53" stroke="#d9fbff" stroke-width="3" stroke-linecap="round"/>',
  ),
  soldier_live_marker: svg(96, 96, ring('#f5d76e', 36)),
  static_overlay: svg(
    64,
    64,
    `<defs><clipPath id="disc"><circle cx="32" cy="32" r="22"/></clipPath></defs><g clip-path="url(#disc)">${Array.from({ length: 90 }, (_, i) => `<rect x="${(i * 17) % 64}" y="${(i * 11) % 64}" width="${3 + ((i * 7) % 12)}" height="${i % 3 === 0 ? 2 : 1}" fill="${i % 2 === 0 ? '#c4d7dc' : '#222d35'}" opacity="${i % 3 === 0 ? '.6' : '.25'}"/>`).join('')}</g>`,
  ),
  icon_interrupted: svg(
    32,
    32,
    '<path d="M16 3L30 28H2Z" fill="#e4ae49" stroke="#151a1e" stroke-width="2.5" stroke-linejoin="round"/><path d="M16 11V19" stroke="#20252a" stroke-width="3" stroke-linecap="round"/><circle cx="16" cy="24" r="1.8" fill="#20252a"/>',
  ),
  icon_x: svg(
    32,
    32,
    '<path d="M7 7L25 25M25 7L7 25" fill="none" stroke="#151a1e" stroke-width="9" stroke-linecap="round"/><path d="M7 7L25 25M25 7L7 25" fill="none" stroke="#ee7764" stroke-width="5" stroke-linecap="round"/>',
  ),
  icon_o: svg(
    32,
    32,
    '<circle cx="16" cy="16" r="10" fill="none" stroke="#151a1e" stroke-width="8"/><circle cx="16" cy="16" r="10" fill="none" stroke="#79d394" stroke-width="4"/>',
  ),
  reticle: svg(
    32,
    32,
    '<path d="M5 11V5H11M21 5H27V11M27 21V27H21M11 27H5V21M16 2V9M16 23V30M2 16H9M23 16H30" fill="none" stroke="#14202a" stroke-width="3.5"/><path d="M5 11V5H11M21 5H27V11M27 21V27H21M11 27H5V21M16 2V9M16 23V30M2 16H9M23 16H30" fill="none" stroke="#f5f3df" stroke-width="1.5"/>',
  ),
} as const;
