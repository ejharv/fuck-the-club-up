# Launch on Cloudflare Pages

Domain registered at Porkbun. James does the account steps himself; nothing here has been done yet.

## Build
The blog has no server needs, so a fully static build is the simplest fit for Cloudflare Pages.
- Before choosing, read the Next.js docs bundled in `node_modules/next/dist/docs/` on static export, and check that it works with the current `next.config.ts` options (`cacheComponents`, `partialPrefetching`).
- Check Cloudflare's current guide for deploying Next.js before setting build options, since the recommended route (static export on Pages vs. the OpenNext adapter on Workers) may have changed.
- Pin the Node version Cloudflare builds with (for example a `.node-version` file) to the one this repo uses locally.

## Cloudflare (James)
1. Sign up at cloudflare.com, free plan.
2. Workers & Pages > Create > Pages > Connect to Git > this repo, branch `main`.
3. Enter the build command and output folder chosen above. Deploy and check the `<project>.pages.dev` address.

## Move DNS from Porkbun (James)
Cloudflare Pages only serves the root domain (fucktheclubup.com) when the domain's DNS is on Cloudflare, so the nameservers move. The domain stays registered at Porkbun.
1. In Cloudflare: Add a site > fucktheclubup.com > Free. Note the two nameservers it shows.
2. If any Porkbun email forwarding is set up for this domain, write it down first: it stops working after the switch until it is recreated in Cloudflare.
3. At Porkbun: Account > Domain Management > fucktheclubup.com > Details > edit Nameservers. Delete the Porkbun entries, paste the two Cloudflare ones (one per line), Save Nameservers, Submit if asked.
4. Wait until Cloudflare shows the site as Active. Usually a few hours, up to 48.

## Connect the domain (James)
In the Pages project: Custom domains > Set up a domain > `fucktheclubup.com`, then again for `www.fucktheclubup.com`. Add the domain in Pages first; a DNS record added by hand without this step fails with a 522 error. Cloudflare creates the records and the HTTPS certificate.

After that, every push to `main` redeploys, and other branches get their own preview links.
