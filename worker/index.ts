/**
 * iqprep.app Worker: serves the site and the game from static assets, and sends the old
 * braincamp.app name and the www host to https://iqprep.app (same path).
 */
interface Env {
  ASSETS: Fetcher;
}

const SITE = 'https://iqprep.app';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.hostname.endsWith('braincamp.app') || url.hostname === 'www.iqprep.app') {
      return Response.redirect(`${SITE}${url.pathname}${url.search}`, 301);
    }
    return env.ASSETS.fetch(req);
  },
};
