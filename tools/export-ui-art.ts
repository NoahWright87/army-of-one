/** Export inspectable SVG copies of the native role/HUD icons. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { ICON_ROLES, roleIconDocument } from '../src/content/role-icons';
import { helmetSvg } from '../src/content/ui-icons';
mkdirSync('assets/ui', { recursive: true });
for (const role of ICON_ROLES)
  writeFileSync(`assets/ui/role_${role}.svg`, roleIconDocument(role, 64, '#e4d6b3'));
writeFileSync('assets/ui/helmet.svg', helmetSvg(64));
