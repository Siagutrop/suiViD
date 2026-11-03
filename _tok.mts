import { SignJWT } from 'jose';
import { readFileSync, writeFileSync } from 'node:fs';
const env = readFileSync('../../.env.development', 'utf8');
const secret = env.match(/AUTH_SECRET=(.+)/)![1]!.trim();
const t = await new SignJWT({ sub: 'u_870fb1b17684', role: 'coach' })
  .setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h')
  .sign(new TextEncoder().encode(secret));
writeFileSync('../../_tok.txt', t);
