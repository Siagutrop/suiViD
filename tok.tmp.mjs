import { SignJWT } from 'jose';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.development','utf8');
const secret = env.match(/AUTH_SECRET=(.+)/)[1].trim();
const users = JSON.parse(readFileSync('data/users.json','utf8'));
const u = users.users[0];
const t = await new SignJWT({sub:u.id, email:u.email}).setProtectedHeader({alg:'HS256'}).setExpirationTime('1h').sign(new TextEncoder().encode(secret));
console.log(t);
