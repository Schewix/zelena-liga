import { resolveBody } from './articles/model.js';
import {
clearEditorSession,
setEditorSession,
validatePassword,
verifyEditorSession
} from './editorAuth.js';

export async function handleAdminSession(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const { ok } = verifyEditorSession(req);
  if (!ok) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  res.status(200).json({ ok: true });
}

export async function handleAdminLogin(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const payload = resolveBody(req);
  const password = typeof payload.password === 'string' ? payload.password : '';
  try {
    if (!validatePassword(password)) {
      res.status(401).json({ error: 'Invalid password' });
      return;
    }
    setEditorSession(res);
    res.status(200).json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to authenticate' });
  }
}

export async function handleAdminLogout(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  clearEditorSession(res);
  res.status(200).json({ ok: true });
}
