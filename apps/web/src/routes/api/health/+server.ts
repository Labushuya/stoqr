import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
	return json({ ok: true, ts: Date.now() }, { status: 200 });
};
